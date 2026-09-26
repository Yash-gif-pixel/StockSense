import { useEffect, useRef } from 'react'
import { motion, useReducedMotion, useScroll, useTransform } from 'motion/react'
import { ChevronDown } from 'lucide-react'
import { Link } from 'react-router'
import { useSignedIn } from '@/hooks/useAuth'
import { AnimatedCounter, Magnetic } from '../ui'

/** nexus-studio Hero: a glow that follows the cursor over a fine grid and grain, a three-line
 *  headline that rises in word by word (the middle line in outline type), a rotating ring of
 *  text, a counter in the corner, and a parallax fade as you scroll away. */
const EASE = [0.25, 0.46, 0.45, 0.94] as const
const LINES: [string, boolean][] = [
  ['Every unit.', false],
  ['Every move.', true],
  ['On record.', false],
]

export function Hero() {
  const containerRef = useRef<HTMLElement>(null)
  const blobRef = useRef<HTMLDivElement>(null)
  const reduce = useReducedMotion()
  const signedIn = useSignedIn()
  const { scrollYProgress } = useScroll({ target: containerRef, offset: ['start start', 'end start'] })
  const opacity = useTransform(scrollYProgress, [0, 0.8], [1, 0])
  const scale = useTransform(scrollYProgress, [0, 1], [1, 0.9])
  const y = useTransform(scrollYProgress, [0, 1], [0, 150])

  useEffect(() => {
    if (reduce) return
    const move = (e: MouseEvent) => {
      if (blobRef.current) blobRef.current.style.transform = `translate(${e.clientX - 400}px, ${e.clientY - 400}px)`
    }
    window.addEventListener('mousemove', move)
    return () => window.removeEventListener('mousemove', move)
  }, [reduce])

  let wordIndex = 0
  const words = (text: string, stroke: boolean) =>
    text.split(' ').map((word, i) => {
      const delay = wordIndex++ * 0.08
      return (
        <motion.span
          animate={{ opacity: 1, y: 0, rotateX: 0 }}
          className={`mr-[2vw] inline-block ${stroke ? 'text-stroke' : 'text-foreground'}`}
          initial={{ opacity: 0, y: 60, rotateX: -40 }}
          key={i}
          style={{ transformOrigin: 'bottom center' }}
          transition={{ delay, duration: 0.7, ease: EASE }}
        >
          {word}
        </motion.span>
      )
    })

  return (
    <section className="relative flex min-h-svh flex-col justify-center overflow-hidden bg-background pt-24 pb-20" ref={containerRef}>
      <div
        aria-hidden
        className="pointer-events-none absolute top-0 left-0 z-0 size-[800px] rounded-full bg-signal/15 blur-[120px] transition-transform duration-1000 ease-out dark:bg-signal/10"
        ref={blobRef}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0 bg-[size:60px_60px]"
        style={{
          backgroundImage:
            'linear-gradient(color-mix(in srgb, var(--foreground) 4%, transparent) 1px, transparent 1px), linear-gradient(90deg, color-mix(in srgb, var(--foreground) 4%, transparent) 1px, transparent 1px)',
        }}
      />
      <div aria-hidden className="grain absolute inset-0 z-[1]" />

      <motion.div className="relative z-10 mx-auto mt-4 flex w-full max-w-7xl flex-col items-start px-6 sm:mt-10 md:px-12" style={reduce ? undefined : { opacity, scale, y }}>
        <motion.a
          animate={{ opacity: 1, y: 0 }}
          className="mb-12 flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 font-mono text-xs text-muted-foreground transition-colors hover:text-foreground"
          href="#flow"
          initial={{ opacity: 0, y: 20 }}
          transition={{ duration: 0.8, delay: 0.2 }}
        >
          <span aria-hidden className="size-1.5 animate-pulse-slow rounded-full bg-signal ring-1 ring-foreground/10" />
          Receipts · Deliveries · Transfers · Adjustments &rarr;
        </motion.a>

        <h1 className="mb-8 w-full text-6xl leading-[0.9] font-semibold tracking-tight [perspective:1000px] sm:text-7xl md:text-8xl lg:text-[9rem]">
          {LINES.map(([text, stroke]) => (
            <span className="block pb-1 sm:pb-2" key={text}>
              {words(text, stroke)}
            </span>
          ))}
        </h1>

        <motion.p
          animate={{ opacity: 1 }}
          className="mb-12 max-w-lg text-lg leading-relaxed text-muted-foreground md:text-xl"
          initial={{ opacity: 0 }}
          transition={{ delay: 1.1, duration: 1 }}
        >
          StockSense replaces the stock register and the spreadsheet. Stock only changes through documents, so every number on screen has a
          history you can open.
        </motion.p>

        <motion.div animate={{ opacity: 1, y: 0 }} className="flex flex-wrap items-center gap-6" initial={{ opacity: 0, y: 20 }} transition={{ delay: 1.3, duration: 0.8 }}>
          <Magnetic>
            <Link
              className="rounded-full bg-signal px-8 py-4 text-lg font-medium text-signal-foreground transition-all hover:shadow-[0_0_30px_rgba(232,255,71,0.35)]"
              to={signedIn ? '/dashboard' : '/signup'}
            >
              {signedIn ? 'Open dashboard' : 'Get started'}
            </Link>
          </Magnetic>
          <a
            className="rounded-full border border-foreground/20 px-8 py-4 text-lg font-medium text-muted-foreground transition-all hover:border-foreground/40 hover:bg-foreground/5 hover:text-foreground"
            href="#flow"
          >
            How it works
          </a>
        </motion.div>
      </motion.div>

      {/* rotating ring of text */}
      <motion.div
        animate={reduce ? undefined : { rotate: 360 }}
        aria-hidden
        className="absolute top-32 right-12 z-10 hidden size-32 items-center justify-center opacity-60 md:flex md:right-32"
        transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
      >
        <svg height="100" viewBox="0 0 100 100" width="100">
          <path d="M 50, 50 m -37, 0 a 37,37 0 1,1 74,0 a 37,37 0 1,1 -74,0" fill="transparent" id="hero-ring" />
          <text className="fill-foreground font-mono text-[9.5px] tracking-widest uppercase">
            <textPath href="#hero-ring">Inventory · Ledger · Live · Inventory · Ledger · Live · </textPath>
          </text>
        </svg>
      </motion.div>

      <div className="absolute bottom-8 left-6 z-20 hidden sm:block md:left-12">
        <div className="flex flex-col items-start gap-1">
          <span className="text-3xl font-semibold text-signal-ink">
            <AnimatedCounter end={4} />
          </span>
          <span className="font-mono text-xs tracking-wider text-muted-foreground">Document types</span>
        </div>
      </div>

      <motion.a
        animate={reduce ? undefined : { y: [0, 10, 0] }}
        aria-label="Scroll to the next section"
        className="absolute bottom-8 left-1/2 z-20 -translate-x-1/2 text-foreground/30 hover:text-foreground/60"
        href="#story"
        transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
      >
        <ChevronDown size={24} />
      </motion.a>

      {/* abstract floating shapes behind the content */}
      <div aria-hidden className="pointer-events-none absolute top-1/2 right-1/4 z-0 opacity-20">
        <motion.div
          animate={reduce ? undefined : { y: [0, -30, 0], rotate: [0, 10, 0] }}
          className="size-64 rounded-full border border-signal-ink"
          transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
        />
      </div>
      <div aria-hidden className="pointer-events-none absolute right-[10%] bottom-1/4 z-0 text-foreground/5">
        <motion.div animate={reduce ? undefined : { y: [0, 40, 0], rotate: [0, -15, 0] }} transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }}>
          <svg fill="currentColor" height="200" viewBox="0 0 100 100" width="200">
            <rect className="clip-diagonal" height="100" width="100" />
          </svg>
        </motion.div>
      </div>
    </section>
  )
}
