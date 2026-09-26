import { Pencil, SlidersHorizontal } from 'lucide-react'
import type { ID, StockRow } from '@/api/types'
import { TableMessageRow, TableSkeletonRows } from '@/components/data/TableStates'
import { StockStatusBadge } from '@/components/StockStatusBadge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useStockByLocation } from '@/hooks/useStock'
import { formatMoney, formatQty } from '@/lib/format'

/** Per-location stock for one product (GET /api/stock/{id}/locations). */
export function ProductStockSheet({
  row,
  onClose,
  onAdjust,
  onEdit,
}: {
  row: StockRow
  onClose: () => void
  onAdjust: (locationId?: ID) => void
  onEdit: () => void
}) {
  const { product } = row
  const { data, isPending, isError, error } = useStockByLocation(product.id)

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full gap-0 sm:max-w-lg">
        <SheetHeader className="border-b">
          <SheetTitle className="flex flex-wrap items-center gap-2">
            {product.name}
            <StockStatusBadge status={row.status} />
            {!product.active && <Badge variant="outline">Inactive</Badge>}
          </SheetTitle>
          <SheetDescription className="font-mono">{product.sku}</SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-4 overflow-y-auto p-4">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted-foreground">Category</dt>
            <dd>{product.category?.name ?? '—'}</dd>
            <dt className="text-muted-foreground">Per unit cost</dt>
            <dd className="tabular-nums">{formatMoney(product.unit_cost)}</dd>
            <dt className="text-muted-foreground">Min quantity</dt>
            <dd className="tabular-nums">{product.min_qty === null ? '—' : `${formatQty(product.min_qty)} ${product.uom}`}</dd>
            <dt className="text-muted-foreground">Total on hand / free</dt>
            <dd className="tabular-nums">
              {formatQty(row.on_hand)} / {formatQty(row.free_to_use)} {product.uom}
            </dd>
          </dl>

          <div className="flex gap-2">
            <Button size="sm" onClick={() => onAdjust(data?.items[0]?.location.id)}>
              <SlidersHorizontal /> Update stock
            </Button>
            <Button size="sm" variant="outline" onClick={onEdit}>
              <Pencil /> Edit product
            </Button>
          </div>

          <div>
            <h3 className="mb-2 text-sm font-medium">Stock by location</h3>
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Location</TableHead>
                    <TableHead className="text-right">On hand</TableHead>
                    <TableHead className="text-right">Reserved</TableHead>
                    <TableHead className="text-right">Free</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isPending ? (
                    <TableSkeletonRows columns={5} rows={2} />
                  ) : isError ? (
                    <TableMessageRow columns={5}>{error.message}</TableMessageRow>
                  ) : data.items.length === 0 ? (
                    <TableMessageRow columns={5}>No stock at any location.</TableMessageRow>
                  ) : (
                    data.items.map((r) => (
                      <TableRow key={r.location.id}>
                        <TableCell className="font-medium">{r.location.full_name}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatQty(r.on_hand)}</TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">{formatQty(r.reserved)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatQty(r.free_to_use)}</TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon-sm" aria-label={`Update stock at ${r.location.full_name}`} onClick={() => onAdjust(r.location.id)}>
                            <SlidersHorizontal />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
