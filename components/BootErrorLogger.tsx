"use client";

import { useEffect } from "react";

/**
 * Global error logger + boot diagnostics for iOS.
 *
 * Installs window.onerror / onunhandledrejection as early as possible.
 * Logs precise boot steps so we can pinpoint WHERE the app gets stuck:
 *   1. React hydration started
 *   2. Auth ready
 *   3. Payment/RevenueCat ready (or skipped)
 *   4. Route resolved
 *
 * All errors are logged to console AND to captureError if available.
 * This component renders nothing.
 */
export function BootErrorLogger() {
  useEffect(() => {
    // ── iOS Boot Marker ──
    const isCapacitor = typeof window !== "undefined" &&
      typeof (window as unknown as Record<string, unknown>).Capacitor === "object";
    console.log("[iOS Boot]", {
      step: "react_hydrated",
      pathname: window.location.pathname,
      isCapacitor,
      timestamp: Date.now(),
    });

    // ── Boot step tracking ──
    // Each provider/action logs when it resolves, so we can see the full
    // boot chain in Xcode console and pinpoint where it gets stuck.
    const bootSteps: Record<string, number> = { react_hydrated: Date.now() };

    (window as unknown as Record<string, unknown>).__ELEVIO_BOOT_STEPS__ = bootSteps;

    // ── Global error handlers ──
    const origOnError = window.onerror;
    window.onerror = (message, source, lineno, colno, error) => {
      console.error("[Boot Error] onerror:", { message: String(message), source, lineno, colno, stack: error?.stack });
      try {
        const { captureError } = require("@/lib/errorTracking");
        captureError(error ?? new Error(String(message)), { action: "boot_onerror", source, lineno, colno });
      } catch { /* errorTracking not available */ }
      if (origOnError) origOnError(message, source, lineno, colno, error);
    };

    const origOnRejection = window.onunhandledrejection;
    window.onunhandledrejection = (event) => {
      const reason = event.reason;
      console.error("[Boot Error] unhandled rejection:", {
        message: reason?.message ?? String(reason),
        stack: reason?.stack,
      });
      try {
        const { captureError } = require("@/lib/errorTracking");
        captureError(reason instanceof Error ? reason : new Error(String(reason)), { action: "boot_unhandledRejection" });
      } catch { /* errorTracking not available */ }
      if (origOnRejection) origOnRejection.call(window, event);
    };

    return () => {
      window.onerror = origOnError;
      window.onunhandledrejection = origOnRejection;
    };
  }, []);

  return null;
}
