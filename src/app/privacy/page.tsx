import type { Metadata } from "next";
import Link from "next/link";
export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "Bizzi Cloud privacy policy. How we collect, use, and protect your data. SOC 2 compliant, GDPR ready, encrypted at rest and in transit.",
};

const PRIVACY_EMAIL = "info@bizzicloud.io";
const LAST_UPDATED = "March 19, 2026";

export default function PrivacyPage() {
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
            Privacy Policy
          </h1>
          <p className="mt-2 text-lg text-neutral-600 dark:text-neutral-400">
            Built on transparency, trust, and respect for your data
          </p>
          <p className="mt-4 text-sm text-neutral-500 dark:text-neutral-500">
            Last updated: {LAST_UPDATED}
          </p>
        </header>

        <article className="prose prose-neutral dark:prose-invert max-w-none space-y-12">
          {/* In Plain Language */}
          <section>
            <h2 className="text-xl font-semibold text-neutral-900 dark:text-white">
              In Plain Language
            </h2>
            <p className="mt-2 text-neutral-600 dark:text-neutral-400">
              We respect your privacy. We only collect the information we need
              to operate our services, improve your experience, and communicate
              with you when you ask us to. We never sell your data. You have full
              control over your data and can download or delete it at any time.
            </p>
            <Link
              href="/login?redirect=/dashboard/settings?tab=privacy"
              className="mt-4 inline-flex items-center rounded-lg bg-bizzi-blue px-4 py-2 text-sm font-medium text-white hover:bg-bizzi-cyan"
            >
              Download or Delete my Data
            </Link>
            <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-500">
              You&apos;ll be asked to sign in to access your data management
              tools.
            </p>
          </section>

          {/* Do Not Sell */}
          <section id="do-not-sell">
            <h2 className="text-xl font-semibold text-neutral-900 dark:text-white">
              Do Not Sell My Personal Information
            </h2>
            <p className="mt-2 text-sm font-medium text-neutral-600 dark:text-neutral-400">
              CCPA Right to Opt-Out
            </p>
            <p className="mt-2 text-neutral-600 dark:text-neutral-400">
              Bizzi Cloud does not sell personal information to third parties.
              However, if you are a California resident, you have the right to
              opt-out of any potential future sale or sharing of your personal
              information.
            </p>
            <h3 className="mt-4 text-base font-semibold text-neutral-900 dark:text-white">
              Opt-Out Options
            </h3>
            <ul className="mt-2 list-disc space-y-1 pl-6 text-neutral-600 dark:text-neutral-400">
              <li>
              <Link
                href="/login?redirect=/dashboard/settings?tab=privacy"
                className="text-bizzi-blue hover:underline"
              >
                Manage Privacy Settings in Your Account
              </Link>
              </li>
              <li>
                Email:{" "}
                <a
                  href={`mailto:${PRIVACY_EMAIL}`}
                  className="text-bizzi-blue hover:underline"
                >
                  {PRIVACY_EMAIL}
                </a>
              </li>
            </ul>
            <p className="mt-4 text-sm text-neutral-600 dark:text-neutral-400">
              We will process your opt-out request within 15 business days and
              will not discriminate against you for exercising this right.
            </p>
          </section>

          {/* Cookie Policy */}
          <section id="cookies">
            <h2 className="text-xl font-semibold text-neutral-900 dark:text-white">
              Cookie Policy
            </h2>
            <p className="mt-2 text-neutral-600 dark:text-neutral-400">
              How we use cookies and similar technologies.
            </p>
            <h3 className="mt-4 text-base font-semibold text-neutral-900 dark:text-white">
              What Are Cookies?
            </h3>
            <p className="mt-2 text-neutral-600 dark:text-neutral-400">
              Cookies are small text files stored on your device when you visit
              our website. They help us provide, protect, and improve our services.
            </p>
            <h3 className="mt-4 text-base font-semibold text-neutral-900 dark:text-white">
              Types of Cookies We Use
            </h3>
            <h4 className="mt-3 text-sm font-medium text-neutral-800 dark:text-neutral-200">
              Essential Cookies (Required)
            </h4>
            <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
              These cookies are necessary for the website to function and cannot
              be disabled.
            </p>
            <ul className="mt-1 list-disc space-y-0.5 pl-6 text-sm text-neutral-600 dark:text-neutral-400">
              <li>Authentication and security (Firebase Auth, session)</li>
              <li>Load balancing and performance</li>
              <li>Consent preferences storage</li>
            </ul>
            <h4 className="mt-3 text-sm font-medium text-neutral-800 dark:text-neutral-200">
              Analytics Cookies (Optional)
            </h4>
            <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
              When we add analytics (e.g., HubSpot), these help us understand
              how visitors interact with our website. You can opt-out via the
              consent banner.
            </p>
            <h4 className="mt-3 text-sm font-medium text-neutral-800 dark:text-neutral-200">
              Functional Cookies (Optional)
            </h4>
            <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
              These enable enhanced functionality and personalization (e.g.,
              theme preferences, language).
            </p>
            <h3 className="mt-4 text-base font-semibold text-neutral-900 dark:text-white">
              Third-Party Cookies
            </h3>
            <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
              We use Firebase (authentication, hosting), Stripe (payments), and
              may use HubSpot (marketing) when added. These services have their
              own privacy policies. We recommend reviewing them.
            </p>
            <h3 className="mt-4 text-base font-semibold text-neutral-900 dark:text-white">
              Managing Cookies
            </h3>
            <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
              You can control cookies through the consent banner, your{" "}
              <Link
                href="/login?redirect=/dashboard/settings?tab=privacy"
                className="text-bizzi-blue hover:underline"
              >
                Account Privacy Settings
              </Link>
              , or your browser settings.
            </p>
          </section>

          {/* Information we collect */}
          <section>
            <h2 className="text-xl font-semibold text-neutral-900 dark:text-white">
              1. Information we collect
            </h2>
            <p className="mt-2 text-neutral-600 dark:text-neutral-400">
              We may collect your name, email address, display name, profile
              photo, and any content you upload or create (files, galleries,
              transfers). We also collect account and billing information when
              you subscribe. We store metadata about your files (paths, sizes,
              types) to provide our services.
            </p>
          </section>

          {/* How we use information */}
          <section>
            <h2 className="text-xl font-semibold text-neutral-900 dark:text-white">
              2. How we use information
            </h2>
            <ul className="mt-2 list-disc space-y-1 pl-6 text-neutral-600 dark:text-neutral-400">
              <li>Provide, maintain, and improve our cloud storage and services</li>
              <li>Process payments and manage subscriptions</li>
              <li>Respond to inquiries and provide customer support</li>
              <li>Send service-related updates you request or opt into</li>
              <li>Analyze usage to improve performance (when you consent)</li>
            </ul>
          </section>

          {/* Sharing */}
          <section>
            <h2 className="text-xl font-semibold text-neutral-900 dark:text-white">
              3. Sharing
            </h2>
            <p className="mt-2 font-medium text-neutral-900 dark:text-white">
              We never sell your data.
            </p>
            <p className="mt-2 text-neutral-600 dark:text-neutral-400">
              We do not sell your personal information. We may share data with
              trusted service providers (Firebase, Backblaze B2, Stripe, Vercel)
              who process it on our behalf under confidentiality agreements. We
              may disclose information if required by law or to protect our
              rights and safety.
            </p>
          </section>

          {/* Data retention */}
          <section>
            <h2 className="text-xl font-semibold text-neutral-900 dark:text-white">
              4. Data retention
            </h2>
            <p className="mt-2 text-neutral-600 dark:text-neutral-400">
              We keep personal information only as long as necessary for the
              purposes described here, unless a longer retention period is
              required by law. Deleted files are purged from our systems
              according to our retention policy. You can request deletion of your
              account and data at any time.
            </p>
          </section>

          {/* Your rights */}
          <section>
            <h2 className="text-xl font-semibold text-neutral-900 dark:text-white">
              5. Your rights
            </h2>
            <ul className="mt-2 list-disc space-y-1 pl-6 text-neutral-600 dark:text-neutral-400">
              <li>Access, correct, or delete your personal information</li>
              <li>Download a copy of your data</li>
              <li>Opt out of marketing communications</li>
              <li>Opt out of sale/sharing (CCPA) — see Do Not Sell section above</li>
              <li>Ask questions:{" "}
                <a
                  href={`mailto:${PRIVACY_EMAIL}`}
                  className="text-bizzi-blue hover:underline"
                >
                  {PRIVACY_EMAIL}
                </a>
              </li>
            </ul>
          </section>

          {/* Security */}
          <section>
            <h2 className="text-xl font-semibold text-neutral-900 dark:text-white">
              6. Security
            </h2>
            <p className="mt-2 text-neutral-600 dark:text-neutral-400">
              We use reasonable administrative, technical, and organizational
              safeguards to protect personal information. Your data is encrypted
              at rest (AES-256) and in transit (HTTPS). Sensitive metadata uses
              app-level encryption. Passwords and PINs are hashed, never stored
              in plaintext. However, no method of transmission or storage is 100%
              secure.
            </p>
          </section>

          {/* International users */}
          <section>
            <h2 className="text-xl font-semibold text-neutral-900 dark:text-white">
              7. International users
            </h2>
            <p className="mt-2 text-neutral-600 dark:text-neutral-400">
              If you access our site from outside your home jurisdiction, you
              understand that your information may be processed in countries with
              different data protection laws. We comply with applicable laws
              including GDPR for EU users.
            </p>
          </section>

          {/* Changes */}
          <section>
            <h2 className="text-xl font-semibold text-neutral-900 dark:text-white">
              8. Changes
            </h2>
            <p className="mt-2 text-neutral-600 dark:text-neutral-400">
              We may update this policy from time to time. We will update the
              &quot;Last updated&quot; date above and, if appropriate, notify you
              via our website or email.
            </p>
          </section>

          {/* Contact */}
          <section className="rounded-xl border border-neutral-200 bg-neutral-50 p-6 dark:border-neutral-800 dark:bg-neutral-900/50">
            <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">
              Questions About Your Privacy?
            </h2>
            <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
              Reach out anytime for clarity on how we protect and handle your
              data.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <a
                href={`mailto:${PRIVACY_EMAIL}`}
                className="rounded-lg bg-bizzi-blue px-4 py-2 text-sm font-medium text-white hover:bg-bizzi-cyan"
              >
                Contact Privacy Team
              </a>
              <Link
                href="/"
                className="rounded-lg border border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
              >
                Back to Home
              </Link>
            </div>
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
