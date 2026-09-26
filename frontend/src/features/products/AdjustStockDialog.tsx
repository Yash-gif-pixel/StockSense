import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import { ADJUST_REASONS, type AdjustReason, type ID, type Product } from '@/api/types'
import { FormAlert } from '@/components/form/FormAlert'
import { TextField } from '@/components/form/TextField'
import { LocationSelect } from '@/components/pickers/EntitySelects'
import { ProductCombobox } from '@/components/pickers/ProductCombobox'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useAdjustStock, useStockByLocation } from '@/hooks/useStock'
import { applyServerErrors } from '@/lib/formErrors'
import { formatQty } from '@/lib/format'
import { requiredNumber } from '@/lib/validation'

const REASON_LABEL: Record<AdjustReason, string> = { count: 'Physical count', damaged: 'Damaged', lost: 'Lost', other: 'Other' }

const schema = z.object({
  product: z.custom<Product>((v) => v != null, 'Choose a product'),
  location_id: z.number({ error: 'Choose a location' }),
  counted_qty: requiredNumber('Counted quantity'),
  reason: z.enum(['count', 'damaged', 'lost', 'other']),
  note: z.string().trim().max(500, 'Max 500 characters'),
})
type FormIn = z.input<typeof schema>
type FormOut = z.output<typeof schema>

export interface AdjustStockDefaults {
  product?: Product
  locationId?: ID
}

/** POST /api/stock/adjust. Mounted only while open, so defaults apply fresh each time. */
export function AdjustStockDialog({ defaults, onClose }: { defaults?: AdjustStockDefaults; onClose: () => void }) {
  const adjust = useAdjustStock()
  const [formError, setFormError] = useState<string | null>(null)

  const form = useForm<FormIn, unknown, FormOut>({
    resolver: zodResolver(schema),
    defaultValues: { product: defaults?.product, location_id: defaults?.locationId, counted_qty: '', reason: 'count', note: '' },
  })
  const { errors } = form.formState
  const product = useWatch({ control: form.control, name: 'product' })
  const locationId = useWatch({ control: form.control, name: 'location_id' })

  // Current figures at the chosen location, as reported by the API (shown for reference only).
  const byLocation = useStockByLocation(product?.id ?? null)
  const current = byLocation.data?.items.find((r) => r.location.id === locationId)

  const onSubmit = form.handleSubmit(({ product, location_id, counted_qty, reason, note }) => {
    setFormError(null)
    adjust.mutate(
      { product_id: product.id, location_id, counted_qty, reason, ...(note ? { note } : {}) },
      {
        onSuccess: (res) => {
          if (!res.changed) toast.info('No difference — nothing recorded')
          else toast.success(`Stock updated (${res.operation?.reference ?? 'adjustment recorded'})`)
          onClose()
        },
        onError: (e) => setFormError(applyServerErrors(e, form.setError, ['location_id', 'counted_qty', 'reason', 'note'])),
      },
    )
  })

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="sm:max-w-md"
        onOpenAutoFocus={(e) => {
          // Prefilled from a product: jump straight to the quantity instead of the first field.
          if (defaults?.product) {
            e.preventDefault()
            form.setFocus('counted_qty')
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>Update stock</DialogTitle>
          <DialogDescription>Enter the quantity actually counted. The difference is recorded as an adjustment.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate>
          <FieldGroup className="gap-4">
            <FormAlert message={formError} />
            <Field data-invalid={errors.product ? true : undefined}>
              <FieldLabel htmlFor="adj-product">Product</FieldLabel>
              <Controller
                control={form.control}
                name="product"
                render={({ field }) => <ProductCombobox id="adj-product" value={field.value ?? null} onChange={field.onChange} invalid={!!errors.product} />}
              />
              <FieldError>{errors.product?.message}</FieldError>
            </Field>
            <Field data-invalid={errors.location_id ? true : undefined}>
              <FieldLabel htmlFor="adj-location">Location</FieldLabel>
              <Controller
                control={form.control}
                name="location_id"
                render={({ field }) => <LocationSelect id="adj-location" value={field.value} onChange={field.onChange} invalid={!!errors.location_id} />}
              />
              <FieldError>{errors.location_id?.message}</FieldError>
            </Field>
            {product && locationId !== undefined && (
              <p className="-mt-2 text-xs text-muted-foreground">
                {byLocation.isPending
                  ? 'Loading current stock…'
                  : `Currently on hand: ${formatQty(current?.on_hand ?? 0)} ${product.uom} · reserved ${formatQty(current?.reserved ?? 0)}`}
              </p>
            )}
            <TextField label="Counted quantity" inputMode="decimal" error={errors.counted_qty?.message} {...form.register('counted_qty')} />
            <Field data-invalid={errors.reason ? true : undefined}>
              <FieldLabel htmlFor="adj-reason">Reason</FieldLabel>
              <Controller
                control={form.control}
                name="reason"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="adj-reason" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ADJUST_REASONS.map((r) => (
                        <SelectItem key={r} value={r}>
                          {REASON_LABEL[r]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              <FieldError>{errors.reason?.message}</FieldError>
            </Field>
            <Field data-invalid={errors.note ? true : undefined}>
              <FieldLabel htmlFor="adj-note">Note (optional)</FieldLabel>
              <Textarea id="adj-note" rows={2} {...form.register('note')} />
              <FieldError>{errors.note?.message}</FieldError>
            </Field>
          </FieldGroup>
          <DialogFooter className="mt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={adjust.isPending}>
              {adjust.isPending ? 'Saving…' : 'Apply'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
