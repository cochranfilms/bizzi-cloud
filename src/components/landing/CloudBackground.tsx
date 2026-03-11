"use client";

export default function CloudBackground() {
  return (
    <div
      className="pointer-events-none absolute inset-0 overflow-hidden"
      aria-hidden
    >
      {/* Soft gradient base */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, #f0f9ff 0%, #e0f2fe 40%, #bae6fd 70%, #7dd3fc 100%)",
        }}
      />
      {/* Cloud shapes - wispy, translucent */}
      <div className="absolute inset-0">
        <div
          className="absolute w-[400px] h-[120px] rounded-full opacity-30 animate-clouds-drift"
          style={{
            background:
              "radial-gradient(ellipse 80% 50% at 50% 50%, rgba(255,255,255,0.9), rgba(255,255,255,0))",
            top: "15%",
            left: "5%",
          }}
        />
        <div
          className="absolute w-[300px] h-[100px] rounded-full opacity-25 animate-clouds-drift-slow"
          style={{
            background:
              "radial-gradient(ellipse 70% 45% at 50% 50%, rgba(255,255,255,0.85), rgba(255,255,255,0))",
            top: "35%",
            right: "10%",
            animationDelay: "-10s",
          }}
        />
        <div
          className="absolute w-[350px] h-[110px] rounded-full opacity-28 animate-clouds-drift"
          style={{
            background:
              "radial-gradient(ellipse 75% 50% at 50% 50%, rgba(255,255,255,0.9), rgba(255,255,255,0))",
            bottom: "25%",
            left: "20%",
            animationDelay: "-5s",
          }}
        />
        <div
          className="absolute w-[250px] h-[90px] rounded-full opacity-22 animate-clouds-drift-slow"
          style={{
            background:
              "radial-gradient(ellipse 65% 40% at 50% 50%, rgba(255,255,255,0.8), rgba(255,255,255,0))",
            top: "55%",
            right: "25%",
          }}
        />
        <div
          className="absolute w-[280px] h-[95px] rounded-full opacity-26 animate-clouds-drift"
          style={{
            background:
              "radial-gradient(ellipse 70% 48% at 50% 50%, rgba(255,255,255,0.85), rgba(255,255,255,0))",
            bottom: "40%",
            right: "5%",
            animationDelay: "-15s",
          }}
        />
        <div
          className="absolute w-[320px] h-[105px] rounded-full opacity-24 animate-clouds-drift-slow"
          style={{
            background:
              "radial-gradient(ellipse 72% 46% at 50% 50%, rgba(255,255,255,0.88), rgba(255,255,255,0))",
            top: "70%",
            left: "10%",
            animationDelay: "-20s",
          }}
        />
      </div>
    </div>
  );
}
