import { zodResolver } from '@hookform/resolvers/zod'
import { useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { AlertTriangle, Plus, Printer, Trash2 } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { Controller, useFieldArray, useForm, useWatch } from 'react-hook-form'
import { Link, useBeforeUnload, useBlocker, useNavigate } from 'react-router'
import { toast } from 'sonner'
import { z } from 'zod'
import { isApiError } from '@/api/client'
import { qk } from '@/api/queryKeys'
import type { OperationAction, OperationBody, OperationDetail, Product } from '@/api/types'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { FormAlert } from '@/components/form/FormAlert'
import { TextField } from '@/components/form/TextField'
import { LocationSelect } from '@/components/pickers/EntitySelects'
import { ProductCombobox } from '@/components/pickers/ProductCombobox'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useMe } from '@/hooks/useAuth'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { useCreateOperation, useOperationAction, useUpdateOperation } from '@/hooks/useOperations'
import { formatDateTime, formatQty, productLabel } from '@/lib/format'
import { cn } from '@/lib/utils'
import { requiredNumber } from '@/lib/validation'
import type { OperationTypeConfig } from './config'
import { OperationPrintView } from './OperationPrintView'
import { LateMarker, StatusBar } from './OperationStatus'

const lineSchema = z.object({
  product: z.custom<Product | null>((v) => v != null, 'Choose a product').transform((v) => v as Product),
  qty: requiredNumber('Quantity').refine((n) => n > 0, 'Must be greater than 0'),
})

const baseSchema = z.object({
  contact: z.string().trim(),
  delivery_address: z.string().trim(),
  scheduled_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a date'),
  /** The location the user picks per type (receipt: destination, delivery/internal: source). */
  location_id: z.number({ error: 'Choose a location' }),
  /** Internal transfers only: where the goods go. */
  dest_location_id: z.number().optional(),
  lines: z
    .array(lineSchema)
    .min(1, 'Add at least one product')
    .superRefine((lines, ctx) => {
      const seen = new Set<number>()
      lines.forEach((l, i) => {
        if (!l.product) return
        if (seen.has(l.product.id)) ctx.addIssue({ code: 'custom', message: 'Already on another line', path: [i, 'product'] })
        seen.add(l.product.id)
      })
    }),
})
type FormIn = z.input<typeof baseSchema>
type FormOut = z.output<typeof baseSchema>

const required = z.string().trim().min(1, 'Required')

/** Per-type required fields (contract bodies). Field-level, so they report alongside the other errors. */
function schemaFor(config: OperationTypeConfig) {
  switch (config.type) {
    case 'delivery':
      return baseSchema.extend({ contact: required, delivery_address: required })
    case 'internal':
      return baseSchema
        .extend({ dest_location_id: z.number().optional().refine((v) => v !== undefined, 'Choose a location') })
        .refine((v) => v.dest_location_id !== v.location_id, { error: 'Must differ from the source location', path: ['dest_location_id'] })
    default:
      return baseSchema.extend({ contact: required })
  }
}

function toFormValues(op: OperationDetail, config: OperationTypeConfig): FormIn {
  return {
    contact: op.contact ?? '',
    delivery_address: op.delivery_address ?? '',
    scheduled_date: op.scheduled_date,
    location_id: (config.locationField === 'dest' ? op.dest_location : op.source_location).id,
    dest_location_id: op.dest_location.id,
    lines: op.lines.map((l) => ({ product: l.product, qty: String(l.qty) })),
  }
}

function toBody(v: FormOut, config: OperationTypeConfig): OperationBody {
  const lines = v.lines.map((l) => ({ product_id: l.product.id, qty: l.qty }))
  if (config.type === 'receipt') {
    return { type: 'receipt', contact: v.contact, dest_location_id: v.location_id, scheduled_date: v.scheduled_date, lines }
  }
  if (config.type === 'delivery') {
    return {
      type: 'delivery',
      contact: v.contact,
      delivery_address: v.delivery_address,
      source_location_id: v.location_id,
      scheduled_date: v.scheduled_date,
      lines,
    }
  }
  if (config.type === 'internal') {
    return { type: 'internal', source_location_id: v.location_id, dest_location_id: v.dest_location_id!, scheduled_date: v.scheduled_date, lines }
  }
  throw new Error(`No form for ${config.type}`)
}

type FormField = 'contact' | 'delivery_address' | 'scheduled_date' | 'location_id' | 'dest_location_id' | 'lines' | `lines.${number}.product` | `lines.${number}.qty`

/**
 * Contract error key -> form field. Line errors come as "lines" (whole table) or "lines.<index>.<field>".
 * Returns null when the key has no input on this form (shown as a message instead).
 */
function formFieldFor(key: string, config: OperationTypeConfig, lineCount: number): FormField | null {
  switch (key) {
    case 'contact':
    case 'delivery_address':
    case 'scheduled_date':
      return key
    case 'source_location_id':
      return config.locationField === 'source' ? 'location_id' : null
    case 'dest_location_id':
      return config.type === 'internal' ? 'dest_location_id' : config.locationField === 'dest' ? 'location_id' : null
    case 'lines':
      return 'lines'
  }
  const m = /^lines\.(\d+)\.(\w+)$/.exec(key)
  if (!m || Number(m[1]) >= lineCount) return key.startsWith('lines') ? 'lines' : null
  return m[2] === 'qty' ? `lines.${Number(m[1])}.qty` : `lines.${Number(m[1])}.product`
}

const ACTION_DONE: Partial<Record<OperationAction, string>> = {
  validate: 'validated — stock updated',
  cancel: 'canceled',
}

export function OperationForm({ config, op }: { config: OperationTypeConfig; op?: OperationDetail }) {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { data: me } = useMe()
  const create = useCreateOperation()
  const update = useUpdateOperation()
  const action = useOperationAction()
  const busy = create.isPending || update.isPending || action.isPending
  const [formError, setFormError] = useState<string | null>(null)
  const [confirmCancel, setConfirmCancel] = useState(false)

  useDocumentTitle(op?.reference ?? `New ${config.singular.toLowerCase()}`)
  const status = op?.status ?? 'draft'
  const editable = status === 'draft'

  // Server state is the source of truth: when the cached operation changes (after save/actions), the form follows it.
  const serverValues = useMemo(() => (op ? toFormValues(op, config) : undefined), [op, config])
  const schema = useMemo(() => schemaFor(config), [config])
  const form = useForm<FormIn, unknown, FormOut>({
    resolver: zodResolver(schema),
    defaultValues: { contact: '', delivery_address: '', scheduled_date: format(new Date(), 'yyyy-MM-dd'), location_id: undefined, lines: [] },
    values: serverValues,
  })
  const lines = useFieldArray({ control: form.control, name: 'lines' })
  const watchedLines = useWatch({ control: form.control, name: 'lines' })
  const { errors, isDirty } = form.formState

  // Availability comes only from the API (free_to_use_at_source / is_short on the saved lines).
  // It is shown for a row only while that row still matches what the server evaluated.
  const showsAvailability = (config.type === 'delivery' || config.type === 'internal') && (status === 'draft' || status === 'waiting')
  const savedLines = useMemo(() => new Map(op?.lines.map((l) => [l.product.id, l]) ?? []), [op])
  const availability = (i: number) => {
    const cur = watchedLines?.[i]
    const saved = cur?.product ? savedLines.get(cur.product.id) : undefined
    if (!saved || saved.free_to_use_at_source === null || Number(cur?.qty) !== saved.qty) return undefined
    return { free: saved.free_to_use_at_source, short: saved.is_short }
  }
  const shortCount = showsAvailability ? (op?.lines.filter((l) => l.is_short).length ?? 0) : 0

  const showError = (e: unknown) => {
    if (!isApiError(e)) return setFormError('Something went wrong. Please try again.')
    if (e.code === 'invalid_state') {
      // Someone else moved it on: say so and reload the real state.
      toast.error(e.message)
      if (op) void qc.invalidateQueries({ queryKey: qk.operations.detail(op.id) })
      return
    }
    // Fields go on their inputs whatever the status (validation_error may be 400 or 422).
    const unmatched: string[] = []
    const lineCount = form.getValues('lines').length
    const tableMessages: string[] = [] // "lines" and unmappable line keys share one slot above the table
    for (const [k, msg] of Object.entries(e.fields)) {
      const field = formFieldFor(k, config, lineCount)
      if (field === 'lines') tableMessages.push(msg)
      else if (field) form.setError(field, { type: 'server', message: msg })
      else unmatched.push(msg)
    }
    if (tableMessages.length) form.setError('lines', { type: 'server', message: tableMessages.join(' ') })
    const matchedAny = Object.keys(e.fields).length > unmatched.length
    // 409 conflict without a matching field: toast, not inline.
    if (e.code === 'conflict') {
      if (!matchedAny) toast.error(e.message)
      return
    }
    if (!Object.keys(e.fields).length || unmatched.length) setFormError(unmatched.join(' ') || e.message)
  }

  /** Create or update; returns the saved operation. */
  const save = (v: FormOut) => {
    const body = toBody(v, config)
    return op ? update.mutateAsync({ id: op.id, body }) : create.mutateAsync(body)
  }
  // Unsaved-changes guard: in-app navigation asks first; closing/reloading the tab gets the browser prompt.
  const hasUnsaved = editable && isDirty
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      hasUnsaved && !(nextLocation.state as { saved?: boolean } | null)?.saved && currentLocation.pathname !== nextLocation.pathname,
  )
  useBeforeUnload(
    useCallback(
      (e: BeforeUnloadEvent) => {
        if (hasUnsaved) e.preventDefault()
      },
      [hasUnsaved],
    ),
  )

  const goTo = (saved: OperationDetail) => {
    if (!op) navigate(`${config.basePath}/${saved.id}`, { replace: true, state: { saved: true } })
  }

  const onSave = form.handleSubmit(async (v) => {
    setFormError(null)
    try {
      const saved = await save(v)
      toast.success(`${saved.reference} saved`)
      goTo(saved)
    } catch (e) {
      showError(e)
    }
  })

  // "To Do" saves pending edits first so the confirmed document is what the user sees.
  const onTodo = form.handleSubmit(async (v) => {
    setFormError(null)
    try {
      const saved = !op || isDirty ? await save(v) : op
      const res = await action.mutateAsync({ id: saved.id, action: 'todo' })
      if (res.status === 'waiting') toast.warning(`${res.reference} is waiting: not enough stock yet`)
      else toast.success(`${res.reference} is ready`)
      goTo(res)
    } catch (e) {
      showError(e)
    }
  })

  const run = async (a: OperationAction) => {
    if (!op) return
    setFormError(null)
    try {
      const res = await action.mutateAsync({ id: op.id, action: a })
      if (a === 'check-availability') {
        if (res.status === 'ready') toast.success(`${res.reference} is ready`)
        else toast.warning('Still not enough stock')
      } else toast.success(`${res.reference} ${ACTION_DONE[a]}`)
    } catch (e) {
      showError(e)
    } finally {
      setConfirmCancel(false)
    }
  }

  const canCancel = op && (status === 'draft' || status === 'waiting' || status === 'ready')
  const responsible = op?.responsible.login_id ?? me?.login_id ?? ''

  return (
    <>
      {op && <OperationPrintView config={config} op={op} />}
      <form onSubmit={onSave} noValidate className="flex flex-col gap-3 print:hidden">
        <nav className="text-sm text-muted-foreground" aria-label="Breadcrumb">
          <Link to={config.basePath} className="hover:text-foreground hover:underline">
            {config.title}
          </Link>
          <span className="mx-1.5">/</span>
          <span className="text-foreground">{op?.reference ?? 'New'}</span>
        </nav>

        {/* Action bar: buttons by status on the left, status bar on the right */}
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-background px-3 py-2 print:hidden">
          <div className="flex flex-wrap gap-2">
            {status === 'draft' && (
              <Button type="button" onClick={onTodo} disabled={busy}>
                To Do
              </Button>
            )}
            {status === 'waiting' && (
              <Button type="button" onClick={() => run('check-availability')} disabled={busy}>
                Check Availability
              </Button>
            )}
            {status === 'ready' && (
              <Button type="button" onClick={() => run('validate')} disabled={busy}>
                Validate
              </Button>
            )}
            {status === 'done' && (
              <Button type="button" onClick={() => window.print()}>
                <Printer /> Print
              </Button>
            )}
            {editable && (!op || isDirty) && (
              <Button type="submit" variant="outline" disabled={busy}>
                Save
              </Button>
            )}
            {!op && (
              <Button type="button" variant="ghost" asChild>
                <Link to={config.basePath}>Discard</Link>
              </Button>
            )}
            {canCancel && (
              <Button type="button" variant="ghost" onClick={() => setConfirmCancel(true)} disabled={busy}>
                Cancel
              </Button>
            )}
          </div>
          <StatusBar steps={config.steps} current={status} />
        </div>

        <div className="rounded-lg border bg-background p-4">
          <div className="mb-4 flex flex-wrap items-baseline gap-3">
            <h1 className="text-3xl font-bold tracking-tight">{op?.reference ?? `New ${config.singular.toLowerCase()}`}</h1>
            {op?.is_late && <LateMarker />}
            {op?.validated_at && <span className="text-xs text-muted-foreground">Validated {formatDateTime(op.validated_at)}</span>}
          </div>

          <FormAlert message={formError} />

          {shortCount > 0 && (
            <div role="status" className="mb-3 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <span>
                {shortCount === 1 ? '1 product does' : `${shortCount} products do`} not have enough stock at {op?.source_location.full_name}.
                {status === 'waiting' && ' Use Check Availability once stock arrives.'}
              </span>
            </div>
          )}

          <div className="mt-2 grid gap-x-8 gap-y-4 md:grid-cols-2">
            {/* Deliveries follow the brief's order: Delivery Address, Schedule Date, Responsible, source location, contact */}
            {config.type === 'delivery' && (
              <TextField label="Delivery Address" readOnly={!editable} error={errors.delivery_address?.message} {...form.register('delivery_address')} />
            )}
            {config.type === 'receipt' && (
              <TextField label={config.contactLabel} readOnly={!editable} error={errors.contact?.message} {...form.register('contact')} />
            )}
            <TextField label="Schedule Date" type="date" readOnly={!editable} error={errors.scheduled_date?.message} {...form.register('scheduled_date')} />
            {config.type === 'delivery' && <TextField label="Responsible" value={responsible} readOnly disabled />}
            <Field data-invalid={errors.location_id ? true : undefined}>
              <FieldLabel htmlFor="location_id">{config.locationLabel}</FieldLabel>
              <Controller
                control={form.control}
                name="location_id"
                render={({ field }) => (
                  <LocationSelect id="location_id" value={field.value} onChange={field.onChange} disabled={!editable} invalid={!!errors.location_id} />
                )}
              />
              <FieldError>{errors.location_id?.message}</FieldError>
            </Field>
            {config.type === 'internal' && (
              <Field data-invalid={errors.dest_location_id ? true : undefined}>
                <FieldLabel htmlFor="dest_location_id">Destination Location</FieldLabel>
                <Controller
                  control={form.control}
                  name="dest_location_id"
                  render={({ field }) => (
                    <LocationSelect id="dest_location_id" value={field.value} onChange={field.onChange} disabled={!editable} invalid={!!errors.dest_location_id} />
                  )}
                />
                <FieldError>{errors.dest_location_id?.message}</FieldError>
              </Field>
            )}
            {config.type === 'delivery' ? (
              <TextField label={config.contactLabel} readOnly={!editable} error={errors.contact?.message} {...form.register('contact')} />
            ) : (
              <TextField label="Responsible" value={responsible} readOnly disabled />
            )}
          </div>

          <h2 className="mt-6 mb-2 text-sm font-medium">Products</h2>
          {(errors.lines?.root?.message || errors.lines?.message) && (
            <FieldError className="mb-2 text-sm">{errors.lines?.root?.message ?? errors.lines?.message}</FieldError>
          )}
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  {showsAvailability && <TableHead className="w-32 text-right">Available</TableHead>}
                  <TableHead className="w-40 text-right">Quantity</TableHead>
                  {editable && <TableHead className="w-12" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.fields.map((row, i) => {
                  const lineErrors = errors.lines?.[i]
                  const product = watchedLines?.[i]?.product
                  const avail = showsAvailability ? availability(i) : undefined
                  const short = !!avail?.short
                  return (
                    <TableRow
                      key={row.id}
                      data-short={short || undefined}
                      className={cn('align-top hover:bg-transparent', short && 'bg-red-50 text-red-900 shadow-[inset_3px_0_0_var(--color-red-500)] hover:bg-red-50 dark:bg-red-500/10 dark:text-red-200 dark:hover:bg-red-500/10')}
                    >
                      <TableCell className="whitespace-normal">
                        {editable ? (
                          <>
                            <Controller
                              control={form.control}
                              name={`lines.${i}.product`}
                              render={({ field }) => (
                                <ProductCombobox value={field.value ?? null} onChange={field.onChange} invalid={!!lineErrors?.product} ariaLabel={`Product line ${i + 1}`} />
                              )}
                            />
                            <FieldError className="mt-1 text-xs">{lineErrors?.product?.message}</FieldError>
                          </>
                        ) : (
                          product && productLabel(product)
                        )}
                        {short && product && (
                          <p className="mt-1 flex items-center gap-1 text-xs font-medium text-red-700 dark:text-red-400">
                            <AlertTriangle className="size-3.5" />
                            Not enough stock for {product.sku}
                          </p>
                        )}
                      </TableCell>
                      {showsAvailability && (
                        <TableCell className="text-right tabular-nums">
                          {avail ? (
                            formatQty(avail.free)
                          ) : (
                            <span className="text-xs text-muted-foreground" title="Availability is checked by the server when the document is saved">
                              {product ? 'Save to check' : '—'}
                            </span>
                          )}
                        </TableCell>
                      )}
                      <TableCell className="text-right">
                        {editable ? (
                          <>
                            <div className="flex items-center justify-end gap-1.5">
                              <Input
                                inputMode="decimal"
                                aria-label={`Quantity line ${i + 1}`}
                                aria-invalid={lineErrors?.qty ? true : undefined}
                                className="w-24 text-right tabular-nums"
                                {...form.register(`lines.${i}.qty`)}
                              />
                              <span className="w-10 text-left text-xs text-muted-foreground">{product?.uom}</span>
                            </div>
                            <FieldError className="mt-1 text-xs">{lineErrors?.qty?.message}</FieldError>
                          </>
                        ) : (
                          <span className="tabular-nums">
                            {formatQty(Number(watchedLines?.[i]?.qty))} <span className="text-xs text-muted-foreground">{product?.uom}</span>
                          </span>
                        )}
                      </TableCell>
                      {editable && (
                        <TableCell>
                          <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove line ${i + 1}`} onClick={() => lines.remove(i)}>
                            <Trash2 />
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  )
                })}
                {editable && (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={showsAvailability ? 4 : 3}>
                      <Button type="button" variant="link" size="sm" className="px-0" onClick={() => lines.append({ product: null, qty: '1' })}>
                        <Plus /> Add a product
                      </Button>
                    </TableCell>
                  </TableRow>
                )}
                {!editable && lines.fields.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={showsAvailability ? 3 : 2} className="text-center text-muted-foreground">
                      No products.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>

        {blocker.state === 'blocked' && (
          <ConfirmDialog
            title="Leave without saving?"
            description="Your changes to this document have not been saved and will be lost."
            confirmLabel="Discard changes"
            cancelLabel="Keep editing"
            destructive
            onConfirm={() => blocker.proceed()}
            onClose={() => blocker.reset()}
          />
        )}
        {confirmCancel && op && (
          <ConfirmDialog
            title={`Cancel ${op.reference}?`}
            description="The operation will be canceled and any reserved stock released. This cannot be undone."
            confirmLabel="Cancel operation"
            destructive
            pending={action.isPending}
            onConfirm={() => void run('cancel')}
            onClose={() => setConfirmCancel(false)}
          />
        )}
      </form>
    </>
  )
}
