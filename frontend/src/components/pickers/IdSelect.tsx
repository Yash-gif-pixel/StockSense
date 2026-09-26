import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { ID } from '@/api/types'

const ALL = '__all__'

export interface IdOption {
  value: ID
  label: string
}

interface IdSelectProps {
  value: ID | undefined
  onChange: (value: ID | undefined) => void
  options: IdOption[]
  placeholder?: string
  /** When set, adds a first option that clears the value (for filters). */
  allLabel?: string
  disabled?: boolean
  id?: string
  invalid?: boolean
  className?: string
  /** Accessible name when there is no visible <label htmlFor={id}> (e.g. filter bars). */
  ariaLabel?: string
}

/** Radix Select over numeric ids (Radix values are strings; empty string is not allowed as an item value). */
export function IdSelect({ value, onChange, options, placeholder, allLabel, disabled, id, invalid, className, ariaLabel }: IdSelectProps) {
  const current = value === undefined ? (allLabel ? ALL : '') : String(value)
  return (
    <Select
      value={current}
      onValueChange={(v) => {
        // Radix can emit "" when the value's option isn't rendered yet (options still loading) — not a user choice.
        if (v === '') return
        onChange(v === ALL ? undefined : Number(v))
      }}
      disabled={disabled}
    >
      <SelectTrigger id={id} aria-label={id ? undefined : ariaLabel} aria-invalid={invalid || undefined} className={className ?? 'w-full'}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {allLabel && <SelectItem value={ALL}>{allLabel}</SelectItem>}
        {options.map((o) => (
          <SelectItem key={o.value} value={String(o.value)}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
