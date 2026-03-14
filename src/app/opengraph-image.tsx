import { ImageResponse } from "next/og";
import { SITE_NAME, SITE_DESCRIPTION } from "@/lib/seo";

export const alt = `${SITE_NAME} - Cloud storage built for creators`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #0c4a6e 0%, #0ea5e9 50%, #38bdf8 100%)",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "48px 64px",
          }}
        >
          <div
            style={{
              display: "flex",
              fontSize: 56,
              fontWeight: 700,
              color: "white",
              marginBottom: 16,
              letterSpacing: "-0.02em",
            }}
          >
            Bizzi Cloud
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 24,
              color: "rgba(255,255,255,0.9)",
              maxWidth: 640,
              textAlign: "center",
              lineHeight: 1.4,
            }}
          >
            {SITE_DESCRIPTION.slice(0, 80)}...
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
