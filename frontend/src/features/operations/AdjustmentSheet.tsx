import { ArrowDownRight, ArrowUpRight } from 'lucide-react'
import type { ID } from '@/api/types'
import { TableMessageRow, TableSkeletonRows } from '@/components/data/TableStates'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useOperation } from '@/hooks/useOperations'
import { formatDate, formatDateTime, formatQty, productLabel } from '@/lib/format'
import { OperationStatusBadge } from './OperationStatus'

/** Read-only view of one adjustment (they have no form: created via POST /api/stock/adjust). */
export function AdjustmentSheet({ id, onClose }: { id: ID; onClose: () => void }) {
  const { data: op, isPending, error } = useOperation(id)
  // An adjustment moves stock into an internal location (increase) or out of one (decrease).
  const increase = op?.dest_location.type === 'internal'
  const location = op && (increase ? op.dest_location : op.source_location)

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full gap-0 sm:max-w-md">
        <SheetHeader className="border-b">
          <SheetTitle className="flex items-center gap-2">
            {op?.reference ?? 'Adjustment'}
            {op && <OperationStatusBadge status={op.status} />}
          </SheetTitle>
          <SheetDescription>Inventory adjustment</SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-4 overflow-y-auto p-4">
          {op && (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <dt className="text-muted-foreground">Location</dt>
              <dd>{location?.full_name}</dd>
              <dt className="text-muted-foreground">Effect</dt>
              <dd className={increase ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400'}>
                {increase ? (
                  <span className="inline-flex items-center gap-1">
                    <ArrowUpRight className="size-4" /> Stock increased
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1">
                    <ArrowDownRight className="size-4" /> Stock decreased
                  </span>
                )}
              </dd>
              <dt className="text-muted-foreground">Date</dt>
              <dd>{formatDate(op.scheduled_date)}</dd>
              {op.validated_at && (
                <>
                  <dt className="text-muted-foreground">Recorded</dt>
                  <dd>{formatDateTime(op.validated_at)}</dd>
                </>
              )}
              <dt className="text-muted-foreground">Responsible</dt>
              <dd>{op.responsible.login_id}</dd>
            </dl>
          )}
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-right">Quantity</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isPending ? (
                  <TableSkeletonRows columns={2} rows={1} />
                ) : error ? (
                  <TableMessageRow columns={2}>{error.message}</TableMessageRow>
                ) : (
                  op.lines.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell>{productLabel(l.product)}</TableCell>
                      <TableCell className={`text-right tabular-nums ${increase ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400'}`}>
                        {increase ? '+' : '−'}
                        {formatQty(l.qty)} <span className="text-xs text-muted-foreground">{l.product.uom}</span>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
