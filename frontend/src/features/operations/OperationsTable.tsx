import { useNavigate } from 'react-router'
import type { OperationSummary } from '@/api/types'
import { TableMessageRow, TableSkeletonRows } from '@/components/data/TableStates'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import { operationPath } from './config'
import { LateMarker, OperationStatusBadge } from './OperationStatus'

/** Reference · From · To · Contact · Schedule date · Status. Rows open the operation's page, or call onRowClick when given. */
export function OperationsTable({
  items,
  isPending,
  error,
  emptyMessage,
  dimmed,
  showContact = true,
  dateLabel = 'Schedule date',
  onRowClick,
}: {
  items: OperationSummary[] | undefined
  isPending: boolean
  error: Error | null
  emptyMessage: string
  dimmed?: boolean
  showContact?: boolean
  dateLabel?: string
  onRowClick?: (op: OperationSummary) => void
}) {
  const navigate = useNavigate()
  const COLUMNS = showContact ? 6 : 5
  return (
    <div className={cn('rounded-lg border bg-background transition-opacity', dimmed && 'opacity-60')}>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Reference</TableHead>
            <TableHead>From</TableHead>
            <TableHead>To</TableHead>
            {showContact && <TableHead>Contact</TableHead>}
            <TableHead>{dateLabel}</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isPending ? (
            <TableSkeletonRows columns={COLUMNS} />
          ) : error ? (
            <TableMessageRow columns={COLUMNS}>{error.message}</TableMessageRow>
          ) : !items?.length ? (
            <TableMessageRow columns={COLUMNS}>{emptyMessage}</TableMessageRow>
          ) : (
            items.map((op) => {
              const path = operationPath(op)
              const open = onRowClick ? () => onRowClick(op) : path ? () => navigate(path) : undefined
              return (
                <TableRow
                  key={op.id}
                  className={cn(open && 'cursor-pointer', op.is_late && 'bg-amber-50/60 shadow-[inset_3px_0_0_var(--color-amber-500)] hover:bg-amber-50 dark:bg-amber-400/10 dark:hover:bg-amber-400/15')}
                  onClick={open}
                >
                  <TableCell className="font-medium">{op.reference}</TableCell>
                  <TableCell>{op.source_location.full_name}</TableCell>
                  <TableCell>{op.dest_location.full_name}</TableCell>
                  {showContact && <TableCell className="text-muted-foreground">{op.contact ?? '—'}</TableCell>}
                  <TableCell className="whitespace-nowrap tabular-nums">
                    {formatDate(op.scheduled_date)}
                    {op.is_late && <LateMarker className="ml-2" />}
                  </TableCell>
                  <TableCell>
                    <OperationStatusBadge status={op.status} />
                  </TableCell>
                </TableRow>
              )
            })
          )}
        </TableBody>
      </Table>
    </div>
  )
}
