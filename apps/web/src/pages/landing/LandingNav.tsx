import { Link } from 'react-router-dom'
import { Logo } from '../../components/Logo'
import { Button } from '../../components/ui/button'

export function LandingNav() {
  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-brand-ink/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
        <Logo variant="dark" />

        <nav className="hidden items-center gap-8 md:flex">
          <a href="#top" className="text-sm font-medium text-white">
            Home
          </a>
          <a href="#features" className="text-sm font-medium text-neutral-400 transition-colors hover:text-white">
            Features
          </a>
          <a href="#epk" className="text-sm font-medium text-neutral-400 transition-colors hover:text-white">
            EPK
          </a>
        </nav>

        <div className="flex items-center gap-3">
          <Link to="/login" className="hidden text-sm font-medium text-neutral-300 transition-colors hover:text-white sm:block">
            Sign In
          </Link>
          <Button asChild className="rounded-full bg-brand-orange px-5 text-white hover:bg-brand-orange/90">
            <Link to="/register">Get Started Free</Link>
          </Button>
        </div>
      </div>
    </header>
  )
}
