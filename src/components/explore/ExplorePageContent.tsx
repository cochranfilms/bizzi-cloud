import ExploreMediaPlaceholder from "@/components/explore/ExploreMediaPlaceholder";
import ExploreSectionFrame from "@/components/explore/ExploreSectionFrame";
import {
  EXPLORE_JOURNEYS,
  EXPLORE_FAQ,
  exploreNavLabelForId,
} from "@/content/explore-sections-data";
import Link from "next/link";

function VsColumn({
  title,
  subtitle,
  bullets,
  accent,
}: {
  title: string;
  subtitle: string;
  bullets: string[];
  accent: "left" | "right";
}) {
  return (
    <div
      className={`break-words rounded-2xl border p-4 sm:p-5 ${
        accent === "left"
          ? "border-bizzi-blue/30 bg-white dark:border-bizzi-cyan/25 dark:bg-neutral-900/60"
          : "border-neutral-200 bg-neutral-50/90 dark:border-neutral-700 dark:bg-neutral-900/40"
      }`}
    >
      <h3 className="text-lg font-bold text-bizzi-navy dark:text-sky-50">{title}</h3>
      <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">{subtitle}</p>
      <ul className="mt-4 space-y-2 text-sm text-neutral-700 dark:text-neutral-300">
        {bullets.map((b) => (
          <li key={b} className="flex gap-2">
            <span className="text-bizzi-blue dark:text-bizzi-cyan" aria-hidden>
              •
            </span>
            <span>{b}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function ExplorePageContent() {
  return (
    <>
      {/* Hero */}
      <section
        id="explore-hero"
        data-explore-section="explore-hero"
        data-explore-region="hero"
        className="scroll-mt-[5.5rem] mb-12 border-b border-neutral-200/80 pb-10 sm:mb-16 sm:pb-12 dark:border-neutral-800"
      >
        <p className="text-xs font-semibold uppercase tracking-widest text-bizzi-blue dark:text-bizzi-cyan">
          Product education
        </p>
        <h1 className="mt-2 text-balance text-3xl font-bold leading-tight tracking-tight text-bizzi-navy sm:text-4xl md:text-5xl dark:text-sky-50">
          Explore Bizzi
        </h1>
        <p className="explore-hero-summary mt-4 max-w-2xl text-base leading-relaxed text-neutral-600 sm:text-lg dark:text-neutral-300">
          One calm, in-depth tour of Bizzi Cloud—how storage, editing, proofing, and delivery fit together for
          video, photo, and creative teams. Skim the cards or read top to bottom: every major topic links to
          related ideas on this same page.
        </p>
        <div className="mt-6 flex flex-col gap-2 text-sm sm:mt-8 sm:flex-row sm:flex-wrap sm:gap-3">
          <a
            href="#choose-journey"
            className="inline-flex min-h-[48px] w-full items-center justify-center rounded-full bg-bizzi-blue px-5 py-3 font-semibold text-white hover:bg-bizzi-cyan sm:w-auto sm:min-h-[44px]"
            data-explore-action="hero-cta"
            data-explore-target="choose-journey"
          >
            Choose a journey
          </a>
          <a
            href="#what-is-bizzi"
            className="inline-flex min-h-[48px] w-full items-center justify-center rounded-full border border-neutral-300 px-5 py-3 font-medium text-neutral-800 hover:border-bizzi-blue/50 dark:border-neutral-600 dark:text-neutral-200 sm:w-auto sm:min-h-[44px]"
            data-explore-action="hero-cta"
            data-explore-target="what-is-bizzi"
          >
            What is Bizzi Cloud?
          </a>
          <a
            href="#faq"
            className="inline-flex min-h-[48px] w-full items-center justify-center rounded-full border border-neutral-300 px-5 py-3 font-medium text-neutral-800 hover:border-bizzi-blue/50 dark:border-neutral-600 dark:text-neutral-200 sm:w-auto sm:min-h-[44px]"
            data-explore-action="hero-cta"
            data-explore-target="faq"
          >
            Jump to FAQ
          </a>
        </div>
        <div className="mt-10">
          <ExploreMediaPlaceholder
            aspect="wide"
            caption="Room for a product overview image, hero video, or interface walkthrough."
          />
        </div>
      </section>

      {/* Journeys */}
      <section
        id="choose-journey"
        data-explore-section="choose-journey"
        data-explore-region="journeys"
        className="scroll-mt-[5.5rem] mb-12 border-b border-neutral-200/80 pb-12 sm:mb-16 sm:pb-14 lg:mb-20 lg:pb-16 dark:border-neutral-800"
      >
        <h2 className="text-balance text-xl font-bold text-bizzi-navy sm:text-2xl md:text-3xl dark:text-sky-50">
          Choose your journey
        </h2>
        <p className="mt-2 max-w-3xl text-[0.9375rem] leading-relaxed text-neutral-600 sm:text-base dark:text-neutral-300">
          Pick a path that matches how you work. Each step jumps to a section on this page—follow in order or
          hop around anytime.
        </p>
        <div className="mt-6 grid grid-cols-1 gap-4 sm:mt-8 sm:grid-cols-2 xl:grid-cols-3">
          {EXPLORE_JOURNEYS.map((j) => (
            <article
              key={j.id}
              data-explore-journey={j.id}
              className="flex flex-col rounded-2xl border border-neutral-200/90 bg-white/80 p-5 shadow-sm dark:border-neutral-700 dark:bg-neutral-900/50"
            >
              <h3 className="text-lg font-semibold text-bizzi-navy dark:text-sky-100">{j.title}</h3>
              <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">{j.description}</p>
              <ol className="mt-4 flex flex-1 flex-col gap-2 text-sm">
                {j.sectionIds.map((sid, i) => (
                  <li key={sid} className="flex items-start gap-2">
                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-bizzi-sky text-xs font-bold text-bizzi-navy dark:bg-neutral-800 dark:text-sky-200">
                      {i + 1}
                    </span>
                    <a
                      href={`#${sid}`}
                      className="font-medium text-bizzi-blue hover:underline dark:text-bizzi-cyan"
                      data-explore-action="journey-step"
                      data-explore-target={sid}
                      data-explore-journey={j.id}
                    >
                      {exploreNavLabelForId(sid)}
                    </a>
                  </li>
                ))}
              </ol>
            </article>
          ))}
        </div>
        <footer className="mt-8 rounded-xl border border-neutral-200/80 bg-bizzi-sky/30 p-4 text-sm text-neutral-700 dark:border-neutral-700 dark:bg-neutral-800/40 dark:text-neutral-200">
          <strong className="text-bizzi-navy dark:text-sky-100">Tip:</strong> Use{" "}
          <kbd className="rounded bg-white/80 px-1 font-mono text-xs dark:bg-neutral-900">⌘K</kbd> /{" "}
          <kbd className="rounded bg-white/80 px-1 font-mono text-xs dark:bg-neutral-900">Ctrl+K</kbd> anytime to
          search sections by plain words like <em>cache</em>, <em>proofing</em>, or <em>mount</em>.
        </footer>
      </section>

      <ExploreSectionFrame
        id="what-is-bizzi"
        title="What Bizzi Cloud is"
        summary="Bizzi Cloud is cloud storage and a creative workflow platform in one. It is built for large media—video, photo, production assets—and for how real teams review, edit, and ship work."
        visual={
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
            {[
              {
                t: "Cloud home for media",
                d: "Footage, stills, project files, and delivery packages live in organized workspaces—not scattered drives.",
              },
              {
                t: "Editing-aware",
                d: "Access feels like a creative drive: open what you need, work with lightweight previews first, finish in full quality.",
              },
              {
                t: "Client-ready",
                d: "Proof in galleries, hand off with transfers—review and delivery are first-class, not an afterthought.",
              },
            ].map((c) => (
              <div
                key={c.t}
                className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-700 dark:bg-neutral-900/60"
              >
                <h3 className="font-semibold text-bizzi-navy dark:text-sky-100">{c.t}</h3>
                <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">{c.d}</p>
              </div>
            ))}
          </div>
        }
        takeaway={
          <p>
            Bizzi is not “files in a folder online.” It is a connected system: storage, creative access, review,
            and delivery—thought through for creators.
          </p>
        }
      >
        <p>
          If you have only used generic cloud tools, you might expect uploads, sharing links, and little else.
          Bizzi starts from a different question:{" "}
          <strong>how do photographers, editors, and production teams actually move from ingest to final handoff?</strong>{" "}
          That is why workspaces, previews, galleries, and transfers sit on the same platform.
        </p>
        <p>
          You can think of Bizzi as the place your active projects live in the cloud—where your team finds the
          right version, clients leave clear feedback, and nothing important is stuck on a single laptop.
        </p>
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          Learn how this differs from generic storage in{" "}
          <a href="#how-its-different" className="font-medium text-bizzi-blue underline dark:text-bizzi-cyan">
            How Bizzi is different
          </a>{" "}
          and walk the setup in{" "}
          <a href="#getting-started" className="font-medium text-bizzi-blue underline dark:text-bizzi-cyan">
            Getting started
          </a>
          .
        </p>
      </ExploreSectionFrame>

      <ExploreSectionFrame
        id="how-its-different"
        title="How Bizzi is different from generic cloud storage"
        summary="Generic cloud tools optimize for documents and light sharing. Bizzi optimizes for creative media—big files, repeated playback, proofing, and team coordination."
        visual={
          <div className="-mx-1 overflow-x-auto overscroll-x-contain touch-pan-x rounded-2xl border border-neutral-200 px-1 sm:mx-0 sm:px-0 dark:border-neutral-700">
            <table className="w-full min-w-[520px] text-left text-xs sm:text-sm">
              <caption className="sr-only">
                Comparison of generic cloud storage and Bizzi Cloud for creative workflows
              </caption>
              <thead className="bg-neutral-50 dark:bg-neutral-900/80">
                <tr>
                  <th className="px-2 py-2.5 font-semibold text-neutral-900 sm:px-4 sm:py-3 dark:text-white">
                    Topic
                  </th>
                  <th className="px-2 py-2.5 font-semibold text-neutral-700 sm:px-4 sm:py-3 dark:text-neutral-300">
                    Typical cloud storage
                  </th>
                  <th className="px-2 py-2.5 font-semibold text-bizzi-navy sm:px-4 sm:py-3 dark:text-sky-100">
                    Bizzi Cloud
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 dark:divide-neutral-700">
                <tr>
                  <td className="px-2 py-2.5 font-medium sm:px-4 sm:py-3">Primary job</td>
                  <td className="px-2 py-2.5 text-neutral-600 sm:px-4 sm:py-3 dark:text-neutral-400">
                    Store and link files
                  </td>
                  <td className="px-2 py-2.5 text-neutral-700 sm:px-4 sm:py-3 dark:text-neutral-300">
                    Store, review, edit-access, and deliver creative work
                  </td>
                </tr>
                <tr>
                  <td className="px-2 py-2.5 font-medium sm:px-4 sm:py-3">Organization</td>
                  <td className="px-2 py-2.5 text-neutral-600 sm:px-4 sm:py-3 dark:text-neutral-400">
                    Folders you manage yourself
                  </td>
                  <td className="px-2 py-2.5 text-neutral-700 sm:px-4 sm:py-3 dark:text-neutral-300">
                    Workspaces tuned for brands, clients, and projects
                  </td>
                </tr>
                <tr>
                  <td className="px-2 py-2.5 font-medium sm:px-4 sm:py-3">Editing</td>
                  <td className="px-2 py-2.5 text-neutral-600 sm:px-4 sm:py-3 dark:text-neutral-400">
                    Download first, often manual
                  </td>
                  <td className="px-2 py-2.5 text-neutral-700 sm:px-4 sm:py-3 dark:text-neutral-300">
                    Lightweight previews, stream cache, mount-style access
                  </td>
                </tr>
                <tr>
                  <td className="px-2 py-2.5 font-medium sm:px-4 sm:py-3">Clients</td>
                  <td className="px-2 py-2.5 text-neutral-600 sm:px-4 sm:py-3 dark:text-neutral-400">
                    Generic download links
                  </td>
                  <td className="px-2 py-2.5 text-neutral-700 sm:px-4 sm:py-3 dark:text-neutral-300">
                    Galleries for proofing + transfers for delivery
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        }
      >
        <p>
          Generic tools are fine for PDFs and light assets. Creative workflows need repeated access to huge files,
          clear review loops, and predictable handoff. Bizzi connects those dots instead of leaving you to glue ten
          tools together.
        </p>
      </ExploreSectionFrame>

      <ExploreSectionFrame
        id="what-bizzi-is-not"
        title="What Bizzi is not"
        summary="A quick clarity check—so expectations match how the platform is designed."
        visual={
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              "Not just a generic file dump—organization and creative workflows matter.",
              "Not only a simple sync folder—Bizzi is built for media access and review, not only mirroring files.",
              "Not a one-time transfer tool—you can live in Bizzi across projects and teams.",
              "Not only a client gallery—delivery, collaboration, and editing workflows are part of the same system.",
            ].map((text) => (
              <div
                key={text}
                className="rounded-xl border border-amber-200/80 bg-amber-50/80 px-4 py-3 text-sm text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100"
              >
                {text}
              </div>
            ))}
          </div>
        }
      >
        <p>
          If you are comparing tools, use the sections on{" "}
          <a href="#galleries-proofing" className="text-bizzi-blue underline dark:text-bizzi-cyan">
            galleries
          </a>
          ,{" "}
          <a href="#transfers-delivery" className="text-bizzi-blue underline dark:text-bizzi-cyan">
            transfers
          </a>
          , and{" "}
          <a href="#mount-vs-local" className="text-bizzi-blue underline dark:text-bizzi-cyan">
            mount-style access
          </a>{" "}
          to see how pieces fit.
        </p>
      </ExploreSectionFrame>

      <ExploreSectionFrame
        id="getting-started"
        title="Getting started"
        summary="A simple path from empty workspace to delivered work—no jargon, just the order of operations most teams follow."
        visual={
          <ol className="space-y-3">
            {[
              "Create your workspace (personal or team).",
              "Upload or import media into clear folder structure.",
              "Organize by client, project, or brand—consistency beats perfection.",
              "Preview and review files—thumbnails and lightweight playback first.",
              "Share work: internal collaborators in the workspace; clients via galleries or transfers.",
              "Edit using Bizzi-friendly workflows—mount-style access and stream cache when you need speed.",
              "Deliver finals with transfers; archive or expand storage as you grow.",
            ].map((step, i) => (
              <li
                key={step}
                className="flex gap-3 rounded-xl border border-neutral-200 bg-white p-3 sm:p-4 dark:border-neutral-700 dark:bg-neutral-900/50"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-bizzi-blue text-sm font-bold text-white">
                  {i + 1}
                </span>
                <span className="text-neutral-800 dark:text-neutral-200">{step}</span>
              </li>
            ))}
          </ol>
        }
        takeaway={<p>When in doubt, optimize for “can everyone find the right file next week?”—not only today.</p>}
      >
        <p>
          You do not need every feature on day one. Most creators start with structure, uploads, and one client
          review flow—then layer editing performance and team habits as projects grow.
        </p>
      </ExploreSectionFrame>

      {/* Who it's for — role cards + subsections */}
      <section
        id="who-its-for"
        data-explore-section="who-its-for"
        data-explore-region="who-its-for"
        className="scroll-mt-[5.5rem] mb-12 border-b border-neutral-200/80 pb-12 sm:mb-16 sm:pb-14 lg:mb-20 lg:pb-16 dark:border-neutral-800"
      >
        <h2 className="text-balance text-xl font-bold text-bizzi-navy sm:text-2xl md:text-3xl dark:text-sky-50">
          Who Bizzi is for
        </h2>
        <p className="mt-2 max-w-3xl text-[0.9375rem] leading-relaxed text-neutral-600 sm:text-base dark:text-neutral-300">
          The same platform supports different creative roles—here is how each typically benefits.
        </p>
        <div className="mt-6 grid grid-cols-1 gap-3 sm:mt-8 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
          {[
            {
              id: "who-solo",
              title: "Solo creators",
              body: "One workspace for every project: ingest, organize, proof, and deliver without juggling five services.",
            },
            {
              id: "who-freelance",
              title: "Freelance editors",
              body: "Fast access to active projects, lightweight previews for cutting, and clean delivery when the job wraps.",
            },
            {
              id: "who-photo",
              title: "Photographers",
              body: "Galleries for selects and proofing, branding for client trust, and transfers when files need to leave the cloud.",
            },
            {
              id: "who-video",
              title: "Videographers",
              body: "Large footage, repeatable playback, and workflows that respect how NLEs actually pull media.",
            },
            {
              id: "who-production",
              title: "Production teams",
              body: "Shared workspaces, coordinated folders, and review flows that keep producers and post aligned.",
            },
            {
              id: "who-agency",
              title: "Creative agencies",
              body: "Multi-client organization, team roles, and polished client experiences without exposing your whole drive.",
            },
            {
              id: "who-studio",
              title: "Studios",
              body: "Scale storage, standardize delivery, and keep long-term libraries searchable and accessible.",
            },
          ].map((role) => (
            <article
              key={role.id}
              id={role.id}
              className="scroll-mt-[5.5rem] rounded-2xl border border-neutral-200 bg-white p-4 sm:p-5 dark:border-neutral-700 dark:bg-neutral-900/50"
            >
              <h3 className="font-semibold text-bizzi-navy dark:text-sky-100">{role.title}</h3>
              <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">{role.body}</p>
            </article>
          ))}
        </div>
        <footer
          className="mt-8 rounded-2xl border border-neutral-200/90 bg-white/60 p-3 sm:mt-10 sm:p-4 dark:border-neutral-700 dark:bg-neutral-900/40"
          data-explore-region="related-topics"
        >
          <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Related topics</p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {["workspaces", "performance-modes", "workflow-examples"].map((rid) => (
              <li key={rid}>
                <a
                  href={`#${rid}`}
                  className="inline-flex min-h-[44px] items-center rounded-full border border-neutral-200 bg-white px-3 py-2 text-sm font-medium text-bizzi-navy hover:border-bizzi-blue/50 sm:min-h-0 sm:py-1.5 dark:border-neutral-600 dark:bg-neutral-800 dark:text-sky-100"
                  data-explore-action="related-topic"
                  data-explore-target={rid}
                >
                  {exploreNavLabelForId(rid)}
                </a>
              </li>
            ))}
          </ul>
        </footer>
      </section>

      <ExploreSectionFrame
        id="workspaces"
        title="Workspaces"
        summary="A workspace is your creative home in Bizzi—where files, galleries, and delivery belong to a clear context: you, your team, or your client work."
        visual={<ExploreMediaPlaceholder caption="Placeholder: workspace switcher and folder overview." />}
        takeaway={
          <p>
            Name workspaces so newcomers understand them in five seconds: brand name, client, or team—not vague
            abbreviations only you know.
          </p>
        }
      >
        <p>
          Personal workspaces suit individual creators. Team-style workspaces help agencies and studios separate
          internal work from client-facing delivery while keeping everyone in the same system.
        </p>
        <p>
          Most teams organize by <strong>brand → project → phase</strong> or <strong>client → job → deliverables</strong>.
          However you slice it, consistency matters more than any “perfect” taxonomy.
        </p>
      </ExploreSectionFrame>

      <ExploreSectionFrame
        id="storage-organization"
        title="Storage and file organization"
        summary="Creative libraries only stay useful when structure matches how people search—not how a drive defaulted on day one."
        visual={
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-green-200/80 bg-green-50/60 p-4 dark:border-green-900/40 dark:bg-green-950/20">
              <p className="text-xs font-bold uppercase text-green-800 dark:text-green-200">Do</p>
              <ul className="mt-2 space-y-1 text-sm text-green-900 dark:text-green-100">
                <li>Separate raw, working, and delivery folders.</li>
                <li>Align folder names with how your NLE or photo app thinks about projects.</li>
                <li>Keep client-specific assets under that client.</li>
              </ul>
            </div>
            <div className="rounded-2xl border border-red-200/80 bg-red-50/60 p-4 dark:border-red-900/40 dark:bg-red-950/20">
              <p className="text-xs font-bold uppercase text-red-800 dark:text-red-200">Avoid</p>
              <ul className="mt-2 space-y-1 text-sm text-red-900 dark:text-red-100">
                <li>One giant “misc” bucket for everything.</li>
                <li>Copying the same files into three places “just in case.”</li>
                <li>Cryptic abbreviations that new editors cannot decode.</li>
              </ul>
            </div>
          </div>
        }
      >
        <p>
          Bizzi holds footage, photos, audio, graphics, and documents together—so think in terms of production
          phases and handoff points, not only file types.
        </p>
      </ExploreSectionFrame>

      <ExploreSectionFrame
        id="uploads-imports"
        title="Uploads and imports"
        summary="Bring media in with drag-and-drop uploads and cloud-side imports. The goal is simple: get to a trusted master library fast."
        visual={
          <div className="rounded-2xl border border-neutral-200 bg-gradient-to-r from-bizzi-sky/50 to-white p-6 dark:border-neutral-700 dark:from-neutral-900 dark:to-neutral-900/40">
            <p className="text-sm font-semibold text-bizzi-navy dark:text-sky-100">Coming soon: camera card convenience</p>
            <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
              A premium workflow many creators want: insert a card, import with clear naming, and let the cloud
              become the system of record—without slow manual babysitting. Watch this space as Bizzi expands ingest
              options.
            </p>
          </div>
        }
      >
        <p>
          Whether you are moving a day’s shoot or migrating an old drive, aim for predictable folder targets and
          consistent naming—your future self (and your editor) will thank you.
        </p>
        <p>
          Pair uploads with{" "}
          <a href="#storage-organization" className="text-bizzi-blue underline dark:text-bizzi-cyan">
            organization habits
          </a>{" "}
          and the{" "}
          <a href="#workflow-examples" className="text-bizzi-blue underline dark:text-bizzi-cyan">
            workflow examples
          </a>{" "}
          at the end of this page.
        </p>
      </ExploreSectionFrame>

      <ExploreSectionFrame
        id="mount-vs-local"
        title="Mount-style access vs storing locally"
        summary="Two valid ways to work: keep media primarily in the cloud and open on demand, or keep full copies on disk for offline and maximum responsiveness."
        visual={
          <div className="grid gap-4 lg:grid-cols-2">
            <VsColumn
              accent="left"
              title="Mount-style access"
              subtitle="Feels like a virtual creative drive."
              bullets={[
                "Files live in the cloud; you open what you need when you need it.",
                "Great for large libraries you cannot fit on one machine.",
                "Pairs well with stream cache for active work.",
              ]}
            />
            <VsColumn
              accent="right"
              title="Store locally (sync-style)"
              subtitle="Full copies on your machine."
              bullets={[
                "Best when offline work is non-negotiable.",
                "Helpful on location with unreliable internet.",
                "Uses disk space—plan folders and retention deliberately.",
              ]}
            />
          </div>
        }
        takeaway={
          <p>
            Many teams mix both: cloud breadth for the whole library, local storage for the current job’s heavy lift.
          </p>
        }
      >
        <p>
          If you have ever wished your cloud felt like plugging in a fast SSD, that is the idea behind mount-style
          access—without pretending that internet conditions do not exist. When travel or offline dominates, local
          storage wins; when collaboration and breadth dominate, cloud-first wins.
        </p>
        <p className="text-sm">
          Next: how Bizzi keeps active sessions snappy in{" "}
          <a href="#stream-cache" className="font-medium text-bizzi-blue underline dark:text-bizzi-cyan">
            Stream cache & speed
          </a>
          .
        </p>
      </ExploreSectionFrame>

      <ExploreSectionFrame
        id="stream-cache"
        title="Stream cache and speed"
        summary="Stream cache is a local speed layer: recently used footage stays ready so playback and scrubbing feel responsive during real editing sessions."
        visual={
          <div className="space-y-4">
            <div className="rounded-2xl border border-bizzi-blue/25 bg-bizzi-sky/40 p-5 dark:border-bizzi-cyan/20 dark:bg-neutral-800/60">
              <p className="text-sm font-semibold text-bizzi-navy dark:text-sky-100">Think in three sizes</p>
              <ul className="mt-3 grid gap-3 sm:grid-cols-3 text-sm text-neutral-700 dark:text-neutral-300">
                <li>
                  <strong>Smaller cache</strong> — light laptop, short jobs, mostly photos or short clips.
                </li>
                <li>
                  <strong>Medium cache</strong> — typical editing week, mixed footage, repeated timeline access.
                </li>
                <li>
                  <strong>Larger cache</strong> — heavy video, long sessions, lots of back-and-forth in the same
                  project.
                </li>
              </ul>
            </div>
            <ExploreMediaPlaceholder caption="Placeholder: simple diagram of cloud library → local cache → your editor." />
          </div>
        }
        takeaway={
          <p>
            Cache is about <em>recently touched</em> work feeling fast—not about downloading your entire library up
            front.
          </p>
        }
      >
        <p>
          Editors notice cache most during active sessions: you loop the same selects, revise the same cuts, and
          scrub the same moments. Stream cache is there to make that repetition feel smooth.
        </p>
      </ExploreSectionFrame>

      <ExploreSectionFrame
        id="editing-speed"
        title="Editing speed and lightweight previews"
        summary="You can work faster when your timeline starts with responsive previews, then moves to full-quality files for finishing—without confusing your collaborators with duplicate assets everywhere."
        visual={
          <div className="rounded-2xl border border-neutral-200 bg-white p-5 dark:border-neutral-700 dark:bg-neutral-900/50">
            <p className="text-sm font-semibold text-bizzi-navy dark:text-sky-100">Plain-language pipeline</p>
            <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-neutral-700 dark:text-neutral-300">
              <li>Preview and rough cut with lightweight, responsive media.</li>
              <li>Lock creative decisions before you lean on full-resolution files.</li>
              <li>Finish and export with full quality when the edit is stable.</li>
            </ol>
          </div>
        }
      >
        <p>
          This is the “fast feels first, quality finishes last” mindset that modern post often needs—especially when
          editors are remote or storage is massive.
        </p>
      </ExploreSectionFrame>

      <ExploreSectionFrame
        id="bizzi-editor"
        title="Bizzi Editor"
        summary="Bizzi’s editor experience is built around creative speed: getting to the right media, staying in flow, and avoiding unnecessary downloads."
        visual={<ExploreMediaPlaceholder caption="Placeholder: Bizzi Editor interface preview." />}
      >
        <p>
          Expect media access, smart previews, and editing convenience to work together—so you spend time on story
          and picture, not on babysitting file paths. Pair this with{" "}
          <a href="#mount-vs-local" className="text-bizzi-blue underline dark:text-bizzi-cyan">
            mount-style access
          </a>{" "}
          and{" "}
          <a href="#stream-cache" className="text-bizzi-blue underline dark:text-bizzi-cyan">
            stream cache
          </a>{" "}
          when projects get heavy.
        </p>
      </ExploreSectionFrame>

      <ExploreSectionFrame
        id="galleries-proofing"
        title="Galleries and proofing"
        summary="Clients review photos and videos in a focused gallery experience—favorites, selects, and clear feedback—separate from simply downloading finals."
        visual={
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-neutral-200 p-4 dark:border-neutral-700">
              <p className="text-xs font-bold uppercase text-neutral-500">Review</p>
              <p className="mt-2 text-sm text-neutral-700 dark:text-neutral-300">
                Pick winners, shortlist options, and communicate taste before anyone pulls pixels unnecessarily.
              </p>
            </div>
            <div className="rounded-xl border border-neutral-200 p-4 dark:border-neutral-700">
              <p className="text-xs font-bold uppercase text-neutral-500">Delivery</p>
              <p className="mt-2 text-sm text-neutral-700 dark:text-neutral-300">
                When it is time to hand off masters, use transfers for packaged delivery—see the next section.
              </p>
            </div>
          </div>
        }
      >
        <p>
          Proofing is a creative decision phase. Delivery is a logistics phase. Bizzi keeps both strong so you are
          not forced to mix them into one messy link.
        </p>
      </ExploreSectionFrame>

      <ExploreSectionFrame
        id="transfers-delivery"
        title="Instant transfers and delivery"
        summary="Transfers package large deliveries for clients: structured links, optional protections, and a better experience than random ad-hoc downloads."
        visual={
          <ul className="space-y-2 rounded-2xl border border-neutral-200 bg-neutral-50/80 p-5 text-sm dark:border-neutral-700 dark:bg-neutral-900/50">
            <li>✓ Branded, intentional handoff—not “here is a giant zip and good luck.”</li>
            <li>✓ Works alongside galleries: review first, deliver next.</li>
            <li>✓ Scales with teams that send many deliveries per month.</li>
          </ul>
        }
      >
        <p>
          If you have ever lost a client in a confusing download flow, you already know why structured delivery
          matters as much as storage size.
        </p>
      </ExploreSectionFrame>

      <ExploreSectionFrame
        id="teams-collaboration"
        title="Teams and collaboration"
        summary="Invite collaborators, share workspaces, and coordinate roles so agencies and studios can run production without chaos."
        visual={
          <div className="rounded-2xl border border-neutral-200 bg-white p-5 dark:border-neutral-700 dark:bg-neutral-900/50">
            <p className="text-sm text-neutral-700 dark:text-neutral-300">
              Shared assets, review workflows, and workspace boundaries help teams stay aligned—especially when
              producers, editors, and clients each need different visibility.
            </p>
          </div>
        }
      >
        <p>
          Position Bizzi as the shared creative system of record—not a pile of personal drives with conflicting
          copies. Start from{" "}
          <a href="#workspaces" className="text-bizzi-blue underline dark:text-bizzi-cyan">
            workspaces
          </a>
          , then tighten habits in{" "}
          <a href="#performance-modes" className="text-bizzi-blue underline dark:text-bizzi-cyan">
            performance modes
          </a>
          .
        </p>
      </ExploreSectionFrame>

      <ExploreSectionFrame
        id="performance-modes"
        title="Performance modes and workflow recommendations"
        summary="Pick a playbook that matches how and where you work—then adjust cache, local storage, and collaboration habits."
        visual={
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {[
              { t: "Fast remote editing", d: "Emphasize stream cache + mount-style access; keep project folders tight." },
              { t: "Travel and offline prep", d: "Store key projects locally; resync when you are back on solid internet." },
              { t: "Agency collaboration", d: "Shared workspaces, clear client folders, galleries for review." },
              { t: "Large client deliveries", d: "Transfers for packages; galleries for approvals beforehand." },
              { t: "Photographer proofing", d: "Galleries first; transfers for finals and add-on purchases." },
              { t: "Production houses", d: "Scale storage deliberately; standardize naming and archive policy." },
            ].map((x) => (
              <div key={x.t} className="rounded-xl border border-neutral-200 bg-bizzi-sky/30 p-4 dark:border-neutral-700 dark:bg-neutral-800/40">
                <p className="font-semibold text-bizzi-navy dark:text-sky-100">{x.t}</p>
                <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">{x.d}</p>
              </div>
            ))}
          </div>
        }
      >
        <p>
          These are starting points, not rules—mix and match as your roster of clients and projects changes.
        </p>
      </ExploreSectionFrame>

      <ExploreSectionFrame
        id="pricing-growth"
        title="Pricing logic and storage growth"
        summary="Bizzi scales with you: add storage as libraries grow, and treat upgrades as part of production planning—not an emergency."
        visual={
          <div className="rounded-2xl border border-dashed border-neutral-300 bg-white/60 p-6 text-center text-sm text-neutral-600 dark:border-neutral-600 dark:bg-neutral-900/40 dark:text-neutral-400">
            No heavy pricing table here—focus on planning headroom for active projects and archive strategy for
            completed work.
          </div>
        }
      >
        <p>
          Creative businesses rarely shrink their libraries year over year. The goal is predictable growth: align
          workspace structure and delivery habits early so storage decisions feel boring instead of frantic.
        </p>
        <p>
          Revisit{" "}
          <a href="#workspaces" className="text-bizzi-blue underline dark:text-bizzi-cyan">
            workspaces
          </a>{" "}
          and{" "}
          <a href="#getting-started" className="text-bizzi-blue underline dark:text-bizzi-cyan">
            getting started
          </a>{" "}
          when you rethink how your team charges for storage and delivery.
        </p>
      </ExploreSectionFrame>

      <ExploreSectionFrame
        id="workflow-examples"
        title="Suggested workflows"
        summary="Visual journeys you can copy—adapt names and folders to your team."
        visual={
          <div className="space-y-8">
            {[
              {
                name: "Solo creator",
                steps: ["Ingest", "Organize", "Edit with previews", "Proof in gallery", "Deliver with transfer"],
              },
              {
                name: "Client gallery workflow",
                steps: ["Upload selects", "Share gallery", "Collect favorites", "Finalize", "Deliver masters"],
              },
              {
                name: "Team production",
                steps: ["Shared workspace", "Role clarity", "Internal review", "Client gallery", "Archive"],
              },
              {
                name: "Remote editor",
                steps: ["Mount-style access", "Stream cache on", "Rough cut", "Online finishing", "Package delivery"],
              },
              {
                name: "Travel prep",
                steps: ["Pin local copies", "Work offline", "Sync on return", "Hand off via transfer"],
              },
              {
                name: "Camera card to cloud",
                steps: ["Ingest cards", "Verify backups", "Organize by shoot day", "Share proofs", "Archive"],
              },
            ].map((wf) => (
              <div key={wf.name}>
                <p className="text-sm font-semibold text-bizzi-navy dark:text-sky-100">{wf.name}</p>
                <div className="mt-2 flex flex-col gap-2 text-xs text-neutral-600 sm:flex-row sm:flex-wrap sm:items-center dark:text-neutral-400">
                  {wf.steps.map((s, i) => (
                    <span key={`${wf.name}-${i}-${s}`} className="flex flex-wrap items-center gap-2">
                      {i > 0 ? (
                        <span aria-hidden className="hidden text-neutral-400 sm:inline">
                          →
                        </span>
                      ) : null}
                      <span className="inline-flex rounded-full bg-neutral-100 px-2.5 py-1.5 dark:bg-neutral-800">
                        {s}
                      </span>
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        }
      >
        <p>
          Use these as templates—swap steps where your client or studio already has a ritual that works.
        </p>
      </ExploreSectionFrame>

      {/* FAQ */}
      <section
        id="faq"
        data-explore-section="faq"
        data-explore-region="faq"
        className="scroll-mt-[5.5rem] mb-12 border-b border-neutral-200/80 pb-12 sm:mb-16 sm:pb-14 lg:mb-20 lg:pb-16 dark:border-neutral-800"
      >
        <h2 className="text-balance text-xl font-bold text-bizzi-navy sm:text-2xl md:text-3xl dark:text-sky-50">FAQ</h2>
        <p className="mt-2 text-[0.9375rem] text-neutral-600 sm:text-base dark:text-neutral-300">
          Straight answers to questions creators ask before they commit to a new workflow.
        </p>
        <div className="mt-8 space-y-3">
          {EXPLORE_FAQ.map((item) => (
            <details
              key={item.id}
              className="group rounded-xl border border-neutral-200 bg-white open:shadow-md dark:border-neutral-700 dark:bg-neutral-900/60"
              data-explore-faq-item={item.id}
            >
              <summary className="flex min-h-[52px] cursor-pointer list-none items-center px-4 py-3 font-medium text-bizzi-navy dark:text-sky-100 sm:min-h-0 sm:px-6 sm:py-4 [&::-webkit-details-marker]:hidden">
                <span className="flex w-full items-start justify-between gap-3 sm:items-center">
                  <span className="text-left">{item.question}</span>
                  <span className="text-neutral-400 transition group-open:rotate-45">+</span>
                </span>
              </summary>
              <div className="border-t border-neutral-100 px-4 pb-4 pt-0 text-sm leading-relaxed text-neutral-600 dark:border-neutral-800 dark:text-neutral-300 sm:px-6">
                <p>{item.answer}</p>
              </div>
            </details>
          ))}
        </div>
        <footer
          className="mt-10 rounded-2xl border border-neutral-200/90 bg-white/60 p-4 dark:border-neutral-700 dark:bg-neutral-900/40"
          data-explore-region="related-topics"
        >
          <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Related topics</p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {["explore-cta", "what-is-bizzi", "getting-started"].map((rid) => (
              <li key={rid}>
                <a
                  href={`#${rid}`}
                  className="inline-flex min-h-[44px] items-center rounded-full border border-neutral-200 bg-white px-3 py-2 text-sm font-medium text-bizzi-navy hover:border-bizzi-blue/50 sm:min-h-0 sm:py-1.5 dark:border-neutral-600 dark:bg-neutral-800 dark:text-sky-100"
                  data-explore-action="related-topic"
                  data-explore-target={rid}
                >
                  {exploreNavLabelForId(rid)}
                </a>
              </li>
            ))}
          </ul>
        </footer>
      </section>

      {/* Final CTA */}
      <section
        id="explore-cta"
        data-explore-section="explore-cta"
        data-explore-region="final-cta"
        className="scroll-mt-[5.5rem] rounded-2xl border border-bizzi-blue/20 bg-gradient-to-br from-bizzi-sky/80 via-white to-white p-5 sm:rounded-3xl sm:p-8 dark:border-bizzi-cyan/20 dark:from-neutral-900 dark:via-neutral-900 dark:to-neutral-950"
      >
        <h2 className="text-balance text-xl font-bold text-bizzi-navy sm:text-2xl dark:text-sky-50">
          Ready to work in Bizzi?
        </h2>
        <p className="mt-2 max-w-2xl text-[0.9375rem] text-neutral-600 sm:text-base dark:text-neutral-300">
          You have the map—next step is your workspace. Sign in, join the waitlist, or grab the desktop app when
          you are ready to go deeper than storage alone.
        </p>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-3">
          <Link
            href="/login"
            className="inline-flex min-h-[48px] w-full items-center justify-center rounded-full bg-bizzi-blue px-5 py-3 text-sm font-semibold text-white hover:bg-bizzi-cyan sm:w-auto sm:min-h-[44px]"
            data-explore-action="cta-sign-in"
          >
            Sign in
          </Link>
          <Link
            href="/waitlist"
            className="inline-flex min-h-[48px] w-full items-center justify-center rounded-full border border-neutral-300 bg-white px-5 py-3 text-sm font-semibold text-neutral-900 hover:border-bizzi-blue/50 dark:border-neutral-600 dark:bg-neutral-900 dark:text-white sm:w-auto sm:min-h-[44px]"
            data-explore-action="cta-waitlist"
          >
            Join waitlist
          </Link>
          <Link
            href="/desktop"
            className="inline-flex min-h-[48px] w-full items-center justify-center rounded-full border border-neutral-300 bg-white px-5 py-3 text-sm font-semibold text-neutral-900 hover:border-bizzi-blue/50 dark:border-neutral-600 dark:bg-neutral-900 dark:text-white sm:w-auto sm:min-h-[44px]"
            data-explore-action="cta-desktop"
          >
            Desktop app
          </Link>
        </div>
        <p className="mt-6 text-xs text-neutral-500 dark:text-neutral-400">
          <a href="#explore-hero" className="underline" data-explore-action="back-to-top" data-explore-target="explore-hero">
            Back to top
          </a>{" "}
          ·{" "}
          <Link href="/" className="underline" data-explore-action="cta-home">
            Bizzi Cloud home
          </Link>
        </p>
      </section>
    </>
  );
}
