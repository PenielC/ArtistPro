import { FeatureShowcaseSection } from './landing/FeatureShowcaseSection'
import { LandingCtaFooter } from './landing/LandingCtaFooter'
import { LandingHero } from './landing/LandingHero'
import { LandingNav } from './landing/LandingNav'
import { TestimonialSection } from './landing/TestimonialSection'

export function LandingPage() {
  return (
    <div className="min-h-screen bg-brand-ink">
      <LandingNav />
      <LandingHero />
      <FeatureShowcaseSection />
      <TestimonialSection />
      <LandingCtaFooter />
    </div>
  )
}
