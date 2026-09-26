import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import { qk } from '@/api/queryKeys'
import type { ID, ListResponse, Warehouse, WarehouseBody } from '@/api/types'

export function useWarehouses() {
  return useQuery({
    queryKey: qk.warehouses.all,
    queryFn: () => api.get<ListResponse<Warehouse>>('/warehouses', { limit: 200 }),
  })
}

export function useSaveWarehouse() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, body }: { id?: ID; body: WarehouseBody }) =>
      id === undefined ? api.post<Warehouse>('/warehouses', body) : api.put<Warehouse>(`/warehouses/${id}`, body),
    onSuccess: () => {
      // New warehouse auto-creates a "Stock" location; short_code changes rename full_name everywhere.
      for (const key of [qk.warehouses.all, qk.locations.all, qk.stock.all, qk.operations.all, qk.moves.all, qk.dashboard.all]) {
        void qc.invalidateQueries({ queryKey: key })
      }
    },
  })
}
