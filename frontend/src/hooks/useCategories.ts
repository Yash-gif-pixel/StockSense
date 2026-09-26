import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import { qk } from '@/api/queryKeys'
import type { Category, CategoryBody, ListResponse } from '@/api/types'

export function useCategories() {
  return useQuery({
    queryKey: qk.categories.all,
    queryFn: () => api.get<ListResponse<Category>>('/categories', { limit: 200 }),
  })
}

export function useCreateCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: CategoryBody) => api.post<Category>('/categories', body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.categories.all }),
  })
}
