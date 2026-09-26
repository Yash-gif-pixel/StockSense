import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router'
import type { OperationStatus } from '@/api/types'
import { Skeleton } from '@/components/ui/skeleton'
import { useOperations } from '@/hooks/useOperations'
import { formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import { STATUS_LABEL, type OperationTypeConfig } from './config'
import { LateMarker } from './OperationStatus'

const CARDS_PER_COLUMN = 50

/** One query per column so each shows its true total. Cards only link; status changes happen on the form's buttons. */
function KanbanColumn({ config, status, search, late }: { config: OperationTypeConfig; status: OperationStatus; search?: string; late?: boolean }) {
  const { data, isPending, error } = useOperations({ type: config.type, status, search, late, limit: CARDS_PER_COLUMN })
  const hidden = data ? data.total - data.items.length : 0
  const listParams = new URLSearchParams({ status, ...(search ? { search } : {}), ...(late ? { late: 'true' } : {}) })

  return (
    <section className="flex w-72 shrink-0 flex-col rounded-lg bg-muted/60 p-2" aria-label={`${STATUS_LABEL[status]} column`}>
      <h2 className="mb-2 flex items-center justify-between px-1 text-sm font-medium">
        {STATUS_LABEL[status]}
        <span className="rounded-full bg-background px-2 text-xs tabular-nums text-muted-foreground">{data?.total ?? '…'}</span>
      </h2>
      <ol className="flex flex-col gap-2">
        {isPending ? (
          Array.from({ length: 2 }, (_, i) => <Skeleton key={i} className="h-20 w-full bg-background" />)
        ) : error ? (
          <li className="px-1 text-xs text-destructive">{error.message}</li>
        ) : data.items.length === 0 ? (
          <li className="px-1 py-3 text-center text-xs text-muted-foreground">Nothing here</li>
        ) : (
          data.items.map((op) => (
            <li key={op.id}>
              <Link
                to={`${config.basePath}/${op.id}`}
                className={cn(
                  'flex flex-col gap-1 rounded-md border bg-background p-2.5 text-sm shadow-xs transition-colors hover:border-foreground/20',
                  op.is_late && 'border-l-4 border-l-amber-500',
                )}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="font-medium">{op.reference}</span>
                  {op.is_late && <LateMarker />}
                </span>
                <span className="truncate text-muted-foreground">{op.contact ?? '—'}</span>
                <span className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                  {op.source_location.full_name}
                  <ArrowRight className="size-3 shrink-0" />
                  {op.dest_location.full_name}
                </span>
                <span className="text-xs tabular-nums">{formatDate(op.scheduled_date)}</span>
              </Link>
            </li>
          ))
        )}
      </ol>
      {hidden > 0 && (
        <Link to={`${config.basePath}?${listParams}`} className="mt-2 px-1 text-xs text-muted-foreground hover:text-foreground hover:underline">
          +{hidden} more — view as list
        </Link>
      )}
    </section>
  )
}

/** Columns follow the status bar: Draft, (Waiting), Ready, Done. No drag-and-drop by design. */
export function OperationsKanban({ config, search, late }: { config: OperationTypeConfig; search?: string; late?: boolean }) {
  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {config.steps.map((s) => (
        <KanbanColumn key={s} config={config} status={s} search={search} late={late} />
      ))}
    </div>
  )
}
