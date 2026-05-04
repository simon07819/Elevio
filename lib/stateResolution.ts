/**
 * Central state resolution for Elevio.
 *
 * Rules:
 * - DB is the only source of truth
 * - Client React state is never the truth
 * - A less-advanced status NEVER overwrites a more-advanced status
 * - boarded/onboard => dropoff (NEVER pickup)
 * - pending/assigned/arriving => pickup
 * - completed/cancelled => none
 */

import type { RequestStatus, HoistRequest } from "../types/hoist";

// ── Status Priority ──────────────────────────────────────────────────────
// Higher number = more advanced state. A lower-priority status must never
// overwrite a higher-priority status in the client.

export const STATUS_PRIORITY: Record<RequestStatus, number> = {
  pending: 1,
  assigned: 2,
  arriving: 2,
  boarded: 3,
  completed: 4,
  cancelled: 4,
};

export function statusPriority(status: RequestStatus): number {
  return STATUS_PRIORITY[status] ?? 0;
}

/** Returns true if the status is terminal (no further transitions). */
export function isTerminalStatus(status: RequestStatus): boolean {
  return status === "completed" || status === "cancelled";
}

/** Returns true if the request represents a passenger currently in the elevator. */
export function isOnboard(status: RequestStatus): boolean {
  return status === "boarded";
}

/** Returns true if the request is still waiting to be picked up. */
export function isAwaitingPickup(status: RequestStatus): boolean {
  return status === "pending" || status === "assigned" || status === "arriving";
}

/** Returns true if the request is active (not terminal). */
export function isActiveRequest(status: RequestStatus): boolean {
  return !isTerminalStatus(status);
}

// ── Resolved Action ──────────────────────────────────────────────────────

export type ResolvedAction = "pickup" | "dropoff" | "none";

export type ResolvedRequestState = {
  /** Whether the request is active (not completed/cancelled). */
  active: boolean;
  /** Whether the passenger is onboard/in the elevator. */
  onboard: boolean;
  /** Whether the request has reached a terminal state. */
  terminal: boolean;
  /** What action the operator should display. */
  action: ResolvedAction;
  /** Numeric priority of the current status. */
  priority: number;
};

/**
 * Central resolver: given a request, determine the operator action.
 *
 * Rules:
 * - boarded/onboard => dropoff
 * - pending/assigned/arriving => pickup
 * - completed/cancelled => none
 * - boarded MUST NEVER display pickup
 */
export function resolveRequestState(request: { status: RequestStatus } | HoistRequest): ResolvedRequestState {
  const { status } = request;
  const priority = statusPriority(status);
  const terminal = isTerminalStatus(status);
  const onboard = isOnboard(status);
  const active = isActiveRequest(status);

  let action: ResolvedAction;
  if (terminal) {
    action = "none";
  } else if (onboard) {
    action = "dropoff";
  } else if (isAwaitingPickup(status)) {
    action = "pickup";
  } else {
    // Shouldn't happen but fallback
    action = "none";
  }

  return { active, onboard, terminal, action, priority };
}

/**
 * Resolve action for multiple requests — returns the primary action
 * the operator should see.
 */
export function resolveOperatorAction(requests: { status: RequestStatus }[]): ResolvedAction {
  const hasBoarded = requests.some(r => isOnboard(r.status));
  const hasAwaiting = requests.some(r => isAwaitingPickup(r.status));

  if (hasBoarded) return "dropoff";
  if (hasAwaiting) return "pickup";
  return "none";
}

// ── Merge Guard ───────────────────────────────────────────────────────────

/**
 * Determines whether an incoming status should be accepted over the current status.
 * A less-advanced status NEVER overwrites a more-advanced status.
 *
 * Returns the winning request (existing or incoming).
 */
export function resolveMerge(existing: HoistRequest | undefined, incoming: HoistRequest): HoistRequest {
  if (!existing) return incoming;

  const existingTerminal = isTerminalStatus(existing.status);
  const incomingTerminal = isTerminalStatus(incoming.status);

  // Terminal status always wins over non-terminal
  if (existingTerminal && !incomingTerminal) return existing;
  if (!existingTerminal && incomingTerminal) return incoming;

  // Both terminal or both non-terminal: higher priority wins
  const existingPriority = statusPriority(existing.status);
  const incomingPriority = statusPriority(incoming.status);

  if (existingPriority > incomingPriority) return existing;
  if (incomingPriority > existingPriority) return incoming;

  // Same priority: newer updated_at wins
  return new Date(incoming.updated_at) >= new Date(existing.updated_at) ? incoming : existing;
}

// ── Debug Logging ────────────────────────────────────────────────────────

const DEBUG_SYNC = typeof window !== "undefined" && (
  ((window as unknown as { __NEXT_DATA__?: { env?: { NEXT_PUBLIC_DEBUG_SYNC?: string } } }).__NEXT_DATA__?.env?.NEXT_PUBLIC_DEBUG_SYNC === "true") ||
  typeof process !== "undefined" && process.env.NEXT_PUBLIC_DEBUG_SYNC === "true"
);

function shouldLog(): boolean {
  if (DEBUG_SYNC) return true;
  // Also check at runtime so toggling doesn't require redeploy
  if (typeof window !== "undefined") {
    try {
      return localStorage.getItem("elevio_debug_sync") === "true";
    } catch { return false; }
  }
  return false;
}

export function logState(context: string, data: Record<string, unknown>) {
  if (!shouldLog()) return;
  console.log(`[Elevio State] ${context}`, data);
}

export function logSync(context: string, data: Record<string, unknown>) {
  if (!shouldLog()) return;
  const tag = context.includes("passenger") ? "[Elevio Passenger Sync]" :
              context.includes("bfcache") || context.includes("visibility") ? "[Elevio Sync]" :
              "[Elevio Sync]";
  console.log(`${tag} ${context}`, data);
}

export function logAction(context: string, data: Record<string, unknown>) {
  if (!shouldLog()) return;
  const tag = context.includes("Cleanup") || context.includes("Orphaned") ? "[Elevio Cleanup]" :
              context.includes("release") ? "[Elevio Release]" :
              context.includes("Pickup") || context.includes("pickup") ? "[Elevio Pickup Redirect]" :
              "[Elevio Action]";
  console.log(`${tag} ${context}`, data);
}

export function logMerge(context: string, data: Record<string, unknown>) {
  if (!shouldLog()) return;
  console.log(`[Elevio Merge] ${context}`, data);
}
