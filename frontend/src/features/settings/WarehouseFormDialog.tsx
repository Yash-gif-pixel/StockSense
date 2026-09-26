import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import type { Warehouse } from '@/api/types'
import { FormAlert } from '@/components/form/FormAlert'
import { TextField } from '@/components/form/TextField'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { FieldGroup } from '@/components/ui/field'
import { useSaveWarehouse } from '@/hooks/useWarehouses'
import { applyServerErrors } from '@/lib/formErrors'
import { shortCodeSchema } from '@/lib/validation'

const schema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  short_code: shortCodeSchema,
  address: z.string().trim().min(1, 'Address is required'),
})
type Form = z.infer<typeof schema>

/** `warehouse` = edit; undefined = create. Mounted only while open so it starts fresh each time. */
export function WarehouseFormDialog({ warehouse, onClose }: { warehouse?: Warehouse; onClose: () => void }) {
  const save = useSaveWarehouse()
  const [formError, setFormError] = useState<string | null>(null)
  const form = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: { name: warehouse?.name ?? '', short_code: warehouse?.short_code ?? '', address: warehouse?.address ?? '' },
  })
  const { errors } = form.formState

  const onSubmit = form.handleSubmit((body) => {
    setFormError(null)
    save.mutate(
      { id: warehouse?.id, body },
      {
        onSuccess: (w) => {
          toast.success(warehouse ? `Warehouse "${w.name}" updated` : `Warehouse "${w.name}" created with a "Stock" location`)
          onClose()
        },
        onError: (e) => setFormError(applyServerErrors(e, form.setError, ['name', 'short_code', 'address'])),
      },
    )
  })

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{warehouse ? 'Edit warehouse' : 'New warehouse'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate>
          <FieldGroup className="gap-4">
            <FormAlert message={formError} />
            <TextField label="Name" autoFocus error={errors.name?.message} {...form.register('name')} />
            <TextField label="Short Code" description="Used as the prefix of references and location names, e.g. WH" error={errors.short_code?.message} {...form.register('short_code')} />
            <TextField label="Address" error={errors.address?.message} {...form.register('address')} />
          </FieldGroup>
          <DialogFooter className="mt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
