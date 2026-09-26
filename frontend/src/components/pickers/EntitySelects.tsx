import type { ID } from '@/api/types'
import { useCategories } from '@/hooks/useCategories'
import { useLocations } from '@/hooks/useLocations'
import { useWarehouses } from '@/hooks/useWarehouses'
import { IdSelect } from './IdSelect'

type Common = {
  value: ID | undefined
  onChange: (value: ID | undefined) => void
  allLabel?: string
  placeholder?: string
  id?: string
  invalid?: boolean
  disabled?: boolean
  className?: string
}

export function WarehouseSelect(props: Common) {
  const { data, isPending } = useWarehouses()
  const options = (data?.items ?? []).map((w) => ({ value: w.id, label: `${w.name} (${w.short_code})` }))
  return <IdSelect ariaLabel="Warehouse" {...props} options={options} placeholder={isPending ? 'Loading…' : (props.placeholder ?? 'Select warehouse')} />
}

export function CategorySelect(props: Common) {
  const { data, isPending } = useCategories()
  const options = (data?.items ?? []).map((c) => ({ value: c.id, label: c.name }))
  return <IdSelect ariaLabel="Category" {...props} options={options} placeholder={isPending ? 'Loading…' : (props.placeholder ?? 'Select category')} />
}

/** Internal locations only (contract: only internal locations are shown in pickers). */
export function LocationSelect({ warehouseId, ...props }: Common & { warehouseId?: ID }) {
  const { data, isPending } = useLocations({ type: 'internal', warehouse_id: warehouseId })
  const options = (data?.items ?? []).map((l) => ({ value: l.id, label: l.full_name }))
  return <IdSelect ariaLabel="Location" {...props} options={options} placeholder={isPending ? 'Loading…' : (props.placeholder ?? 'Select location')} />
}
