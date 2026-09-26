import { Search } from 'lucide-react'
import { useEffect, useState } from 'react'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'

/** Search box that reports its value after the user pauses typing. */
export function SearchInput({ value, onChange, placeholder = 'Search…', className }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string }) {
  const [draft, setDraft] = useState(value)
  const [lastValue, setLastValue] = useState(value)

  // Follow external changes (e.g. back/forward navigation) — adjusted during render, not in an effect.
  if (value !== lastValue) {
    setLastValue(value)
    setDraft(value)
  }

  useEffect(() => {
    if (draft.trim() === value) return
    const t = setTimeout(() => onChange(draft.trim()), 300)
    return () => clearTimeout(t)
  }, [draft, value, onChange])

  return (
    <InputGroup className={className ?? 'w-64'}>
      <InputGroupAddon>
        <Search />
      </InputGroupAddon>
      <InputGroupInput type="search" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={placeholder} aria-label={placeholder} />
    </InputGroup>
  )
}
