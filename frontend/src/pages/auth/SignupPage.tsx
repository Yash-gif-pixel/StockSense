import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useNavigate } from 'react-router'
import { toast } from 'sonner'
import { FormAlert } from '@/components/form/FormAlert'
import { TextField } from '@/components/form/TextField'
import { AuthLayout } from '@/components/layout/AuthLayout'
import { Button } from '@/components/ui/button'
import { FieldGroup } from '@/components/ui/field'
import { useSignup } from '@/hooks/useAuth'
import { applyServerErrors } from '@/lib/formErrors'
import { type SignupForm, signupFormSchema } from '@/lib/validation'

const PASSWORD_HINT = 'At least 9 characters, with a lowercase, an uppercase and a special character.'

export function SignupPage() {
  const navigate = useNavigate()
  const signup = useSignup()
  const [formError, setFormError] = useState<string | null>(null)

  const form = useForm<SignupForm>({
    resolver: zodResolver(signupFormSchema),
    defaultValues: { login_id: '', email: '', password: '', confirm_password: '' },
  })
  const { errors } = form.formState

  const onSubmit = form.handleSubmit(({ login_id, email, password }) => {
    setFormError(null)
    signup.mutate(
      { login_id, email, password },
      {
        // 201 sets no cookie: the user signs in next.
        onSuccess: () => {
          toast.success('Account created. Please sign in.')
          navigate('/login', { replace: true })
        },
        onError: (e) => setFormError(applyServerErrors(e, form.setError, ['login_id', 'email', 'password'])),
      },
    )
  })

  return (
    <AuthLayout
      title="Create an account"
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-foreground underline-offset-4 hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate>
        <FieldGroup className="gap-4">
          <FormAlert message={formError} />
          <TextField
            label="Login ID"
            autoComplete="username"
            autoFocus
            description="6–12 characters: letters, digits, _ or ."
            error={errors.login_id?.message}
            {...form.register('login_id')}
          />
          <TextField label="Email" type="email" autoComplete="email" error={errors.email?.message} {...form.register('email')} />
          <TextField
            label="Password"
            type="password"
            autoComplete="new-password"
            description={PASSWORD_HINT}
            error={errors.password?.message}
            {...form.register('password')}
          />
          <TextField
            label="Re-enter Password"
            type="password"
            autoComplete="new-password"
            error={errors.confirm_password?.message}
            {...form.register('confirm_password')}
          />
          <Button type="submit" className="w-full" disabled={signup.isPending}>
            {signup.isPending ? 'Creating account…' : 'Sign Up'}
          </Button>
        </FieldGroup>
      </form>
    </AuthLayout>
  )
}
