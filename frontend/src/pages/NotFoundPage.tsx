import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'

export function NotFoundPage() {
  useDocumentTitle('Page not found')
  return (
    <div className="flex flex-col items-start gap-3 py-10">
      <h1 className="text-3xl font-bold tracking-tight">Page not found</h1>
      <p className="text-sm text-muted-foreground">The page you opened doesn&apos;t exist or has moved.</p>
      <Button asChild variant="outline">
        <Link to="/dashboard">Go to Dashboard</Link>
      </Button>
    </div>
  )
}
