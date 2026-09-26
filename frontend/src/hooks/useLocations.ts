import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import { qk } from '@/api/queryKeys'
import type { ID, ListResponse, Location, LocationCreateBody, LocationListParams, LocationUpdateBody } from '@/api/types'

/** Internal locations by default (the only kind shown in pickers). */
export function useLocations(params: LocationListParams = {}) {
  const p: LocationListParams = { limit: 200, ...params }
  return useQuery({
    queryKey: qk.locations.list(p),
    queryFn: () => api.get<ListResponse<Location>>('/locations', p),
  })
}

export function useCreateLocation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: LocationCreateBody) => api.post<Location>('/locations', body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.locations.all }),
  })
}

export function useUpdateLocation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, body }: { id: ID; body: LocationUpdateBody }) => api.put<Location>(`/locations/${id}`, body),
    onSuccess: () => {
      // full_name appears in stock-by-location, operations and moves.
      for (const key of [qk.locations.all, qk.stock.all, qk.operations.all, qk.moves.all]) {
        void qc.invalidateQueries({ queryKey: key })
      }
    },
  })
}
