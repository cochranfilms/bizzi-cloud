export default function KeyFeaturesPills() {
  return (
    <section className="py-12 md:py-16 px-6">
      <div className="max-w-6xl mx-auto">
        <div
          className="rounded-2xl bg-white/90 backdrop-blur-sm p-6 md:p-8 border border-white/50 shadow-lg dark:border-white/12 dark:bg-neutral-900/55 dark:shadow-black/30"
          aria-label="Product preview video"
        >
          <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-black/5 dark:bg-black/40">
            <video
              className="absolute inset-0 h-full w-full object-contain"
              src="/placeholder.MOV"
              controls
              playsInline
              preload="metadata"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
