import { useState } from 'react'
import { AnimatePresence, motion, useMotionValueEvent, useScroll } from 'motion/react'
import { Menu, X } from 'lucide-react'
import { Link } from 'react-router'
import { useSignedIn } from '@/hooks/useAuth'
import { ThemeToggle } from '@/components/ThemeToggle'
import { Wordmark } from '@/components/Wordmark'
import { cn } from '@/lib/utils'
import { Magnetic } from '../ui'

/** nexus-studio Navbar: transparent over the hero, blurred bar once scrolled, full-screen menu on
 *  phones. Wordmark with the pulsing signal dot; ember outline for the call to action. */
const LINKS: [string, string][] = [
  ['Why', '#story'],
  ['Features', '#features'],
  ['How it flows', '#flow'],
  ['Screens', '#screens'],
  ['FAQ', '#faq'],
]

export function LandingNav() {
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)
  const { scrollY } = useScroll()
  const signedIn = useSignedIn()
  useMotionValueEvent(scrollY, 'change', (v) => setScrolled(v > 80))

  return (
    <>
      <header
        className={cn(
          'fixed inset-x-0 top-0 z-50 transition-all duration-500',
          scrolled ? 'border-b border-border/60 bg-background/80 py-3 backdrop-blur-xl' : 'bg-transparent py-5',
        )}
      >
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 md:px-12">
          <Link aria-label="StockSense home" className="z-50" to="/">
            <Wordmark />
          </Link>

          <nav aria-label="Landing" className="hidden items-center gap-8 md:flex">
            {LINKS.map(([label, href]) => (
              <a className="group relative text-sm text-muted-foreground transition-colors hover:text-foreground" href={href} key={label}>
                {label}
                <span className="absolute -bottom-1 left-0 h-px w-0 bg-signal-ink transition-all duration-300 group-hover:w-full" />
              </a>
            ))}
          </nav>

          <div className="hidden items-center gap-3 md:flex">
            <ThemeToggle />
            {!signedIn && (
              <Link className="px-3 text-sm text-muted-foreground transition-colors hover:text-foreground" to="/login">
                Sign in
              </Link>
            )}
            <Magnetic>
              <Link
                className="rounded-full border border-ember-ink px-5 py-2 text-sm text-ember-ink transition-colors hover:bg-ember hover:text-white"
                to={signedIn ? '/dashboard' : '/signup'}
              >
                {signedIn ? 'Open dashboard' : 'Get started'}
              </Link>
            </Magnetic>
          </div>

          <div className="z-50 flex items-center gap-1 md:hidden">
            <ThemeToggle />
            <button aria-expanded={open} aria-label={open ? 'Close menu' : 'Open menu'} className="p-2 text-foreground" onClick={() => setOpen(!open)} type="button">
              {open ? <X size={26} /> : <Menu size={26} />}
            </button>
          </div>
        </div>
      </header>

      <AnimatePresence>
        {open && (
          <motion.div animate={{ opacity: 1 }} className="fixed inset-0 z-40 flex flex-col justify-center bg-card px-6" exit={{ opacity: 0 }} initial={{ opacity: 0 }}>
            <nav aria-label="Menu" className="mt-16 flex flex-col gap-5">
              {LINKS.map(([label, href], i) => (
                <motion.a
                  animate={{ x: 0, opacity: 1 }}
                  className="text-5xl font-semibold tracking-tight text-foreground transition-colors hover:text-signal-ink"
                  href={href}
                  initial={{ x: -60, opacity: 0 }}
                  key={label}
                  onClick={() => setOpen(false)}
                  transition={{ delay: i * 0.07, duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
                >
                  {label}
                </motion.a>
              ))}
            </nav>
            <div className="mt-12 flex gap-4">
              <Link className="rounded-full bg-signal px-6 py-3 font-medium text-signal-foreground" to={signedIn ? '/dashboard' : '/signup'}>
                {signedIn ? 'Open dashboard' : 'Get started'}
              </Link>
              {!signedIn && (
                <Link className="rounded-full border border-border px-6 py-3 text-foreground" to="/login">
                  Sign in
                </Link>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
