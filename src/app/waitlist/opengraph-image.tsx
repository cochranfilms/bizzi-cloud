import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { WAITLIST_LEAD } from "@/lib/seo";

export const alt = "Bizzi Cloud waitlist — glass form on a white and sky-blue gradient";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function WaitlistOpenGraphImage() {
  const logoPath = join(process.cwd(), "public", "bizzi-byte-logo.png");
  let logoSrc: string;
  try {
    const logoBuf = await readFile(logoPath);
    logoSrc = `data:image/png;base64,${logoBuf.toString("base64")}`;
  } catch {
    logoSrc = "";
  }

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
            width: 780,
            padding: "40px 48px 44px",
            borderRadius: 36,
            border: "1px solid rgba(255,255,255,0.9)",
            background: "rgba(255,255,255,0.48)",
            boxShadow: "0 16px 56px rgba(14,116,144,0.16)",
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              marginBottom: 18,
            }}
          >
            {logoSrc ? (
              <img
                src={logoSrc}
                alt=""
                width={64}
                height={64}
                style={{ display: "flex", objectFit: "contain" }}
              />
            ) : null}
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 44,
              fontWeight: 700,
              color: "#0f172a",
              letterSpacing: "-0.02em",
              lineHeight: 1.15,
              marginBottom: 14,
              textAlign: "center",
              justifyContent: "center",
            }}
          >
            Pre-register for Bizzi Cloud
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 18,
              color: "#475569",
              lineHeight: 1.55,
              marginBottom: 28,
              textAlign: "center",
              justifyContent: "center",
            }}
          >
            {WAITLIST_LEAD}
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
              marginTop: 4,
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
