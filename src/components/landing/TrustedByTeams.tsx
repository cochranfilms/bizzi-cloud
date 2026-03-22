"use client";

const TEAM_VIDEOS = [
  "/Darren Print #1.mp4",
  "/Cody Print #2.mp4",
  "/James Choi #3.mp4",
  "/Kathryn Book #4.mp4",
  "/VIDEO #1 Frost.mp4",
  "/Video #7.mp4",
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
        {/* Apple-style: no gap, slides touch edge-to-edge */}
        <div className="flex animate-teams-scroll">
          {[...TEAM_VIDEOS, ...TEAM_VIDEOS].map((src, i) => (
            <div
              key={`${src}-${i}`}
              className="flex-shrink-0 w-[min(500px,85vw)] aspect-video overflow-hidden"
            >
              <video
                src={encodeURI(src)}
                className="w-full h-full object-cover"
                muted
                loop
                playsInline
                autoPlay
                preload="auto"
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
