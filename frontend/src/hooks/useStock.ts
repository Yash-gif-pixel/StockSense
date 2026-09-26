import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import { qk } from '@/api/queryKeys'
import type { ID, ListResponse, LocationStockRow, StockAdjustBody, StockAdjustResponse, StockListParams, StockRow } from '@/api/types'

export function useStock(params: StockListParams) {
  return useQuery({
    queryKey: qk.stock.list(params),
    queryFn: () => api.get<ListResponse<StockRow>>('/stock', params),
    placeholderData: keepPreviousData,
  })
}

export function useStockByLocation(productId: ID | null) {
  return useQuery({
    queryKey: qk.stock.locations(productId ?? 0),
    queryFn: () => api.get<ListResponse<LocationStockRow>>(`/stock/${productId}/locations`, { limit: 200 }),
    enabled: productId !== null,
  })
}

export function useAdjustStock() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: StockAdjustBody) => api.post<StockAdjustResponse>('/stock/adjust', body),
    onSuccess: () => {
      for (const key of [qk.stock.all, qk.operations.all, qk.moves.all, qk.dashboard.all]) {
        void qc.invalidateQueries({ queryKey: key })
      }
    },
  })
}
