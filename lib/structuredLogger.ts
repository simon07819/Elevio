/**
 * Structured logger for Elevio.
 *
 * Centralized logging with consistent tags:
 *   [Elevio Analytics]  — analytics events
 *   [Elevio Error]      — error tracking
 *   [Elevio Performance] — performance metrics
 *   [Elevio Sync]       — realtime sync / poll events
 *
 * Each log includes:
 *   - timestamp (ISO)
 *   - requestId (if applicable)
 *   - elevatorId (if applicable)
 *   - action
 *
 * Controlled by:
 *   - NEXT_PUBLIC_DEBUG_SYNC=true (env)
 *   - localStorage.elevio_debug_sync=true (runtime)
 */

export type ElevioLogTag = "Analytics" | "Error" | "Performance" | "Sync";

export interface ElevioLogEntry {
  timestamp: string;
  tag: ElevioLogTag;
  action: string;
  requestId?: string;
  elevatorId?: string;
  projectId?: string;
  [key: string]: unknown;
}

const MAX_LOG_HISTORY = 200;
const logHistory: ElevioLogEntry[] = [];

function isDebugEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem("elevio_debug_sync") === "true"
    || process.env.NEXT_PUBLIC_DEBUG_SYNC === "true";
}

export function structuredLog(
  tag: ElevioLogTag,
  action: string,
  data?: Record<string, unknown>,
): void {
  const entry: ElevioLogEntry = {
    timestamp: new Date().toISOString(),
    tag,
    action,
    ...data,
  };

  // Store in circular buffer
  logHistory.push(entry);
  if (logHistory.length > MAX_LOG_HISTORY) {
    logHistory.shift();
  }

  // Only console.log if debug enabled
  if (isDebugEnabled()) {
    console.log(`[Elevio ${tag}]`, action, data ?? "");
  }
}

/** Retrieve recent log entries (for admin/metrics page). */
export function getLogHistory(limit = 50): ElevioLogEntry[] {
  return logHistory.slice(-limit);
}

/** Clear log history. */
export function clearLogHistory(): void {
  logHistory.length = 0;
}

/** Get performance entries only. */
export function getPerformanceLogs(limit = 20): ElevioLogEntry[] {
  return logHistory.filter(e => e.tag === "Performance").slice(-limit);
}

/** Get error entries only. */
export function getErrorLogs(limit = 20): ElevioLogEntry[] {
  return logHistory.filter(e => e.tag === "Error").slice(-limit);
}
