import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useNavigate } from 'react-router'
import { FormAlert } from '@/components/form/FormAlert'
import { TextField } from '@/components/form/TextField'
import { AuthLayout } from '@/components/layout/AuthLayout'
import { Button } from '@/components/ui/button'
import { FieldGroup } from '@/components/ui/field'
import { useForgotPassword } from '@/hooks/useAuth'
import { type ForgotPasswordForm, forgotPasswordFormSchema } from '@/lib/validation'

// Same text whether or not the email exists (the API always answers 200).
const RESET_SENT_MESSAGE = 'If an account exists for that email, we have sent a 6-digit reset code.'

export function ForgotPasswordPage() {
  const navigate = useNavigate()
  const forgot = useForgotPassword()
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)

  const form = useForm<ForgotPasswordForm>({
    resolver: zodResolver(forgotPasswordFormSchema),
    defaultValues: { email: '' },
  })

  const onSubmit = form.handleSubmit(({ email }) => {
    setFormError(null)
    forgot.mutate(
      { email },
      {
        onSuccess: () => setSentTo(email),
        onError: (e) => setFormError(e.message),
      },
    )
  })

  const footer = (
    <Link to="/login" className="font-medium text-foreground underline-offset-4 hover:underline">
      Back to sign in
    </Link>
  )

  if (sentTo) {
    return (
      <AuthLayout title="Check your email" footer={footer}>
        <div className="flex flex-col gap-4">
          <FormAlert message={RESET_SENT_MESSAGE} variant="success" />
          {/* Email travels in router state, never in the URL. */}
          <Button className="w-full" onClick={() => navigate('/reset-password', { state: { email: sentTo } })}>
            Enter reset code
          </Button>
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title="Forgot password" description="Enter your account email and we'll send you a reset code." footer={footer}>
      <form onSubmit={onSubmit} noValidate>
        <FieldGroup className="gap-4">
          <FormAlert message={formError} />
          <TextField label="Email" type="email" autoComplete="email" autoFocus error={form.formState.errors.email?.message} {...form.register('email')} />
          <Button type="submit" className="w-full" disabled={forgot.isPending}>
            {forgot.isPending ? 'Sending…' : 'Send reset code'}
          </Button>
        </FieldGroup>
      </form>
    </AuthLayout>
  )
}
