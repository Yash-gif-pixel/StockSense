import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import type { Product } from '@/api/types'
import { FormAlert } from '@/components/form/FormAlert'
import { TextField } from '@/components/form/TextField'
import { CategoryCombobox } from '@/components/pickers/CategoryCombobox'
import { LocationSelect } from '@/components/pickers/EntitySelects'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { useCreateProduct, useUpdateProduct } from '@/hooks/useProducts'
import { applyServerErrors } from '@/lib/formErrors'
import { optionalNumber, requiredNumber } from '@/lib/validation'

const schema = z
  .object({
    name: z.string().trim().min(1, 'Name is required'),
    sku: z.string().trim().min(1, 'SKU is required'),
    category_id: z.number().nullable(),
    uom: z.string().trim().min(1, 'Unit of measure is required'),
    unit_cost: requiredNumber('Unit cost'),
    min_qty: optionalNumber('Min quantity'),
    active: z.boolean(),
    initial_qty: optionalNumber('Initial quantity'),
    initial_location_id: z.number().optional(),
  })
  .refine((v) => !(v.initial_qty && v.initial_qty > 0) || v.initial_location_id !== undefined, {
    error: 'Choose where the initial stock is',
    path: ['initial_location_id'],
  })
type FormIn = z.input<typeof schema>
type FormOut = z.output<typeof schema>

const SERVER_FIELDS = ['name', 'sku', 'category_id', 'uom', 'unit_cost', 'min_qty', 'active', 'initial_qty', 'initial_location_id'] as const

/** `product` = edit (PUT, no initial stock); undefined = create (POST, optional initial stock). */
export function ProductFormDialog({ product, onClose }: { product?: Product; onClose: () => void }) {
  const create = useCreateProduct()
  const update = useUpdateProduct()
  const pending = create.isPending || update.isPending
  const [formError, setFormError] = useState<string | null>(null)

  const form = useForm<FormIn, unknown, FormOut>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: product?.name ?? '',
      sku: product?.sku ?? '',
      category_id: product?.category?.id ?? null,
      uom: product?.uom ?? 'Units',
      unit_cost: product ? String(product.unit_cost) : '',
      min_qty: product?.min_qty != null ? String(product.min_qty) : '',
      active: product?.active ?? true,
      initial_qty: '',
      initial_location_id: undefined,
    },
  })
  const { errors } = form.formState

  const onError = (e: Error) => setFormError(applyServerErrors(e, form.setError, SERVER_FIELDS))

  const onSubmit = form.handleSubmit((v) => {
    setFormError(null)
    const base = { name: v.name, sku: v.sku, category_id: v.category_id, uom: v.uom, unit_cost: v.unit_cost, min_qty: v.min_qty }
    if (product) {
      update.mutate(
        { id: product.id, body: { ...base, active: v.active } },
        {
          onSuccess: (p) => {
            toast.success(`"${p.name}" updated`)
            onClose()
          },
          onError,
        },
      )
    } else {
      const withStock = v.initial_qty !== null && v.initial_qty > 0
      create.mutate(
        { ...base, ...(withStock ? { initial_qty: v.initial_qty!, initial_location_id: v.initial_location_id } : {}) },
        {
          onSuccess: (p) => {
            toast.success(`"${p.name}" created${withStock ? ' with initial stock' : ''}`)
            onClose()
          },
          onError,
        },
      )
    }
  })

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{product ? `Edit ${product.name}` : 'New product'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate>
          <FieldGroup className="gap-4">
            <FormAlert message={formError} />
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField label="Name" autoFocus error={errors.name?.message} {...form.register('name')} />
              <TextField label="SKU" className="font-mono" error={errors.sku?.message} {...form.register('sku')} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field data-invalid={errors.category_id ? true : undefined}>
                <FieldLabel htmlFor="category_id">Category</FieldLabel>
                <Controller
                  control={form.control}
                  name="category_id"
                  render={({ field }) => <CategoryCombobox id="category_id" value={field.value} onChange={field.onChange} invalid={!!errors.category_id} />}
                />
                <FieldError>{errors.category_id?.message}</FieldError>
              </Field>
              <TextField label="Unit of measure" description="e.g. Units, kg, m" error={errors.uom?.message} {...form.register('uom')} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField label="Per unit cost" inputMode="decimal" error={errors.unit_cost?.message} {...form.register('unit_cost')} />
              <TextField
                label="Min quantity (optional)"
                inputMode="decimal"
                description="Flag as low stock at or below this"
                error={errors.min_qty?.message}
                {...form.register('min_qty')}
              />
            </div>

            {product ? (
              <Field orientation="horizontal">
                <input id="active" type="checkbox" className="size-4 accent-foreground" {...form.register('active')} />
                <FieldLabel htmlFor="active" className="font-normal">
                  Active (inactive products are hidden from pickers)
                </FieldLabel>
              </Field>
            ) : (
              <div className="grid gap-4 rounded-lg border border-dashed p-3 sm:grid-cols-2">
                <TextField label="Initial quantity (optional)" inputMode="decimal" error={errors.initial_qty?.message} {...form.register('initial_qty')} />
                <Field data-invalid={errors.initial_location_id ? true : undefined}>
                  <FieldLabel htmlFor="initial_location_id">Initial location</FieldLabel>
                  <Controller
                    control={form.control}
                    name="initial_location_id"
                    render={({ field }) => (
                      <LocationSelect id="initial_location_id" value={field.value} onChange={field.onChange} invalid={!!errors.initial_location_id} />
                    )}
                  />
                  <FieldError>{errors.initial_location_id?.message}</FieldError>
                </Field>
                <FieldDescription className="sm:col-span-2">Recorded as a stock adjustment and shown in Move History.</FieldDescription>
              </div>
            )}
          </FieldGroup>
          <DialogFooter className="mt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
