import { Pencil, Plus } from 'lucide-react'
import { useState } from 'react'
import type { Location } from '@/api/types'
import { TableMessageRow, TableSkeletonRows } from '@/components/data/TableStates'
import { PageHeader } from '@/components/PageHeader'
import { WarehouseSelect } from '@/components/pickers/EntitySelects'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { LocationFormDialog } from '@/features/settings/LocationFormDialog'
import { useLocations } from '@/hooks/useLocations'
import { useUrlParams } from '@/hooks/useUrlParams'
import { useWarehouses } from '@/hooks/useWarehouses'

export function LocationsPage() {
  const url = useUrlParams()
  const warehouseId = url.getNumber('warehouse_id')
  const { data, isPending, isError, error } = useLocations({ type: 'internal', warehouse_id: warehouseId })
  const { data: warehouses } = useWarehouses()
  const warehouseName = (id: number | null) => warehouses?.items.find((w) => w.id === id)?.name ?? '—'
  const [editing, setEditing] = useState<Location | null | undefined>(undefined)

  return (
    <>
      <PageHeader
        eyebrow="Settings"
        title="Locations"
        actions={
          <Button onClick={() => setEditing(null)}>
            <Plus /> New
          </Button>
        }
      >
        <WarehouseSelect value={warehouseId} onChange={(v) => url.set({ warehouse_id: v })} allLabel="All warehouses" className="w-56" />
      </PageHeader>
      <div className="rounded-lg border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Full Name</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Short Code</TableHead>
              <TableHead>Warehouse</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isPending ? (
              <TableSkeletonRows columns={5} rows={4} />
            ) : isError ? (
              <TableMessageRow columns={5}>{error.message}</TableMessageRow>
            ) : data.items.length === 0 ? (
              <TableMessageRow columns={5}>No locations{warehouseId ? ' in this warehouse' : ''}.</TableMessageRow>
            ) : (
              data.items.map((l) => (
                <TableRow key={l.id} className="cursor-pointer" onClick={() => setEditing(l)}>
                  <TableCell className="font-medium">{l.full_name}</TableCell>
                  <TableCell>{l.name}</TableCell>
                  <TableCell className="font-mono text-xs">{l.short_code}</TableCell>
                  <TableCell className="text-muted-foreground">{warehouseName(l.warehouse_id)}</TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon-sm" aria-label={`Edit ${l.full_name}`}>
                      <Pencil />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      {editing !== undefined && <LocationFormDialog location={editing ?? undefined} defaultWarehouseId={warehouseId} onClose={() => setEditing(undefined)} />}
    </>
  )
}
