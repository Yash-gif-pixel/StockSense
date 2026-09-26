import { isRouteErrorResponse, useRouteError } from 'react-router'
import { Button } from '@/components/ui/button'

/** Last-resort error screen for render errors and failed page downloads (e.g. after a redeploy). */
export function RouteErrorPage() {
  const error = useRouteError()
  console.error(error)
  const message = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : error instanceof Error && /dynamically imported module|Importing a module script failed/i.test(error.message)
      ? 'A new version of StockSense is available.'
      : 'Something went wrong on this page.'
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-3 p-6 text-center">
      <h1 className="text-lg font-semibold">{message}</h1>
      <p className="text-sm text-muted-foreground">Reload the page to continue. Your saved data is safe.</p>
      <Button onClick={() => window.location.reload()}>Reload</Button>
    </div>
  )
}
