import ExploreChrome from "@/components/explore/ExploreChrome";
import ExplorePageContent from "@/components/explore/ExplorePageContent";
import { EXPLORE_PAGE_ID } from "@/components/explore/explore-data-attributes";
import Footer from "@/components/Footer";
import Header from "@/components/Header";

export default function ExplorePage() {
  return (
    <div
      className="explore-academy-shell min-h-screen min-h-[100dvh] landing-page-shell explore-page-print"
      data-explore-surface="explore-bizzi-page"
    >
      <a
        href="#explore-main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:shadow-lg dark:focus:bg-neutral-900"
        data-explore-action="skip-to-content"
        data-explore-target="explore-main"
      >
        Skip to Explore content
      </a>
      <Header />
      <ExploreChrome>
        <main
          id="explore-main"
          tabIndex={-1}
          className="outline-none pb-28 sm:pb-12 lg:pb-8"
          data-explore-region="primary-content"
          data-explore-page={EXPLORE_PAGE_ID}
        >
          <ExplorePageContent />
        </main>
      </ExploreChrome>
      <Footer />
    </div>
  );
}
