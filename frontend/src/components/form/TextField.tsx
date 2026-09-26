import type { ComponentProps } from 'react'
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

type TextFieldProps = ComponentProps<typeof Input> & {
  label: string
  error?: string
  description?: string
}

/** Label + input + error, wired for react-hook-form's register(). */
export function TextField({ label, error, description, id, name, className, ...props }: TextFieldProps) {
  const fieldId = id ?? name
  return (
    <Field data-invalid={error ? true : undefined}>
      <FieldLabel htmlFor={fieldId}>{label}</FieldLabel>
      <Input
        id={fieldId}
        name={name}
        aria-invalid={error ? true : undefined}
        className={cn(props.readOnly && 'border-transparent bg-muted/50 shadow-none focus-visible:ring-0', className)}
        {...props}
      />
      {description && !error && <FieldDescription>{description}</FieldDescription>}
      <FieldError>{error}</FieldError>
    </Field>
  )
}
