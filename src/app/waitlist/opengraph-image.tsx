import { ImageResponse } from "next/og";
import { WAITLIST_DESCRIPTION } from "@/lib/seo";

export const alt = "Bizzi Cloud waitlist — glass form on a white and sky-blue gradient";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function WaitlistOpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(180deg, #ffffff 0%, #e0f2fe 42%, #7dd3fc 100%)",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "stretch",
            width: 760,
            padding: "44px 48px",
            borderRadius: 36,
            border: "1px solid rgba(255,255,255,0.9)",
            background: "rgba(255,255,255,0.48)",
            boxShadow: "0 16px 56px rgba(14,116,144,0.16)",
          }}
        >
          <div
            style={{
              fontSize: 46,
              fontWeight: 700,
              color: "#0f172a",
              letterSpacing: "-0.02em",
              lineHeight: 1.15,
              marginBottom: 14,
            }}
          >
            Pre-register for Bizzi Cloud
          </div>
          <div
            style={{
              fontSize: 20,
              color: "#475569",
              lineHeight: 1.5,
              marginBottom: 32,
            }}
          >
            {WAITLIST_DESCRIPTION.slice(0, 118).trim() + "\u2026"}
          </div>
          <div
            style={{
              height: 16,
              borderRadius: 8,
              background: "rgba(100,116,139,0.35)",
              marginBottom: 14,
              width: "100%",
            }}
          />
          <div
            style={{
              display: "flex",
              gap: 14,
              marginBottom: 14,
            }}
          >
            <div
              style={{
                flex: 1,
                height: 16,
                borderRadius: 8,
                background: "rgba(100,116,139,0.35)",
              }}
            />
            <div
              style={{
                flex: 1,
                height: 16,
                borderRadius: 8,
                background: "rgba(100,116,139,0.35)",
              }}
            />
          </div>
          <div
            style={{
              height: 16,
              borderRadius: 8,
              background: "rgba(100,116,139,0.35)",
              marginBottom: 14,
              width: "88%",
            }}
          />
          <div
            style={{
              height: 44,
              borderRadius: 999,
              background: "linear-gradient(90deg, #0ea5e9 0%, #00BFFF 100%)",
              marginTop: 8,
              width: "62%",
              alignSelf: "center",
            }}
          />
        </div>
      </div>
    ),
    { ...size }
  );
}
