import { bypass, delay, type HttpResponseResolver, type PathParams } from 'msw'
import type { User } from '@/api/types'
import { db, type UserRow } from './db'
import { LIVE } from './live'
import { errors } from './utils'

// ---------- Mock auth (only used while auth itself is mocked) ----------

// Stand-in for the backend's httpOnly session cookie. A mocked Set-Cookie cannot be
// httpOnly (MSW writes it via document.cookie), but app code never reads it — only these handlers do.
export const SESSION_COOKIE = 'stocksense_session'

export function currentUser(cookies: Record<string, string>): UserRow | undefined {
  const id = Number(cookies[SESSION_COOKIE])
  return Number.isFinite(id) ? db.users.find((u) => u.id === id) : undefined
}

export const sessionCookie = (userId: number) => `${SESSION_COOKIE}=${userId}; Path=/; SameSite=Lax`
export const clearSessionCookie = () => `${SESSION_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`

// ---------- Session for the still-mocked endpoints ----------

/**
 * With auth live, the session is the backend's httpOnly cookie, which neither app code nor MSW can read.
 * So ask the real backend: GET /api/auth/me, bypassing MSW. The browser attaches the cookie itself.
 * The real user is mirrored into the mock db so "Responsible" shows who is actually signed in.
 */
async function liveSessionUser(request: Request): Promise<UserRow | undefined> {
  const res = await fetch(bypass(new URL('/api/auth/me', request.url)))
  if (!res.ok) return undefined
  const me = (await res.json()) as User
  let row = db.users.find((u) => u.id === me.id)
  if (row) Object.assign(row, { login_id: me.login_id, email: me.email, created_at: me.created_at })
  else db.users.push((row = { id: me.id, login_id: me.login_id, email: me.email, password: '', created_at: me.created_at }))
  return row
}

const userByRequest = new WeakMap<Request, UserRow>()

/** The signed-in user for a request that went through `authed()`. */
export function requestUser(request: Request): UserRow {
  const user = userByRequest.get(request)
  if (!user) throw new Error('requestUser() called outside an authed() handler')
  return user
}

/** Wraps a resolver: adds latency and returns 401 unless there is a valid session (contract: all non-auth endpoints). */
export function authed<P extends PathParams<keyof P> = PathParams>(resolver: HttpResponseResolver<P>): HttpResponseResolver<P> {
  return async (info) => {
    await delay()
    const user = LIVE.auth ? await liveSessionUser(info.request) : currentUser(info.cookies)
    if (!user) return errors.unauthorized()
    userByRequest.set(info.request, user)
    return resolver(info)
  }
}
