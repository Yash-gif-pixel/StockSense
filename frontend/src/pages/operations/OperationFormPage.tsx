import { Navigate, useParams } from 'react-router'
import { isApiError } from '@/api/client'
import { Skeleton } from '@/components/ui/skeleton'
import { operationPath, type OperationTypeConfig } from '@/features/operations/config'
import { OperationForm } from '@/features/operations/OperationForm'
import { useOperation } from '@/hooks/useOperations'

/** /…/new (no :id) or /…/:id — loads the operation and hands it to the form. */
export function OperationFormPage({ config }: { config: OperationTypeConfig }) {
  const { id } = useParams()
  const opId = id === undefined ? undefined : Number(id)
  const invalidId = opId !== undefined && !Number.isInteger(opId)
  const { data: op, isPending, error, refetch } = useOperation(invalidId ? undefined : opId)

  if (invalidId || (isApiError(error) && error.status === 404)) {
    return <p className="p-6 text-sm text-muted-foreground">{config.singular} not found.</p>
  }
  if (opId !== undefined && isPending) {
    return (
      <div className="flex flex-col gap-3" aria-busy="true">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-72 w-full" />
      </div>
    )
  }
  if (opId !== undefined && error) {
    return (
      <p className="p-6 text-sm text-muted-foreground">
        {error.message}{' '}
        <button type="button" className="underline" onClick={() => void refetch()}>
          Try again
        </button>
      </p>
    )
  }
  // Opened a delivery under /receipts (or vice versa): send to the right page.
  if (op && op.type !== config.type) {
    const path = operationPath(op)
    return path ? <Navigate to={path} replace /> : <p className="p-6 text-sm text-muted-foreground">This operation has no detail page.</p>
  }

  return <OperationForm key={op?.id ?? 'new'} config={config} op={op} />
}
