import { ArrowRight, Calendar, FileText, Sparkles } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '../../components/ui/button'

const bullets = [
  { icon: Sparkles, label: 'AI Artist Manager' },
  { icon: FileText, label: 'One-Click EPK' },
  { icon: Calendar, label: 'Smart Booking Pipeline' },
]

export function LandingHero() {
  return (
    <section id="top" className="relative overflow-hidden bg-brand-ink">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-24 top-0 h-96 w-96 animate-blob rounded-full bg-brand-orange/20 blur-3xl" />
        <div
          className="absolute -right-10 top-1/4 h-80 w-80 animate-blob rounded-full bg-brand-purple/25 blur-3xl"
          style={{ animationDelay: '-4s' }}
        />
        <div
          className="absolute bottom-0 left-1/3 h-72 w-72 animate-blob rounded-full bg-brand-orange/10 blur-3xl"
          style={{ animationDelay: '-8s' }}
        />
      </div>

      <div className="relative mx-auto grid max-w-7xl grid-cols-1 items-center gap-16 px-6 py-24 lg:grid-cols-2 lg:py-32">
        <div className="animate-fade-in-up">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-brand-orange-light">
            Now in Public Beta
          </span>
          <h1 className="mt-6 text-4xl font-bold leading-tight text-white sm:text-5xl lg:text-6xl">
            Turn Talent
            <br />
            <span className="bg-gradient-to-r from-brand-orange to-brand-purple bg-clip-text text-transparent">
              into a Business.
            </span>
          </h1>
          <p className="mt-6 max-w-lg text-lg text-neutral-400">
            ArtBH, the Art Business Hub, unifies bookings, quotes, contracts, EPKs and payments into one platform — replacing
            the WhatsApp threads and scattered spreadsheets with a business operating system built for artists.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <Button asChild size="lg" className="h-12 rounded-full bg-brand-orange px-7 text-base text-white shadow-lg shadow-brand-orange/30 hover:bg-brand-orange/90">
              <Link to="/register">
                Start for Free
                <ArrowRight size={18} />
              </Link>
            </Button>
            <Button size="lg" variant="outline" className="h-12 rounded-full border-white/15 bg-transparent px-7 text-base text-white hover:bg-white/5">
              Watch Demo
            </Button>
          </div>

          <div className="mt-12 flex flex-wrap gap-8">
            {bullets.map((bullet) => (
              <div key={bullet.label} className="flex items-center gap-2.5">
                <bullet.icon size={18} className="text-brand-orange-light" />
                <p className="text-sm font-medium text-neutral-300">{bullet.label}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="relative hidden animate-fade-in-up lg:block" style={{ animationDelay: '150ms' }}>
          <div className="relative mx-auto max-w-md rounded-2xl border border-white/10 bg-white/[0.03] p-6 shadow-2xl backdrop-blur-sm">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-white">Dashboard</p>
              <span className="rounded-full bg-brand-orange/20 px-2.5 py-1 text-[11px] font-medium text-brand-orange-light">Live</span>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                <p className="text-xs text-neutral-400">Bookings this month</p>
                <p className="mt-1 text-2xl font-bold text-white">24</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                <p className="text-xs text-neutral-400">Revenue</p>
                <p className="mt-1 text-2xl font-bold text-white">$12.4K</p>
              </div>
            </div>
            <div className="mt-3 h-24 rounded-xl border border-white/10 bg-gradient-to-br from-brand-orange/20 via-transparent to-brand-purple/20" />
          </div>
        </div>
      </div>
    </section>
  )
}
