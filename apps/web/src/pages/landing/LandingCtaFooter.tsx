import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Logo } from '../../components/Logo'
import { Reveal } from '../../components/Reveal'
import { Button } from '../../components/ui/button'

export function LandingCtaFooter() {
  return (
    <footer className="relative overflow-hidden bg-neutral-950">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-24 bottom-0 h-72 w-72 animate-blob rounded-full bg-brand-orange/10 blur-3xl" />
        <div
          className="absolute right-0 top-0 h-64 w-64 animate-blob rounded-full bg-brand-purple/10 blur-3xl"
          style={{ animationDelay: '-5s' }}
        />
      </div>

      <Reveal className="relative mx-auto flex max-w-7xl flex-col items-center justify-between gap-8 px-6 py-16 lg:flex-row lg:text-left">
        <div className="flex flex-col items-center lg:items-start">
          <Logo variant="dark" />
          <p className="mt-2 text-sm text-neutral-500">Turn Talent into a Business.</p>
        </div>

        <div className="text-center lg:text-left">
          <h2 className="text-2xl font-bold text-white sm:text-3xl">Ready to run your creative business like a pro?</h2>
          <p className="mt-2 text-neutral-400">Get started with ArtBH in minutes — no credit card required.</p>
        </div>

        <Button asChild size="lg" className="h-12 shrink-0 rounded-full bg-brand-orange px-7 text-base text-white shadow-lg shadow-brand-orange/30 hover:bg-brand-orange/90">
          <Link to="/register">
            Start Your Free Trial
            <ArrowRight size={18} />
          </Link>
        </Button>
      </Reveal>

      <div className="relative border-t border-white/10 px-6 py-6 text-center text-xs text-neutral-500">
        © {new Date().getFullYear()} ArtBH. All rights reserved.
      </div>
    </footer>
  )
}
