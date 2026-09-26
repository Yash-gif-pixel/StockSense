import { AlertTriangle, Columns3, List, Plus, X } from 'lucide-react'
import { Link } from 'react-router'
import type { OperationStatus } from '@/api/types'
import { Pagination } from '@/components/data/Pagination'
import { SearchInput } from '@/components/data/SearchInput'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { STATUS_LABEL, type OperationTypeConfig } from '@/features/operations/config'
import { OperationsKanban } from '@/features/operations/OperationsKanban'
import { OperationsTable } from '@/features/operations/OperationsTable'
import { useOperations } from '@/hooks/useOperations'
import { useUrlParams } from '@/hooks/useUrlParams'

const LIMIT = 50
const ANY = '__any__'

/** Receipts / Deliveries, as a list or a kanban (`?view=kanban`). `?status=` (comma-separated) and `?late=true` come from dashboard links. */
export function OperationListPage({ config }: { config: OperationTypeConfig }) {
  const url = useUrlParams()
  const search = url.get('search')
  const statusParam = url.get('status')
  const late = url.get('late') === 'true'
  const offset = url.getNumber('offset') ?? 0
  const kanban = url.get('view') === 'kanban'
  const statuses = statusParam ? (statusParam.split(',') as OperationStatus[]) : undefined

  const { data, isPending, error, isPlaceholderData } = useOperations({
    type: config.type,
    status: statuses,
    search: search || undefined,
    late: late || undefined,
    limit: LIMIT,
    offset,
  }, { enabled: !kanban })

  const statusOptions: OperationStatus[] = [...config.steps, 'canceled']
  const customStatus = statusParam && !statusOptions.includes(statusParam as OperationStatus)

  return (
    <>
      <PageHeader
        eyebrow="Operations"
        title={config.title}
        actions={
          <Button asChild>
            <Link to={`${config.basePath}/new`}>
              <Plus /> NEW
            </Link>
          </Button>
        }
      >
        <SearchInput value={search} onChange={(v) => url.set({ search: v })} placeholder={config.type === 'internal' ? 'Search reference…' : 'Search reference or contact…'} />
        {/* In kanban the columns are the statuses, so the status filter only applies to the list. */}
        {!kanban && (
          <Select value={statusParam || ANY} onValueChange={(v) => url.set({ status: v === ANY ? undefined : v })}>
            <SelectTrigger className="w-44" aria-label="Status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>Any status</SelectItem>
              {customStatus && <SelectItem value={statusParam}>{statuses!.map((s) => STATUS_LABEL[s] ?? s).join(' + ')}</SelectItem>}
              {statusOptions.map((s) => (
                <SelectItem key={s} value={s}>
                  {STATUS_LABEL[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Button variant={late ? 'secondary' : 'outline'} aria-pressed={late} onClick={() => url.set({ late: late ? undefined : 'true' })}>
          <AlertTriangle className={late ? 'text-amber-600' : undefined} />
          Late only
          {late && <X className="opacity-60" />}
        </Button>
        <ToggleGroup
          type="single"
          variant="outline"
          spacing={0}
          value={kanban ? 'kanban' : 'list'}
          onValueChange={(v) => v && url.set({ view: v === 'kanban' ? 'kanban' : undefined, status: undefined })}
          aria-label="View"
          className="ml-auto"
        >
          <ToggleGroupItem value="list" aria-label="List view">
            <List />
          </ToggleGroupItem>
          <ToggleGroupItem value="kanban" aria-label="Kanban view">
            <Columns3 />
          </ToggleGroupItem>
        </ToggleGroup>
      </PageHeader>

      {kanban ? (
        <OperationsKanban config={config} search={search || undefined} late={late || undefined} />
      ) : (
        <>
          <OperationsTable
            items={data?.items}
            isPending={isPending}
            error={error}
            dimmed={isPlaceholderData}
            showContact={config.type !== 'internal'}
            emptyMessage={search || statusParam || late ? 'No operations match these filters.' : `No ${config.title.toLowerCase()} yet.`}
          />
          {data && <Pagination total={data.total} limit={LIMIT} offset={offset} onOffsetChange={(o) => url.set({ offset: o || undefined })} />}
        </>
      )}
    </>
  )
}
