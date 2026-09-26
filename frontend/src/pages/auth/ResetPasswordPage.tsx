import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useLocation, useNavigate } from 'react-router'
import { isApiError } from '@/api/client'
import { FormAlert } from '@/components/form/FormAlert'
import { TextField } from '@/components/form/TextField'
import { AuthLayout } from '@/components/layout/AuthLayout'
import { Button } from '@/components/ui/button'
import { FieldGroup } from '@/components/ui/field'
import { useResetPassword } from '@/hooks/useAuth'
import { applyServerErrors } from '@/lib/formErrors'
import { type ResetPasswordForm, resetPasswordFormSchema } from '@/lib/validation'

export function ResetPasswordPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const reset = useResetPassword()
  const [formError, setFormError] = useState<string | null>(null)
  const prefillEmail = (location.state as { email?: string } | null)?.email ?? ''

  const form = useForm<ResetPasswordForm>({
    resolver: zodResolver(resetPasswordFormSchema),
    defaultValues: { email: prefillEmail, otp: '', new_password: '', confirm_password: '' },
  })
  const { errors } = form.formState

  const onSubmit = form.handleSubmit(({ email, otp, new_password }) => {
    setFormError(null)
    reset.mutate(
      { email, otp, new_password },
      {
        onSuccess: () => navigate('/login', { replace: true, state: { notice: 'Password updated. Please sign in.' } }),
        onError: (e) => {
          if (isApiError(e) && e.code === 'invalid_otp') {
            form.setError('otp', { type: 'server', message: e.message }, { shouldFocus: true })
            return
          }
          setFormError(applyServerErrors(e, form.setError, ['email', 'otp', 'new_password']))
        },
      },
    )
  })

  return (
    <AuthLayout
      title="Reset password"
      description="Enter the 6-digit code from your email and choose a new password."
      footer={
        <>
          Didn&apos;t get a code?{' '}
          <Link to="/forgot-password" className="font-medium text-foreground underline-offset-4 hover:underline">
            Send again
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate>
        <FieldGroup className="gap-4">
          <FormAlert message={formError} />
          <TextField label="Email" type="email" autoComplete="email" autoFocus={!prefillEmail} error={errors.email?.message} {...form.register('email')} />
          <TextField
            label="Reset code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="000000"
            autoFocus={!!prefillEmail}
            className="font-mono tracking-[0.3em]"
            error={errors.otp?.message}
            {...form.register('otp')}
          />
          <TextField
            label="New password"
            type="password"
            autoComplete="new-password"
            description="At least 9 characters, with a lowercase, an uppercase and a special character."
            error={errors.new_password?.message}
            {...form.register('new_password')}
          />
          <TextField label="Confirm password" type="password" autoComplete="new-password" error={errors.confirm_password?.message} {...form.register('confirm_password')} />
          <Button type="submit" className="w-full" disabled={reset.isPending}>
            {reset.isPending ? 'Resetting…' : 'Reset password'}
          </Button>
        </FieldGroup>
      </form>
    </AuthLayout>
  )
}
