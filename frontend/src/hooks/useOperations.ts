import { keepPreviousData, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import { qk } from '@/api/queryKeys'
import type { ID, ListResponse, OperationAction, OperationBody, OperationDetail, OperationListParams, OperationSummary } from '@/api/types'

export function useOperations(params: OperationListParams, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: qk.operations.list(params),
    queryFn: () => api.get<ListResponse<OperationSummary>>('/operations', params),
    placeholderData: keepPreviousData,
    enabled: options.enabled,
  })
}

export function useOperation(id: ID | undefined) {
  return useQuery({
    queryKey: qk.operations.detail(id ?? 0),
    queryFn: () => api.get<OperationDetail>(`/operations/${id}`),
    enabled: id !== undefined,
  })
}

/** Put the server's answer in the detail cache and refresh every list/figure it can affect. */
function afterWrite(qc: QueryClient, op: OperationDetail, stockChanged: boolean) {
  qc.setQueryData(qk.operations.detail(op.id), op)
  void qc.invalidateQueries({ queryKey: qk.operations.all, predicate: (q) => q.queryKey[1] !== 'detail' || q.queryKey[2] !== op.id })
  void qc.invalidateQueries({ queryKey: qk.dashboard.all })
  if (stockChanged) {
    void qc.invalidateQueries({ queryKey: qk.stock.all })
    void qc.invalidateQueries({ queryKey: qk.moves.all })
  }
}

export function useCreateOperation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: OperationBody) => api.post<OperationDetail>('/operations', body),
    onSuccess: (op) => afterWrite(qc, op, false),
  })
}

export function useUpdateOperation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, body }: { id: ID; body: OperationBody }) => api.put<OperationDetail>(`/operations/${id}`, body),
    onSuccess: (op) => afterWrite(qc, op, false),
  })
}

/** todo / check-availability / validate / cancel. Reservations and stock moves change, so stock + moves refresh too. */
export function useOperationAction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, action }: { id: ID; action: OperationAction }) => api.post<OperationDetail>(`/operations/${id}/${action}`),
    onSuccess: (op) => afterWrite(qc, op, true),
  })
}
