/**
 * Sampled structured logs for asset delivery routes (egress + Fluid CPU visibility).
 */

export type DeliverySurface =
  | "dashboard"
  | "gallery"
  | "share"
  | "transfer"
  | "mount"
  | "migration";

export type DeliveryResponseType = "json" | "redirect" | "bytes";

export type DeliveryClass =
  | "mux_hls"
  | "proxy_mp4"
  | "source_inline"
  | "source_download"
  | "thumb_cdn"
  | "thumb_bytes"
  | "processing"
  | "unknown";

export interface DeliveryTelemetryPayload {
  route: string;
  durationMs: number;
  deliveryClass: DeliveryClass;
  responseType: DeliveryResponseType;
  approxPayloadBytes?: number;
  headFallback?: boolean;
  surface: DeliverySurface;
  pollingRequest?: boolean;
  firestoreReads?: "none" | "single" | "batch";
}

function sampleHit(): boolean {
  const raw = process.env.DELIVERY_LOG_SAMPLE_RATE ?? "0.01";
  const rate = parseFloat(raw);
  if (!Number.isFinite(rate) || rate <= 0) return false;
  if (rate >= 1) return true;
  return Math.random() < rate;
}

export function logDeliveryTelemetry(payload: DeliveryTelemetryPayload): void {
  if (!sampleHit()) return;
  try {
    console.info(
      JSON.stringify({
        scope: "delivery_telemetry",
        ...payload,
      })
    );
  } catch {
    // ignore
  }
}

export function readPollingRequestHeader(request: Request): boolean {
  return request.headers.get("X-Bizzi-Client-Poll") === "1";
}
