"use client";

import { useEffect, useState } from "react";

/**
 * Minimal iOS health check page — zero providers, zero billing, zero Supabase.
 * Used to isolate Capacitor/WebKit JS Eval errors from React app errors.
 *
 * To test: set CAPACITOR_SERVER_URL to point to staging, navigate to /ios-health
 */
export default function IosHealthPage() {
  const [info, setInfo] = useState<string>("checking...");

  useEffect(() => {
    try {
      const w = window as unknown as Record<string, unknown>;
      const isCap = !!(w.Capacitor && typeof (w.Capacitor as Record<string, unknown>).isNativePlatform === "function" && ((w.Capacitor as Record<string, unknown>).isNativePlatform as () => boolean)());
      setInfo(`iOS OK | Capacitor: ${isCap} | URL: ${window.location.href} | UA: ${navigator.userAgent.slice(0, 60)}`);
    } catch (err) {
      setInfo(`ERROR: ${(err as Error).message}`);
    }
  }, []);

  return (
    <div style={{ padding: 32, fontFamily: "system-ui", color: "#f8fafc", background: "#07090d", minHeight: "100vh" }}>
      <h1>iOS Health Check</h1>
      <p style={{ fontSize: 18, fontWeight: "bold" }}>{info}</p>
      <p style={{ color: "#94a3b8" }}>This page has no providers, billing, RevenueCat, or Supabase.</p>
      <p style={{ color: "#94a3b8" }}>If you see this, React hydration works on iOS.</p>
    </div>
  );
}
