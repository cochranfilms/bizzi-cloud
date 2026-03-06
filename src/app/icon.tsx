import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 6,
          background: "linear-gradient(135deg, #2563eb 0%, #0ea5e9 100%)",
        }}
      >
        <div
          style={{
            width: 14,
            height: 10,
            borderRadius: "50%",
            background: "white",
          }}
        />
      </div>
    ),
    { ...size }
  );
}
