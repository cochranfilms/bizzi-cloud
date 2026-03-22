"use client";

const TEAM_VIDEOS = [
  { src: "/Darren Print #1.mp4" },
  { src: "/Cody Print #2.mp4" },
  { src: "/James Choi #3.mp4" },
  { src: "/Kathryn Book #4.mp4" },
  { src: "/VIDEO #1 Frost.mp4" },
  { src: "/Video #7.mp4" },
];

export default function TrustedByTeams() {
  return (
    <section className="py-12 md:py-16 overflow-hidden bg-white/60">
      <div className="text-center mb-8">
        <h2 className="text-xl md:text-2xl font-semibold text-bizzi-navy">
          Trusted by creative teams
        </h2>
      </div>
      <div className="relative">
        <div className="flex animate-teams-scroll gap-6 md:gap-8 px-4">
          {/* Duplicate for seamless infinite scroll */}
          {[...TEAM_VIDEOS, ...TEAM_VIDEOS].map((video, i) => (
            <div
              key={`${video.src}-${i}`}
              className="flex-shrink-0 w-[240px] md:w-[320px] aspect-video overflow-hidden rounded-lg bg-neutral-900"
            >
              <video
                src={video.src}
                className="w-full h-full object-cover"
                muted
                loop
                playsInline
                autoPlay
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
