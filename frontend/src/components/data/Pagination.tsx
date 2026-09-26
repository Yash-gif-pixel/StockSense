import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'

/** Offset pagination over the contract's {items, total} lists. */
export function Pagination({ total, limit, offset, onOffsetChange }: { total: number; limit: number; offset: number; onOffsetChange: (offset: number) => void }) {
  if (total <= limit && offset === 0) return total > 0 ? <p className="mt-2 text-xs text-muted-foreground">{total} record{total === 1 ? '' : 's'}</p> : null
  const from = Math.min(offset + 1, total)
  const to = Math.min(offset + limit, total)
  return (
    <div className="mt-2 flex items-center justify-end gap-2 text-xs text-muted-foreground">
      <span>
        {from}–{to} of {total}
      </span>
      <Button variant="outline" size="icon-sm" aria-label="Previous page" disabled={offset === 0} onClick={() => onOffsetChange(Math.max(0, offset - limit))}>
        <ChevronLeft />
      </Button>
      <Button variant="outline" size="icon-sm" aria-label="Next page" disabled={offset + limit >= total} onClick={() => onOffsetChange(offset + limit)}>
        <ChevronRight />
      </Button>
    </div>
  )
}
