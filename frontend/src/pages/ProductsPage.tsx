import { Plus, SlidersHorizontal } from 'lucide-react'
import { useState } from 'react'
import type { Product, StockRow, StockStatus } from '@/api/types'
import { Pagination } from '@/components/data/Pagination'
import { SearchInput } from '@/components/data/SearchInput'
import { TableMessageRow, TableSkeletonRows } from '@/components/data/TableStates'
import { PageHeader } from '@/components/PageHeader'
import { CategorySelect, WarehouseSelect } from '@/components/pickers/EntitySelects'
import { StockStatusBadge } from '@/components/StockStatusBadge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { AdjustStockDialog, type AdjustStockDefaults } from '@/features/products/AdjustStockDialog'
import { ProductFormDialog } from '@/features/products/ProductFormDialog'
import { ProductStockSheet } from '@/features/products/ProductStockSheet'
import { useStock } from '@/hooks/useStock'
import { useUrlParams } from '@/hooks/useUrlParams'
import { formatMoney, formatQty } from '@/lib/format'
import { cn } from '@/lib/utils'

const LIMIT = 50
const COLUMNS = 7
const STATUS_FILTERS: { value: StockStatus; label: string }[] = [
  { value: 'ok', label: 'In stock' },
  { value: 'low', label: 'Low stock' },
  { value: 'out', label: 'Out of stock' },
]

export function ProductsPage() {
  const url = useUrlParams()
  const search = url.get('search')
  const categoryId = url.getNumber('category_id')
  const warehouseId = url.getNumber('warehouse_id')
  const status = (url.get('status') || undefined) as StockStatus | undefined
  const offset = url.getNumber('offset') ?? 0

  const { data, isPending, isError, error, isPlaceholderData } = useStock({
    search: search || undefined,
    category_id: categoryId,
    warehouse_id: warehouseId,
    status,
    limit: LIMIT,
    offset,
  })

  // Drawer follows the selected product through refetches (e.g. after an adjustment);
  // falls back to the clicked row if a filter change drops it from the current page.
  const [selected, setSelected] = useState<StockRow | null>(null)
  const selectedRow = selected && (data?.items.find((r) => r.product.id === selected.product.id) ?? selected)

  const [adjustDefaults, setAdjustDefaults] = useState<AdjustStockDefaults | null>(null)
  // undefined = closed, null = create, Product = edit
  const [productForm, setProductForm] = useState<Product | null | undefined>(undefined)

  return (
    <>
      <PageHeader
        eyebrow="Inventory"
        title="Products"
        actions={
          <>
            <Button variant="outline" onClick={() => setAdjustDefaults({})}>
              <SlidersHorizontal /> Update stock
            </Button>
            <Button onClick={() => setProductForm(null)}>
              <Plus /> New product
            </Button>
          </>
        }
      >
        <SearchInput value={search} onChange={(v) => url.set({ search: v })} placeholder="Search name or SKU…" />
        <CategorySelect value={categoryId} onChange={(v) => url.set({ category_id: v })} allLabel="All categories" className="w-44" />
        <WarehouseSelect value={warehouseId} onChange={(v) => url.set({ warehouse_id: v })} allLabel="All warehouses" className="w-52" />
        <Select value={status ?? 'all'} onValueChange={(v) => url.set({ status: v === 'all' ? undefined : v })}>
          <SelectTrigger className="w-40" aria-label="Stock status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any status</SelectItem>
            {STATUS_FILTERS.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </PageHeader>

      <div className={cn('rounded-lg border bg-background transition-opacity', isPlaceholderData && 'opacity-60')}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product</TableHead>
              <TableHead>SKU</TableHead>
              <TableHead>Category</TableHead>
              <TableHead className="text-right">Per unit cost</TableHead>
              <TableHead className="text-right">On hand</TableHead>
              <TableHead className="text-right">Free to use</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isPending ? (
              <TableSkeletonRows columns={COLUMNS} />
            ) : isError ? (
              <TableMessageRow columns={COLUMNS}>{error.message}</TableMessageRow>
            ) : data.items.length === 0 ? (
              <TableMessageRow columns={COLUMNS}>
                {search || categoryId || warehouseId || status ? 'No products match these filters.' : 'No products yet — create one to get started.'}
              </TableMessageRow>
            ) : (
              data.items.map((r) => (
                <TableRow key={r.product.id} className="cursor-pointer" onClick={() => setSelected(r)}>
                  <TableCell className="font-medium">
                    {r.product.name}
                    {!r.product.active && (
                      <Badge variant="outline" className="ml-2">
                        Inactive
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{r.product.sku}</TableCell>
                  <TableCell className="text-muted-foreground">{r.product.category?.name ?? '—'}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatMoney(r.product.unit_cost)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatQty(r.on_hand)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatQty(r.free_to_use)}</TableCell>
                  <TableCell>
                    <StockStatusBadge status={r.status} />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      {data && <Pagination total={data.total} limit={LIMIT} offset={offset} onOffsetChange={(o) => url.set({ offset: o || undefined })} />}

      {selectedRow && (
        <ProductStockSheet
          row={selectedRow}
          onClose={() => setSelected(null)}
          onAdjust={(locationId) => setAdjustDefaults({ product: selectedRow.product, locationId })}
          onEdit={() => setProductForm(selectedRow.product)}
        />
      )}
      {adjustDefaults && <AdjustStockDialog defaults={adjustDefaults} onClose={() => setAdjustDefaults(null)} />}
      {productForm !== undefined && <ProductFormDialog product={productForm ?? undefined} onClose={() => setProductForm(undefined)} />}
    </>
  )
}
