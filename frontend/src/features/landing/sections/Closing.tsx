import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Minus, Plus } from 'lucide-react'
import { Accordion } from 'radix-ui'
import { Link } from 'react-router'
import { useSignedIn } from '@/hooks/useAuth'
import { cn } from '@/lib/utils'
import { FAQS, STATS } from '../content'
import { ProductPreview, type PreviewKey } from '../ProductPreviews'
import { AnimatedCounter, Eyebrow, Magnetic, ScrollReveal } from '../ui'
import { Wordmark } from '@/components/Wordmark'

const EASE = [0.25, 0.46, 0.45, 0.94] as const

/** nexus-studio StatsSection: the one full-bleed signal-lime band, with counters. */
export function Stats() {
  return (
    <section aria-label="StockSense in numbers" className="relative z-10 w-full bg-signal py-24 text-signal-foreground md:py-32">
      <div className="mx-auto grid max-w-7xl grid-cols-2 gap-12 px-6 md:grid-cols-4 md:px-12">
        {STATS.map((s, i) => (
          <ScrollReveal className="flex flex-col items-start" delay={i * 0.1} key={s.label}>
            <div className="text-6xl font-bold tracking-tighter md:text-8xl">
              <AnimatedCounter end={s.num} suffix={s.suffix} />
            </div>
            <p className="mt-2 font-mono text-xs font-semibold tracking-widest uppercase opacity-80 md:mt-4 md:text-sm">{s.label}</p>
          </ScrollReveal>
        ))}
      </div>
    </section>
  )
}

const SCREENS: { key: PreviewKey; label: string }[] = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'receipts', label: 'Receipts' },
  { key: 'deliveries', label: 'Deliveries' },
  { key: 'stock', label: 'Stock' },
]

/** The app's own screens on sample data (in place of the original's case studies), in the
 *  current theme. */
export function Screens() {
  const [i, setI] = useState(0)
  return (
    <section className="scroll-mt-20 bg-background py-32" id="screens">
      <div className="mx-auto max-w-7xl px-6 md:px-12">
        <ScrollReveal>
          <Eyebrow>The app</Eyebrow>
          <h2 className="mb-12 text-5xl font-bold tracking-tight md:text-7xl">See it before you sign up.</h2>
        </ScrollReveal>
        <div aria-label="Screens" className="mb-6 flex flex-wrap gap-2" role="tablist">
          {SCREENS.map((s, n) => (
            <button
              aria-selected={n === i}
              className={cn(
                'rounded-full border px-4 py-2 font-mono text-xs tracking-wider uppercase transition-colors',
                n === i ? 'border-transparent bg-signal text-signal-foreground' : 'border-border text-muted-foreground hover:text-foreground',
              )}
              key={s.key}
              onClick={() => setI(n)}
              role="tab"
              type="button"
            >
              {s.label}
            </button>
          ))}
        </div>
        <ScrollReveal>
          <div aria-label={`${SCREENS[i].label} screen, sample data`} className="overflow-hidden rounded-2xl border border-border shadow-2xl shadow-foreground/5" role="img">
            <ProductPreview screen={SCREENS[i].key} />
          </div>
        </ScrollReveal>
      </div>
    </section>
  )
}

/** nexus-studio FAQSection: a sticky oversized "FAQ" on the left, a Radix accordion on the right. */
export function Faq() {
  const [value, setValue] = useState('')
  return (
    <section className="scroll-mt-20 border-b border-border bg-card py-32" id="faq">
      <div className="mx-auto grid max-w-7xl grid-cols-1 items-start gap-16 px-6 md:px-12 lg:grid-cols-2 lg:gap-24">
        <ScrollReveal>
          <div className="lg:sticky lg:top-32">
            <p aria-hidden className="pointer-events-none mb-4 -ml-2 text-[8rem] leading-none font-bold tracking-tighter text-foreground/5 select-none md:text-[10rem]">
              FAQ
            </p>
            <div className="relative -mt-16 ml-2 md:-mt-20">
              <Eyebrow>The details</Eyebrow>
              <h2 className="mb-6 text-4xl font-bold md:text-5xl">Answers to your questions.</h2>
              <p className="max-w-sm text-lg leading-relaxed text-muted-foreground">How stock, documents and reservations behave, and what happens when something goes wrong.</p>
            </div>
          </div>
        </ScrollReveal>

        <ScrollReveal className="relative z-10 w-full lg:mt-32" delay={0.2}>
          <Accordion.Root className="flex w-full flex-col" collapsible onValueChange={setValue} type="single" value={value}>
            {FAQS.map((faq, index) => {
              const id = `item-${index}`
              const open = value === id
              return (
                <Accordion.Item className="overflow-hidden border-b border-border" key={id} value={id}>
                  <Accordion.Header className="flex">
                    <Accordion.Trigger className="group flex w-full items-center justify-between py-6 text-left text-lg md:py-7 md:text-xl">
                      <span className={cn('pr-8 tracking-tight transition-colors duration-300', open ? 'text-signal-ink' : 'text-foreground')}>{faq.q}</span>
                      <span className="shrink-0 text-muted-foreground transition-colors group-hover:text-foreground">
                        {open ? <Minus className="text-signal-ink" size={20} /> : <Plus size={20} />}
                      </span>
                    </Accordion.Trigger>
                  </Accordion.Header>
                  <Accordion.Content asChild forceMount>
                    <AnimatePresence initial={false}>
                      {open && (
                        <motion.div
                          animate="open"
                          className="overflow-hidden"
                          exit="collapsed"
                          initial="collapsed"
                          transition={{ duration: 0.4, ease: EASE }}
                          variants={{ open: { opacity: 1, height: 'auto', marginBottom: 24 }, collapsed: { opacity: 0, height: 0, marginBottom: 0 } }}
                        >
                          <p className="pr-8 text-sm leading-relaxed text-muted-foreground md:text-base">{faq.a}</p>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </Accordion.Content>
                </Accordion.Item>
              )
            })}
          </Accordion.Root>
        </ScrollReveal>
      </div>
    </section>
  )
}

/** nexus-studio CTASection: a spotlight, two slow-drifting blobs and outsized type. */
export function Cta() {
  const signedIn = useSignedIn()
  return (
    <section className="relative flex min-h-svh flex-col items-center justify-center overflow-hidden bg-background py-32" id="cta">
      <div aria-hidden className="grain absolute inset-0 z-0 opacity-30 mix-blend-overlay" />
      <div
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-1/2 z-0 h-[80vw] max-h-[800px] w-[80vw] max-w-[800px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(ellipse_80%_50%_at_50%_50%,rgba(232,255,71,0.12),transparent)] blur-[50px]"
      />
      <motion.div
        animate={{ y: [0, -100, 0], x: [0, 50, 0] }}
        aria-hidden
        className="absolute -top-20 left-[10%] z-0 h-[40vw] max-h-[600px] w-[40vw] max-w-[600px] rounded-full bg-signal opacity-[0.05] blur-3xl"
        transition={{ duration: 25, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        animate={{ y: [0, 100, 0], x: [0, -50, 0] }}
        aria-hidden
        className="absolute right-[10%] -bottom-40 z-0 h-[50vw] max-h-[800px] w-[50vw] max-w-[800px] rounded-full bg-ember opacity-[0.05] blur-3xl"
        transition={{ duration: 20, repeat: Infinity, ease: 'easeInOut', delay: 2 }}
      />

      <div className="relative z-10 mx-auto flex w-full max-w-5xl flex-col items-center px-6 text-center">
        <motion.p className="mb-8 font-mono text-xs tracking-widest text-muted-foreground uppercase" initial={{ opacity: 0, y: 20 }} viewport={{ once: true }} whileInView={{ opacity: 1, y: 0 }}>
          Ready when you are
        </motion.p>
        <motion.h2
          className="mb-12 flex flex-col text-6xl leading-[0.9] font-semibold tracking-tighter md:text-8xl lg:text-9xl"
          initial={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.8, delay: 0.1 }}
          viewport={{ once: true }}
          whileInView={{ opacity: 1, scale: 1 }}
        >
          <span className="text-foreground">Know what you have</span>
          <span className="text-stroke">before you promise it.</span>
        </motion.h2>
        <motion.p
          className="mb-14 max-w-xl text-xl text-muted-foreground md:text-2xl"
          initial={{ opacity: 0, y: 20 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          viewport={{ once: true }}
          whileInView={{ opacity: 1, y: 0 }}
        >
          Create an account and record your first receipt in minutes.
        </motion.p>
        <motion.div
          className="flex flex-col items-center gap-6"
          initial={{ opacity: 0, y: 20 }}
          transition={{ duration: 0.8, delay: 0.3 }}
          viewport={{ once: true }}
          whileInView={{ opacity: 1, y: 0 }}
        >
          <Magnetic>
            <Link
              className="group relative overflow-hidden rounded-full bg-signal px-12 py-6 text-xl font-medium text-signal-foreground transition-all hover:shadow-[0_0_40px_rgba(232,255,71,0.35)] md:text-2xl"
              to={signedIn ? '/dashboard' : '/signup'}
            >
              <span className="relative z-10 flex items-center gap-3">
                {signedIn ? 'Open dashboard' : 'Get started'}
                <motion.span animate={{ x: [0, 5, 0] }} aria-hidden transition={{ duration: 1.5, repeat: Infinity }}>
                  &rarr;
                </motion.span>
              </span>
              <span aria-hidden className="absolute inset-0 z-0 bg-white opacity-0 transition-opacity group-hover:opacity-20" />
            </Link>
          </Magnetic>
          {!signedIn && (
            <Link className="mt-2 border-b border-foreground/20 pb-1 font-mono text-sm text-muted-foreground transition-colors hover:border-foreground hover:text-foreground" to="/login">
              Already have an account? Sign in
            </Link>
          )}
        </motion.div>
      </div>
    </section>
  )
}

/** nexus-studio Footer, trimmed to what StockSense has: the wordmark and its real links. */
export function LandingFooter() {
  const cols: [string, [string, string, boolean][]][] = [
    [
      'Product',
      [
        ['Why StockSense', '#story', false],
        ['Features', '#features', false],
        ['How it flows', '#flow', false],
        ['FAQ', '#faq', false],
      ],
    ],
    [
      'Account',
      [
        ['Sign in', '/login', true],
        ['Create an account', '/signup', true],
        ['Reset password', '/forgot-password', true],
      ],
    ],
  ]
  return (
    <footer className="border-t border-border bg-background pt-24 pb-8">
      <div className="mx-auto max-w-7xl px-6 md:px-12">
        <div className="mb-20 grid grid-cols-1 gap-12 md:grid-cols-4 md:gap-8">
          <div className="md:col-span-2 md:border-r md:border-border md:pr-8">
            <Wordmark className="mb-6" />
            <p className="max-w-xs text-sm leading-relaxed text-muted-foreground">
              Inventory without the spreadsheet.
              <br />
              Every unit, every move, on record.
            </p>
          </div>
          {cols.map(([title, links]) => (
            <div key={title}>
              <h3 className="mb-6 font-mono text-xs tracking-widest text-signal-ink uppercase">{title}</h3>
              <ul className="flex flex-col gap-4 text-sm text-muted-foreground">
                {links.map(([label, href, route]) => (
                  <li key={label}>
                    {route ? (
                      <Link className="transition-colors hover:text-foreground" to={href}>
                        {label}
                      </Link>
                    ) : (
                      <a className="transition-colors hover:text-foreground" href={href}>
                        {label}
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="flex flex-col items-center justify-between gap-4 border-t border-border pt-8 font-mono text-xs text-muted-foreground md:flex-row">
          <p>© 2026 StockSense</p>
          <p>
            For warehouses that can&apos;t afford to <span className="text-ember-ink">guess</span>.
          </p>
        </div>
      </div>
    </footer>
  )
}
