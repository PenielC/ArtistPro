import { Calendar, CreditCard, FileSignature, FileText, Sparkles, Users } from 'lucide-react'
import { Reveal } from '../../components/Reveal'

const features = [
  {
    icon: Calendar,
    title: 'Smart Booking Pipeline',
    description: 'Track every enquiry from first message to confirmed booking, without losing a thread in WhatsApp.',
  },
  {
    icon: Sparkles,
    title: 'AI Artist Manager',
    description: 'Get quote suggestions, follow-up reminders and scheduling help — like having a manager on call.',
  },
  {
    icon: FileSignature,
    title: 'Quote & Contract Generator',
    description: 'Send professional quotes and contracts in minutes, not hours spent formatting documents.',
  },
  {
    icon: FileText,
    title: 'Electronic Press Kit',
    description: 'A one-click, shareable EPK with your bio, press photos, riders and links — always up to date.',
  },
  {
    icon: CreditCard,
    title: 'Payment Tracking',
    description: 'See deposits, invoices and outstanding balances at a glance, across every client and event.',
  },
  {
    icon: Users,
    title: 'Client CRM',
    description: 'Every client, venue and collaborator in one place — with full history of past bookings.',
  },
]

export function FeatureShowcaseSection() {
  return (
    <section id="features" className="bg-neutral-950 py-24">
      <div className="mx-auto max-w-7xl px-6">
        <Reveal className="mx-auto max-w-2xl text-center">
          <span className="text-xs font-bold uppercase tracking-widest text-brand-orange-light">Built for Artists</span>
          <h2 className="mt-3 text-3xl font-bold leading-tight text-white sm:text-4xl">
            Everything You Need to Run Your Creative Business
          </h2>
          <p className="mt-4 text-neutral-400">
            Instead of feeling like accounting software, ArtBH feels like the tools you already love —
            just built for how artists actually work.
          </p>
        </Reveal>

        <div className="mt-16 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature, i) => (
            <Reveal key={feature.title} delayMs={i * 60}>
              <div className="h-full rounded-2xl border border-white/10 bg-white/[0.03] p-6 transition-colors hover:border-brand-orange/40">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-brand-orange to-brand-purple">
                  <feature.icon size={20} className="text-white" />
                </span>
                <h3 className="mt-4 text-base font-semibold text-white">{feature.title}</h3>
                <p className="mt-2 text-sm text-neutral-400">{feature.description}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}
