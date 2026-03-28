import { Suspense } from "react";
import Header from "@/components/Header";
import Hero from "@/components/Hero";
import LandingHeroShell from "@/components/landing/LandingHeroShell";
import TrustedByBrands from "@/components/landing/TrustedByBrands";
import KeyFeaturesPills from "@/components/landing/KeyFeaturesPills";
import HowItWorks from "@/components/landing/HowItWorks";
import PricingSection from "@/components/PricingSection";
import TrustedByTeams from "@/components/landing/TrustedByTeams";
import ScrollReveal from "@/components/landing/ScrollReveal";
import FAQ from "@/components/landing/FAQ";
import CTA from "@/components/CTA";
import Footer from "@/components/Footer";
import CheckoutCancelledBanner from "@/components/CheckoutCancelledBanner";
import { HomePageStructuredData } from "@/components/seo/HomePageStructuredData";

export default function Home() {
  return (
    <div className="min-h-screen landing-page-shell">
      <HomePageStructuredData />
      <main>
        <Header variant="landingIntegrated" />
        <LandingHeroShell>
          <Hero />
        </LandingHeroShell>
        <Suspense fallback={null}>
          <CheckoutCancelledBanner />
        </Suspense>
        <ScrollReveal variant="fade-up">
          <TrustedByBrands />
        </ScrollReveal>
        <ScrollReveal variant="tilt-in">
          <KeyFeaturesPills />
        </ScrollReveal>
        <ScrollReveal variant="fade">
          <div id="features">
            <HowItWorks />
          </div>
        </ScrollReveal>
        <Suspense fallback={null}>
          <ScrollReveal variant="fade-scale">
            <PricingSection />
          </ScrollReveal>
        </Suspense>
        <ScrollReveal variant="fade-up">
          <TrustedByTeams />
        </ScrollReveal>
        <ScrollReveal variant="fade-up" delayMs={80}>
          <FAQ />
        </ScrollReveal>
        <ScrollReveal variant="tilt-in">
          <CTA />
        </ScrollReveal>
        <ScrollReveal variant="fade">
          <Footer />
        </ScrollReveal>
      </main>
    </div>
  );
}
