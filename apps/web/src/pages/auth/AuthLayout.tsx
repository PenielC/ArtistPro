import { Link } from 'react-router-dom'
import { Logo } from '../../components/Logo'

export function AuthLayout({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string
  subtitle: string
  children: React.ReactNode
  footer: React.ReactNode
}) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-brand-ink px-4 py-12">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-32 top-0 h-96 w-96 animate-blob rounded-full bg-brand-orange/15 blur-3xl" />
        <div
          className="absolute -right-20 bottom-0 h-96 w-96 animate-blob rounded-full bg-brand-purple/20 blur-3xl"
          style={{ animationDelay: '-4s' }}
        />
      </div>

      <div className="relative w-full max-w-sm">
        <Link to="/" className="mb-8 flex justify-center">
          <Logo variant="dark" />
        </Link>

        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-8 shadow-2xl backdrop-blur-sm">
          <h1 className="text-xl font-bold text-white">{title}</h1>
          <p className="mt-1 text-sm text-neutral-400">{subtitle}</p>

          <div className="mt-6">{children}</div>
        </div>

        <p className="mt-6 text-center text-sm text-neutral-500">{footer}</p>
      </div>
    </div>
  )
}
