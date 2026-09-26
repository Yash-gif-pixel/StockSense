import { Pencil, Plus } from 'lucide-react'
import { useState } from 'react'
import type { Warehouse } from '@/api/types'
import { TableMessageRow, TableSkeletonRows } from '@/components/data/TableStates'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { WarehouseFormDialog } from '@/features/settings/WarehouseFormDialog'
import { useWarehouses } from '@/hooks/useWarehouses'

export function WarehousesPage() {
  const { data, isPending, isError, error } = useWarehouses()
  // undefined = closed, null = create, Warehouse = edit
  const [editing, setEditing] = useState<Warehouse | null | undefined>(undefined)

  return (
    <>
      <PageHeader
        eyebrow="Settings"
        title="Warehouses"
        actions={
          <Button onClick={() => setEditing(null)}>
            <Plus /> New
          </Button>
        }
      />
      <div className="rounded-lg border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Short Code</TableHead>
              <TableHead>Address</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isPending ? (
              <TableSkeletonRows columns={4} rows={3} />
            ) : isError ? (
              <TableMessageRow columns={4}>{error.message}</TableMessageRow>
            ) : data.items.length === 0 ? (
              <TableMessageRow columns={4}>No warehouses yet.</TableMessageRow>
            ) : (
              data.items.map((w) => (
                <TableRow key={w.id} className="cursor-pointer" onClick={() => setEditing(w)}>
                  <TableCell className="font-medium">{w.name}</TableCell>
                  <TableCell className="font-mono text-xs">{w.short_code}</TableCell>
                  <TableCell className="text-muted-foreground">{w.address}</TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon-sm" aria-label={`Edit ${w.name}`}>
                      <Pencil />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      {editing !== undefined && <WarehouseFormDialog warehouse={editing ?? undefined} onClose={() => setEditing(undefined)} />}
    </>
  )
}
