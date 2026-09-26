import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { ThemeToggle } from '@/components/ThemeToggle'
import { Wordmark } from '@/components/Wordmark'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'

/** Centered card used by login / signup / forgot / reset, over the landing hero's grid, glow and grain. */
export function AuthLayout({ title, description, children, footer }: { title: string; description?: string; children: ReactNode; footer?: ReactNode }) {
  useDocumentTitle(title)
  return (
    <div className="relative flex min-h-svh flex-col items-center justify-center gap-6 overflow-hidden bg-background p-4">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[size:60px_60px]"
        style={{
          backgroundImage:
            'linear-gradient(color-mix(in srgb, var(--foreground) 4%, transparent) 1px, transparent 1px), linear-gradient(90deg, color-mix(in srgb, var(--foreground) 4%, transparent) 1px, transparent 1px)',
        }}
      />
      <div aria-hidden className="pointer-events-none absolute -top-40 left-1/2 size-[640px] -translate-x-1/2 rounded-full bg-signal/20 blur-[120px] dark:bg-signal/10" />
      <div aria-hidden className="grain absolute inset-0" />

      <ThemeToggle className="absolute top-4 right-4 z-10" />
      <Link to="/" aria-label="StockSense home" className="relative z-10">
        <Wordmark />
      </Link>
      <Card className="relative z-10 w-full max-w-sm rounded-2xl bg-card/90 backdrop-blur">
        <CardHeader>
          <CardTitle className="text-xl font-bold tracking-tight">{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
      {footer && <div className="relative z-10 text-sm text-muted-foreground">{footer}</div>}
    </div>
  )
}
