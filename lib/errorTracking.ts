/**
 * Sentry error tracking wrapper for Elevio.
 *
 * Captures client errors, server action errors, and Supabase errors
 * with Elevio-specific metadata.
 * Gracefully degrades if NEXT_PUBLIC_SENTRY_DSN is not set or Sentry not available.
 */

const SENTRY_DSN = typeof process !== "undefined" ? (process.env.NEXT_PUBLIC_SENTRY_DSN ?? "") : "";

let initialized = false;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let SentryLib: any = null;

async function loadSentry() {
  if (SentryLib) return;
  try {
    SentryLib = await import("@sentry/nextjs");
  } catch {
    // Sentry not available (e.g. Node test runner) — non-critical
  }
}

export function initSentry() {
  if (initialized) return;
  if (!SENTRY_DSN) return;
  void loadSentry().then(() => {
    if (!SentryLib || initialized) return;
    try {
      SentryLib.init({
        dsn: SENTRY_DSN,
        tracesSampleRate: 0.1,
        replaysSessionSampleRate: 0,
        replaysOnErrorSampleRate: 0.5,
        environment: typeof process !== "undefined" ? (process.env.NODE_ENV ?? "production") : "production",
        enabled: typeof process !== "undefined" ? process.env.NODE_ENV === "production" : true,
      });
      initialized = true;
      structuredLog("Error", "Sentry initialized");
    } catch {
      // Sentry init failure is non-critical
    }
  });
}

type UserType = "operator" | "passenger" | "admin" | "unknown";

interface ElevioErrorContext {
  projectId?: string;
  elevatorId?: string;
  requestId?: string;
  userType?: UserType;
  action?: string;
  userId?: string;
  path?: string;
  statusCode?: number;
  [key: string]: unknown;
}

function mapActionToCategory(action?: string): string {
  if (!action) return "general";
  const a = action.toLowerCase();
  if (a.includes("dispatch")) return "dispatch";
  if (a.includes("auth") || a.includes("login") || a.includes("signin")) return "auth";
  if (a.includes("billing") || a.includes("plan") || a.includes("subscription")) return "billing";
  if (a.includes("sync") || a.includes("realtime") || a.includes("poll")) return "sync";
  if (a.includes("api") || a.includes("webhook")) return "api";
  if (a.includes("operator") || a.includes("activate") || a.includes("release")) return "operator";
  if (a.includes("passenger") || a.includes("request")) return "passenger";
  if (a.includes("ui") || a.includes("render")) return "ui";
  return "general";
}

/**
 * Capture a non-critical, recoverable condition (e.g. realtime broadcast subscribe timeout).
 * Logged as `warning` in app_errors and `Sentry.captureMessage(level="warning")` so it is
 * never reported as a hard error in production dashboards.
 */
export function captureWarning(message: string, context: ElevioErrorContext = {}) {
  initSentry();
  structuredLog("Error", context.action ?? "warning", { message, level: "warning", ...context });

  if (typeof window !== "undefined") {
    fetch("/api/errors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message,
        error: message,
        category: mapActionToCategory(context.action),
        level: "warning",
        projectId: context.projectId,
        path: context.path,
        statusCode: context.statusCode,
        metadata: context,
      }),
    }).catch(() => {
      // Fire-and-forget, failure is non-critical
    });
  }

  if (initialized && SentryLib) {
    try {
      SentryLib.withScope((scope: typeof SentryLib.Scope) => {
        scope.setLevel("warning");
        if (context.projectId) scope.setTag("projectId", context.projectId);
        if (context.elevatorId) scope.setTag("elevatorId", context.elevatorId);
        if (context.requestId) scope.setTag("requestId", context.requestId);
        if (context.userType) scope.setTag("userType", context.userType);
        if (context.action) scope.setTag("action", context.action);
        for (const [key, value] of Object.entries(context)) {
          if (!["projectId", "elevatorId", "requestId", "userType", "action"].includes(key)) {
            scope.setExtra(key, value);
          }
        }
        SentryLib.captureMessage(message, "warning");
      });
    } catch {
      // Sentry capture failure is non-critical
    }
  }
}

export function captureError(error: unknown, context: ElevioErrorContext = {}) {
  initSentry();
  structuredLog("Error", context.action ?? "unknown_error", {
    message: error instanceof Error ? error.message : String(error),
    ...context,
  });

  // Client-side: POST to /api/errors to persist in app_errors table
  if (typeof window !== "undefined") {
    fetch("/api/errors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: error instanceof Error ? error.message : String(error),
        error: error instanceof Error ? error.stack ?? error.message : String(error),
        category: mapActionToCategory(context.action),
        level: "error",
        projectId: context.projectId,
        path: context.path,
        statusCode: context.statusCode,
        metadata: context,
      }),
    }).catch(() => {
      // Fire-and-forget, failure is non-critical
    });
  }

  if (initialized && SentryLib) {
    try {
      SentryLib.withScope((scope: typeof SentryLib.Scope) => {
        if (context.projectId) scope.setTag("projectId", context.projectId);
        if (context.elevatorId) scope.setTag("elevatorId", context.elevatorId);
        if (context.requestId) scope.setTag("requestId", context.requestId);
        if (context.userType) scope.setTag("userType", context.userType);
        if (context.action) scope.setTag("action", context.action);
        for (const [key, value] of Object.entries(context)) {
          if (!["projectId", "elevatorId", "requestId", "userType", "action"].includes(key)) {
            scope.setExtra(key, value);
          }
        }
        SentryLib.captureException(error);
      });
    } catch {
      // Sentry capture failure is non-critical
    }
  }
}

/** Wrap a server action with error tracking. */
export async function trackedAction<T>(
  action: string,
  fn: () => Promise<T>,
  context: ElevioErrorContext = {},
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    captureError(error, { ...context, action });
    throw error;
  }
}

function structuredLog(tag: string, action: string, data?: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  const debug = window.localStorage.getItem("elevio_debug_sync") === "true"
    || process.env.NEXT_PUBLIC_DEBUG_SYNC === "true";
  if (!debug) return;
  console.log(`[Elevio ${tag}]`, action, data ?? "");
}
