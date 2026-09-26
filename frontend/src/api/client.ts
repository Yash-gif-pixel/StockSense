import type { ApiErrorBody } from './types'

/** Thrown for every non-2xx response (and for network / non-JSON failures). */
export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly fields: Record<string, string>

  constructor(status: number, body: ApiErrorBody) {
    super(body.message)
    this.name = 'ApiError'
    this.status = status
    this.code = body.code
    this.fields = body.fields ?? {}
  }
}

export function isApiError(e: unknown): e is ApiError {
  return e instanceof ApiError
}

/** Auth screens: a 401 is expected here and must not trigger a redirect to /login. */
export const AUTH_PATHS = ['/login', '/signup', '/forgot-password', '/reset-password'] as const

/** Public pages: the auth screens plus the landing page at `/`. A 401 there is expected, not an expired session. */
export function isAuthPath(pathname: string): boolean {
  return pathname === '/' || AUTH_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}

let onUnauthorized: (() => void) | null = null

/** Registered once at startup: clears the query cache and navigates to /login. */
export function setUnauthorizedHandler(handler: () => void) {
  onUnauthorized = handler
}

type QueryValue = string | number | boolean | null | undefined | readonly (string | number)[]

/** Builds a query string, skipping empty values. Arrays become comma-separated (contract: status=a,b). */
export function toQuery(params?: object): string {
  if (!params) return ''
  const sp = new URLSearchParams()
  for (const [key, raw] of Object.entries(params) as [string, QueryValue][]) {
    if (raw === undefined || raw === null || raw === '') continue
    if (Array.isArray(raw)) {
      if (raw.length) sp.set(key, raw.join(','))
    } else {
      sp.set(key, String(raw))
    }
  }
  const s = sp.toString()
  return s ? `?${s}` : ''
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response
  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? { Accept: 'application/json' } : { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new ApiError(0, { code: 'network_error', message: 'Cannot reach the server. Check your connection.' })
  }

  if (res.status === 204) return undefined as T

  const text = await res.text()
  let data: unknown = undefined
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = undefined
    }
  }

  if (!res.ok) {
    const errBody = isErrorBody(data)
      ? data
      : { code: 'unknown_error', message: `Request failed (${res.status} ${res.statusText})` }
    const error = new ApiError(res.status, errBody)
    if (res.status === 401 && !isAuthPath(window.location.pathname)) onUnauthorized?.()
    throw error
  }

  return data as T
}

function isErrorBody(d: unknown): d is ApiErrorBody {
  return typeof d === 'object' && d !== null && typeof (d as ApiErrorBody).code === 'string' && typeof (d as ApiErrorBody).message === 'string'
}

export const api = {
  get: <T>(path: string, params?: object) => request<T>('GET', `${path}${toQuery(params)}`),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  put: <T>(path: string, body: unknown) => request<T>('PUT', path, body),
}
