import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import type { ID, Location } from '@/api/types'
import { FormAlert } from '@/components/form/FormAlert'
import { TextField } from '@/components/form/TextField'
import { WarehouseSelect } from '@/components/pickers/EntitySelects'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { useCreateLocation, useUpdateLocation } from '@/hooks/useLocations'
import { applyServerErrors } from '@/lib/formErrors'
import { shortCodeSchema } from '@/lib/validation'

const schema = z.object({
  warehouse_id: z.number({ error: 'Choose a warehouse' }),
  name: z.string().trim().min(1, 'Name is required'),
  short_code: shortCodeSchema,
})
type Form = z.infer<typeof schema>

/** `location` = edit (warehouse is fixed: PUT only takes name + short_code); undefined = create. */
export function LocationFormDialog({ location, defaultWarehouseId, onClose }: { location?: Location; defaultWarehouseId?: ID; onClose: () => void }) {
  const create = useCreateLocation()
  const update = useUpdateLocation()
  const pending = create.isPending || update.isPending
  const [formError, setFormError] = useState<string | null>(null)

  const form = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: {
      warehouse_id: location?.warehouse_id ?? defaultWarehouseId,
      name: location?.name ?? '',
      short_code: location?.short_code ?? '',
    },
  })
  const { errors } = form.formState

  const onError = (e: Error) => setFormError(applyServerErrors(e, form.setError, ['warehouse_id', 'name', 'short_code']))

  const onSubmit = form.handleSubmit(({ warehouse_id, name, short_code }) => {
    setFormError(null)
    const done = (l: Location) => {
      toast.success(location ? `Location "${l.full_name}" updated` : `Location "${l.full_name}" created`)
      onClose()
    }
    if (location) update.mutate({ id: location.id, body: { name, short_code } }, { onSuccess: done, onError })
    else create.mutate({ warehouse_id, name, short_code }, { onSuccess: done, onError })
  })

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{location ? `Edit ${location.full_name}` : 'New location'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate>
          <FieldGroup className="gap-4">
            <FormAlert message={formError} />
            <Field data-invalid={errors.warehouse_id ? true : undefined}>
              <FieldLabel htmlFor="warehouse_id">Warehouse</FieldLabel>
              <Controller
                control={form.control}
                name="warehouse_id"
                render={({ field }) => (
                  <WarehouseSelect id="warehouse_id" value={field.value} onChange={field.onChange} disabled={!!location} invalid={!!errors.warehouse_id} />
                )}
              />
              {location && <FieldDescription>A location cannot be moved to another warehouse.</FieldDescription>}
              <FieldError>{errors.warehouse_id?.message}</FieldError>
            </Field>
            <TextField label="Name" autoFocus error={errors.name?.message} {...form.register('name')} />
            <TextField label="Short Code" error={errors.short_code?.message} {...form.register('short_code')} />
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
