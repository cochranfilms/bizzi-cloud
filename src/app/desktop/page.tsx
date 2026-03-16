"use client";

import Image from "next/image";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import {
  Monitor,
  HardDrive,
  Film,
  FolderOpen,
  Zap,
  Download,
  CheckCircle2,
  ExternalLink,
  AlertCircle,
} from "lucide-react";

const DMG_URL =
  "https://github.com/cochranfilms/bizzi-cloud/releases/latest/download/Bizzi.Cloud-0.1.3-arm64.dmg";

export default function DesktopLandingPage() {
  return (
    <>
      <Header />
      <main>
        {/* Hero */}
        <section className="relative py-20 md:py-28 px-6 overflow-hidden">
          <div
            className="absolute inset-0 -z-10"
            style={{
              background:
                "linear-gradient(180deg, #e0f2fe 0%, #bae6fd 40%, #7dd3fc 100%)",
            }}
          />
          <div className="max-w-6xl mx-auto relative z-10">
            <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
              <div>
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/80 backdrop-blur-sm border border-white/50 text-bizzi-navy text-sm font-medium mb-6">
                  <Monitor className="w-4 h-4" />
                  macOS Desktop App
                </div>
                <h1 className="text-4xl md:5xl lg:text-6xl font-bold tracking-tight text-bizzi-navy mb-6">
                  Edit directly from the cloud.
                </h1>
                <p className="text-lg md:text-xl text-neutral-600 mb-8 max-w-xl leading-relaxed">
                  Mount your Bizzi Cloud drive as a local volume. Work in
                  Premiere Pro, DaVinci Resolve, and Final Cut Pro without
                  downloading—your files stream on demand like a virtual SSD.
                </p>
                <a
                  href={DMG_URL}
                  className="inline-flex items-center gap-2 px-8 py-3.5 bg-bizzi-blue text-white font-semibold rounded-full hover:bg-bizzi-cyan transition-colors shadow-lg shadow-bizzi-blue/25"
                >
                  <Download className="w-5 h-5" />
                  Download for Mac (Apple Silicon)
                </a>
                <p className="mt-4 text-sm text-neutral-500">
                  Requires macFUSE. macOS 12+ (Apple Silicon)
                </p>
              </div>
              <div className="relative hidden lg:block">
                <div
                  className="rounded-2xl p-8 shadow-xl border border-white/50 backdrop-blur-sm"
                  style={{
                    background:
                      "linear-gradient(135deg, rgba(255,255,255,0.95) 0%, rgba(224,242,254,0.6) 100%)",
                  }}
                >
                  <div className="flex items-center gap-2 text-bizzi-navy font-medium mb-4">
                    <HardDrive className="w-5 h-5" />
                    BizziCloud in Finder
                  </div>
                  <div className="space-y-2 text-sm text-neutral-600">
                    <div className="flex items-center gap-2">
                      <FolderOpen className="w-4 h-4 text-bizzi-blue" />
                      Storage
                    </div>
                    <div className="flex items-center gap-2">
                      <FolderOpen className="w-4 h-4 text-bizzi-blue" />
                      RAW
                    </div>
                    <div className="flex items-center gap-2">
                      <FolderOpen className="w-4 h-4 text-bizzi-blue" />
                      Gallery Media
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* What makes it different */}
        <section className="py-20 md:py-28 px-6 bg-white">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-4xl font-bold text-bizzi-navy mb-4">
                Built for video editors
              </h2>
              <p className="text-lg text-neutral-600 max-w-2xl mx-auto">
                Unlike generic cloud storage, Bizzi Cloud Desktop is designed for
                NLE workflows. Mount your drive and edit—no sync folders, no
                manual downloads.
              </p>
            </div>
            <div className="grid md:grid-cols-3 gap-8">
              <div className="rounded-2xl p-6 border border-neutral-200 bg-neutral-50/50">
                <div className="w-12 h-12 rounded-xl bg-bizzi-blue/15 flex items-center justify-center mb-4">
                  <HardDrive className="w-6 h-6 text-bizzi-blue" />
                </div>
                <h3 className="text-xl font-semibold text-bizzi-navy mb-2">
                  Virtual SSD mount
                </h3>
                <p className="text-neutral-600">
                  Your cloud drive appears at /Volumes/BizziCloud. NLEs see it
                  like a local drive—scrub, preview, and edit without copying
                  files first.
                </p>
              </div>
              <div className="rounded-2xl p-6 border border-neutral-200 bg-neutral-50/50">
                <div className="w-12 h-12 rounded-xl bg-bizzi-blue/15 flex items-center justify-center mb-4">
                  <Film className="w-6 h-6 text-bizzi-blue" />
                </div>
                <h3 className="text-xl font-semibold text-bizzi-navy mb-2">
                  Proxy support
                </h3>
                <p className="text-neutral-600">
                  Bizzi proxies are exposed in the mount. Edit with lightweight
                  proxies, export in full resolution—changes sync back to the
                  cloud automatically.
                </p>
              </div>
              <div className="rounded-2xl p-6 border border-neutral-200 bg-neutral-50/50">
                <div className="w-12 h-12 rounded-xl bg-bizzi-blue/15 flex items-center justify-center mb-4">
                  <Zap className="w-6 h-6 text-bizzi-blue" />
                </div>
                <h3 className="text-xl font-semibold text-bizzi-navy mb-2">
                  Smart prefetching
                </h3>
                <p className="text-neutral-600">
                  Predictive cache prefetches ahead as you scrub. Sequential
                  reads stay fast so timelines feel responsive.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* macFUSE - Required for mount */}
        <section className="py-20 md:py-28 px-6 bg-gradient-to-b from-neutral-50 to-neutral-100/80 border-y border-neutral-200">
          <div className="max-w-5xl mx-auto">
            <div className="flex flex-col md:flex-row gap-12 md:gap-16 items-center">
              <div className="flex-shrink-0 order-2 md:order-1">
                <a
                  href="https://macfuse.github.io/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block group"
                >
                  <div className="relative w-36 h-36 md:w-44 md:h-44 rounded-2xl overflow-hidden shadow-xl ring-2 ring-white ring-offset-4 ring-offset-neutral-100 bg-white transition-transform group-hover:scale-[1.02]">
                    <Image
                      src="/838036.png"
                      alt="macFUSE logo"
                      fill
                      className="object-contain p-4"
                      sizes="(max-width: 768px) 144px, 176px"
                    />
                  </div>
                </a>
              </div>
              <div className="flex-1 order-1 md:order-2">
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-100 text-amber-800 text-xs font-semibold uppercase tracking-wider mb-4">
                  <AlertCircle className="w-3.5 h-3.5" />
                  Required for Mount
                </div>
                <h2 className="text-2xl md:text-3xl font-bold text-bizzi-navy mb-4">
                  Install macFUSE before you mount
                </h2>
                <p className="text-neutral-600 mb-4 leading-relaxed">
                  Bizzi Cloud Desktop uses FUSE (Filesystem in Userspace) to
                  mount your cloud drive as a local volume. macOS does not
                  include FUSE by default—you must download and install{" "}
                  <strong className="text-bizzi-navy">macFUSE</strong> from the
                  official project before the Mount feature will work.
                </p>
                <p className="text-neutral-600 mb-6 leading-relaxed">
                  <a
                    href="https://macfuse.github.io/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-bizzi-blue font-medium hover:underline"
                  >
                    macFUSE
                  </a>{" "}
                  adds support for FUSE file systems on macOS. It&apos;s free,
                  open-source, and used by many professional apps. Installation
                  takes about a minute; you may need to restart your Mac afterward.
                </p>
                <a
                  href="https://macfuse.github.io/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-neutral-900 text-white font-medium hover:bg-neutral-800 transition-colors shadow-lg"
                >
                  Download macFUSE at macfuse.github.io
                  <ExternalLink className="w-4 h-4" />
                </a>
                <p className="mt-4 text-sm text-neutral-500">
                  macOS 12+ · Apple Silicon & Intel
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Requirements & CTA */}
        <section className="py-20 md:py-28 px-6 relative overflow-hidden">
          <div
            className="absolute inset-0 -z-10"
            style={{
              background:
                "linear-gradient(180deg, #bae6fd 0%, #7dd3fc 50%, #38bdf8 100%)",
            }}
          />
          <div className="max-w-3xl mx-auto text-center relative z-10">
            <h2 className="text-3xl md:text-4xl font-bold text-bizzi-navy mb-6">
              Ready to edit from the cloud?
            </h2>
            <p className="text-lg text-neutral-700 mb-8">
              Sign in with your Bizzi Cloud account, click Mount, and start
              editing. Add the volume to your Finder sidebar for quick access.
            </p>
            <div className="flex flex-wrap justify-center gap-4 mb-8">
              <div className="flex items-center gap-2 text-sm text-neutral-700">
                <CheckCircle2 className="w-5 h-5 text-bizzi-navy" />
                macOS (Apple Silicon)
              </div>
              <div className="flex items-center gap-2 text-sm text-neutral-700">
                <CheckCircle2 className="w-5 h-5 text-bizzi-navy" />
                macFUSE required
              </div>
              <div className="flex items-center gap-2 text-sm text-neutral-700">
                <CheckCircle2 className="w-5 h-5 text-bizzi-navy" />
                rclone bundled
              </div>
            </div>
            <a
              href={DMG_URL}
              className="inline-flex items-center gap-2 px-10 py-4 bg-bizzi-navy text-white font-semibold rounded-full hover:bg-bizzi-navy/90 transition-colors shadow-lg"
            >
              <Download className="w-5 h-5" />
              Download for Desktop
            </a>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
