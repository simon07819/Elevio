/**
 * PostHog analytics wrapper for Elevio.
 *
 * Tracks 7 core events + timing metrics.
 * Gracefully degrades if NEXT_PUBLIC_POSTHOG_KEY is not set or PostHog not available.
 */

const POSTHOG_KEY = typeof process !== "undefined" ? (process.env.NEXT_PUBLIC_POSTHOG_KEY ?? "") : "";
const POSTHOG_HOST = typeof process !== "undefined" ? (process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com") : "https://us.i.posthog.com";

let initialized = false;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let posthogLib: any = null;

async function loadPostHog() {
  if (posthogLib) return;
  try {
    const mod = await import("posthog-js");
    posthogLib = mod.default ?? mod;
  } catch {
    // PostHog not available (e.g. Node test runner) — non-critical
  }
}

function init() {
  if (initialized) return;
  if (!POSTHOG_KEY) return;
  void loadPostHog().then(() => {
    if (!posthogLib || initialized) return;
    try {
      posthogLib.init(POSTHOG_KEY, {
        api_host: POSTHOG_HOST,
        loaded: () => {
          structuredLog("Analytics", "PostHog initialized");
        },
      });
      initialized = true;
    } catch {
      // PostHog init failure is non-critical
    }
  });
}

type ElevioEvent =
  | "operator_activated"
  | "operator_released"
  | "request_created"
  | "request_picked_up"
  | "request_dropped_off"
  | "request_cancelled"
  | "passenger_qr_scanned";

interface ElevioEventProperties {
  projectId?: string;
  elevatorId?: string;
  requestId?: string;
  timestamp?: string;
  [key: string]: unknown;
}

// Timing storage: requestId → created_at timestamp
const pickupTimers = new Map<string, number>();
const dropoffTimers = new Map<string, number>();

export function trackEvent(event: ElevioEvent, properties: ElevioEventProperties = {}) {
  init();
  const enriched = {
    ...properties,
    timestamp: properties.timestamp ?? new Date().toISOString(),
  };
  structuredLog("Analytics", `${event}`, enriched);
  if (initialized && posthogLib) {
    try {
      posthogLib.capture(event, enriched);
    } catch {
      // Non-critical
    }
  }
}

/** Mark request as created — start pickup timer. */
export function trackRequestCreated(requestId: string, projectId: string, elevatorId?: string) {
  pickupTimers.set(requestId, Date.now());
  trackEvent("request_created", { requestId, projectId, elevatorId });
}

/** Mark request as picked up — compute time since created, start dropoff timer. */
export function trackRequestPickedUp(requestId: string, projectId: string, elevatorId: string) {
  const createdMs = pickupTimers.get(requestId);
  const pickupDurationMs = createdMs != null ? Date.now() - createdMs : undefined;
  dropoffTimers.set(requestId, Date.now());
  pickupTimers.delete(requestId);
  trackEvent("request_picked_up", {
    requestId,
    projectId,
    elevatorId,
    pickupDurationMs,
    pickupDurationSec: pickupDurationMs != null ? (pickupDurationMs / 1000).toFixed(1) : undefined,
  });
  if (pickupDurationMs != null && pickupDurationMs > 30_000) {
    structuredLog("Performance", "Slow pickup", { requestId, pickupDurationMs });
  }
}

/** Mark request as dropped off — compute time since picked up. */
export function trackRequestDroppedOff(requestId: string, projectId: string, elevatorId: string) {
  const pickedUpMs = dropoffTimers.get(requestId);
  const dropoffDurationMs = pickedUpMs != null ? Date.now() - pickedUpMs : undefined;
  dropoffTimers.delete(requestId);
  trackEvent("request_dropped_off", {
    requestId,
    projectId,
    elevatorId,
    dropoffDurationMs,
    dropoffDurationSec: dropoffDurationMs != null ? (dropoffDurationMs / 1000).toFixed(1) : undefined,
  });
  if (dropoffDurationMs != null && dropoffDurationMs > 60_000) {
    structuredLog("Performance", "Slow dropoff", { requestId, dropoffDurationMs });
  }
}

export function trackRequestCancelled(requestId: string, projectId: string, reason?: string) {
  pickupTimers.delete(requestId);
  dropoffTimers.delete(requestId);
  trackEvent("request_cancelled", { requestId, projectId, reason });
}

export function trackOperatorActivated(projectId: string, elevatorId: string) {
  trackEvent("operator_activated", { projectId, elevatorId });
}

export function trackOperatorReleased(projectId: string, elevatorId: string) {
  trackEvent("operator_released", { projectId, elevatorId });
}

export function trackPassengerQRScanned(projectId: string, floorId: string) {
  trackEvent("passenger_qr_scanned", { projectId, floorId });
}

// ── Structured log helper (re-exported for self-containment) ──

function structuredLog(tag: string, action: string, data?: Record<string, unknown>) {
  if (typeof window === "undefined") return; // SSR: skip
  const debug = window.localStorage.getItem("elevio_debug_sync") === "true"
    || process.env.NEXT_PUBLIC_DEBUG_SYNC === "true";
  if (!debug) return;
  console.log(`[Elevio ${tag}]`, action, data ?? "");
}
