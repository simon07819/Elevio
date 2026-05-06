"use client";

import { useSubscriptionSync } from "@/hooks/useSubscriptionSync";

/**
 * Client component that initializes RevenueCat subscription sync.
 * Placed in root layout so it runs on every page load for native users.
 * No-op on web (isCapacitorNative check inside the hook).
 */
export function SubscriptionSyncProvider({ children }: { children: React.ReactNode }) {
  useSubscriptionSync();
  return <>{children}</>;
}
