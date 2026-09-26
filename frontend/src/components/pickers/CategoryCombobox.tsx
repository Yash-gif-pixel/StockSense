import { Check, ChevronsUpDown, Plus } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import type { ID } from '@/api/types'
import { Button } from '@/components/ui/button'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useCategories, useCreateCategory } from '@/hooks/useCategories'
import { cn } from '@/lib/utils'

/** Category picker with "Create …" for a name that doesn't exist yet. */
export function CategoryCombobox({ value, onChange, id, invalid }: { value: ID | null; onChange: (v: ID | null) => void; id?: string; invalid?: boolean }) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const { data } = useCategories()
  const create = useCreateCategory()
  const categories = data?.items ?? []
  const selected = categories.find((c) => c.id === value)
  const term = search.trim()
  const exists = categories.some((c) => c.name.toLowerCase() === term.toLowerCase())

  const pick = (v: ID | null) => {
    onChange(v)
    setOpen(false)
    setSearch('')
  }

  const onCreate = () =>
    create.mutate(
      { name: term },
      {
        onSuccess: (cat) => {
          toast.success(`Category "${cat.name}" created`)
          pick(cat.id)
        },
        onError: (e) => toast.error(e.message),
      },
    )

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button id={id} type="button" variant="outline" role="combobox" aria-expanded={open} aria-invalid={invalid || undefined} className="w-full justify-between font-normal">
          <span className={cn('truncate', !selected && 'text-muted-foreground')}>{selected?.name ?? 'No category'}</span>
          <ChevronsUpDown className="opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
        <Command>
          <CommandInput placeholder="Search or create…" value={search} onValueChange={setSearch} />
          <CommandList>
            <CommandEmpty>{term ? 'No match.' : 'No categories yet.'}</CommandEmpty>
            <CommandGroup>
              <CommandItem value="__none__" onSelect={() => pick(null)}>
                <Check className={cn(value === null ? 'opacity-100' : 'opacity-0')} />
                No category
              </CommandItem>
              {categories.map((c) => (
                <CommandItem key={c.id} value={c.name} onSelect={() => pick(c.id)}>
                  <Check className={cn(value === c.id ? 'opacity-100' : 'opacity-0')} />
                  {c.name}
                </CommandItem>
              ))}
            </CommandGroup>
            {term && !exists && (
              <CommandGroup forceMount>
                <CommandItem forceMount value={`__create__${term}`} onSelect={onCreate} disabled={create.isPending}>
                  <Plus />
                  Create &quot;{term}&quot;
                </CommandItem>
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
