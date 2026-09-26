/**
 * UI pieces from nexus-studio (src/components/ui), ported to TypeScript and `motion`:
 * ScrollProgressBar, MagneticButton, AnimatedCounter, MarqueeText, ScrollReveal.
 * AnimatedCounter no longer needs react-countup: motion's `animate` drives it. Everything
 * honours reduced motion (the page also sits inside <MotionConfig reducedMotion="user">).
 */
import { useEffect, useRef, useState, type ComponentProps, type ReactNode } from 'react'
import { animate, motion, useInView, useMotionValue, useReducedMotion, useScroll, useSpring } from 'motion/react'
import { cn } from '@/lib/utils'

const EASE = [0.25, 0.46, 0.45, 0.94] as const


/** 2px signal-lime bar across the top that fills as the page scrolls. */
export function ScrollProgressBar() {
  const { scrollYProgress } = useScroll()
  return <motion.div aria-hidden className="fixed inset-x-0 top-0 z-[100] h-[2px] origin-left bg-signal" style={{ scaleX: scrollYProgress }} />
}

/** Drifts toward the cursor while hovered, springs back on leave. Wraps any link or button. */
export function Magnetic({ children, className, strength = 0.35 }: { children: ReactNode; className?: string; strength?: number }) {
  const ref = useRef<HTMLSpanElement>(null)
  const reduce = useReducedMotion()
  const x = useMotionValue(0)
  const y = useMotionValue(0)
  const sx = useSpring(x, { stiffness: 200, damping: 15 })
  const sy = useSpring(y, { stiffness: 200, damping: 15 })
  return (
    <motion.span
      ref={ref}
      className={cn('inline-flex', className)}
      style={reduce ? undefined : { x: sx, y: sy }}
      onMouseMove={(e) => {
        if (reduce || !ref.current) return
        const r = ref.current.getBoundingClientRect()
        x.set((e.clientX - (r.left + r.width / 2)) * strength)
        y.set((e.clientY - (r.top + r.height / 2)) * strength)
      }}
      onMouseLeave={() => {
        x.set(0)
        y.set(0)
      }}
    >
      {children}
    </motion.span>
  )
}

/** Counts from 0 to `end` once it scrolls into view (2.5s, like the original). */
export function AnimatedCounter({ end, prefix = '', suffix = '', decimals = 0 }: { end: number; prefix?: string; suffix?: string; decimals?: number }) {
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true })
  const reduce = useReducedMotion()
  const [value, setValue] = useState(0)

  useEffect(() => {
    if (!inView || reduce) return
    const controls = animate(0, end, { duration: 2.5, ease: 'easeOut', onUpdate: setValue })
    return () => controls.stop()
  }, [inView, end, reduce])

  return (
    <span ref={ref} className="tabular-nums">
      {prefix}
      {(reduce ? end : value).toFixed(decimals)}
      {suffix}
    </span>
  )
}

/** Endless horizontal ticker: the items twice over, translated -50% on a loop. */
export function MarqueeText({ items, direction = 'forward' }: { items: ReactNode[]; direction?: 'forward' | 'reverse' }) {
  const row = (dup: boolean) =>
    items.map((item, i) => (
      <div key={`${dup ? 'd' : 'o'}-${i}`} aria-hidden={dup || undefined} className="flex items-center">
        <span className="mx-8">{item}</span>
        <span aria-hidden className="text-sm text-signal-ink/40">
          ◆
        </span>
      </div>
    ))
  return (
    <div className="relative flex w-full overflow-hidden">
      <div className={cn('flex whitespace-nowrap', direction === 'reverse' ? 'animate-marquee-reverse' : 'animate-marquee')}>
        {row(false)}
        {row(true)}
      </div>
    </div>
  )
}

/** Fade + rise into view. */
export function ScrollReveal({ children, delay = 0, className }: { children: ReactNode; delay?: number; className?: string }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 50 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.8, delay, ease: EASE }}
    >
      {children}
    </motion.div>
  )
}

/** Small mono eyebrow above a section title, in the signal colour. */
export function Eyebrow({ children, className, ...props }: ComponentProps<'p'>) {
  return (
    <p className={cn('mb-4 font-mono text-xs uppercase tracking-widest text-signal-ink', className)} {...props}>
      {children}
    </p>
  )
}
