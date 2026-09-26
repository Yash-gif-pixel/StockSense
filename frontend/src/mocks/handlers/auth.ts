import { delay, http, HttpResponse } from 'msw'
import { z } from 'zod'
import type {
  ChangePasswordBody,
  ForgotPasswordBody,
  LoginBody,
  ResetPasswordBody,
  SignupBody,
  User,
} from '@/api/types'
import { emailSchema, loginIdSchema, passwordSchema } from '@/lib/validation'
import { db, isoNow, nextId, type UserRow } from '../db'
import { clearSessionCookie, currentUser, sessionCookie } from '../session'
import { apiError, errors, zodFields } from '../utils'

const toUser = (u: UserRow): User => ({ id: u.id, login_id: u.login_id, email: u.email, created_at: u.created_at })

// One-time reset codes issued by forgot-password (mock-only state).
const otps: { email: string; otp: string; expires: number; used: boolean }[] = []
const OTP_TTL_MS = 10 * 60_000

const signupSchema = z.object({ login_id: loginIdSchema, email: emailSchema, password: passwordSchema })
const resetSchema = z.object({ email: emailSchema, otp: z.string(), new_password: passwordSchema })

export const authHandlers = [
  http.post('/api/auth/signup', async ({ request }) => {
    await delay()
    const parsed = signupSchema.safeParse(await request.json())
    if (!parsed.success) return errors.validation(zodFields(parsed.error))
    const body: SignupBody = parsed.data
    if (db.users.some((u) => u.login_id === body.login_id)) {
      return errors.conflict('Login ID is already taken', { login_id: 'Login ID is already taken' })
    }
    if (db.users.some((u) => u.email.toLowerCase() === body.email.toLowerCase())) {
      return errors.conflict('Email is already registered', { email: 'Email is already registered' })
    }
    // Backend stores and returns emails fully lower-cased.
    const user: UserRow = { id: nextId(db.users), ...body, email: body.email.toLowerCase(), created_at: isoNow() }
    db.users.push(user)
    return HttpResponse.json(toUser(user), { status: 201 })
  }),

  http.post('/api/auth/login', async ({ request }) => {
    await delay()
    const body = (await request.json()) as LoginBody
    const user = db.users.find((u) => u.login_id === body.login_id && u.password === body.password)
    if (!user) return apiError(401, 'unauthorized', 'Invalid Login Id or Password')
    return HttpResponse.json(toUser(user), { headers: { 'Set-Cookie': sessionCookie(user.id) } })
  }),

  http.post('/api/auth/logout', async () => {
    await delay()
    return new HttpResponse(null, { status: 204, headers: { 'Set-Cookie': clearSessionCookie() } })
  }),

  http.get('/api/auth/me', async ({ cookies }) => {
    await delay()
    const user = currentUser(cookies)
    return user ? HttpResponse.json(toUser(user)) : errors.unauthorized()
  }),

  http.post('/api/auth/change-password', async ({ request, cookies }) => {
    await delay()
    const user = currentUser(cookies)
    if (!user) return errors.unauthorized()
    const body = (await request.json()) as ChangePasswordBody
    // Contract does not specify the wrong-current-password response; mock uses a 422 field error.
    if (body.current_password !== user.password) {
      return errors.validation({ current_password: 'Current password is incorrect' })
    }
    const parsed = passwordSchema.safeParse(body.new_password)
    if (!parsed.success) return errors.validation({ new_password: parsed.error.issues[0].message })
    user.password = body.new_password
    return new HttpResponse(null, { status: 204 })
  }),

  http.post('/api/auth/forgot-password', async ({ request }) => {
    await delay()
    const body = (await request.json()) as ForgotPasswordBody
    const user = db.users.find((u) => u.email.toLowerCase() === String(body.email ?? '').toLowerCase())
    if (user) {
      const otp = String(Math.floor(100000 + Math.random() * 900000))
      otps.push({ email: user.email.toLowerCase(), otp, expires: Date.now() + OTP_TTL_MS, used: false })
      // Stand-in for the email the backend would send.
      console.info(`[mock] Password reset code for ${user.email}: ${otp}`)
    }
    return HttpResponse.json({ message: 'If an account exists for that email, a reset code has been sent.' })
  }),

  http.post('/api/auth/reset-password', async ({ request }) => {
    await delay()
    const raw = (await request.json()) as ResetPasswordBody
    const parsed = resetSchema.safeParse(raw)
    if (!parsed.success) return errors.validation(zodFields(parsed.error))
    const { email, otp, new_password } = parsed.data
    const entry = otps.findLast((o) => o.email === email.toLowerCase() && o.otp === otp)
    const user = db.users.find((u) => u.email.toLowerCase() === email.toLowerCase())
    if (!entry || entry.used || entry.expires < Date.now() || !user) {
      return apiError(400, 'invalid_otp', 'The code is invalid or has expired')
    }
    entry.used = true
    user.password = new_password
    return new HttpResponse(null, { status: 204 })
  }),
]
