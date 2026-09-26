import { motion } from 'motion/react'
import { AlertTriangle, ArrowDownToLine, ArrowLeftRight, ArrowUpFromLine, Circle, History, LayoutDashboard, SlidersHorizontal, Warehouse, type LucideIcon } from 'lucide-react'
import { FEATURES } from '../content'
import { Eyebrow, ScrollReveal } from '../ui'

/** Only the icons the grid uses — importing lucide's whole namespace, as the original did, would
 *  put every icon in the bundle. */
const ICONS: Record<string, LucideIcon> = { AlertTriangle, ArrowDownToLine, ArrowLeftRight, ArrowUpFromLine, History, LayoutDashboard, SlidersHorizontal, Warehouse }

/** nexus-studio ServicesGrid: a bento grid of numbered cards with tags and a hover lift. */
export function Features() {
  return (
    <section className="relative scroll-mt-20 bg-card py-32" id="features">
      <div className="mx-auto max-w-7xl px-6 md:px-12">
        <ScrollReveal delay={0.1}>
          <Eyebrow>What it does</Eyebrow>
          <h2 className="mb-16 text-5xl font-bold tracking-tight md:text-7xl">
            Everything that moves stock.
            <br />
            Nothing that fakes it.
          </h2>
        </ScrollReveal>

        <div className="grid auto-rows-[minmax(260px,auto)] grid-cols-1 gap-4 md:grid-cols-4">
          {FEATURES.map((f, i) => {
            const Icon = ICONS[f.icon] ?? Circle
            const large = f.span !== 'md:col-span-1'
            return (
              <motion.article
                className={`${f.span} group relative flex flex-col justify-between overflow-hidden rounded-xl border border-border bg-background p-8 transition-all duration-500 hover:scale-[1.01] hover:border-signal-ink/40`}
                initial={{ opacity: 0, y: 30 }}
                key={f.number}
                transition={{ duration: 0.6, delay: i * 0.05 }}
                viewport={{ once: true, margin: '-50px' }}
                whileInView={{ opacity: 1, y: 0 }}
              >
                <div className="absolute inset-0 bg-gradient-to-br from-foreground/[0.02] to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
                <div className="relative z-10 mb-8">
                  <div className="mb-8 flex w-full items-start justify-between">
                    <span className="font-mono text-xs text-muted-foreground">{f.number}</span>
                    <Icon className="text-foreground/60 transition-all duration-300 group-hover:scale-110 group-hover:text-foreground" size={28} strokeWidth={1.5} />
                  </div>
                  <h3 className={`mb-3 font-medium ${large ? 'text-3xl lg:text-4xl' : 'mt-4 text-2xl'}`}>{f.title}</h3>
                  <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">{f.desc}</p>
                </div>
                <div className="relative z-10 mt-auto flex flex-wrap gap-2">
                  {f.tags.map((tag) => (
                    <span className="rounded-full border border-border bg-card px-3 py-1.5 font-mono text-[10px] text-muted-foreground md:text-xs" key={tag}>
                      {tag}
                    </span>
                  ))}
                </div>
              </motion.article>
            )
          })}
        </div>
      </div>
    </section>
  )
}
