import { zodResolver } from '@hookform/resolvers/zod'
import { format, parseISO } from 'date-fns'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { FormAlert } from '@/components/form/FormAlert'
import { TextField } from '@/components/form/TextField'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { FieldGroup } from '@/components/ui/field'
import { useChangePassword, useMe } from '@/hooks/useAuth'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { applyServerErrors } from '@/lib/formErrors'
import { type ChangePasswordForm, changePasswordFormSchema } from '@/lib/validation'

export function ProfilePage() {
  useDocumentTitle('My Profile')
  const { data: user } = useMe()
  const change = useChangePassword()
  const [formError, setFormError] = useState<string | null>(null)

  const form = useForm<ChangePasswordForm>({
    resolver: zodResolver(changePasswordFormSchema),
    defaultValues: { current_password: '', new_password: '', confirm_password: '' },
  })
  const { errors } = form.formState

  const onSubmit = form.handleSubmit(({ current_password, new_password }) => {
    setFormError(null)
    change.mutate(
      { current_password, new_password },
      {
        onSuccess: () => {
          form.reset()
          toast.success('Password changed')
        },
        onError: (e) => setFormError(applyServerErrors(e, form.setError, ['current_password', 'new_password'])),
      },
    )
  })

  return (
    <div className="flex max-w-xl flex-col gap-4">
      <div>
        <p className="mb-1 font-mono text-xs tracking-widest text-signal-ink uppercase">Account</p>
        <h1 className="text-3xl font-bold tracking-tight">My Profile</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
        </CardHeader>
        <CardContent>
          <FieldGroup className="gap-4">
            <TextField label="Login ID" value={user?.login_id ?? ''} readOnly disabled />
            <TextField label="Email" value={user?.email ?? ''} readOnly disabled />
            {user && <p className="text-xs text-muted-foreground">Member since {format(parseISO(user.created_at), 'd MMM yyyy')}</p>}
          </FieldGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Change password</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} noValidate>
            <FieldGroup className="gap-4">
              <FormAlert message={formError} />
              <TextField
                label="Current password"
                type="password"
                autoComplete="current-password"
                error={errors.current_password?.message}
                {...form.register('current_password')}
              />
              <TextField
                label="New password"
                type="password"
                autoComplete="new-password"
                description="At least 9 characters, with a lowercase, an uppercase and a special character."
                error={errors.new_password?.message}
                {...form.register('new_password')}
              />
              <TextField label="Confirm new password" type="password" autoComplete="new-password" error={errors.confirm_password?.message} {...form.register('confirm_password')} />
              <div>
                <Button type="submit" disabled={change.isPending}>
                  {change.isPending ? 'Saving…' : 'Change password'}
                </Button>
              </div>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
