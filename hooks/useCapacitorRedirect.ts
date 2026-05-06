"use client";

import { useEffect, useState } from "react";

/**
 * When running inside the Capacitor native shell (iOS/Android),
 * detect native platform so the component can render mobile UI inline.
 *
 * IMPORTANT: Do NOT redirect to /welcome — it has no static HTML file
 * in the Capacitor webDir and causes an infinite reload loop.
 * Instead, the passenger QR scan page renders directly at / via ScanHome.
 *
 * Returns: { ready: boolean } — caller should render nothing until ready.
 */
export function useCapacitorRedirect() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const isNative =
      typeof window !== "undefined" &&
      typeof (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform === "function" &&
      (window as unknown as { Capacitor: { isNativePlatform: () => boolean } }).Capacitor.isNativePlatform();

    // For native Capacitor, just mark as ready — no redirect.
    // The calling component (HomeContent) will handle native detection itself.
    setReady(true);
  }, []);

  return { ready };
}
