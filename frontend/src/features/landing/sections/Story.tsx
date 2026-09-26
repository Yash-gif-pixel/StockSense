import { motion } from 'motion/react'
import { CHAPTERS, MARQUEE } from '../content'
import { MarqueeText } from '../ui'

/** In place of nexus-studio's LogoCloud: the same two-way marquee, listing what StockSense does
 *  rather than clients it does not have. */
export function FeatureMarquee() {
  const item = (label: string) => (
    <span className="text-4xl font-semibold text-foreground/20 transition-colors duration-300 hover:text-foreground/80 md:text-5xl" key={label}>
      {label}
    </span>
  )
  return (
    <section aria-label="What StockSense covers" className="group relative overflow-hidden border-b border-border bg-card py-24 pb-28">
      <p className="mx-auto mb-14 max-w-7xl px-6 text-center font-mono text-xs tracking-widest text-muted-foreground uppercase">
        Everything that moves stock, on one ledger
      </p>
      <div className="flex flex-col gap-10 sm:group-hover:[&>div>div]:[animation-play-state:paused]">
        <MarqueeText items={MARQUEE.map(item)} />
        <MarqueeText direction="reverse" items={[...MARQUEE].reverse().map(item)} />
      </div>
      <div aria-hidden className="pointer-events-none absolute inset-y-0 left-0 z-10 w-32 bg-gradient-to-r from-card to-transparent" />
      <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 z-10 w-32 bg-gradient-to-l from-card to-transparent" />
    </section>
  )
}

/** Abstract art from nexus-studio's StorySection, on theme tokens. */
function Art01() {
  return (
    <div aria-hidden className="pointer-events-none relative flex aspect-square w-full items-center justify-center md:aspect-[4/3]">
      <div className="absolute size-64 animate-pulse-slow rounded-full bg-signal opacity-40 blur-2xl" />
      <div className="absolute size-40 rotate-45 rounded-tr-full rounded-bl-full bg-ember opacity-70 mix-blend-multiply dark:mix-blend-overlay" />
      <div className="clip-diagonal absolute size-48 rounded-sm bg-foreground/15" />
      <div
        className="absolute inset-0 border border-border"
        style={{
          backgroundImage:
            'linear-gradient(color-mix(in srgb, var(--foreground) 5%, transparent) 1px, transparent 1px), linear-gradient(90deg, color-mix(in srgb, var(--foreground) 5%, transparent) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }}
      />
    </div>
  )
}

function Art02() {
  return (
    <div aria-hidden className="group pointer-events-none relative flex aspect-square w-full items-center justify-center md:aspect-[4/3]">
      <div className="mx-4 h-3/4 w-1 bg-foreground/20" />
      <div className="mx-4 h-1/2 w-16 bg-signal/80 transition-transform group-hover:scale-y-110" />
      <div className="mx-4 h-2/3 w-1 bg-foreground/20" />
      <div className="mx-4 h-1/4 w-1 bg-foreground/10" />
      <div className="absolute top-1/4 right-1/4 mx-4 size-8 animate-bounce rounded-full bg-ember motion-reduce:animate-none" />
    </div>
  )
}

/** nexus-studio StorySection: three numbered chapters, alternating sides, the last centred. */
export function Story() {
  return (
    <section className="relative scroll-mt-20 overflow-hidden bg-background py-32 md:py-48" id="story">
      <div className="mx-auto flex max-w-7xl flex-col px-6 pt-12 md:px-12">
        {CHAPTERS.map((chapter, i) => (
          <div className="relative mb-24 last:mb-0 md:mb-40" key={chapter.num}>
            <motion.div
              className={`grid grid-cols-1 items-center gap-16 md:gap-24 ${chapter.align === 'center' ? 'mx-auto text-center md:w-3/4' : 'md:grid-cols-2'}`}
              initial={{ opacity: 0, y: 80 }}
              transition={{ duration: 0.9, ease: [0.25, 0.46, 0.45, 0.94] }}
              viewport={{ once: true, margin: '-100px' }}
              whileInView={{ opacity: 1, y: 0 }}
            >
              <div className={`relative z-10 ${chapter.align === 'right' ? 'md:col-start-2 md:row-start-1' : ''}`}>
                <div aria-hidden className="pointer-events-none absolute -top-16 -left-8 text-[12rem] leading-none font-bold text-foreground/[0.03] select-none md:-top-28 md:-left-16 md:text-[18rem]">
                  {chapter.num}
                </div>
                <h2 className="mb-8 text-4xl leading-tight font-medium tracking-tight md:text-5xl lg:text-6xl">{chapter.title}</h2>
                <div className={`flex flex-col gap-6 text-lg leading-relaxed text-muted-foreground ${chapter.align === 'center' ? 'items-center' : ''}`}>
                  <p>{chapter.p1}</p>
                  <p>{chapter.p2}</p>
                </div>
                {chapter.align === 'center' && (
                  <a className="mt-12 inline-flex items-center gap-2 font-mono text-sm tracking-widest text-signal-ink uppercase transition-colors hover:text-foreground" href="#flow">
                    See how it flows &rarr;
                  </a>
                )}
              </div>
              {chapter.align !== 'center' && (
                <div className={`relative z-0 ${chapter.align === 'right' ? 'md:col-start-1 md:row-start-1' : ''}`}>{i === 0 ? <Art01 /> : <Art02 />}</div>
              )}
            </motion.div>

            {i < CHAPTERS.length - 1 && (
              <div className="relative my-24 flex items-center justify-center md:my-40">
                <hr className="absolute w-full border-border" />
                <span className="relative bg-background px-4 font-mono text-xs text-muted-foreground/60">Chapter {CHAPTERS[i + 1].num}</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}
