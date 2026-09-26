import { AlertTriangle, ArrowDownToLine, ArrowUpFromLine, CircleCheck, CircleSlash, Clock, PackageMinus, Repeat } from 'lucide-react'
import type { ReactNode } from 'react'
import type { Location, OperationSummary, StockStatus } from '@/api/types'
import { StockStatusBadge } from '@/components/StockStatusBadge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { OperationsTable } from '@/features/operations/OperationsTable'
import { formatMoney } from '@/lib/format'

/**
 * Previews of the real screens for the landing page, in place of the bundle's screenshots.
 * They are the app's own table and badge components fed SAMPLE data (no API call), rendered
 * in the app's light theme, so the landing shows exactly what a user will see.
 */

const loc = (id: number, full_name: string, type: Location['type'] = 'internal'): Location => ({
  id,
  warehouse_id: type === 'internal' ? 1 : null,
  name: full_name.split('/').pop()!,
  short_code: full_name,
  full_name,
  type,
})
const STOCK1 = loc(1, 'WH/Stock1')
const STOCK2 = loc(2, 'WH/Stock2')
const VENDORS = loc(3, 'Vendors', 'vendor')
const CUSTOMERS = loc(4, 'Customers', 'customer')

const op = (id: number, reference: string, type: OperationSummary['type'], status: OperationSummary['status'], contact: string | null, from: Location, to: Location, date: string, late = false): OperationSummary => ({
  id,
  reference,
  type,
  status,
  contact,
  source_location: from,
  dest_location: to,
  scheduled_date: date,
  is_late: late,
})

const RECEIPTS = [
  op(1, 'WH/IN/0014', 'receipt', 'ready', 'Azure Interior', VENDORS, STOCK1, '2026-09-23', true),
  op(2, 'WH/IN/0015', 'receipt', 'draft', 'Wood Corner', VENDORS, STOCK2, '2026-09-28'),
  op(3, 'WH/IN/0013', 'receipt', 'done', 'Azure Interior', VENDORS, STOCK1, '2026-09-21'),
  op(4, 'WH/IN/0012', 'receipt', 'done', 'Lumber & Co', VENDORS, STOCK2, '2026-09-19'),
]
const DELIVERIES = [
  op(5, 'WH/OUT/0022', 'delivery', 'waiting', 'Gemini Furniture', STOCK1, CUSTOMERS, '2026-09-27'),
  op(6, 'WH/OUT/0021', 'delivery', 'ready', 'Deco Addict', STOCK1, CUSTOMERS, '2026-09-26'),
  op(7, 'WH/OUT/0020', 'delivery', 'ready', 'Ready Mat', STOCK2, CUSTOMERS, '2026-09-24', true),
  op(8, 'WH/OUT/0019', 'delivery', 'done', 'Deco Addict', STOCK1, CUSTOMERS, '2026-09-22'),
]
const STOCK: { name: string; sku: string; category: string; cost: number; onHand: number; free: number; status: StockStatus }[] = [
  { name: 'Desk', sku: 'DESK001', category: 'Furniture', cost: 3000, onHand: 47, free: 42, status: 'ok' },
  { name: 'Table', sku: 'TABLE001', category: 'Furniture', cost: 3000, onHand: 8, free: 8, status: 'low' },
  { name: 'Office Chair', sku: 'CHAIR001', category: 'Chairs', cost: 1500, onHand: 120, free: 96, status: 'ok' },
  { name: 'Bookshelf', sku: 'SHELF002', category: 'Storage', cost: 2200, onHand: 0, free: 0, status: 'out' },
]

/** the app's own surface: light theme, as users see it */
function AppSurface({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="pointer-events-none bg-muted/30 p-4 text-left text-foreground sm:p-6" style={{ background: 'var(--background)' }}>
      <p className="mb-3 text-lg font-semibold">{title}</p>
      {children}
    </div>
  )
}

function DashboardPreview() {
  const card = (title: string, icon: ReactNode, primary: string, lines: [ReactNode, string][]) => (
    <div className="flex flex-col gap-3 rounded-lg border bg-background p-4">
      <p className="flex items-center gap-2 text-sm font-semibold">
        {icon}
        {title}
      </p>
      <div className="flex items-start justify-between gap-3">
        <span className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground">{primary}</span>
        <ul className="flex flex-col items-end gap-1 text-xs">
          {lines.map(([i, t]) => (
            <li className="inline-flex items-center gap-1.5" key={t}>
              {i}
              {t}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
  const tile = (label: string, value: number, icon: ReactNode) => (
    <div className="flex flex-col gap-1 rounded-lg border bg-background px-3 py-2">
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {icon}
        {label}
      </span>
      <span className="text-2xl font-semibold tabular-nums">{value}</span>
    </div>
  )
  return (
    <AppSurface title="Dashboard">
      <div className="grid gap-3 sm:grid-cols-2">
        {card('Receipt', <ArrowDownToLine className="size-4 text-muted-foreground" />, '4 to receive', [
          [<AlertTriangle className="size-3.5 text-amber-600" key="l" />, '1 Late'],
          [<Clock className="size-3.5 text-muted-foreground" key="u" />, '3 operations upcoming'],
        ])}
        {card('Delivery', <ArrowUpFromLine className="size-4 text-muted-foreground" />, '2 to Deliver', [
          [<AlertTriangle className="size-3.5 text-amber-600" key="l" />, '1 Late'],
          [<Clock className="size-3.5 text-muted-foreground" key="w" />, '1 Waiting'],
          [<Clock className="size-3.5 text-muted-foreground" key="u" />, '5 operations upcoming'],
        ])}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tile('Products in stock', 38, <CircleCheck className="size-3.5 text-emerald-600" />)}
        {tile('Low stock', 4, <PackageMinus className="size-3.5 text-amber-600" />)}
        {tile('Out of stock', 1, <CircleSlash className="size-3.5 text-red-600" />)}
        {tile('Internal transfers scheduled', 2, <Repeat className="size-3.5 text-muted-foreground" />)}
      </div>
    </AppSurface>
  )
}

function StockPreview() {
  return (
    <AppSurface title="Products">
      <div className="rounded-lg border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product</TableHead>
              <TableHead>SKU</TableHead>
              <TableHead className="hidden sm:table-cell">Category</TableHead>
              <TableHead className="hidden text-right sm:table-cell">Per unit cost</TableHead>
              <TableHead className="text-right">On hand</TableHead>
              <TableHead className="text-right">Free to use</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {STOCK.map((r) => (
              <TableRow key={r.sku}>
                <TableCell className="font-medium">{r.name}</TableCell>
                <TableCell className="font-mono text-xs">{r.sku}</TableCell>
                <TableCell className="hidden text-muted-foreground sm:table-cell">{r.category}</TableCell>
                <TableCell className="hidden text-right tabular-nums sm:table-cell">{formatMoney(r.cost)}</TableCell>
                <TableCell className="text-right tabular-nums">{r.onHand}</TableCell>
                <TableCell className="text-right tabular-nums">{r.free}</TableCell>
                <TableCell>
                  <StockStatusBadge status={r.status} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </AppSurface>
  )
}

export type PreviewKey = 'dashboard' | 'receipts' | 'deliveries' | 'stock'

/** One app screen on sample data. Rows are not clickable (the surface is pointer-events: none). */
export function ProductPreview({ screen }: { screen: PreviewKey }) {
  switch (screen) {
    case 'dashboard':
      return <DashboardPreview />
    case 'receipts':
      return (
        <AppSurface title="Receipts">
          <OperationsTable items={RECEIPTS} isPending={false} error={null} emptyMessage="" onRowClick={() => {}} />
        </AppSurface>
      )
    case 'deliveries':
      return (
        <AppSurface title="Deliveries">
          <OperationsTable items={DELIVERIES} isPending={false} error={null} emptyMessage="" onRowClick={() => {}} />
        </AppSurface>
      )
    case 'stock':
      return <StockPreview />
  }
}
