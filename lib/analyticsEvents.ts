/**
 * Client-side event tracking — no server-only imports.
 * Used by OperatorWorkspace, RecommendedNextStop, RequestForm (client components).
 */

const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com";

type AnalyticsEvent = {
  name: string;
  properties: Record<string, unknown>;
};

const eventBuffer: AnalyticsEvent[] = [];

let initialized = !!POSTHOG_KEY;

function pushEvent(name: string, properties: Record<string, unknown> = {}) {
  const event: AnalyticsEvent = {
    name,
    properties: {
      ...properties,
      timestamp: Date.now(),
      projectId: properties.projectId ?? null,
      elevatorId: properties.elevatorId ?? null,
      requestId: properties.requestId ?? null,
    },
  };

  if (typeof window !== "undefined" && process.env.NEXT_PUBLIC_DEBUG_SYNC === "true") {
    console.log("[Elevio Analytics]", name, event.properties);
  }

  // Structured log via shared logger when available (server or client-safe)
  try {
    const { structuredLog } = require("@/lib/structuredLogger");
    structuredLog("Analytics", name, event.properties);
  } catch {
    // structuredLogger is server-only; skip in client context
  }

  if (POSTHOG_KEY) {
    void fetch(`${POSTHOG_HOST}/e/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: POSTHOG_KEY,
        event: event.name,
        properties: event.properties,
        timestamp: event.properties.timestamp,
      }),
    }).catch(() => {
      // Degrade gracefully — never block
    });
  } else {
    eventBuffer.push(event);
  }
}

export function trackRequestPickedUp(requestId: string, projectId: string, elevatorId: string) {
  pushEvent("request_picked_up", { requestId, projectId, elevatorId, userType: "operator" });
}

export function trackRequestDroppedOff(requestId: string, projectId: string, elevatorId: string) {
  pushEvent("request_dropped_off", { requestId, projectId, elevatorId, userType: "operator" });
}

export function trackOperatorActivated(projectId: string, elevatorId: string) {
  pushEvent("operator_activated", { projectId, elevatorId, userType: "operator" });
}

export function trackRequestCreated(requestId: string, projectId: string) {
  pushEvent("request_created", { requestId, projectId, userType: "passenger" });
}

export function trackRequestCancelled(requestId: string, projectId: string, reason?: string) {
  pushEvent("request_cancelled", { requestId, projectId, reason, userType: "operator" });
}

export function trackRequestSkipped(requestId: string, projectId: string, elevatorId: string) {
  pushEvent("request_skipped", { requestId, projectId, elevatorId, userType: "operator" });
}

export function trackOperatorReleased(projectId: string, elevatorId: string) {
  pushEvent("operator_released", { projectId, elevatorId, userType: "operator" });
}

export function trackPassengerQRScanned(projectId: string, floorId: string) {
  pushEvent("passenger_qr_scanned", { projectId, floorId, userType: "passenger" });
}

export function getEventBuffer(): ReadonlyArray<AnalyticsEvent> {
  return eventBuffer;
}

// ── Pickup/dropoff timing (performance monitoring) ──────────────────────────

const pickupTimers = new Map<string, number>();
const dropoffTimers = new Map<string, number>();

export function startPickupToDbTimer(context: { projectId: string; elevatorId: string; requestId: string }): () => number {
  const start = performance.now();
  pickupTimers.set(context.requestId, start);
  return () => {
    const end = performance.now();
    const pickupDurationMs = end - start;
    const pickupDurationSec = pickupDurationMs / 1000;
    pickupTimers.delete(context.requestId);
    if (pickupDurationMs > 30_000) {
      console.warn("[Elevio Performance] Slow pickup", { pickupDurationMs, threshold: 30_000, ...context });
    }
    pushEvent("pickup_db_duration", { ...context, pickupDurationMs, pickupDurationSec });
    return pickupDurationMs;
  };
}

export function startDropoffToDbTimer(context: { projectId: string; elevatorId: string; requestId: string }): () => number {
  const start = performance.now();
  dropoffTimers.set(context.requestId, start);
  return () => {
    const end = performance.now();
    const dropoffDurationMs = end - start;
    const dropoffDurationSec = dropoffDurationMs / 1000;
    dropoffTimers.delete(context.requestId);
    if (dropoffDurationMs > 60_000) {
      console.warn("[Elevio Performance] Slow dropoff", { dropoffDurationMs, threshold: 60_000, ...context });
    }
    pushEvent("dropoff_db_duration", { ...context, dropoffDurationMs, dropoffDurationSec });
    return dropoffDurationMs;
  };
}
