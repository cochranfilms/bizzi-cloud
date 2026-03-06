"use client";

type CloudVariant = "light" | "sky" | "dark" | "ambient" | "header" | "hero";

interface CloudBackgroundProps {
  variant?: CloudVariant;
  className?: string;
}

/* Puffy cumulus cloud shapes */
const cloudShapes = {
  puffy1: (
    <g fill="currentColor">
      <ellipse cx="25" cy="45" rx="22" ry="14" />
      <ellipse cx="48" cy="38" rx="26" ry="16" />
      <ellipse cx="72" cy="42" rx="20" ry="13" />
      <ellipse cx="55" cy="50" rx="18" ry="12" />
      <ellipse cx="35" cy="50" rx="16" ry="10" />
      <ellipse cx="50" cy="32" rx="14" ry="9" />
    </g>
  ),
  puffy2: (
    <g fill="currentColor">
      <ellipse cx="30" cy="48" rx="28" ry="17" />
      <ellipse cx="58" cy="42" rx="24" ry="15" />
      <ellipse cx="75" cy="48" rx="18" ry="12" />
      <ellipse cx="42" cy="38" rx="20" ry="13" />
      <ellipse cx="65" cy="52" rx="14" ry="9" />
    </g>
  ),
  puffy3: (
    <g fill="currentColor">
      <ellipse cx="35" cy="45" rx="20" ry="13" />
      <ellipse cx="55" cy="38" rx="24" ry="15" />
      <ellipse cx="78" cy="44" rx="18" ry="11" />
      <ellipse cx="48" cy="52" rx="22" ry="14" />
      <ellipse cx="62" cy="48" rx="16" ry="10" />
    </g>
  ),
  puffy4: (
    <g fill="currentColor">
      <ellipse cx="22" cy="42" rx="24" ry="15" />
      <ellipse cx="45" cy="48" rx="22" ry="14" />
      <ellipse cx="68" cy="40" rx="26" ry="16" />
      <ellipse cx="55" cy="52" rx="18" ry="11" />
      <ellipse cx="38" cy="38" rx="16" ry="10" />
      <ellipse cx="72" cy="50" rx="14" ry="9" />
    </g>
  ),
};

function CloudSvg({
  shape,
  className,
}: {
  shape: keyof typeof cloudShapes;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 100 65"
      className={className}
      preserveAspectRatio="xMidYMid meet"
      aria-hidden
      width="100%"
      height="100%"
    >
      {cloudShapes[shape]}
    </svg>
  );
}

export default function CloudBackground({ variant = "light", className = "" }: CloudBackgroundProps) {
  const isDark = variant === "dark";
  const isAmbient = variant === "ambient";
  const isHeader = variant === "header";
  const isHero = variant === "hero";

  if (isHero) {
    const heroClouds: Array<{
      left: string;
      top: string;
      w: string;
      h: string;
      opacity: number;
      shape: keyof typeof cloudShapes;
    }> = [
      { left: "-15%", top: "-8%", w: "72%", h: "200px", opacity: 0.2, shape: "puffy1" },
      { left: "42%", top: "-5%", w: "75%", h: "210px", opacity: 0.18, shape: "puffy2" },
      { left: "-10%", top: "12%", w: "68%", h: "185px", opacity: 0.22, shape: "puffy3" },
      { left: "25%", top: "8%", w: "65%", h: "175px", opacity: 0.17, shape: "puffy4" },
      { left: "-5%", top: "32%", w: "60%", h: "165px", opacity: 0.19, shape: "puffy1" },
      { left: "32%", top: "28%", w: "70%", h: "192px", opacity: 0.2, shape: "puffy2" },
      { left: "-12%", top: "48%", w: "58%", h: "155px", opacity: 0.16, shape: "puffy3" },
      { left: "45%", top: "42%", w: "65%", h: "175px", opacity: 0.18, shape: "puffy4" },
      { left: "22%", top: "50%", w: "60%", h: "162px", opacity: 0.15, shape: "puffy1" },
      { left: "-8%", top: "62%", w: "65%", h: "175px", opacity: 0.17, shape: "puffy4" },
      { left: "35%", top: "-5%", w: "58%", h: "158px", opacity: 0.2, shape: "puffy3" },
      { left: "5%", top: "45%", w: "68%", h: "185px", opacity: 0.16, shape: "puffy2" },
    ];

    return (
      <div
        className={`absolute inset-0 overflow-hidden pointer-events-none ${className}`}
        aria-hidden
      >
        <div
          className="absolute inset-0"
          style={{
            background: "linear-gradient(180deg, #e8f6ff 0%, #f5faff 50%, #ffffff 100%)",
          }}
        />
        {heroClouds.map((cloud, i) => (
          <div
            key={i}
            className="absolute"
            style={{
              left: cloud.left,
              top: cloud.top,
              width: cloud.w,
              height: cloud.h,
              opacity: cloud.opacity,
              filter: "blur(0.5px)",
            }}
          >
            <CloudSvg shape={cloud.shape} className="text-neutral-300" />
          </div>
        ))}
      </div>
    );
  }

  if (isHeader) {
    return (
      <div
        className={`absolute inset-0 overflow-visible pointer-events-none ${className}`}
        aria-hidden
      >
        <div className="absolute -left-[5%] -top-[20px] w-[45%] h-[80px]" style={{ opacity: 0.45 }}>
          <CloudSvg shape="puffy1" className="text-neutral-300" />
        </div>
        <div className="absolute right-[-5%] -top-[15px] w-[40%] h-[70px]" style={{ opacity: 0.4 }}>
          <CloudSvg shape="puffy2" className="text-neutral-300" />
        </div>
        <div className="absolute left-[15%] top-0 w-[35%] h-[60px]" style={{ opacity: 0.38 }}>
          <CloudSvg shape="puffy3" className="text-neutral-300" />
        </div>
        <div className="absolute right-[10%] top-[-5px] w-[30%] h-[55px]" style={{ opacity: 0.4 }}>
          <CloudSvg shape="puffy4" className="text-neutral-300" />
        </div>
        <div className="absolute left-[5%] top-[5px] w-[22%] h-[45px]" style={{ opacity: 0.35 }}>
          <CloudSvg shape="puffy1" className="text-neutral-400" />
        </div>
        <div className="absolute right-[25%] top-[2px] w-[20%] h-[40px]" style={{ opacity: 0.32 }}>
          <CloudSvg shape="puffy2" className="text-neutral-300" />
        </div>
      </div>
    );
  }

  if (isAmbient) {
    return (
      <div
        className={`fixed inset-0 overflow-hidden pointer-events-none -z-10 ${className}`}
        aria-hidden
      >
        <div
          className="absolute inset-0"
          style={{
            background: "linear-gradient(180deg, #f8fcff 0%, #ffffff 50%, #fafbfc 100%)",
          }}
        />
        <div className="absolute -left-[15%] top-[10%] w-[50%] h-[100px]" style={{ opacity: 0.08 }}>
          <CloudSvg shape="puffy1" className="text-neutral-300" />
        </div>
        <div className="absolute right-[-10%] top-[30%] w-[45%] h-[90px]" style={{ opacity: 0.06 }}>
          <CloudSvg shape="puffy2" className="text-neutral-300" />
        </div>
        <div className="absolute left-[20%] bottom-[20%] w-[40%] h-[80px]" style={{ opacity: 0.05 }}>
          <CloudSvg shape="puffy3" className="text-neutral-200" />
        </div>
      </div>
    );
  }

  return (
    <div
      className={`absolute inset-0 overflow-hidden pointer-events-none ${className}`}
      aria-hidden
    >
      {/* Gradient sky for hero / light ambience */}
      {variant === "sky" && (
        <div
          className="absolute inset-0"
          style={{
            background: "linear-gradient(180deg, #e0f4ff 0%, #f0f9ff 40%, #ffffff 100%)",
          }}
        />
      )}

      {/* Cloud layer 1 - back, largest, most subtle */}
      <div
        className="absolute -left-[10%] top-[5%] w-[45%] h-[100px]"
        style={{ opacity: isDark ? 0.2 : 0.25 }}
      >
        <CloudSvg shape="puffy1" className={isDark ? "text-white" : "text-neutral-200"} />
      </div>
      <div
        className="absolute right-[-5%] top-[15%] w-[40%] h-[95px]"
        style={{ opacity: isDark ? 0.15 : 0.2 }}
      >
        <CloudSvg shape="puffy2" className={isDark ? "text-white" : "text-neutral-200"} />
      </div>

      {/* Cloud layer 2 - mid depth */}
      <div
        className="absolute left-[15%] top-[35%] w-[35%] h-[85px]"
        style={{ opacity: isDark ? 0.18 : 0.22 }}
      >
        <CloudSvg shape="puffy3" className={isDark ? "text-white" : "text-neutral-300"} />
      </div>
      <div
        className="absolute right-[10%] bottom-[25%] w-[30%] h-[78px]"
        style={{ opacity: isDark ? 0.12 : 0.18 }}
      >
        <CloudSvg shape="puffy4" className={isDark ? "text-white" : "text-neutral-200"} />
      </div>

      {/* Cloud layer 3 - front, smallest accent */}
      <div
        className="absolute left-[5%] bottom-[15%] w-[25%] h-[65px]"
        style={{ opacity: isDark ? 0.1 : 0.15 }}
      >
        <CloudSvg shape="puffy1" className={isDark ? "text-bizzi-blue/30" : "text-neutral-300"} />
      </div>
      <div
        className="absolute right-[20%] top-[45%] w-[20%] h-[55px]"
        style={{ opacity: isDark ? 0.08 : 0.12 }}
      >
        <CloudSvg shape="puffy2" className={isDark ? "text-white" : "text-neutral-200"} />
      </div>
    </div>
  );
}
