import { ArrowRight, X } from 'lucide-react'
import { useState } from 'react'
import type { MoveDirection, Product } from '@/api/types'
import { Pagination } from '@/components/data/Pagination'
import { SearchInput } from '@/components/data/SearchInput'
import { TableMessageRow, TableSkeletonRows } from '@/components/data/TableStates'
import { PageHeader } from '@/components/PageHeader'
import { LocationSelect } from '@/components/pickers/EntitySelects'
import { ProductCombobox } from '@/components/pickers/ProductCombobox'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useMoves } from '@/hooks/useMoves'
import { useProducts } from '@/hooks/useProducts'
import { useUrlParams } from '@/hooks/useUrlParams'
import { formatDateTime, formatQty, productLabel } from '@/lib/format'
import { cn } from '@/lib/utils'

const LIMIT = 50
const COLUMNS = 7
const ALL = '__all__'

const DIRECTION_ROW: Record<MoveDirection, string> = {
  in: 'bg-emerald-50/70 text-emerald-900 hover:bg-emerald-50 dark:bg-emerald-400/10 dark:text-emerald-200 dark:hover:bg-emerald-400/15',
  out: 'bg-red-50/70 text-red-900 hover:bg-red-50 dark:bg-red-500/10 dark:text-red-200 dark:hover:bg-red-500/15',
  internal: '',
}
const DIRECTION_SIGN: Record<MoveDirection, string> = { in: '+', out: '−', internal: '' }

export function MovesPage() {
  const url = useUrlParams()
  const search = url.get('search')
  const productId = url.getNumber('product_id')
  const locationId = url.getNumber('location_id')
  const direction = (url.get('direction') || undefined) as MoveDirection | undefined
  const dateFrom = url.get('date_from')
  const dateTo = url.get('date_to')
  const offset = url.getNumber('offset') ?? 0

  const { data, isPending, error, isPlaceholderData } = useMoves({
    search: search || undefined,
    product_id: productId,
    location_id: locationId,
    direction,
    date_from: dateFrom || undefined,
    date_to: dateTo || undefined,
    limit: LIMIT,
    offset,
  })

  // The product filter lives in the URL as an id; resolve it to a Product for the picker's label.
  const [picked, setPicked] = useState<Product | null>(null)
  const needsLookup = productId !== undefined && picked?.id !== productId
  const lookup = useProducts({ limit: 200 }, { enabled: needsLookup })
  const productValue = !productId ? null : picked?.id === productId ? picked : (lookup.data?.items.find((p) => p.id === productId) ?? null)

  const filtered = !!(search || productId || locationId || direction || dateFrom || dateTo)

  return (
    <>
      <PageHeader eyebrow="Inventory" title="Move History">
        <SearchInput value={search} onChange={(v) => url.set({ search: v })} placeholder="Search reference, contact, product…" />
        <div className="flex items-center gap-1">
          <ProductCombobox
            value={productValue}
            onChange={(p) => {
              setPicked(p)
              url.set({ product_id: p.id })
            }}
            includeInactive
            ariaLabel="Product"
            placeholder={needsLookup && lookup.isPending ? 'Loading…' : 'All products'}
            className="w-56"
          />
          {productId && (
            <Button variant="ghost" size="icon-sm" aria-label="Clear product filter" onClick={() => url.set({ product_id: undefined })}>
              <X />
            </Button>
          )}
        </div>
        <LocationSelect value={locationId} onChange={(v) => url.set({ location_id: v })} allLabel="All locations" className="w-44" />
        <Select value={direction ?? ALL} onValueChange={(v) => url.set({ direction: v === ALL ? undefined : v })}>
          <SelectTrigger className="w-36" aria-label="Direction">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All moves</SelectItem>
            <SelectItem value="in">In</SelectItem>
            <SelectItem value="out">Out</SelectItem>
            <SelectItem value="internal">Internal</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex items-center gap-1 text-sm text-muted-foreground">
          <Input type="date" aria-label="From date" value={dateFrom} max={dateTo || undefined} onChange={(e) => url.set({ date_from: e.target.value })} className="w-36" />
          <span>–</span>
          <Input type="date" aria-label="To date" value={dateTo} min={dateFrom || undefined} onChange={(e) => url.set({ date_to: e.target.value })} className="w-36" />
        </div>
        {filtered && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => url.set({ search: undefined, product_id: undefined, location_id: undefined, direction: undefined, date_from: undefined, date_to: undefined })}
          >
            Clear filters
          </Button>
        )}
      </PageHeader>

      <div className={cn('rounded-lg border bg-background transition-opacity', isPlaceholderData && 'opacity-60')}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Reference</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Product</TableHead>
              <TableHead>From</TableHead>
              <TableHead>To</TableHead>
              <TableHead className="text-right">Quantity</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isPending ? (
              <TableSkeletonRows columns={COLUMNS} />
            ) : error ? (
              <TableMessageRow columns={COLUMNS}>{error.message}</TableMessageRow>
            ) : data.items.length === 0 ? (
              <TableMessageRow columns={COLUMNS}>{filtered ? 'No moves match these filters.' : 'No stock moves yet.'}</TableMessageRow>
            ) : (
              data.items.map((m) => (
                <TableRow key={m.id} data-direction={m.direction} className={DIRECTION_ROW[m.direction]}>
                  <TableCell className="font-medium">{m.reference}</TableCell>
                  <TableCell className="whitespace-nowrap tabular-nums">{formatDateTime(m.created_at)}</TableCell>
                  <TableCell className="opacity-80">{m.contact ?? '—'}</TableCell>
                  <TableCell>{productLabel(m.product)}</TableCell>
                  <TableCell>{m.from_location.full_name}</TableCell>
                  <TableCell>
                    <span className="inline-flex items-center gap-1">
                      <ArrowRight className="size-3.5 opacity-50" />
                      {m.to_location.full_name}
                    </span>
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {DIRECTION_SIGN[m.direction]}
                    {formatQty(m.qty)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      {data && <Pagination total={data.total} limit={LIMIT} offset={offset} onOffsetChange={(o) => url.set({ offset: o || undefined })} />}
    </>
  )
}
