import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { EXPLORE_DESCRIPTION, EXPLORE_OG_IMAGE_ALT, EXPLORE_SHORT_TITLE } from "@/content/explore-seo";

export const alt = EXPLORE_OG_IMAGE_ALT;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const TAGLINE = "Product education for creative teams · One page, every workflow";

export default async function ExploreOpenGraphImage() {
  const logoPath = join(process.cwd(), "public", "bizzi-byte-logo.png");
  let logoSrc: string;
  try {
    const logoBuf = await readFile(logoPath);
    logoSrc = `data:image/png;base64,${logoBuf.toString("base64")}`;
  } catch {
    logoSrc = "";
  }

  const subline =
    EXPLORE_DESCRIPTION.length > 160 ? `${EXPLORE_DESCRIPTION.slice(0, 157)}…` : EXPLORE_DESCRIPTION;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(145deg, #0c4a6e 0%, #0369a1 38%, #0ea5e9 72%, #bae6fd 100%)",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            width: "92%",
            maxWidth: 1040,
            padding: "44px 52px",
            borderRadius: 32,
            border: "1px solid rgba(255,255,255,0.35)",
            background: "rgba(255,255,255,0.12)",
            boxShadow: "0 24px 80px rgba(8,47,73,0.35)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 20, marginBottom: 28 }}>
            {logoSrc ? (
              <img
                src={logoSrc}
                alt=""
                width={72}
                height={72}
                style={{ display: "flex", borderRadius: 16, objectFit: "contain" }}
              />
            ) : null}
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span
                style={{
                  display: "flex",
                  fontSize: 22,
                  fontWeight: 600,
                  color: "rgba(255,255,255,0.92)",
                  letterSpacing: "0.06em",
                  textTransform: "uppercase" as const,
                }}
              >
                Bizzi Cloud
              </span>
              <span
                style={{
                  display: "flex",
                  fontSize: 52,
                  fontWeight: 800,
                  color: "#ffffff",
                  letterSpacing: "-0.03em",
                  lineHeight: 1.1,
                  marginTop: 4,
                }}
              >
                {EXPLORE_SHORT_TITLE}
              </span>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              fontSize: 22,
              color: "rgba(255,255,255,0.92)",
              lineHeight: 1.45,
              marginBottom: 22,
              maxWidth: 920,
            }}
          >
            {TAGLINE}
          </div>

          <div
            style={{
              display: "flex",
              fontSize: 17,
              color: "rgba(255,255,255,0.82)",
              lineHeight: 1.5,
              marginBottom: 28,
              maxWidth: 960,
            }}
          >
            {subline}
          </div>

          <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 10, marginBottom: 8 }}>
            {["Workspaces", "Stream cache", "Galleries", "Delivery", "Teams"].map((pill) => (
              <span
                key={pill}
                style={{
                  display: "flex",
                  padding: "10px 18px",
                  borderRadius: 999,
                  background: "rgba(255,255,255,0.22)",
                  color: "#ffffff",
                  fontSize: 16,
                  fontWeight: 600,
                }}
              >
                {pill}
              </span>
            ))}
          </div>

          <div
            style={{
              display: "flex",
              marginTop: "auto",
              paddingTop: 20,
              borderTop: "1px solid rgba(255,255,255,0.25)",
              fontSize: 15,
              color: "rgba(255,255,255,0.75)",
            }}
          >
            bizzicloud.io/explore · Learn the platform end to end
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
