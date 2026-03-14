import { Suspense } from "react";
import Header from "@/components/Header";
import Hero from "@/components/Hero";
import TrustedByBrands from "@/components/landing/TrustedByBrands";
import KeyFeaturesPills from "@/components/landing/KeyFeaturesPills";
import HowItWorks from "@/components/landing/HowItWorks";
import FeatureComparison from "@/components/landing/FeatureComparison";
import PricingSection from "@/components/PricingSection";
import TrustedByTeams from "@/components/landing/TrustedByTeams";
import FAQ from "@/components/landing/FAQ";
import CTA from "@/components/CTA";
import Footer from "@/components/Footer";
import CheckoutCancelledBanner from "@/components/CheckoutCancelledBanner";
import { HomePageStructuredData } from "@/components/seo/HomePageStructuredData";

export default function Home() {
  return (
    <>
      <HomePageStructuredData />
      <Header />
      <Suspense fallback={null}>
        <CheckoutCancelledBanner />
      </Suspense>
      <main>
        <Hero />
        <TrustedByBrands />
        <KeyFeaturesPills />
        <div id="features">
          <HowItWorks />
        </div>
        <FeatureComparison />
        <Suspense fallback={null}>
          <PricingSection />
        </Suspense>
        <TrustedByTeams />
        <FAQ />
        <CTA />
        <Footer />
      </main>
    </>
  );
}
