import { Boxes } from 'lucide-react'
import { cn } from '@/lib/utils'

/** `compact` hides the word mark on narrow screens (top nav). */
export function Logo({ className, compact }: { className?: string; compact?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-2 font-semibold tracking-tight', className)}>
      <span className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
        <Boxes className="size-4" />
      </span>
      <span className={cn(compact && 'hidden sm:inline')}>StockSense</span>
    </span>
  )
}
