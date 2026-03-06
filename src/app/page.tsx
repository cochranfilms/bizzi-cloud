import Header from "@/components/Header";
import Hero from "@/components/Hero";
import ValueProps from "@/components/ValueProps";
import BrandContinuity from "@/components/BrandContinuity";
import FeatureList from "@/components/FeatureList";
import CTA from "@/components/CTA";
import Footer from "@/components/Footer";

export default function Home() {
  return (
    <>
      <Header />
      <main>
        <Hero />
        <ValueProps />
        <BrandContinuity />
        <FeatureList />
        <CTA />
        <Footer />
      </main>
    </>
  );
}
