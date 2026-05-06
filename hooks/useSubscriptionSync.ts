"use client";

import { useEffect, useRef } from "react";
import { isCapacitorNative } from "@/lib/platform";
import { configureRevenueCat, getCustomerEntitlement, logOutRevenueCat } from "@/lib/billing/revenuecat";
import { createClient } from "@/lib/supabase/client";

/**
 * Hook that synchronizes RevenueCat entitlements → Supabase on auth events.
 *
 * Source of truth: **RevenueCat** (the payment processor).
 * Supabase `user_entitlements` is a *cache* that mirrors RevenueCat state.
 *
 * This hook runs:
 * - On mount (app launch / page load): syncs RevenueCat → Supabase
 * - On auth state change (login/logout): configures or logs out RevenueCat
 *
 * Guarantees:
 * - No infinite loops (runs once per auth state change)
 * - No hydration mismatch (client-only via useEffect)
 * - No aggressive polling (event-driven, not interval-based)
 * - Compatible with Capacitor iOS (safe native detection)
 * - Multi-device: syncs on every login, regardless of device
 */

export function useSubscriptionSync() {
  const syncedRef = useRef(false);

  useEffect(() => {
    const native = isCapacitorNative();
    if (!native) return;

    const supabase = createClient();
    if (!supabase) return;

    async function syncOnAuth() {
      const { data: { session } } = await supabase.auth.getSession();

      if (!session?.user) {
        // User logged out — clean up RevenueCat
        await logOutRevenueCat();
        syncedRef.current = false;
        return;
      }

      // Configure RevenueCat with the current user
      await configureRevenueCat(session.user.id);

      // Sync current entitlement from RevenueCat → Supabase
      await syncEntitlementFromRC(session.user.id);

      syncedRef.current = true;
    }

    // Run immediately on mount
    syncOnAuth();

    // Listen for auth state changes (login, logout, token refresh)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event: any, session: any) => {
      if (session?.user) {
        // Don't re-sync if we already synced for this user
        if (!syncedRef.current) {
          syncOnAuth();
        }
      } else {
        // Logged out
        logOutRevenueCat();
        syncedRef.current = false;
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);
}

/**
 * Sync the current RevenueCat entitlement into Supabase.
 * This is the critical bridge: RevenueCat = source of truth → Supabase = cache.
 */
async function syncEntitlementFromRC(userId: string): Promise<void> {
  try {
    const rcEntitlement = await getCustomerEntitlement();

    const supabase = createClient();
    if (!supabase) return;

    if (rcEntitlement && rcEntitlement.isActive) {
      // Active entitlement — upsert into Supabase
      await supabase.from("user_entitlements").upsert({
        user_id: userId,
        plan: rcEntitlement.planId,
        activated_via: "iap",
        expires_at: rcEntitlement.expiresAt ?? null,
      }, { onConflict: "user_id" });

      // Also update the subscriptions row for consistency
      await supabase.from("subscriptions").upsert({
        user_id: userId,
        provider: "revenuecat",
        provider_subscription_id: `${userId}:iap`,
        provider_customer_id: userId,
        plan_id: rcEntitlement.planId,
        billing_period: "monthly",
        status: "active",
        current_period_end: rcEntitlement.expiresAt ?? null,
        price_id: rcEntitlement.planId === "pro" ? "com.elevio.pro.monthly" : "com.elevio.starter.monthly",
      }, { onConflict: "user_id,provider,provider_subscription_id" });
    } else {
      // No active entitlement — check if user had IAP before (downgrade)
      const { data: existing } = await supabase
        .from("user_entitlements")
        .select("activated_via, plan")
        .eq("user_id", userId)
        .maybeSingle();

      if (existing?.activated_via === "iap") {
        // Was an IAP user with no active entitlement — downgrade to starter
        await supabase.from("user_entitlements").upsert({
          user_id: userId,
          plan: "starter",
          activated_via: "default",
          expires_at: null,
        }, { onConflict: "user_id" });

        // Mark subscription as expired
        await supabase.from("subscriptions")
          .update({ status: "expired" })
          .eq("user_id", userId)
          .eq("provider", "revenuecat");
      }
      // If activated_via is "admin" or "activation_code", don't touch it
    }
  } catch (err) {
    console.error("[SubscriptionSync] sync failed:", err);
  }
}
