"use client";

import { useEffect, useRef } from "react";
import { isCapacitorNative } from "@/lib/platform";
import { configureRevenueCat, getCustomerEntitlement, logOutRevenueCat } from "@/lib/billing/revenuecat";
import { getProductId } from "@/lib/billing/productIds";
import { createClient } from "@/lib/supabase/client";
import { captureError } from "@/lib/errorTracking";

/**
 * Hook that synchronizes RevenueCat entitlements → Supabase on auth events.
 *
 * ONLY runs when:
 * - Platform is Capacitor native (iOS/Android)
 * - REVENUECAT_API_KEY is configured
 * - User has a Supabase session (authenticated)
 *
 * Does NOT run for:
 * - Unauthenticated passengers scanning QR codes
 * - Web/PWA users (no Capacitor native)
 * - Missing RevenueCat API key
 */

export function useSubscriptionSync() {
  const syncedRef = useRef(false);

  useEffect(() => {
    // ── Guard 1: only run on Capacitor native ──
    if (!isCapacitorNative()) return;

    // ── Guard 2: RevenueCat API key must be configured ──
    const rcKey = process.env.NEXT_PUBLIC_REVENUECAT_API_KEY?.trim();
    if (!rcKey) return;

    const supabase = createClient();
    if (!supabase) return;

    let cancelled = false;

    async function syncOnAuth() {
      if (cancelled) return;
      try {
        const { data: { session } } = await supabase.auth.getSession();

        if (cancelled) return;

        if (!session?.user) {
          // User logged out or no session — clean up RevenueCat
          try {
            await logOutRevenueCat();
          } catch {
            // Non-critical — RevenueCat may not be initialized yet
          }
          syncedRef.current = false;
          return;
        }

        // Configure RevenueCat with the current user
        await configureRevenueCat(session.user.id);

        if (cancelled) return;

        // Sync current entitlement from RevenueCat → Supabase
        await syncEntitlementFromRC(session.user.id);

        syncedRef.current = true;
      } catch (err) {
        // Top-level catch — never let sync crash the app
        if (!cancelled) {
          try {
            captureError(err, { action: "subscriptionSync_syncOnAuth" });
          } catch {
            // captureError may not be available yet
          }
        }
      }
    }

    // Run immediately on mount
    syncOnAuth();

    // Listen for auth state changes (login, logout, token refresh)
    let authSubscription: { unsubscribe: () => void } | null = null;
    try {
      const { data } = supabase.auth.onAuthStateChange((_event: string, session: { user?: { id: string } } | null) => {
        if (cancelled) return;
        if (session?.user) {
          if (!syncedRef.current) {
            syncOnAuth();
          }
        } else {
          try { logOutRevenueCat(); } catch { /* non-critical */ }
          syncedRef.current = false;
        }
      });
      authSubscription = data.subscription;
    } catch (err) {
      // auth.onAuthStateChange may fail if Supabase client not ready
      try {
        captureError(err, { action: "subscriptionSync_authListener" });
      } catch { /* non-critical */ }
    }

    return () => {
      cancelled = true;
      authSubscription?.unsubscribe();
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
      const { error: entError } = await supabase.from("user_entitlements").upsert({
        user_id: userId,
        plan: rcEntitlement.planId,
        activated_via: "iap",
        expires_at: rcEntitlement.expiresAt ?? null,
      }, { onConflict: "user_id" });

      if (entError) {
        captureError(new Error("entitlement upsert failed: " + entError.message), { action: "subscriptionSync_entitlementUpsert", userId, planId: rcEntitlement.planId });
      }

      // Also update the subscriptions row for consistency
      const { error: subError } = await supabase.from("subscriptions").upsert({
        user_id: userId,
        provider: "revenuecat",
        provider_subscription_id: `${userId}:iap`,
        provider_customer_id: userId,
        plan_id: rcEntitlement.planId,
        billing_period: "monthly",
        status: "active",
        current_period_end: rcEntitlement.expiresAt ?? null,
        price_id: getProductId(rcEntitlement.planId as "starter" | "pro", "monthly"),
      }, { onConflict: "user_id,provider,provider_subscription_id" });

      if (subError) {
        captureError(new Error("subscription upsert failed: " + subError.message), { action: "subscriptionSync_subscriptionUpsert", userId, planId: rcEntitlement.planId });
      }
    } else {
      // No active entitlement — check if user had IAP before (downgrade)
      const { data: existing, error: fetchError } = await supabase
        .from("user_entitlements")
        .select("activated_via, plan")
        .eq("user_id", userId)
        .maybeSingle();

      if (fetchError) {
        captureError(new Error("entitlement fetch failed: " + fetchError.message), { action: "subscriptionSync_entitlementFetch", userId });
        return;
      }

      if (existing?.activated_via === "iap") {
        // Was an IAP user with no active entitlement — downgrade to starter
        const { error: downError } = await supabase.from("user_entitlements").upsert({
          user_id: userId,
          plan: "starter",
          activated_via: "default",
          expires_at: null,
        }, { onConflict: "user_id" });

        if (downError) {
          captureError(new Error("entitlement downgrade failed: " + downError.message), { action: "subscriptionSync_downgrade", userId });
        }

        // Mark subscription as expired
        const { error: expError } = await supabase.from("subscriptions")
          .update({ status: "expired" })
          .eq("user_id", userId)
          .eq("provider", "revenuecat");

        if (expError) {
          captureError(new Error("subscription expire failed: " + expError.message), { action: "subscriptionSync_markExpired", userId });
        }
      }
    }
  } catch (err) {
    captureError(err, { action: "subscriptionSync_syncFailed", userId });
  }
}
