"use client";

import Link from "next/link";

const SECTION_IDS = [
  "overview",
  "key-workflows",
  "how-users-enter",
  "personal-workspace",
  "enterprise-teams",
  "file-storage",
  "uploads",
  "galleries",
  "transfers",
  "shares",
  "subscriptions",
  "emails",
  "notifications",
  "desktop-app",
  "client-portal",
  "admin",
  "automated-tasks",
  "integrations",
] as const;

export default function BackendDocPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-bizzi-sky/30 via-white to-white dark:from-neutral-950 dark:via-neutral-900 dark:to-neutral-950">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-neutral-200/80 bg-white/90 backdrop-blur-md dark:border-neutral-800 dark:bg-neutral-900/90">
        <div className="mx-auto max-w-5xl px-4 py-4 sm:px-6">
          <div className="flex items-center justify-between gap-4">
            <Link
              href="/"
              className="text-sm font-medium text-bizzi-blue hover:text-bizzi-cyan transition-colors"
            >
              ← Back to Bizzi Cloud
            </Link>
            <span className="text-xs text-neutral-500 dark:text-neutral-400">
              Platform Documentation · Plain-Language Overview
            </span>
          </div>
          <h1 className="mt-2 text-2xl font-bold text-neutral-900 dark:text-white sm:text-3xl">
            How Bizzi Cloud Works
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-neutral-600 dark:text-neutral-400">
            A complete, plain-language breakdown of every feature, workflow, email, and screen
            in the platform—designed so anyone can understand what happens behind the scenes.
          </p>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
        {/* Table of Contents */}
        <nav
          className="mb-12 rounded-xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900"
          aria-label="Table of contents"
        >
          <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
            Jump to Section
          </h2>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {SECTION_IDS.map((id) => (
              <li key={id}>
                <a
                  href={`#${id}`}
                  className="text-sm font-medium text-bizzi-blue hover:text-bizzi-cyan hover:underline"
                >
                  {id.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        {/* Sections */}
        <main className="space-y-12">
          {/* 1. Overview */}
          <DocSection id="overview" title="1. Platform Overview">
            <p className="text-neutral-600 dark:text-neutral-400">
              Bizzi Cloud is a cloud storage and delivery platform built for creators—photographers,
              videographers, and creative teams. Think of it as a blend of Dropbox (for files),
              Google Drive (for sharing), and a photo gallery tool, all tailored for professionals
              who need to store, organize, and deliver large media files to clients.
            </p>
            <h3 className="mt-6 text-base font-semibold text-neutral-900 dark:text-white">
              What the Platform Does (In Simple Terms)
            </h3>
            <ul className="mt-2 list-inside list-disc space-y-1 text-neutral-600 dark:text-neutral-400">
              <li>
                <strong>Stores files</strong> — Photos, videos, and documents are uploaded and
                backed up in the cloud (Backblaze B2).
              </li>
              <li>
                <strong>Organizes into workspaces</strong> — Each user can have a personal workspace
                and/or belong to team organizations (enterprise).
              </li>
              <li>
                <strong>Delivers to clients</strong> — Galleries let photographers share proofs with
                clients; Transfers let anyone send files to a client via a link and email.
              </li>
              <li>
                <strong>Shares internally</strong> — Folder shares let users share specific files or
                folders with other users via a link.
              </li>
              <li>
                <strong>Handles billing</strong> — Subscriptions are managed through Stripe; users
                pick a plan, pay, and their storage quota updates automatically.
              </li>
            </ul>
          </DocSection>

          {/* 2. Key Workflows */}
          <DocSection id="key-workflows" title="2. Key Workflows (End-to-End)">
            <p className="text-neutral-600 dark:text-neutral-400">
              Here are a few complete flows from a user’s perspective—what happens step by step.
            </p>
            <h3 className="mt-6 text-base font-semibold text-neutral-900 dark:text-white">
              Consumer Signup & First Upload
            </h3>
            <ol className="mt-2 list-inside list-decimal space-y-1 text-neutral-600 dark:text-neutral-400">
              <li>User visits the site, clicks “Get Started,” and goes to Stripe Checkout.</li>
              <li>User enters payment info and completes purchase.</li>
              <li>Stripe sends a webhook to our server; we create or update their profile.</li>
              <li>User is redirected to /account/setup to set a password and finish account creation.</li>
              <li>User gets a welcome email (if configured).</li>
              <li>User goes to Dashboard → Files, uploads files. Files go to B2, metadata to Firestore.</li>
            </ol>
            <h3 className="mt-6 text-base font-semibold text-neutral-900 dark:text-white">
              Enterprise Team Invite
            </h3>
            <ol className="mt-2 list-inside list-decimal space-y-1 text-neutral-600 dark:text-neutral-400">
              <li>Admin creates an org (or Bizzi creates it from an invoice).</li>
              <li>Admin goes to Seats, invites a member by email.</li>
              <li>Invitee gets an email with a join link (/invite/join?token=...).</li>
              <li>Invitee clicks link, lands on join page, then signs up at /invite/signup.</li>
              <li>After signup, invitee is added to the org and can access the enterprise workspace.</li>
            </ol>
            <h3 className="mt-6 text-base font-semibold text-neutral-900 dark:text-white">
              Gallery Delivery to Client
            </h3>
            <ol className="mt-2 list-inside list-decimal space-y-1 text-neutral-600 dark:text-neutral-400">
              <li>Photographer creates a gallery, adds photos/videos, sets access (e.g., invite-only).</li>
              <li>If invite-only, photographer enters client emails; each gets a gallery invite email.</li>
              <li>Client clicks link, lands on /g/[galleryId] (or /[handle]/[slug] for branded URLs).</li>
              <li>Client views, favorites, and optionally comments. Photographer sees feedback in proofing view.</li>
            </ol>
            <h3 className="mt-6 text-base font-semibold text-neutral-900 dark:text-white">
              Transfer to Client
            </h3>
            <ol className="mt-2 list-inside list-decimal space-y-1 text-neutral-600 dark:text-neutral-400">
              <li>User creates a transfer, adds files, optionally sets a password and client email.</li>
              <li>If email provided, client gets a transfer notification email with the link.</li>
              <li>Client visits /t/[slug], enters password if needed, previews/downloads files.</li>
            </ol>
          </DocSection>

          {/* 3. How Users Enter */}
          <DocSection id="how-users-enter" title="3. How Users Enter the Platform">
            <p className="text-neutral-600 dark:text-neutral-400">
              Users log in with email and password. Authentication is handled by Firebase
              Auth—a secure system that manages login, password reset, and session tokens.
            </p>
            <h3 className="mt-6 text-base font-semibold text-neutral-900 dark:text-white">
              Main Entry Points
            </h3>
            <ul className="mt-2 space-y-2 text-neutral-600 dark:text-neutral-400">
              <li>
                <strong>Landing page (/)</strong> — Marketing site with pricing, features, and
                sign-up.
              </li>
              <li>
                <strong>Login (/login)</strong> — Email + password sign-in.
              </li>
              <li>
                <strong>Checkout → Setup</strong> — After paying via Stripe, users are routed to
                /account/setup to create their account and set a password.
              </li>
              <li>
                <strong>Enterprise invite</strong> — Team admins send invite links; invited users
                go to /invite/join, then /invite/signup to create an account and join the org.
              </li>
            </ul>
            <h3 className="mt-6 text-base font-semibold text-neutral-900 dark:text-white">
              Workspaces
            </h3>
            <p className="mt-2 text-neutral-600 dark:text-neutral-400">
              Once logged in, users see either their <strong>Personal Workspace</strong> (Dashboard)
              or an <strong>Enterprise Workspace</strong> (team). They can switch between them from
              a workspace switcher. Each workspace has its own files, galleries, transfers, and
              storage quota.
            </p>
          </DocSection>

          {/* 3. Personal Workspace */}
          <DocSection id="personal-workspace" title="4. Personal Workspace (Dashboard)">
            <p className="text-neutral-600 dark:text-neutral-400">
              The Dashboard is a user’s personal workspace. It contains all the main features
              for a solo creator.
            </p>
            <h3 className="mt-6 text-base font-semibold text-neutral-900 dark:text-white">
              Dashboard Pages & What They Do
            </h3>
            <div className="mt-3 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-neutral-200 dark:border-neutral-700">
                    <th className="py-2 pr-4 text-left font-medium text-neutral-900 dark:text-white">
                      Page
                    </th>
                    <th className="py-2 text-left font-medium text-neutral-900 dark:text-white">
                      Purpose
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                  <tr>
                    <td className="py-3 pr-4 font-medium">/dashboard</td>
                    <td className="text-neutral-600 dark:text-neutral-400">Home: quick overview and recent activity</td>
                  </tr>
                  <tr>
                    <td className="py-3 pr-4 font-medium">/dashboard/files</td>
                    <td className="text-neutral-600 dark:text-neutral-400">Browse, search, and manage all uploaded files</td>
                  </tr>
                  <tr>
                    <td className="py-3 pr-4 font-medium">/dashboard/activity</td>
                    <td className="text-neutral-600 dark:text-neutral-400">See recent activity (uploads, shares, etc.)</td>
                  </tr>
                  <tr>
                    <td className="py-3 pr-4 font-medium">/dashboard/recent</td>
                    <td className="text-neutral-600 dark:text-neutral-400">Recently viewed or edited files</td>
                  </tr>
                  <tr>
                    <td className="py-3 pr-4 font-medium">/dashboard/hearts</td>
                    <td className="text-neutral-600 dark:text-neutral-400">Files the user has marked as favorites (hearted)</td>
                  </tr>
                  <tr>
                    <td className="py-3 pr-4 font-medium">/dashboard/shared</td>
                    <td className="text-neutral-600 dark:text-neutral-400">Files and folders shared with the user by others</td>
                  </tr>
                  <tr>
                    <td className="py-3 pr-4 font-medium">/dashboard/trash</td>
                    <td className="text-neutral-600 dark:text-neutral-400">Deleted items (can be restored until permanently removed)</td>
                  </tr>
                  <tr>
                    <td className="py-3 pr-4 font-medium">/dashboard/projects</td>
                    <td className="text-neutral-600 dark:text-neutral-400">Project-based organization of files</td>
                  </tr>
                  <tr>
                    <td className="py-3 pr-4 font-medium">/dashboard/creator</td>
                    <td className="text-neutral-600 dark:text-neutral-400">Creator-oriented tools and shortcuts</td>
                  </tr>
                  <tr>
                    <td className="py-3 pr-4 font-medium">/dashboard/galleries</td>
                    <td className="text-neutral-600 dark:text-neutral-400">Create and manage photo/video galleries for clients</td>
                  </tr>
                  <tr>
                    <td className="py-3 pr-4 font-medium">/dashboard/transfers</td>
                    <td className="text-neutral-600 dark:text-neutral-400">Create and manage file transfers (send links to clients)</td>
                  </tr>
                  <tr>
                    <td className="py-3 pr-4 font-medium">/dashboard/change-plan</td>
                    <td className="text-neutral-600 dark:text-neutral-400">Upgrade or change subscription plan</td>
                  </tr>
                  <tr>
                    <td className="py-3 pr-4 font-medium">/dashboard/settings</td>
                    <td className="text-neutral-600 dark:text-neutral-400">Account settings, profile, billing, privacy</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </DocSection>

          {/* 4. Enterprise */}
          <DocSection id="enterprise-teams" title="5. Enterprise (Team Organizations)">
            <p className="text-neutral-600 dark:text-neutral-400">
              Enterprise is for teams. An organization has a name, logo, storage quota, and seats
              (members). Each seat can be an admin (manage team, invite others) or a member
              (use storage and features).
            </p>
            <h3 className="mt-6 text-base font-semibold text-neutral-900 dark:text-white">
              How Enterprise Works
            </h3>
            <ul className="mt-2 list-inside list-disc space-y-1 text-neutral-600 dark:text-neutral-400">
              <li>
                An admin creates an org or is set up by Bizzi support (Stripe invoice).
              </li>
              <li>
                After the first invoice is paid, the owner gets a signup link via email to create
                their account.
              </li>
              <li>
                Admins can invite members by email—each invitee gets an email with a join link.
              </li>
              <li>
                Invitees visit /invite/join, then /invite/signup, and join the org.
              </li>
            </ul>
            <h3 className="mt-6 text-base font-semibold text-neutral-900 dark:text-white">
              Enterprise Pages
            </h3>
            <p className="mt-2 text-neutral-600 dark:text-neutral-400">
              Mirror the dashboard: /enterprise/files, /enterprise/galleries, /enterprise/transfers,
              etc. Plus /enterprise/seats to manage team members and /enterprise/settings for
              org-level settings.
            </p>
          </DocSection>

          {/* 5. File Storage */}
          <DocSection id="file-storage" title="6. File Storage & Backup">
            <p className="text-neutral-600 dark:text-neutral-400">
              Files are stored in Backblaze B2 (an S3-compatible cloud storage service). Each file
              has metadata (name, size, type, path) in Firestore. Large files use multipart uploads
              and can be deduplicated (same file uploaded twice = one copy).
            </p>
            <h3 className="mt-6 text-base font-semibold text-neutral-900 dark:text-white">
              What Happens When a User Uploads a File
            </h3>
            <ol className="mt-2 list-inside list-decimal space-y-1 text-neutral-600 dark:text-neutral-400">
              <li>The user selects files (via web or desktop app).</li>
              <li>The app requests presigned URLs from our API to upload directly to B2.</li>
              <li>Files are uploaded in chunks (multipart) for reliability.</li>
              <li>When complete, our API records the file in Firestore and updates storage usage.</li>
              <li>For videos, a lower-resolution “proxy” can be generated for faster previews.</li>
            </ol>
            <h3 className="mt-6 text-base font-semibold text-neutral-900 dark:text-white">
              Storage Lifecycle
            </h3>
            <p className="mt-2 text-neutral-600 dark:text-neutral-400">
              When a user cancels or stops paying: files move to <strong>grace period</strong>,
              then <strong>cold storage</strong> (cheaper, not immediately accessible). If they
              resubscribe, files can be restored. After a set time without payment, files are
              permanently deleted.
            </p>
            <h3 className="mt-6 text-base font-semibold text-neutral-900 dark:text-white">
              Drives
            </h3>
            <p className="mt-2 text-neutral-600 dark:text-neutral-400">
              Users organize files in “drives”—think of them like top-level folders (e.g., “Wedding
              Project,” “Commercial Reel”). The desktop app can sync with these drives so files
              appear as a mounted volume.
            </p>
          </DocSection>

          {/* 6. Uploads */}
          <DocSection id="uploads" title="7. Upload System">
            <p className="text-neutral-600 dark:text-neutral-400">
              Uploads use Uppy (a JavaScript library) on the frontend and S3-compatible multipart
              APIs on the backend. Large files are split into parts, uploaded in parallel, then
              combined on the server.
            </p>
            <h3 className="mt-6 text-base font-semibold text-neutral-900 dark:text-white">
              APIs Involved
            </h3>
            <ul className="mt-2 list-inside list-disc space-y-1 text-neutral-600 dark:text-neutral-400">
              <li><strong>Create session</strong> — Start an upload, get an upload ID.</li>
              <li><strong>Presigned parts</strong> — Get temporary URLs for each chunk.</li>
              <li><strong>Complete</strong> — Tell the server all parts are done; metadata is saved.</li>
              <li><strong>Abort</strong> — Cancel an upload and clean up.</li>
              <li><strong>Dedupe check</strong> — Avoid re-uploading identical files.</li>
            </ul>
            <p className="mt-4 text-neutral-600 dark:text-neutral-400">
              A nightly cron job cleans up incomplete upload sessions so they don’t clutter storage.
            </p>
          </DocSection>

          {/* 7. Galleries */}
          <DocSection id="galleries" title="8. Galleries">
            <p className="text-neutral-600 dark:text-neutral-400">
              Galleries let photographers share photos and videos with clients. A gallery has a
              title, access type (public, password, PIN, or invite-only), and a list of assets
              (files) that clients can view, favorite, and optionally download.
            </p>
            <h3 className="mt-6 text-base font-semibold text-neutral-900 dark:text-white">
              Access Types
            </h3>
            <ul className="mt-2 list-inside list-disc space-y-1 text-neutral-600 dark:text-neutral-400">
              <li><strong>Public</strong> — Anyone with the link can view.</li>
              <li><strong>Password</strong> — User must enter a password to view.</li>
              <li><strong>PIN</strong> — Similar to password, numeric code.</li>
              <li><strong>Invite-only</strong> — Only invited email addresses can view; each gets an invite email.</li>
            </ul>
            <h3 className="mt-6 text-base font-semibold text-neutral-900 dark:text-white">
              Client Features
            </h3>
            <ul className="mt-2 list-inside list-disc space-y-1 text-neutral-600 dark:text-neutral-400">
              <li><strong>Favorites</strong> — Clients can mark images and create “favorites lists” (e.g., “Print these”).</li>
              <li><strong>Comments</strong> — Add comments on individual images for feedback.</li>
              <li><strong>Proofing</strong> — Workflow to approve/reject images.</li>
              <li><strong>Watermark</strong> — Optional watermark on previews.</li>
              <li><strong>LUT</strong> — Color lookup table for consistent preview appearance.</li>
            </ul>
            <h3 className="mt-6 text-base font-semibold text-neutral-900 dark:text-white">
              URLs
            </h3>
            <p className="mt-2 text-neutral-600 dark:text-neutral-400">
              Clients view galleries at <code className="rounded bg-neutral-100 px-1 dark:bg-neutral-800">/g/[galleryId]</code>.
              Photographers with a custom handle can share <code className="rounded bg-neutral-100 px-1 dark:bg-neutral-800">/[handle]/[gallerySlug]</code>.
            </p>
          </DocSection>

          {/* 8. Transfers */}
          <DocSection id="transfers" title="9. Transfers">
            <p className="text-neutral-600 dark:text-neutral-400">
              A Transfer is a way to send files to someone via a link. The user creates a transfer,
              adds files, optionally sets a password, and can enter the client’s email. The client
              gets an email with the link and can download the files.
            </p>
            <h3 className="mt-6 text-base font-semibold text-neutral-900 dark:text-white">
              How It Works
            </h3>
            <ol className="mt-2 list-inside list-decimal space-y-1 text-neutral-600 dark:text-neutral-400">
              <li>User creates a transfer, gives it a name, and uploads or selects files.</li>
              <li>Optionally adds a password and/or client email.</li>
              <li>Transfer gets a unique slug (e.g., abc123).</li>
              <li>If email provided, the client receives an email with the link.</li>
              <li>Client visits /t/[slug], enters password if required, and downloads.</li>
            </ol>
            <p className="mt-4 text-neutral-600 dark:text-neutral-400">
              Transfers can include videos; those can be streamed or downloaded. Bulk downloads
              are zipped on the server.
            </p>
          </DocSection>

          {/* 9. Shares */}
          <DocSection id="shares" title="10. Folder Shares">
            <p className="text-neutral-600 dark:text-neutral-400">
              Shares let users give other people access to specific files or folders. The sharer
              creates a share link, optionally invites specific emails, and sets view/edit permissions.
              Recipients get an email (if configured) and can access the content at <code className="rounded bg-neutral-100 px-1 dark:bg-neutral-800">/s/[token]</code>.
            </p>
            <p className="mt-4 text-neutral-600 dark:text-neutral-400">
              Shares are different from transfers: they’re tied to the user’s files in their
              workspace and can include nested folders. If the underlying files change, the share
              reflects that.
            </p>
          </DocSection>

          {/* 10. Subscriptions */}
          <DocSection id="subscriptions" title="11. Subscriptions & Billing">
            <p className="text-neutral-600 dark:text-neutral-400">
              Billing is powered by Stripe. Users choose a plan (Solo, Indie, Video, Production),
              pay via Stripe Checkout, and our system syncs their subscription status.
            </p>
            <h3 className="mt-6 text-base font-semibold text-neutral-900 dark:text-white">
              Plans & Storage
            </h3>
            <div className="mt-2 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-neutral-200 dark:border-neutral-700">
                    <th className="py-2 pr-4 text-left font-medium">Plan</th>
                    <th className="py-2 text-left font-medium">Storage</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                  <tr>
                    <td className="py-2 pr-4">Free</td>
                    <td>2 GB</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4">Solo</td>
                    <td>1 TB</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4">Indie</td>
                    <td>2 TB</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4">Video</td>
                    <td>5 TB</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4">Production</td>
                    <td>10 TB</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <h3 className="mt-6 text-base font-semibold text-neutral-900 dark:text-white">
              Add-ons
            </h3>
            <p className="mt-2 text-neutral-600 dark:text-neutral-400">
              Gallery, Editor, and Fullframe add-ons can be added to plans. Enterprise orgs can add
              extra seats.
            </p>
            <h3 className="mt-6 text-base font-semibold text-neutral-900 dark:text-white">
              Stripe Webhooks
            </h3>
            <p className="mt-2 text-neutral-600 dark:text-neutral-400">
              When a user pays, cancels, or changes a plan, Stripe sends webhooks to our server.
              We update the user’s profile (plan, storage quota, subscription status) and trigger
              any emails (e.g., welcome email on first payment).
            </p>
          </DocSection>

          {/* 11. Emails */}
          <DocSection id="emails" title="12. Emails">
            <p className="text-neutral-600 dark:text-neutral-400">
              All transactional emails are sent via EmailJS. Templates are designed in the
              EmailJS dashboard and triggered by our API when specific events occur.
            </p>
            <h3 className="mt-6 text-base font-semibold text-neutral-900 dark:text-white">
              Email Types & When They’re Sent
            </h3>
            <div className="mt-3 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-neutral-200 dark:border-neutral-700">
                    <th className="py-2 pr-4 text-left font-medium">Email</th>
                    <th className="py-2 text-left font-medium">When It’s Sent</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                  <tr>
                    <td className="py-3 pr-4 font-medium">Invoice</td>
                    <td className="text-neutral-600 dark:text-neutral-400">
                      Admin creates an enterprise org and sends a payment link; owner gets invoice email with link to pay.
                    </td>
                  </tr>
                  <tr>
                    <td className="py-3 pr-4 font-medium">Signup Link</td>
                    <td className="text-neutral-600 dark:text-neutral-400">
                      After an enterprise invoice is paid, owner gets an email with a link to create their account.
                    </td>
                  </tr>
                  <tr>
                    <td className="py-3 pr-4 font-medium">Share Files</td>
                    <td className="text-neutral-600 dark:text-neutral-400">
                      When a user shares files or folders with someone and adds their email to the invite list.
                    </td>
                  </tr>
                  <tr>
                    <td className="py-3 pr-4 font-medium">Transfer Notification</td>
                    <td className="text-neutral-600 dark:text-neutral-400">
                      When a user creates a transfer and enters the client’s email; client gets the transfer link.
                    </td>
                  </tr>
                  <tr>
                    <td className="py-3 pr-4 font-medium">Subscription Welcome</td>
                    <td className="text-neutral-600 dark:text-neutral-400">
                      When a consumer (personal) user pays for their first subscription.
                    </td>
                  </tr>
                  <tr>
                    <td className="py-3 pr-4 font-medium">Gallery Invite</td>
                    <td className="text-neutral-600 dark:text-neutral-400">
                      When a photographer creates an invite-only gallery and adds client emails.
                    </td>
                  </tr>
                  <tr>
                    <td className="py-3 pr-4 font-medium">Org Seat Invite</td>
                    <td className="text-neutral-600 dark:text-neutral-400">
                      When an enterprise admin invites a new member by email.
                    </td>
                  </tr>
                  <tr>
                    <td className="py-3 pr-4 font-medium">Org Removal (Owner)</td>
                    <td className="text-neutral-600 dark:text-neutral-400">
                      When an org is being removed (e.g., non-payment); owner gets a detailed notice with deadline.
                    </td>
                  </tr>
                  <tr>
                    <td className="py-3 pr-4 font-medium">Org Removal (Member)</td>
                    <td className="text-neutral-600 dark:text-neutral-400">
                      Same situation; members get a shorter alert that the org will be removed.
                    </td>
                  </tr>
                  <tr>
                    <td className="py-3 pr-4 font-medium">Support Ticket</td>
                    <td className="text-neutral-600 dark:text-neutral-400">
                      When a user submits a support ticket from the app; goes to the support inbox.
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </DocSection>

          {/* 13. Notifications */}
          <DocSection id="notifications" title="13. In-App Notifications">
            <p className="text-neutral-600 dark:text-neutral-400">
              Users receive in-app notifications for events like: someone shared files with them,
              someone commented on a file or gallery asset, a new invite, or other activity. These
              appear in a notification bell/dropdown in the header. Users can mark them as read
              or mark all as read. Notifications are stored in Firestore and fetched when the user
              opens the app.
            </p>
          </DocSection>

          {/* 14. Desktop App */}
          <DocSection id="desktop-app" title="14. Desktop App">
            <p className="text-neutral-600 dark:text-neutral-400">
              The Bizzi Cloud desktop app is an Electron app that provides the same features as
              the web dashboard but runs as a native app. It can mount drives (show cloud files
              as a folder on the computer) and sync files locally for offline access. The app
              uses the same API and Firebase auth.
            </p>
            <h3 className="mt-6 text-base font-semibold text-neutral-900 dark:text-white">
              Key Features
            </h3>
            <ul className="mt-2 list-inside list-disc space-y-1 text-neutral-600 dark:text-neutral-400">
              <li><strong>Mount</strong> — Cloud drives appear as a mounted volume (e.g., F: drive on Windows).</li>
              <li><strong>Conform</strong> — RAW/NLE workflow integration for video editors.</li>
              <li><strong>Local store</strong> — Cache files locally for offline access.</li>
            </ul>
            <p className="mt-4 text-neutral-600 dark:text-neutral-400">
              Pages mirror the web: /desktop/app, /desktop/app/files, /desktop/app/galleries, etc.
            </p>
          </DocSection>

          {/* 15. Client Portal */}
          <DocSection id="client-portal" title="15. Client Portal">
            <p className="text-neutral-600 dark:text-neutral-400">
              When a client is invited to a gallery (by email), they can go to /client to see all
              galleries they’ve been invited to. They verify their email and get a session. This
              gives them a single place to see all their invited galleries instead of following
              individual links.
            </p>
          </DocSection>

          {/* 16. Admin */}
          <DocSection id="admin" title="16. Admin Panel">
            <p className="text-neutral-600 dark:text-neutral-400">
              The admin panel is for Bizzi staff to manage the platform. It’s at /admin and
              protected so only authorized admins can access it.
            </p>
            <h3 className="mt-6 text-base font-semibold text-neutral-900 dark:text-white">
              Admin Pages & Purpose
            </h3>
            <div className="mt-2 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-neutral-200 dark:border-neutral-700">
                    <th className="py-2 pr-4 text-left font-medium">Page</th>
                    <th className="py-2 text-left font-medium">Purpose</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                  <tr>
                    <td className="py-2 pr-4">/admin</td>
                    <td className="text-neutral-600 dark:text-neutral-400">Overview: users, revenue, storage metrics</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4">/admin/users</td>
                    <td className="text-neutral-600 dark:text-neutral-400">List and manage user accounts</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4">/admin/files</td>
                    <td className="text-neutral-600 dark:text-neutral-400">Browse and manage files across the system</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4">/admin/uploads</td>
                    <td className="text-neutral-600 dark:text-neutral-400">See upload sessions (in progress or incomplete)</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4">/admin/organizations</td>
                    <td className="text-neutral-600 dark:text-neutral-400">Manage enterprise orgs, create orgs, resend signup links</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4">/admin/storage</td>
                    <td className="text-neutral-600 dark:text-neutral-400">Storage analytics, bucket stats, orphan cleanup</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4">/admin/cold-storage</td>
                    <td className="text-neutral-600 dark:text-neutral-400">Cold storage files, restore requests, extend retention</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4">/admin/support</td>
                    <td className="text-neutral-600 dark:text-neutral-400">Support tickets submitted by users</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4">/admin/revenue</td>
                    <td className="text-neutral-600 dark:text-neutral-400">Revenue metrics and Stripe data</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4">/admin/audit</td>
                    <td className="text-neutral-600 dark:text-neutral-400">Audit log of platform events</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4">/admin/alerts</td>
                    <td className="text-neutral-600 dark:text-neutral-400">System alerts and issues</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4">/admin/settings</td>
                    <td className="text-neutral-600 dark:text-neutral-400">Admin settings and configuration</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </DocSection>

          {/* 17. Automated Tasks */}
          <DocSection id="automated-tasks" title="17. Automated Tasks (Cron Jobs)">
            <p className="text-neutral-600 dark:text-neutral-400">
              The platform runs scheduled jobs on Vercel to keep the system clean and up to date.
            </p>
            <h3 className="mt-6 text-base font-semibold text-neutral-900 dark:text-white">
              Cron Jobs & Schedule
            </h3>
            <div className="mt-2 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-neutral-200 dark:border-neutral-700">
                    <th className="py-2 pr-4 text-left font-medium">Task</th>
                    <th className="py-2 pr-4 text-left font-medium">Schedule</th>
                    <th className="py-2 text-left font-medium">Purpose</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                  <tr>
                    <td className="py-2 pr-4">Upload cleanup</td>
                    <td className="py-2 pr-4">2:00 AM daily</td>
                    <td className="text-neutral-600 dark:text-neutral-400">Remove incomplete upload sessions</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4">Mux cleanup</td>
                    <td className="py-2 pr-4">3:00 AM daily</td>
                    <td className="text-neutral-600 dark:text-neutral-400">Clean up Mux video assets</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4">Trash cleanup</td>
                    <td className="py-2 pr-4">4:00 AM daily</td>
                    <td className="text-neutral-600 dark:text-neutral-400">Permanently delete items in trash past retention</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4">Orphan cleanup</td>
                    <td className="py-2 pr-4">5:00 AM Sundays</td>
                    <td className="text-neutral-600 dark:text-neutral-400">Remove orphaned B2 objects (files with no DB record)</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4">Org removal cleanup</td>
                    <td className="py-2 pr-4">5:30 AM daily</td>
                    <td className="text-neutral-600 dark:text-neutral-400">Process org removals (e.g., after grace period)</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4">Cold storage cleanup</td>
                    <td className="py-2 pr-4">5:45 AM daily</td>
                    <td className="text-neutral-600 dark:text-neutral-400">Delete expired cold storage files</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4">Account deletion cleanup</td>
                    <td className="py-2 pr-4">6:00 AM daily</td>
                    <td className="text-neutral-600 dark:text-neutral-400">Process account deletion requests</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4">Grace period expiry</td>
                    <td className="py-2 pr-4">5:15 AM daily</td>
                    <td className="text-neutral-600 dark:text-neutral-400">Move expired grace-period accounts to cold storage</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4">Proxy generation</td>
                    <td className="py-2 pr-4">Every 5 minutes</td>
                    <td className="text-neutral-600 dark:text-neutral-400">Generate video proxy files for faster previews</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </DocSection>

          {/* 18. Integrations */}
          <DocSection id="integrations" title="18. External Integrations">
            <p className="text-neutral-600 dark:text-neutral-400">
              Bizzi Cloud connects to several external services to provide its features.
            </p>
            <div className="mt-3 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-neutral-200 dark:border-neutral-700">
                    <th className="py-2 pr-4 text-left font-medium">Service</th>
                    <th className="py-2 text-left font-medium">Purpose</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                  <tr>
                    <td className="py-3 pr-4 font-medium">Firebase</td>
                    <td className="text-neutral-600 dark:text-neutral-400">Authentication (login), Firestore database (users, files, galleries, etc.)</td>
                  </tr>
                  <tr>
                    <td className="py-3 pr-4 font-medium">Backblaze B2</td>
                    <td className="text-neutral-600 dark:text-neutral-400">File storage; all uploaded files live here (S3-compatible)</td>
                  </tr>
                  <tr>
                    <td className="py-3 pr-4 font-medium">Stripe</td>
                    <td className="text-neutral-600 dark:text-neutral-400">Subscriptions, checkout, billing portal, webhooks</td>
                  </tr>
                  <tr>
                    <td className="py-3 pr-4 font-medium">EmailJS</td>
                    <td className="text-neutral-600 dark:text-neutral-400">All transactional emails (invites, transfers, invoices, support)</td>
                  </tr>
                  <tr>
                    <td className="py-3 pr-4 font-medium">Vercel</td>
                    <td className="text-neutral-600 dark:text-neutral-400">Hosting the web app, running cron jobs</td>
                  </tr>
                  <tr>
                    <td className="py-3 pr-4 font-medium">Cloudflare Worker</td>
                    <td className="text-neutral-600 dark:text-neutral-400">CDN to speed up file delivery from B2</td>
                  </tr>
                  <tr>
                    <td className="py-3 pr-4 font-medium">Mux (optional)</td>
                    <td className="text-neutral-600 dark:text-neutral-400">Video processing and streaming</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </DocSection>
        </main>

        {/* Footer */}
        <footer className="mt-16 border-t border-neutral-200 pt-8 dark:border-neutral-800">
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            This documentation describes the Bizzi Cloud platform as of March 2026. For technical
            implementation details, see the codebase. For support, contact your account manager
            or{" "}
            <a href="mailto:info@bizzicloud.io" className="text-bizzi-blue hover:underline">
              info@bizzicloud.io
            </a>
            .
          </p>
          <div className="mt-4 flex flex-wrap gap-6 text-sm">
            <Link href="/" className="text-bizzi-blue hover:underline">
              Back to Bizzi Cloud
            </Link>
            <Link href="/terms" className="text-neutral-500 hover:text-bizzi-blue">
              Terms
            </Link>
            <Link href="/privacy" className="text-neutral-500 hover:text-bizzi-blue">
              Privacy
            </Link>
          </div>
        </footer>
      </div>
    </div>
  );
}

function DocSection({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24">
      <div className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900 sm:p-8">
        <h2 className="text-xl font-bold text-neutral-900 dark:text-white sm:text-2xl">
          {title}
        </h2>
        <div className="mt-4 space-y-4">{children}</div>
      </div>
    </section>
  );
}
