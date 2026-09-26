import type { FieldValues, Path, UseFormSetError } from 'react-hook-form'
import { toast } from 'sonner'
import { isApiError } from '@/api/client'

/**
 * Copies ApiError.fields onto matching form fields, whatever the status (e.g. validation_error as 400 or 422).
 * Returns a message for anything that could not be attached to a field (shown at form level),
 * or null when there is nothing left to show inline.
 *
 * 409 conflict: fields (login_id, email, sku, short_code, name, …) go on their inputs; if none match,
 * the message is shown as a toast instead of inline.
 */
export function applyServerErrors<T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>,
  formFields: readonly Path<T>[],
): string | null {
  if (!isApiError(error)) return 'Something went wrong. Please try again.'

  const unmatched: string[] = []
  for (const [field, message] of Object.entries(error.fields)) {
    if ((formFields as readonly string[]).includes(field)) {
      setError(field as Path<T>, { type: 'server', message }, { shouldFocus: true })
    } else {
      unmatched.push(message)
    }
  }
  const matchedAny = Object.keys(error.fields).length > unmatched.length

  if (error.code === 'conflict') {
    if (!matchedAny) toast.error(error.message)
    return null
  }
  if (Object.keys(error.fields).length === 0) return error.message
  return unmatched.length ? unmatched.join(' ') : null
}
