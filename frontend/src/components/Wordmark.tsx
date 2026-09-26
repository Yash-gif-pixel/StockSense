import { cn } from '@/lib/utils'

/** The nexus-studio style wordmark: STOCKSENSE plus the pulsing signal dot. Used by the app header,
 *  the auth screens and the landing page. */
export function Wordmark({ className, size = 'lg' }: { className?: string; size?: 'md' | 'lg' }) {
  return (
    <span className={cn('flex items-center gap-2', className)}>
      <span className={cn('font-bold tracking-tight text-foreground', size === 'lg' ? 'text-2xl' : 'text-lg')}>STOCKSENSE</span>
      <span aria-hidden className="size-2 animate-pulse-slow rounded-full bg-signal ring-1 ring-foreground/10" />
    </span>
  )
}
