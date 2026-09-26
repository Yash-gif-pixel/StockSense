import { ChevronDown, LogOut, UserRound } from 'lucide-react'
import { Link, NavLink, Outlet, useLocation, useNavigate, useNavigation } from 'react-router'
import { toast } from 'sonner'
import { Wordmark } from '@/components/Wordmark'
import { ThemeToggle } from '@/components/ThemeToggle'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useLogout, useMe } from '@/hooks/useAuth'
import { cn } from '@/lib/utils'

const navItem =
  "relative inline-flex h-14 items-center gap-1 px-2.5 text-sm font-medium text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:text-foreground after:absolute after:inset-x-2.5 after:bottom-0 after:h-0.5 after:origin-left after:scale-x-0 after:bg-signal-ink after:transition-transform after:duration-300 hover:after:scale-x-100 focus-visible:after:scale-x-100"
const navItemActive = 'text-foreground after:scale-x-100'

interface MenuLink {
  to: string
  label: string
}

function NavDropdown({ label, base, items }: { label: string; base: string; items: MenuLink[] }) {
  const { pathname } = useLocation()
  const active = pathname.startsWith(base)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={cn(navItem, active && navItemActive)}>
        {label}
        <ChevronDown className="size-3.5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-40">
        {items.map((item) => (
          <DropdownMenuItem key={item.to} asChild>
            <Link to={item.to} className={cn(pathname.startsWith(item.to) && 'font-medium')}>
              {item.label}
            </Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function TopLink({ to, label }: MenuLink) {
  return (
    <NavLink to={to} className={({ isActive }) => cn(navItem, isActive && navItemActive)}>
      {label}
    </NavLink>
  )
}

function UserMenu() {
  const { data: user } = useMe()
  const logout = useLogout()
  const navigate = useNavigate()
  const initials = (user?.login_id ?? '?').slice(0, 2).toUpperCase()

  const onLogout = () => {
    logout.mutate(undefined, {
      onSettled: () => navigate('/login', { replace: true }),
      onError: (e) => toast.error(e.message),
    })
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="rounded-full" aria-label="Account menu">
          <Avatar className="size-8">
            <AvatarFallback className="text-xs font-medium">{initials}</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-48">
        <DropdownMenuLabel className="flex flex-col">
          <span className="text-sm font-medium text-foreground">{user?.login_id}</span>
          <span className="truncate text-xs font-normal text-muted-foreground">{user?.email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/profile">
            <UserRound />
            My Profile
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onLogout} disabled={logout.isPending}>
          <LogOut />
          Logout
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function AppShell() {
  // Pages are code-split: show a slim bar while the next page's code loads.
  const navigating = useNavigation().state !== 'idle'
  return (
    <div className="flex min-h-svh flex-col bg-background print:bg-white">
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/80 backdrop-blur-xl print:hidden">
        {navigating && <div role="progressbar" aria-label="Loading page" className="absolute inset-x-0 bottom-0 h-0.5 animate-pulse bg-signal" />}
        <div className="mx-auto flex h-14 max-w-screen-2xl items-center gap-6 px-4 md:px-6">
          <Link to="/" className="shrink-0" aria-label="StockSense home">
            <Wordmark size="md" />
          </Link>
          <nav className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto" aria-label="Main">
            <TopLink to="/dashboard" label="Dashboard" />
            <NavDropdown
              label="Operations"
              base="/operations"
              items={[
                { to: '/operations/receipts', label: 'Receipts' },
                { to: '/operations/deliveries', label: 'Deliveries' },
                { to: '/operations/internal', label: 'Internal Transfers' },
                { to: '/operations/adjustments', label: 'Adjustments' },
              ]}
            />
            <TopLink to="/products" label="Products" />
            <TopLink to="/moves" label="Move History" />
            <NavDropdown
              label="Settings"
              base="/settings"
              items={[
                { to: '/settings/warehouses', label: 'Warehouses' },
                { to: '/settings/locations', label: 'Locations' },
              ]}
            />
          </nav>
          <ThemeToggle />
          <UserMenu />
        </div>
      </header>
      <main className="mx-auto w-full max-w-screen-2xl flex-1 px-4 py-6 md:px-6 print:max-w-none print:p-0">
        <Outlet />
      </main>
    </div>
  )
}
