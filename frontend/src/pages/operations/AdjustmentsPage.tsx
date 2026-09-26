import { Plus } from 'lucide-react'
import { useState } from 'react'
import type { ID } from '@/api/types'
import { Pagination } from '@/components/data/Pagination'
import { SearchInput } from '@/components/data/SearchInput'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { AdjustmentSheet } from '@/features/operations/AdjustmentSheet'
import { OperationsTable } from '@/features/operations/OperationsTable'
import { AdjustStockDialog } from '@/features/products/AdjustStockDialog'
import { useOperations } from '@/hooks/useOperations'
import { useUrlParams } from '@/hooks/useUrlParams'

const LIMIT = 50

/** GET /api/operations?type=adjustment + "New adjustment" (POST /api/stock/adjust). */
export function AdjustmentsPage() {
  const url = useUrlParams()
  const search = url.get('search')
  const offset = url.getNumber('offset') ?? 0
  const { data, isPending, error, isPlaceholderData } = useOperations({ type: 'adjustment', search: search || undefined, limit: LIMIT, offset })
  const [creating, setCreating] = useState(false)
  const [selectedId, setSelectedId] = useState<ID | null>(null)

  return (
    <>
      <PageHeader
        eyebrow="Operations"
        title="Adjustments"
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus /> New adjustment
          </Button>
        }
      >
        <SearchInput value={search} onChange={(v) => url.set({ search: v })} placeholder="Search reference…" />
      </PageHeader>

      <OperationsTable
        items={data?.items}
        isPending={isPending}
        error={error}
        dimmed={isPlaceholderData}
        showContact={false}
        dateLabel="Date"
        onRowClick={(op) => setSelectedId(op.id)}
        emptyMessage={search ? 'No adjustments match this search.' : 'No adjustments yet. Stock corrections you record will appear here.'}
      />
      {data && <Pagination total={data.total} limit={LIMIT} offset={offset} onOffsetChange={(o) => url.set({ offset: o || undefined })} />}

      {creating && <AdjustStockDialog onClose={() => setCreating(false)} />}
      {selectedId !== null && <AdjustmentSheet id={selectedId} onClose={() => setSelectedId(null)} />}
    </>
  )
}
