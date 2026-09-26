import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function FullPageLoader() {
  return (
    <div className="flex min-h-svh items-center justify-center text-muted-foreground" aria-busy="true">
      <Loader2 className="size-5 animate-spin" />
      <span className="sr-only">Loading…</span>
    </div>
  )
}

export function FullPageError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-3 p-6 text-center">
      <p className="text-sm text-muted-foreground">{message}</p>
      <Button variant="outline" onClick={onRetry}>
        Try again
      </Button>
    </div>
  )
}
