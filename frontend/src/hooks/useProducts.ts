import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import { qk } from '@/api/queryKeys'
import type { ID, ListResponse, Product, ProductCreateBody, ProductListParams, ProductUpdateBody } from '@/api/types'

export function useProducts(params: ProductListParams = {}, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: qk.products.list(params),
    queryFn: () => api.get<ListResponse<Product>>('/products', params),
    placeholderData: keepPreviousData,
    enabled: options.enabled,
  })
}

const AFFECTED_BY_PRODUCT = [qk.products.all, qk.stock.all, qk.operations.all, qk.moves.all, qk.dashboard.all]

export function useCreateProduct() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: ProductCreateBody) => api.post<Product>('/products', body),
    // initial_qty is recorded as a done adjustment → stock, operations, moves, dashboard change too.
    onSuccess: () => AFFECTED_BY_PRODUCT.forEach((queryKey) => void qc.invalidateQueries({ queryKey })),
  })
}

export function useUpdateProduct() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, body }: { id: ID; body: ProductUpdateBody }) => api.put<Product>(`/products/${id}`, body),
    onSuccess: () => AFFECTED_BY_PRODUCT.forEach((queryKey) => void qc.invalidateQueries({ queryKey })),
  })
}
