import { AlertTriangle, ArrowDownToLine, ArrowUpFromLine, CircleCheck, CircleSlash, Clock, PackageMinus, Repeat } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import type { OperationCounts, OperationStatus, OperationType } from '@/api/types'
import { OPERATION_STATUSES, OPERATION_TYPES } from '@/api/types'
import { Pagination } from '@/components/data/Pagination'
import { PageHeader } from '@/components/PageHeader'
import { CategorySelect, WarehouseSelect } from '@/components/pickers/EntitySelects'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { STATUS_LABEL } from '@/features/operations/config'
import { OperationsTable } from '@/features/operations/OperationsTable'
import { useDashboard } from '@/hooks/useDashboard'
import { useOperations } from '@/hooks/useOperations'
import { useUrlParams } from '@/hooks/useUrlParams'
import { cn } from '@/lib/utils'

const LIMIT = 20
const ANY = '__any__'
const TYPE_LABEL: Record<OperationType, string> = { receipt: 'Receipts', delivery: 'Deliveries', internal: 'Internal transfers', adjustment: 'Adjustments' }

// ---------- Operation cards (mockup: Receipt / Delivery) ----------

interface CardLine {
  key: string
  icon: ReactNode
  text: string
  to?: string
}

function OperationCard({
  title,
  icon,
  primary,
  primaryTo,
  lines,
  loading,
}: {
  title: string
  icon: ReactNode
  primary: string
  primaryTo: string
  lines: CardLine[]
  loading: boolean
}) {
  return (
    <section className="flex flex-col gap-4 rounded-lg border bg-background p-4" aria-label={title}>
      <h2 className="flex items-center gap-2 text-base font-semibold">
        {icon}
        {title}
      </h2>
      {loading ? (
        <div className="flex items-start justify-between gap-4">
          <Skeleton className="h-10 w-36" />
          <div className="flex flex-col items-end gap-2">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-28" />
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-start justify-between gap-4">
          <Button asChild size="lg" className="h-10 px-4 text-base">
            <Link to={primaryTo}>{primary}</Link>
          </Button>
          <ul className="flex flex-col items-end gap-1.5 text-sm">
            {lines.map((l) => (
              <li key={l.key}>
                {l.to ? (
                  <Link to={l.to} className="inline-flex items-center gap-1.5 underline-offset-4 hover:underline">
                    {l.icon}
                    {l.text}
                  </Link>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                    {l.icon}
                    {l.text}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}

function cardLines(c: OperationCounts, basePath: string, hideZeroWaiting: boolean): CardLine[] {
  const lines: CardLine[] = []
  if (c.late > 0) {
    lines.push({ key: 'late', icon: <AlertTriangle className="size-4 text-amber-600 dark:text-amber-400" />, text: `${c.late} Late`, to: `${basePath}?late=true` })
  } else {
    lines.push({ key: 'late', icon: <CircleCheck className="size-4 text-emerald-600 dark:text-emerald-400" />, text: '0 Late' })
  }
  if (!(hideZeroWaiting && c.waiting === 0)) {
    lines.push({ key: 'waiting', icon: <Clock className="size-4 text-muted-foreground" />, text: `${c.waiting} Waiting`, to: c.waiting ? `${basePath}?status=waiting` : undefined })
  }
  // No list filter matches "upcoming" exactly (late=false also includes today), so this line is not a link.
  lines.push({ key: 'upcoming', icon: <Clock className="size-4 text-muted-foreground" />, text: `${c.upcoming} operation${c.upcoming === 1 ? '' : 's'} upcoming` })
  return lines
}

// ---------- KPI strip ----------

function KpiTile({ label, value, icon, to, loading }: { label: string; value: number | undefined; icon: ReactNode; to?: string; loading: boolean }) {
  const body = (
    <>
      <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
        {icon}
        {label}
      </span>
      {loading || value === undefined ? <Skeleton className="h-8 w-12" /> : <span className="text-3xl font-semibold tabular-nums">{value.toLocaleString()}</span>}
    </>
  )
  const cls = 'flex flex-col gap-1 rounded-lg border bg-background px-4 py-3'
  return to ? (
    <Link to={to} className={cn(cls, 'transition-colors hover:border-foreground/20 hover:bg-muted/40')}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  )
}

// ---------- Page ----------

export function DashboardPage() {
  const url = useUrlParams()
  const warehouseId = url.getNumber('warehouse_id')
  const categoryId = url.getNumber('category_id')
  const type = (url.get('type') || undefined) as OperationType | undefined
  const status = (url.get('status') || undefined) as OperationStatus | undefined
  const offset = url.getNumber('offset') ?? 0

  const dash = useDashboard({ warehouse_id: warehouseId, category_id: categoryId })
  const ops = useOperations({ type, status, warehouse_id: warehouseId, category_id: categoryId, limit: LIMIT, offset })
  const d = dash.data
  // No data (still loading, or the request failed): show placeholders, never zeros that look real.
  const loading = !d

  return (
    <>
      {/* Warehouse + category scope both the cards and the table */}
      <PageHeader eyebrow="Overview" title="Dashboard">
        <WarehouseSelect value={warehouseId} onChange={(v) => url.set({ warehouse_id: v })} allLabel="All warehouses" className="w-52" />
        <CategorySelect value={categoryId} onChange={(v) => url.set({ category_id: v })} allLabel="All categories" className="w-44" />
      </PageHeader>

      {dash.isError && <p className="mb-3 text-sm text-destructive">{dash.error.message}</p>}

      <div className={cn('grid gap-3 md:grid-cols-2', dash.isPlaceholderData && 'opacity-60')}>
        <OperationCard
          title="Receipt"
          icon={<ArrowDownToLine className="size-4 text-muted-foreground" />}
          primary={`${d?.receipts.ready ?? 0} to receive`}
          primaryTo="/operations/receipts?status=ready"
          lines={d ? cardLines(d.receipts, '/operations/receipts', true) : []}
          loading={loading}
        />
        <OperationCard
          title="Delivery"
          icon={<ArrowUpFromLine className="size-4 text-muted-foreground" />}
          primary={`${d?.deliveries.ready ?? 0} to Deliver`}
          primaryTo="/operations/deliveries?status=ready"
          lines={d ? cardLines(d.deliveries, '/operations/deliveries', false) : []}
          loading={loading}
        />
      </div>

      <div className={cn('mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4', dash.isPlaceholderData && 'opacity-60')}>
        {/* the backend counts "in stock" as on hand > 0 (ok + low); no stock filter matches that, so no link */}
        <KpiTile label="Products in stock" value={d?.products.in_stock} icon={<CircleCheck className="size-4 text-emerald-600 dark:text-emerald-400" />} loading={loading} />
        <KpiTile label="Low stock" value={d?.products.low_stock} icon={<PackageMinus className="size-4 text-amber-600 dark:text-amber-400" />} to="/products?status=low" loading={loading} />
        <KpiTile label="Out of stock" value={d?.products.out_of_stock} icon={<CircleSlash className="size-4 text-red-600 dark:text-red-400" />} to="/products?status=out" loading={loading} />
        <KpiTile
          label="Internal transfers scheduled"
          value={d?.internal.scheduled}
          icon={<Repeat className="size-4 text-muted-foreground" />}
          to="/operations/internal?status=waiting,ready"
          loading={loading}
        />
      </div>

      <div className="mt-6 mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold">Operations</h2>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={type ?? ANY} onValueChange={(v) => url.set({ type: v === ANY ? undefined : v })}>
            <SelectTrigger className="w-44" aria-label="Document type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>All documents</SelectItem>
              {OPERATION_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {TYPE_LABEL[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={status ?? ANY} onValueChange={(v) => url.set({ status: v === ANY ? undefined : v })}>
            <SelectTrigger className="w-36" aria-label="Status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>Any status</SelectItem>
              {OPERATION_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {STATUS_LABEL[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <OperationsTable
        items={ops.data?.items}
        isPending={ops.isPending}
        error={ops.error}
        dimmed={ops.isPlaceholderData}
        emptyMessage={type || status || warehouseId || categoryId ? 'No operations match these filters.' : 'No operations yet.'}
      />
      {ops.data && <Pagination total={ops.data.total} limit={LIMIT} offset={offset} onOffsetChange={(o) => url.set({ offset: o || undefined })} />}
    </>
  )
}
