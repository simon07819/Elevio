"use client";

import { useEffect } from "react";

/**
 * Global error logger for iOS boot diagnostics.
 * Installs window.onerror and onunhandledrejection as early as possible.
 * All errors are logged to console AND to captureError if available.
 * This component renders nothing.
 */
export function BootErrorLogger() {
  useEffect(() => {
    // ── iOS Boot Marker ──
    const isCapacitor = typeof window !== "undefined" &&
      typeof (window as unknown as Record<string, unknown>).Capacitor === "object";
    console.log("[iOS Boot]", {
      pathname: window.location.pathname,
      isCapacitor,
      hasSession: false, // will be determined by subscription sync
    });

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
