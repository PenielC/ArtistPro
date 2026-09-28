import {
  Calendar,
  CalendarDays,
  FileSignature,
  FileText,
  LayoutDashboard,
  LogOut,
  Menu,
  Mic2,
  Receipt,
  ScrollText,
  Settings,
  Sparkles,
  Users,
  Wallet,
  X,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { Logo } from './Logo'
import { NotificationBell } from './NotificationBell'
import { useAuth } from '../lib/AuthContext'
import { useMediaQuery } from '../lib/useMediaQuery'

type NavItem = { label: string; icon: LucideIcon; to: string }

const navItems: NavItem[] = [
  { label: 'Dashboard', icon: LayoutDashboard, to: '/dashboard' },
  { label: 'AI Manager', icon: Sparkles, to: '/ai' },
  { label: 'Calendar', icon: CalendarDays, to: '/calendar' },
  { label: 'Artists', icon: Mic2, to: '/artists' },
  { label: 'Bookings', icon: Calendar, to: '/bookings' },
  { label: 'Clients', icon: Users, to: '/clients' },
  { label: 'Quotes', icon: FileSignature, to: '/quotes' },
  { label: 'Contracts', icon: ScrollText, to: '/contracts' },
  { label: 'Invoices', icon: Receipt, to: '/invoices' },
  { label: 'EPK', icon: FileText, to: '/epk' },
  { label: 'Payments', icon: Wallet, to: '/payments' },
]

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium ${
    isActive ? 'bg-brand-orange/15 text-brand-orange-light' : 'text-neutral-300 hover:bg-white/5 hover:text-white'
  }`

/**
 * The signed-in shell. From md up the sidebar is always visible; on phones it
 * becomes a slide-over drawer opened from a top bar, so pages get the full width.
 */
export function DashboardLayout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  // One bell only: in the sidebar on desktop, in the top bar on phones.
  const desktop = useMediaQuery('(min-width: 768px)')

  useEffect(() => {
    if (!menuOpen) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenuOpen(false)
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [menuOpen])

  const close = () => setMenuOpen(false)

  return (
    <div className="flex min-h-screen flex-col bg-brand-ink md:flex-row">
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-white/10 bg-brand-ink/95 px-4 py-2 backdrop-blur md:hidden">
        <button onClick={() => setMenuOpen(true)} className="rounded-lg p-2 text-neutral-300 hover:bg-white/5 hover:text-white" aria-label="Open menu">
          <Menu size={20} />
        </button>
        <Logo variant="dark" className="h-9" />
        {!desktop && <NotificationBell />}
      </header>

      {menuOpen && <div className="fixed inset-0 z-40 bg-black/60 md:hidden" onClick={close} aria-hidden="true" />}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 shrink-0 flex-col justify-between overflow-y-auto border-r border-white/10 bg-brand-ink px-4 py-6 transition-transform md:static md:z-auto md:translate-x-0 ${
          menuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        aria-label="Main navigation"
      >
        <div>
          <div className="mb-8 flex items-center justify-between">
            <Logo variant="dark" className="ml-2 h-11" />
            {desktop && <NotificationBell />}
            <button onClick={close} className="rounded-lg p-2 text-neutral-400 hover:bg-white/5 hover:text-white md:hidden" aria-label="Close menu">
              <X size={18} />
            </button>
          </div>
          <nav className="flex flex-col gap-1">
            {navItems.map((item) => (
              <NavLink key={item.label} to={item.to} onClick={close} className={linkClass}>
                <item.icon size={16} />
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>

        <div className="mt-8 flex flex-col gap-3">
          <NavLink to="/settings" onClick={close} className={linkClass}>
            <Settings size={16} />
            Settings
          </NavLink>
          <button
            onClick={logout}
            className="flex items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium text-neutral-300 hover:bg-white/5 hover:text-white"
          >
            <LogOut size={16} />
            Log out
          </button>
          <div className="flex items-center gap-3 border-t border-white/10 px-3 pt-4">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-brand-orange to-brand-purple text-xs font-bold text-white">
              {user?.firstName?.[0]}
              {user?.lastName?.[0]}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-white">
                {user?.firstName} {user?.lastName}
              </p>
              <p className="truncate text-xs text-neutral-500">{user?.organizationName}</p>
            </div>
          </div>
        </div>
      </aside>

      <main className="min-w-0 flex-1 overflow-y-auto">{children}</main>
    </div>
  )
}
