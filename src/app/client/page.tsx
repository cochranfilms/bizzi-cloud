"use client";

import { Suspense, useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import BizziLogoMark from "@/components/BizziLogoMark";
import { Images, Loader2, Mail } from "lucide-react";
import { useGalleryThumbnail } from "@/hooks/useGalleryThumbnail";
import { useInView } from "@/hooks/useInView";

interface ClientGallery {
  id: string;
  title: string;
  slug: string;
  cover_object_key: string | null;
  cover_name: string | null;
  description: string | null;
  event_date: string | null;
  branding: { business_name?: string | null; logo_url?: string | null };
  created_at: string | null;
}

function formatDate(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function GalleryCard({ gallery }: { gallery: ClientGallery }) {
  const [cardRef, isInView] = useInView<HTMLDivElement>();
  const { url: thumbUrl } = useGalleryThumbnail(
    gallery.cover_object_key ? gallery.id : undefined,
    gallery.cover_object_key ?? undefined,
    gallery.cover_name ?? "",
    { enabled: !!gallery.cover_object_key && isInView, size: "cover-sm", useCredentials: true }
  );

  return (
    <div ref={cardRef}>
    <Link
      href={`/g/${gallery.id}`}
      className="group flex flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white transition-colors hover:border-bizzi-blue/40 hover:shadow-md dark:border-neutral-700 dark:bg-neutral-900 dark:hover:border-bizzi-cyan/40"
    >
      <div className="relative flex aspect-video shrink-0 items-center justify-center overflow-hidden rounded-t-xl bg-neutral-100 dark:bg-neutral-800">
        {thumbUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={thumbUrl}
            alt=""
            className="h-full w-full object-cover transition-transform group-hover:scale-105"
          />
        ) : (
          <Images className="h-12 w-12 text-neutral-300 dark:text-neutral-600" />
        )}
      </div>
      <div className="flex flex-1 flex-col p-4">
        {gallery.event_date && (
          <p className="mb-1 text-xs font-medium uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
            {formatDate(gallery.event_date)}
          </p>
        )}
        <h3 className="truncate font-medium text-neutral-900 dark:text-white">
          {gallery.title}
        </h3>
        {gallery.description && (
          <p className="mt-1 line-clamp-2 text-sm text-neutral-500 dark:text-neutral-400">
            {gallery.description}
          </p>
        )}
      </div>
    </Link>
    </div>
  );
}

function ClientPortalContent() {
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirect");
  const [galleries, setGalleries] = useState<ClientGallery[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [needsEmail, setNeedsEmail] = useState(false);
  const [email, setEmail] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [accessDenied, setAccessDenied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      setNeedsEmail(false);
      setAccessDenied(false);
      try {
        const res = await fetch("/api/client/galleries", {
          credentials: "include",
        });
        if (cancelled) return;
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          if (res.status === 401 && data.error === "needs_email") {
            setNeedsEmail(true);
            return;
          }
          setError(data.message ?? data.error ?? `Failed to load (${res.status})`);
          return;
        }
        setGalleries(data.galleries ?? []);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleVerifyEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) return;
    setVerifying(true);
    setAccessDenied(false);
    setError(null);
    try {
      const res = await fetch("/api/client/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed }),
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 403) {
          setAccessDenied(true);
          return;
        }
        setError(data.message ?? data.error ?? "Verification failed");
        return;
      }
      setNeedsEmail(false);
      setAccessDenied(false);
      if (redirectTo && redirectTo.startsWith("/")) {
        window.location.href = redirectTo;
      } else {
        window.location.reload();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed");
    } finally {
      setVerifying(false);
    }
  };

  if (loading && !needsEmail) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-neutral-50 p-6 dark:bg-neutral-950">
        <Loader2 className="h-10 w-10 animate-spin text-bizzi-blue" />
        <p className="mt-4 text-sm text-neutral-500 dark:text-neutral-400">
          Loading galleries…
        </p>
      </div>
    );
  }

  if (needsEmail) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-neutral-50 p-6 dark:bg-neutral-950">
        <div className="w-full max-w-sm space-y-6 rounded-xl border border-neutral-200 bg-white p-8 shadow-lg dark:border-neutral-700 dark:bg-neutral-900">
          <div className="flex flex-col items-center gap-2">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-bizzi-blue/10 text-bizzi-blue dark:bg-bizzi-blue/20">
              <Mail className="h-7 w-7" />
            </div>
            <h1 className="text-lg font-semibold text-neutral-900 dark:text-white">
              Enter your guest email
            </h1>
            <p className="text-center text-sm text-neutral-500 dark:text-neutral-400">
              Enter the email your photographer shared the gallery with. No account required.
            </p>
          </div>
          <form onSubmit={handleVerifyEmail} className="space-y-4">
            {accessDenied && (
              <div className="rounded-lg bg-red-100 px-4 py-2 text-sm text-red-800 dark:bg-red-900/30 dark:text-red-300">
                This email is not on any gallery guest lists yet.
              </div>
            )}
            {error && !accessDenied && (
              <div className="rounded-lg bg-red-100 px-4 py-2 text-sm text-red-800 dark:bg-red-900/30 dark:text-red-300">
                {error}
              </div>
            )}
            <input
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setAccessDenied(false);
              }}
              placeholder="you@example.com"
              className="w-full rounded-lg border border-neutral-200 px-4 py-3 text-neutral-900 outline-none focus:border-bizzi-blue dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
              autoFocus
              required
            />
            <button
              type="submit"
              disabled={verifying}
              className="w-full rounded-lg bg-bizzi-blue py-3 text-sm font-medium text-white transition-colors hover:bg-bizzi-cyan disabled:opacity-50"
            >
              {verifying ? "Verifying…" : "Continue"}
            </button>
          </form>
          <Link
            href="/dashboard"
            className="block text-center text-sm text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-300"
          >
            Photographer login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950">
      <header className="border-b border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2">
            <BizziLogoMark width={28} height={28} alt="Bizzi Cloud" />
            <span className="text-lg font-semibold tracking-tight text-neutral-900 dark:text-white">
              My Galleries
            </span>
          </Link>
          <Link
            href="/dashboard"
            className="text-sm font-medium text-bizzi-blue hover:text-bizzi-cyan"
          >
            Photographer login
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <h1 className="mb-6 text-2xl font-semibold text-neutral-900 dark:text-white">
          Galleries shared with you
        </h1>

        {error && (
          <div className="mb-6 rounded-lg bg-red-100 px-4 py-3 text-sm text-red-800 dark:bg-red-900/30 dark:text-red-300">
            {error}
          </div>
        )}

        {galleries.length === 0 && !loading && (
          <div className="rounded-xl border border-neutral-200 bg-white py-16 text-center dark:border-neutral-700 dark:bg-neutral-900">
            <Images className="mx-auto mb-4 h-16 w-16 text-neutral-300 dark:text-neutral-600" />
            <p className="text-lg font-medium text-neutral-700 dark:text-neutral-300">
              No galleries yet
            </p>
            <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
              When a photographer shares a gallery with you, it will appear here.
            </p>
          </div>
        )}

        {galleries.length > 0 && (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {galleries.map((g) => (
              <GalleryCard key={g.id} gallery={g} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

export default function ClientPortalPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen flex-col items-center justify-center bg-neutral-50 p-6 dark:bg-neutral-950">
          <Loader2 className="h-10 w-10 animate-spin text-bizzi-blue" />
          <p className="mt-4 text-sm text-neutral-500 dark:text-neutral-400">
            Loading…
          </p>
        </div>
      }
    >
      <ClientPortalContent />
    </Suspense>
  );
}
