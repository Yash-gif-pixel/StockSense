import { Check, ChevronsUpDown } from 'lucide-react'
import { useDeferredValue, useState } from 'react'
import type { Product } from '@/api/types'
import { Button } from '@/components/ui/button'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useProducts } from '@/hooks/useProducts'
import { productLabel } from '@/lib/format'
import { cn } from '@/lib/utils'

/** Searchable product picker (server-side search on name or SKU). Shows "[SKU] Name". */
export function ProductCombobox({
  value,
  onChange,
  id,
  invalid,
  disabled,
  placeholder = 'Select product',
  ariaLabel,
  includeInactive = false,
  className,
}: {
  value: Product | null
  onChange: (p: Product) => void
  id?: string
  invalid?: boolean
  disabled?: boolean
  placeholder?: string
  /** Accessible name when there is no <label htmlFor={id}> (e.g. inside a table row). */
  ariaLabel?: string
  /** Pickers for new documents hide inactive products; filters over history need them. */
  includeInactive?: boolean
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const deferred = useDeferredValue(search.trim())
  const { data, isFetching } = useProducts({ search: deferred || undefined, active: includeInactive ? undefined : true, limit: 20 }, { enabled: open })
  const items = data?.items ?? []

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button id={id} type="button" variant="outline" role="combobox" aria-expanded={open} aria-label={id ? undefined : ariaLabel} aria-invalid={invalid || undefined} disabled={disabled} className={cn('w-full justify-between font-normal', className)}>
          <span className={cn('truncate', !value && 'text-muted-foreground')}>{value ? productLabel(value) : placeholder}</span>
          <ChevronsUpDown className="opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) min-w-64 p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Search name or SKU…" value={search} onValueChange={setSearch} />
          <CommandList>
            <CommandEmpty>{isFetching ? 'Searching…' : 'No products found.'}</CommandEmpty>
            <CommandGroup>
              {items.map((p) => (
                <CommandItem
                  key={p.id}
                  value={String(p.id)}
                  onSelect={() => {
                    onChange(p)
                    setOpen(false)
                    setSearch('')
                  }}
                >
                  <Check className={cn(value?.id === p.id ? 'opacity-100' : 'opacity-0')} />
                  <span className="font-mono text-xs text-muted-foreground">[{p.sku}]</span>
                  {p.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
