import { useRef } from 'react'
import { motion, useInView, useScroll, useTransform } from 'motion/react'
import { cn } from '@/lib/utils'
import { FLOW } from '../content'
import { Eyebrow, ScrollReveal } from '../ui'

const EASE = [0.25, 0.46, 0.45, 0.94] as const

/** One step; lights up (dot, title, tagline) while it holds the middle of the screen. */
function Step({ step, index }: { step: (typeof FLOW)[number]; index: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const active = useInView(ref, { amount: 0.5 })
  return (
    <div className="relative flex min-h-[70vh] items-center py-24" ref={ref}>
      <div aria-hidden className="absolute left-0 z-10 flex size-8 -translate-x-1/2 items-center justify-center">
        <span className={cn('size-4 rounded-full border-2 transition-colors duration-500', active ? 'border-signal-ink bg-signal' : 'border-foreground/20 bg-card')} />
      </div>
      <motion.div
        className="relative w-full max-w-2xl pl-16 md:pl-24"
        initial={{ x: 60, opacity: 0 }}
        transition={{ duration: 0.8, ease: EASE }}
        viewport={{ margin: '-20%' }}
        whileInView={{ x: 0, opacity: 1 }}
      >
        <div aria-hidden className="pointer-events-none absolute -top-12 left-12 text-[8rem] leading-none font-bold text-foreground/5 select-none md:-top-20 md:left-16 md:text-[12rem]">
          0{index + 1}
        </div>
        <div className="relative z-10">
          <span className="mb-6 inline-block rounded-full border border-border bg-background px-3 py-1 font-mono text-xs text-muted-foreground">{step.chip}</span>
          <h3 className={cn('mb-4 text-4xl font-semibold tracking-tight transition-colors duration-500 md:text-5xl lg:text-6xl', active ? 'text-foreground' : 'text-muted-foreground/60')}>
            {step.title}
          </h3>
          <p className={cn('mb-6 text-xl transition-colors duration-500 md:text-2xl', active ? 'text-signal-ink' : 'text-muted-foreground')}>&ldquo;{step.tagline}&rdquo;</p>
          <p className="max-w-lg text-base leading-relaxed text-muted-foreground md:text-lg">{step.desc}</p>
        </div>
      </motion.div>
    </div>
  )
}

/** nexus-studio ProcessTimeline: a sticky line that draws itself as you scroll through the steps,
 *  here the life of a delivery from draft to print. */
export function Flow() {
  const containerRef = useRef<HTMLElement>(null)
  const { scrollYProgress } = useScroll({ target: containerRef, offset: ['start center', 'end end'] })
  const scaleY = useTransform(scrollYProgress, [0, 1], [0, 1])

  return (
    <section className="relative scroll-mt-20 bg-card" id="flow" ref={containerRef}>
      <div className="mx-auto max-w-7xl px-6 pt-32 pb-8 md:px-12">
        <ScrollReveal>
          <Eyebrow>How it flows</Eyebrow>
          <h2 className="text-5xl font-bold tracking-tight md:text-7xl">The life of a delivery.</h2>
        </ScrollReveal>
      </div>

      <div className="relative mx-auto flex w-full max-w-4xl px-6 md:px-12">
        <div aria-hidden className="absolute top-0 bottom-0 left-6 w-px bg-border md:left-12" />
        <div aria-hidden className="sticky top-0 left-6 z-0 h-screen w-px shrink-0 md:left-12">
          <motion.div
            className="absolute top-0 -ml-px w-[3px] origin-top bg-gradient-to-b from-signal-ink/10 via-signal-ink to-signal-ink/10 dark:shadow-[0_0_15px_rgba(232,255,71,0.5)]"
            style={{ scaleY, height: '100vh' }}
          />
        </div>
        <div className="flex-1 pb-24">
          {FLOW.map((step, i) => (
            <Step index={i} key={step.title} step={step} />
          ))}
        </div>
      </div>
    </section>
  )
}
