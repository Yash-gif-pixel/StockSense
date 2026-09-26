import type { StockStatus } from '@/api/types'
import { Badge } from '@/components/ui/badge'

/** Only low / out are flagged; ok stays quiet to keep the table scannable. */
export function StockStatusBadge({ status }: { status: StockStatus }) {
  if (status === 'out') return <Badge variant="destructive">Out of stock</Badge>
  if (status === 'low') return <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 dark:bg-amber-400/15 dark:text-amber-300">Low stock</Badge>
  return null
}
