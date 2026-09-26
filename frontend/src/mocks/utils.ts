import { HttpResponse } from 'msw'
import type { ApiErrorBody, ListResponse } from '@/api/types'

/** Contract error envelope with the status the contract assigns to each code. */
export function apiError(status: number, code: ApiErrorBody['code'], message: string, fields?: Record<string, string>) {
  const body: ApiErrorBody = fields ? { code, message, fields } : { code, message }
  return HttpResponse.json(body, { status })
}

export const errors = {
  validation: (fields: Record<string, string>, message = 'Validation failed') => apiError(422, 'validation_error', message, fields),
  unauthorized: () => apiError(401, 'unauthorized', 'Authentication required'),
  notFound: (what = 'Resource') => apiError(404, 'not_found', `${what} not found`),
  conflict: (message: string, fields?: Record<string, string>) => apiError(409, 'conflict', message, fields),
  invalidState: (message: string) => apiError(409, 'invalid_state', message),
  insufficientStock: (message: string) => apiError(409, 'insufficient_stock', message),
}

/** zod issues -> contract `fields` map (first message per key; nested paths joined, e.g. "lines.0.qty"). */
export function zodFields(error: { issues: { path: PropertyKey[]; message: string }[] }): Record<string, string> {
  const fields: Record<string, string> = {}
  for (const issue of error.issues) {
    const key = issue.path.length ? issue.path.map(String).join('.') : '_'
    fields[key] ??= issue.message
  }
  return fields
}

/** Applies the contract's limit (default 50, max 200) / offset (default 0) and wraps in {items, total}. */
export function paginate<T>(items: T[], url: URL): ListResponse<T> {
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit') ?? 50) || 50, 1), 200)
  const offset = Math.max(Number(url.searchParams.get('offset') ?? 0) || 0, 0)
  return { items: items.slice(offset, offset + limit), total: items.length }
}

