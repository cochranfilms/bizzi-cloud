import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Cookie Policy",
  description: "Bizzi Cloud cookie policy. How we use cookies and how you can manage your preferences.",
};

export default function CookiesPage() {
  return (
    <div className="min-h-screen bg-white dark:bg-neutral-950">
      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
        <header className="mb-12">
          <Link
            href="/"
            className="text-sm font-medium text-bizzi-blue hover:text-bizzi-cyan"
          >
            ← Back to Bizzi Cloud
          </Link>
          <h1 className="mt-4 text-3xl font-bold text-neutral-900 dark:text-white sm:text-4xl">
            Cookie Policy
          </h1>
          <p className="mt-2 text-neutral-600 dark:text-neutral-400">
            How we use cookies and similar technologies
          </p>
        </header>

        <article className="prose prose-neutral dark:prose-invert max-w-none space-y-8">
          <section>
            <h2 className="text-xl font-semibold text-neutral-900 dark:text-white">
              What Are Cookies?
            </h2>
            <p className="mt-2 text-neutral-600 dark:text-neutral-400">
              Cookies are small text files stored on your device when you visit
              our website. They help us provide, protect, and improve our
              services.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-neutral-900 dark:text-white">
              Types of Cookies We Use
            </h2>
            <h3 className="mt-4 text-base font-medium text-neutral-800 dark:text-neutral-200">
              Essential Cookies (Required)
            </h3>
            <p className="mt-1 text-neutral-600 dark:text-neutral-400">
              These cookies are necessary for the website to function and cannot
              be disabled.
            </p>
            <ul className="mt-2 list-disc space-y-0.5 pl-6 text-neutral-600 dark:text-neutral-400">
              <li>Authentication and security (Firebase Auth, session management)</li>
              <li>Load balancing and performance</li>
              <li>Consent preferences storage</li>
            </ul>

            <h3 className="mt-6 text-base font-medium text-neutral-800 dark:text-neutral-200">
              Analytics Cookies (Optional)
            </h3>
            <p className="mt-1 text-neutral-600 dark:text-neutral-400">
              When we add analytics (e.g., HubSpot), these help us understand
              how visitors interact with our website. You can opt-out using the
              consent banner.
            </p>

            <h3 className="mt-6 text-base font-medium text-neutral-800 dark:text-neutral-200">
              Functional Cookies (Optional)
            </h3>
            <p className="mt-1 text-neutral-600 dark:text-neutral-400">
              These enable enhanced functionality and personalization.
            </p>
            <ul className="mt-1 list-disc space-y-0.5 pl-6 text-neutral-600 dark:text-neutral-400">
              <li>Theme and display preferences</li>
              <li>Language preferences</li>
              <li>User settings</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-neutral-900 dark:text-white">
              Third-Party Cookies
            </h2>
            <p className="mt-2 text-neutral-600 dark:text-neutral-400">
              We use the following third-party services that may set cookies:
            </p>
            <ul className="mt-2 list-disc space-y-0.5 pl-6 text-neutral-600 dark:text-neutral-400">
              <li>
                <strong>Firebase</strong> — Authentication and hosting (
                <a
                  href="https://firebase.google.com/support/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-bizzi-blue hover:underline"
                >
                  Firebase Privacy Policy
                </a>
                )
              </li>
              <li>
                <strong>Stripe</strong> — Payment processing (
                <a
                  href="https://stripe.com/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-bizzi-blue hover:underline"
                >
                  Stripe Privacy Policy
                </a>
                )
              </li>
              <li>
                <strong>HubSpot</strong> — Marketing (when added) (
                <a
                  href="https://legal.hubspot.com/privacy-policy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-bizzi-blue hover:underline"
                >
                  HubSpot Privacy Policy
                </a>
                )
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-neutral-900 dark:text-white">
              Cookie Retention
            </h2>
            <p className="mt-2 text-neutral-600 dark:text-neutral-400">
              Cookies are retained for different periods:
            </p>
            <ul className="mt-2 list-disc space-y-0.5 pl-6 text-neutral-600 dark:text-neutral-400">
              <li>Consent preferences: Stored until you change your preferences</li>
              <li>Session cookies: Deleted when you close your browser</li>
              <li>Persistent cookies: Up to 2 years or until you delete them</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-neutral-900 dark:text-white">
              Managing Cookies
            </h2>
            <p className="mt-2 text-neutral-600 dark:text-neutral-400">
              You can control cookies through:
            </p>
            <ul className="mt-2 list-disc space-y-0.5 pl-6 text-neutral-600 dark:text-neutral-400">
              <li>
                <strong>Consent banner</strong> — Use the cookie consent banner
                that appears when you first visit our site
              </li>
              <li>
                <strong>Account settings</strong> — Visit your{" "}
                <Link
                  href="/login?redirect=/dashboard/settings"
                  className="text-bizzi-blue hover:underline"
                >
                  Account Privacy Settings
                </Link>{" "}
                when logged in
              </li>
              <li>
                <strong>Browser settings</strong> — Most browsers allow you to
                refuse or delete cookies. Check your browser&apos;s help menu for
                instructions.
              </li>
            </ul>
          </section>
        </article>

        <footer className="mt-16 border-t border-neutral-200 pt-8 dark:border-neutral-800">
          <div className="flex flex-wrap gap-6 text-sm text-neutral-500">
            <Link href="/privacy" className="hover:text-bizzi-blue">
              Privacy Policy
            </Link>
            <Link href="/terms" className="hover:text-bizzi-blue">
              Terms of Service
            </Link>
            <Link href="/privacy#cookies" className="hover:text-bizzi-blue">
              Cookie Policy
            </Link>
            <Link href="/privacy#do-not-sell" className="hover:text-bizzi-blue">
              Don&apos;t Sell My Data
            </Link>
          </div>
        </footer>
      </div>
    </div>
  );
}
