import { CircleAlert, CircleCheck } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Form-level message (server errors that don't belong to a single field, or a success note). */
export function FormAlert({ message, variant = 'error' }: { message?: string | null; variant?: 'error' | 'success' }) {
  if (!message) return null
  const Icon = variant === 'error' ? CircleAlert : CircleCheck
  return (
    <div
      role={variant === 'error' ? 'alert' : 'status'}
      className={cn(
        'flex items-start gap-2 rounded-md border px-3 py-2 text-sm',
        variant === 'error' ? 'border-destructive/30 bg-destructive/5 text-destructive' : 'border-emerald-600/30 bg-emerald-50 text-emerald-800 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-300',
      )}
    >
      <Icon className="mt-0.5 size-4 shrink-0" />
      <span>{message}</span>
    </div>
  )
}
