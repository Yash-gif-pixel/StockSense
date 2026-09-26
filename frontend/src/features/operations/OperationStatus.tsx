import { AlertTriangle, ChevronRight } from 'lucide-react'
import type { OperationStatus } from '@/api/types'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { STATUS_LABEL } from './config'

const BADGE_CLASS: Record<OperationStatus, string> = {
  draft: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
  waiting: 'bg-amber-100 text-amber-800 dark:bg-amber-400/15 dark:text-amber-300',
  ready: 'bg-sky-100 text-sky-800 dark:bg-sky-400/15 dark:text-sky-300',
  done: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-400/15 dark:text-emerald-300',
  canceled: 'bg-muted text-muted-foreground line-through',
}

export function OperationStatusBadge({ status }: { status: OperationStatus }) {
  return <Badge className={cn('font-medium', BADGE_CLASS[status])}>{STATUS_LABEL[status]}</Badge>
}

export function LateMarker({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 text-xs font-medium text-amber-700 dark:text-amber-400', className)} title="Scheduled date has passed">
      <AlertTriangle className="size-3.5" />
      Late
    </span>
  )
}

/** Odoo-style breadcrumb of states, current one highlighted: Draft > Ready > Done. */
export function StatusBar({ steps, current }: { steps: OperationStatus[]; current: OperationStatus }) {
  if (current === 'canceled') return <OperationStatusBadge status="canceled" />
  return (
    <ol className="flex items-center text-xs font-medium" aria-label="Status">
      {steps.map((s, i) => (
        <li key={s} className="flex items-center">
          {i > 0 && <ChevronRight className="size-3.5 text-muted-foreground/60" />}
          <span
            aria-current={s === current ? 'step' : undefined}
            className={cn('rounded px-2 py-1', s === current ? 'bg-primary text-primary-foreground' : 'text-muted-foreground')}
          >
            {STATUS_LABEL[s]}
          </span>
        </li>
      ))}
    </ol>
  )
}
