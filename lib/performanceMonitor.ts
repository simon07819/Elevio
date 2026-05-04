/**
 * Performance monitoring for Elevio.
 *
 * Measures critical timings and logs warnings if > 2 seconds.
 * Uses Performance API when available.
 */

const SLOW_THRESHOLD_MS = 2000;

interface PerfMetric {
  label: string;
  startMs: number;
  projectId?: string;
  elevatorId?: string;
  requestId?: string;
}

const activeMetrics = new Map<string, PerfMetric>();

/** Start a performance timer. Returns a stop function. */
export function startPerfTimer(
  label: string,
  meta: { projectId?: string; elevatorId?: string; requestId?: string } = {},
): () => number {
  const id = `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const startMs = performance.now();
  activeMetrics.set(id, { label, startMs, ...meta });

  return () => {
    const metric = activeMetrics.get(id);
    if (!metric) return 0;
    activeMetrics.delete(id);
    const durationMs = performance.now() - metric.startMs;
    const durationSec = (durationMs / 1000).toFixed(2);

    structuredLog("Performance", `${label} completed`, {
      durationMs: Math.round(durationMs),
      durationSec,
      projectId: meta.projectId,
      elevatorId: meta.elevatorId,
      requestId: meta.requestId,
    });

    if (durationMs > SLOW_THRESHOLD_MS) {
      structuredLog("Performance", `SLOW: ${label} took ${durationSec}s (>2s threshold)`, {
        durationMs: Math.round(durationMs),
        ...meta,
      });
    }

    return durationMs;
  };
}

/** Predefined timer factories for the 3 critical metrics. */

/** Time from Ramasser click → DB update confirmed (server action returns). */
export function startPickupToDbTimer(meta: { projectId: string; elevatorId: string; requestId: string }) {
  return startPerfTimer("pickup_to_db", meta);
}

/** Time from Ramasser click → passenger QR page rendered. */
export function startPickupToQrTimer(meta: { projectId: string; elevatorId: string; requestId: string }) {
  return startPerfTimer("pickup_to_qr_return", meta);
}

/** Time from Libérer click → Activate button available. */
export function startReleaseToActivateTimer(meta: { projectId: string; elevatorId: string }) {
  return startPerfTimer("release_to_activate_available", meta);
}

function structuredLog(tag: string, action: string, data?: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  const debug = window.localStorage.getItem("elevio_debug_sync") === "true"
    || process.env.NEXT_PUBLIC_DEBUG_SYNC === "true";
  if (!debug) return;
  console.log(`[Elevio ${tag}]`, action, data ?? "");
}
