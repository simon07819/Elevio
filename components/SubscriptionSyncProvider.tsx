"use client";

import { useEffect, useRef } from "react";
import { useSubscriptionSync } from "@/hooks/useSubscriptionSync";
import { isCapacitorNative } from "@/lib/platform";

/**
 * Client component that initializes RevenueCat subscription sync.
 * Placed in root layout so it runs on every page load for native users.
 * No-op on web (isCapacitorNative check inside the hook).
 *
 * Boot-safe: this provider NEVER blocks rendering. Children render
 * immediately while the sync runs in the background. The hook has
 * top-level try/catch so a failing RevenueCat init cannot crash the app.
 */
export function SubscriptionSyncProvider({ children }: { children: React.ReactNode }) {
  const loggedRef = useRef(false);

  useEffect(() => {
    // Log boot step for diagnostics (Xcode console).
    // This helps pinpoint whether RevenueCat/auth is blocking the boot.
    if (!loggedRef.current) {
      loggedRef.current = true;
      const native = isCapacitorNative();
      const rcKey = !!process.env.NEXT_PUBLIC_REVENUECAT_API_KEY?.trim();
      console.log("[iOS Boot]", {
        step: "subscription_sync_start",
        isNative: native,
        hasRevenueCatKey: rcKey,
        willRun: native && rcKey,
      });
    }
  }, []);

  useSubscriptionSync();
  return <>{children}</>;
}
