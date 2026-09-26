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
import { useLogin } from '@/hooks/useAuth'
import { type LoginForm, loginFormSchema } from '@/lib/validation'

const INVALID_LOGIN_MESSAGE = 'Invalid Login Id or Password'

export function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const login = useLogin()
  const [formError, setFormError] = useState<string | null>(null)
  const notice = (location.state as { notice?: string } | null)?.notice
  const from = (location.state as { from?: string } | null)?.from

  const form = useForm<LoginForm>({
    resolver: zodResolver(loginFormSchema),
    defaultValues: { login_id: '', password: '' },
  })
  const { errors } = form.formState

  const onSubmit = form.handleSubmit((values) => {
    setFormError(null)
    login.mutate(values, {
      onSuccess: () => navigate(from && from !== '/login' ? from : '/dashboard', { replace: true }),
      onError: (e) => {
        form.resetField('password')
        setFormError(isApiError(e) && e.status === 401 ? INVALID_LOGIN_MESSAGE : e.message)
      },
    })
  })

  return (
    <AuthLayout
      title="Sign in"
      description="Sign in to manage your inventory."
      footer={
        <>
          New here?{' '}
          <Link to="/signup" className="font-medium text-foreground underline-offset-4 hover:underline">
            Sign Up
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate>
        <FieldGroup className="gap-4">
          <FormAlert message={notice} variant="success" />
          <FormAlert message={formError} />
          <TextField label="Login ID" autoComplete="username" autoFocus error={errors.login_id?.message} {...form.register('login_id')} />
          <div className="flex flex-col gap-1">
            <TextField label="Password" type="password" autoComplete="current-password" error={errors.password?.message} {...form.register('password')} />
            <Link to="/forgot-password" className="self-end text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
              Forgot Password?
            </Link>
          </div>
          <Button type="submit" className="w-full" disabled={login.isPending}>
            {login.isPending ? 'Signing in…' : 'Sign in'}
          </Button>
        </FieldGroup>
      </form>
    </AuthLayout>
  )
}
