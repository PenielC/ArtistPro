import { Reveal } from '../../components/Reveal'

export function TestimonialSection() {
  return (
    <section className="bg-brand-ink py-24">
      <div className="mx-auto max-w-7xl px-6">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-2">
          <Reveal className="relative">
            <div className="overflow-hidden rounded-2xl shadow-2xl">
              <img
                src="https://images.unsplash.com/photo-1758522276630-8ebdf55d7619?auto=format&fit=crop&w=1000&q=80"
                alt="An artist painting in her studio"
                className="h-96 w-full object-cover"
              />
            </div>
            <div className="absolute -bottom-8 right-4 max-w-xs rounded-2xl border border-white/10 bg-brand-ink/95 p-5 shadow-xl backdrop-blur-sm sm:-right-8">
              <p className="text-sm text-neutral-300">
                &ldquo;Your creativity is your gift. Your business should be your superpower.&rdquo;
              </p>
            </div>
          </Reveal>

          <Reveal delayMs={100} className="flex flex-col justify-center lg:pt-8">
            <span className="text-xs font-bold uppercase tracking-widest text-brand-orange-light">Why We Built This</span>
            <h2 className="mt-3 text-3xl font-bold leading-tight text-white sm:text-4xl">
              Professionalisation Is the Product
            </h2>
            <p className="mt-4 text-neutral-400">
              Too many talented artists lose bookings, underprice their work, or spend hours on admin instead of
              their craft. ArtBH helps you progress from &ldquo;I am an artist&rdquo; to &ldquo;I run a professional
              creative business&rdquo; — from first enquiry to completed performance and collected payment.
            </p>

            <div className="mt-8 overflow-hidden rounded-xl">
              <img
                src="https://images.unsplash.com/photo-1749720773543-fbee226b950f?auto=format&fit=crop&w=900&q=80"
                alt="A musician performing on stage"
                className="h-48 w-full object-cover"
              />
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  )
}
