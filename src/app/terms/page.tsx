import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "Bizzi Cloud terms of service. Agreement governing your use of our cloud storage and creator tools.",
};

const LAST_UPDATED = "March 19, 2026";

export default function TermsPage() {
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
            Terms of Service
          </h1>
          <p className="mt-4 text-sm text-neutral-500 dark:text-neutral-500">
            Last updated: {LAST_UPDATED}
          </p>
        </header>

        <article className="prose prose-neutral dark:prose-invert max-w-none space-y-10">
          <section>
            <h2 className="text-xl font-semibold text-neutral-900 dark:text-white">
              1. Acceptance
            </h2>
            <p className="mt-2 text-neutral-600 dark:text-neutral-400">
              By accessing or using Bizzi Cloud (&quot;Service&quot;), you agree
              to be bound by these Terms of Service (&quot;Terms&quot;). If you
              do not agree, do not use the Service. If you are using the Service
              on behalf of an organization, you represent that you have authority
              to bind that organization.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-neutral-900 dark:text-white">
              2. Description of Service
            </h2>
            <p className="mt-2 text-neutral-600 dark:text-neutral-400">
              Bizzi Cloud provides cloud storage, file sharing, client delivery,
              galleries, and related tools for creators. We reserve the right to
              modify, suspend, or discontinue any part of the Service with
              reasonable notice where practicable.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-neutral-900 dark:text-white">
              3. Account and Registration
            </h2>
            <p className="mt-2 text-neutral-600 dark:text-neutral-400">
              You must provide accurate information when creating an account.
              You are responsible for maintaining the confidentiality of your
              credentials and for all activity under your account. Notify us
              immediately at{" "}
              <a
                href="mailto:info@bizzicloud.io"
                className="text-bizzi-blue hover:underline"
              >
                info@bizzicloud.io
              </a>{" "}
              of any unauthorized use.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-neutral-900 dark:text-white">
              4. Acceptable Use
            </h2>
            <p className="mt-2 text-neutral-600 dark:text-neutral-400">
              You agree not to use the Service to: (a) violate any law or
              regulation; (b) infringe intellectual property or other rights of
              others; (c) distribute malware, spam, or harmful content; (d)
              attempt to gain unauthorized access to our systems or other
              accounts; (e) interfere with or disrupt the Service; or (f) use
              the Service for any illegal or abusive purpose. We may suspend or
              terminate accounts that violate these terms.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-neutral-900 dark:text-white">
              5. Your Content
            </h2>
            <p className="mt-2 text-neutral-600 dark:text-neutral-400">
              You retain ownership of content you upload. By using the Service,
              you grant us a limited license to store, process, and transmit
              your content as necessary to provide the Service. You represent
              that you have the right to upload and share your content and that
              it does not violate these Terms or any third-party rights.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-neutral-900 dark:text-white">
              6. Intellectual Property
            </h2>
            <p className="mt-2 text-neutral-600 dark:text-neutral-400">
              Bizzi Cloud, our logos, and the Service (excluding your content)
              are our intellectual property. You may not copy, modify, or create
              derivative works of our Service or branding without our written
              consent.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-neutral-900 dark:text-white">
              7. Payment and Subscription
            </h2>
            <p className="mt-2 text-neutral-600 dark:text-neutral-400">
              Paid plans are billed according to the pricing at the time of
              purchase. Fees are non-refundable except as required by law or as
              stated in our refund policy. We may change pricing with notice;
              continued use after changes constitutes acceptance. You may cancel
              at any time; access continues until the end of the billing period.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-neutral-900 dark:text-white">
              8. Termination
            </h2>
            <p className="mt-2 text-neutral-600 dark:text-neutral-400">
              You may terminate your account at any time from Settings. We may
              suspend or terminate your account for violation of these Terms, for
              non-payment, or for any other reason with notice where practicable.
              Upon termination, your right to use the Service ceases. We may
              retain data as required by law or our Privacy Policy.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-neutral-900 dark:text-white">
              9. Disclaimers
            </h2>
            <p className="mt-2 text-neutral-600 dark:text-neutral-400">
              THE SERVICE IS PROVIDED &quot;AS IS&quot; AND &quot;AS
              AVAILABLE&quot; WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED.
              WE DO NOT WARRANT THAT THE SERVICE WILL BE UNINTERRUPTED, ERROR-FREE,
              OR SECURE. YOU USE THE SERVICE AT YOUR OWN RISK.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-neutral-900 dark:text-white">
              10. Limitation of Liability
            </h2>
            <p className="mt-2 text-neutral-600 dark:text-neutral-400">
              TO THE MAXIMUM EXTENT PERMITTED BY LAW, BIZZI CLOUD AND ITS
              AFFILIATES SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL,
              SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR FOR LOSS OF DATA,
              PROFITS, OR REVENUE, ARISING FROM YOUR USE OF THE SERVICE. OUR
              TOTAL LIABILITY SHALL NOT EXCEED THE AMOUNT YOU PAID US IN THE
              TWELVE MONTHS PRECEDING THE CLAIM.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-neutral-900 dark:text-white">
              11. Indemnification
            </h2>
            <p className="mt-2 text-neutral-600 dark:text-neutral-400">
              You agree to indemnify and hold harmless Bizzi Cloud and its
              affiliates from any claims, damages, or expenses (including
              reasonable attorneys&apos; fees) arising from your use of the
              Service, your content, or your violation of these Terms.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-neutral-900 dark:text-white">
              12. Governing Law
            </h2>
            <p className="mt-2 text-neutral-600 dark:text-neutral-400">
              These Terms are governed by the laws of the United States and the
              State of Delaware, without regard to conflict of law principles.
              Any disputes shall be resolved in the courts of Delaware.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-neutral-900 dark:text-white">
              13. Changes
            </h2>
            <p className="mt-2 text-neutral-600 dark:text-neutral-400">
              We may update these Terms from time to time. We will post the
              updated Terms and update the &quot;Last updated&quot; date.
              Material changes may be communicated via email or in-app notice.
              Continued use after changes constitutes acceptance.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-neutral-900 dark:text-white">
              14. Contact
            </h2>
            <p className="mt-2 text-neutral-600 dark:text-neutral-400">
              For questions about these Terms, contact us at{" "}
              <a
                href="mailto:info@bizzicloud.io"
                className="text-bizzi-blue hover:underline"
              >
                info@bizzicloud.io
              </a>
              .
            </p>
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
