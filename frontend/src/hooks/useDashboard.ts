import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { api } from '@/api/client'
import { qk } from '@/api/queryKeys'
import type { Dashboard, DashboardParams } from '@/api/types'

export function useDashboard(params: DashboardParams) {
  return useQuery({
    queryKey: qk.dashboard.get(params),
    queryFn: () => api.get<Dashboard>('/dashboard', params),
    placeholderData: keepPreviousData,
    // Counts change with everyone's activity: refetch on every visit and when the tab regains focus.
    staleTime: 0,
    refetchOnWindowFocus: true,
  })
}
