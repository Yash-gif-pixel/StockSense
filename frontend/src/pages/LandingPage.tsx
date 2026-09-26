/**
 * The public landing page (`/`), built from nexus-studio (github.com/legendxdevil/nexus-studio)
 * and rewritten for StockSense. It is the first page for everyone: signed-in visitors see it too,
 * with "Open dashboard" in place of Sign in / Get started (see useSignedIn).
 *
 * Taken from the repo: its palette (now the app-wide theme tokens), ScrollProgressBar, the
 * Navbar, Hero, StorySection, ServicesGrid (bento), ProcessTimeline, StatsSection, the marquee,
 * FAQSection, CTASection and Footer — ported to TypeScript, `motion` and theme tokens, so the
 * page works in light and dark mode.
 * Left out on purpose: the fictional logo cloud, team, testimonials, case studies, pricing and
 * blog (a product page cannot invent clients), and the custom cursor, which hides the system
 * cursor on every element.
 */
import { MotionConfig } from 'motion/react'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { Cta, Faq, LandingFooter, Screens, Stats } from '@/features/landing/sections/Closing'
import { Features } from '@/features/landing/sections/Features'
import { Flow } from '@/features/landing/sections/Flow'
import { Hero } from '@/features/landing/sections/Hero'
import { LandingNav } from '@/features/landing/sections/LandingNav'
import { FeatureMarquee, Story } from '@/features/landing/sections/Story'
import { ScrollProgressBar } from '@/features/landing/ui'

export function LandingPage() {
  useDocumentTitle(undefined)

  return (
    <MotionConfig reducedMotion="user">
      <div className="relative overflow-x-hidden bg-background text-foreground antialiased selection:bg-signal selection:text-signal-foreground">
        <ScrollProgressBar />
        <LandingNav />
        <main>
          <Hero />
          <FeatureMarquee />
          <Story />
          <Features />
          <Flow />
          <Stats />
          <Screens />
          <Faq />
          <Cta />
        </main>
        <LandingFooter />
      </div>
    </MotionConfig>
  )
}
