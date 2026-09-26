import { z } from 'zod'

// Rules copied from docs/API_CONTRACT.md → Auth. Shared by the forms and the MSW mocks.

export const loginIdSchema = z
  .string()
  .trim()
  .min(6, 'Login ID must be 6–12 characters')
  .max(12, 'Login ID must be 6–12 characters')
  .regex(/^[A-Za-z0-9_.]+$/, 'Only letters, digits, "_" and "." are allowed')

export const emailSchema = z.string().trim().min(1, 'Email is required').pipe(z.email('Enter a valid email address'))

/** More than 8 chars (min 9), at least one lowercase, one uppercase, one special character. */
export const passwordSchema = z
  .string()
  .min(9, 'Password must be at least 9 characters')
  .regex(/[a-z]/, 'Password needs a lowercase letter')
  .regex(/[A-Z]/, 'Password needs an uppercase letter')
  .regex(/[^A-Za-z0-9]/, 'Password needs a special character')

export const otpSchema = z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code')

const passwordsMatch = { error: 'Passwords do not match', path: ['confirm_password'] }

export const loginFormSchema = z.object({
  login_id: z.string().trim().min(1, 'Login ID is required'),
  password: z.string().min(1, 'Password is required'),
})

export const signupFormSchema = z
  .object({
    login_id: loginIdSchema,
    email: emailSchema,
    password: passwordSchema,
    confirm_password: z.string(),
  })
  .refine((v) => v.password === v.confirm_password, passwordsMatch)

export const forgotPasswordFormSchema = z.object({
  email: emailSchema,
})

export const resetPasswordFormSchema = z
  .object({
    email: emailSchema,
    otp: otpSchema,
    new_password: passwordSchema,
    confirm_password: z.string(),
  })
  .refine((v) => v.new_password === v.confirm_password, passwordsMatch)

export const changePasswordFormSchema = z
  .object({
    current_password: z.string().min(1, 'Current password is required'),
    new_password: passwordSchema,
    confirm_password: z.string(),
  })
  .refine((v) => v.new_password === v.confirm_password, passwordsMatch)

export type LoginForm = z.infer<typeof loginFormSchema>
export type SignupForm = z.infer<typeof signupFormSchema>
export type ForgotPasswordForm = z.infer<typeof forgotPasswordFormSchema>
export type ResetPasswordForm = z.infer<typeof resetPasswordFormSchema>
export type ChangePasswordForm = z.infer<typeof changePasswordFormSchema>

// ---------- Numeric inputs ----------
// Number inputs are kept as strings in the form and converted here, so empty fields
// produce a clear message instead of NaN.

const isNumeric = (v: string) => v !== '' && Number.isFinite(Number(v))

export const requiredNumber = (label: string) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required`)
    .refine(isNumeric, `${label} must be a number`)
    .transform(Number)
    .refine((n) => n >= 0, `${label} cannot be negative`)

export const optionalNumber = (label: string) =>
  z
    .string()
    .trim()
    .refine((v) => v === '' || isNumeric(v), `${label} must be a number`)
    .transform((v) => (v === '' ? null : Number(v)))
    .refine((n) => n === null || n >= 0, `${label} cannot be negative`)

export const shortCodeSchema = z.string().trim().min(1, 'Short code is required').max(10, 'Max 10 characters')
