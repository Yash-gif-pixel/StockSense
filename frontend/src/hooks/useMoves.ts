import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { api } from '@/api/client'
import { qk } from '@/api/queryKeys'
import type { ListResponse, Move, MoveListParams } from '@/api/types'

export function useMoves(params: MoveListParams) {
  return useQuery({
    queryKey: qk.moves.list(params),
    queryFn: () => api.get<ListResponse<Move>>('/moves', params),
    placeholderData: keepPreviousData,
  })
}
