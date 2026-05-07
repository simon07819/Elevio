/**
 * Access code activation logic.
 *
 * Server action to validate and redeem an access code,
 * granting the user the associated plan for the code's duration.
 *
 * Codes support: multi-use, duration (7d/30d/1y/permanent/custom),
 * max usage limit, enable/disable toggle, and all plan types.
 */
"use server";

import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PlanId } from "./plans";

export interface ActivationResult {
  ok: boolean;
  message: string;
  plan?: PlanId;
}

/** Calculate expires_at based on duration */
function calculateExpiry(duration: string, customExpiresAt: string | null): string | null {
  const now = new Date();
  switch (duration) {
    case "7d": return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
    case "30d": return new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
    case "1y": return new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000).toISOString();
    case "custom": return customExpiresAt;
    case "permanent": default: return null;
  }
}

export async function activateEnterpriseCode(code: string): Promise<ActivationResult> {
  const trimmed = code.trim().toUpperCase();

  if (!trimmed || trimmed.length < 4) {
    return { ok: false, message: "Code invalide." };
  }

  const supabase = await createClient();
  if (!supabase) {
    return { ok: false, message: "Service indisponible." };
  }

  // Get the current user
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, message: "Connexion requise pour activer un code." };
  }

  // Look up the code in the new access_codes table (case-insensitive via uppercase)
  const { data: codeRow, error: codeError } = await supabase
    .from("access_codes")
    .select("id, code, name, plan, duration, custom_expires_at, max_uses, current_uses, enabled")
    .eq("code", trimmed)
    .maybeSingle();

  // Fallback: check legacy enterprise_activation_codes table
  if (!codeRow && !codeError) {
    return await activateLegacyCode(supabase, user.id, trimmed);
  }

  if (codeError) {
    return { ok: false, message: "Erreur de vérification. Réessayez." };
  }

  if (!codeRow) {
    return { ok: false, message: "Code introuvable. Vérifiez et réessayez." };
  }

  // Check if code is enabled
  if (!codeRow.enabled) {
    return { ok: false, message: "Ce code est désactivé. Contactez votre représentant." };
  }

  // Check if code has reached max uses
  if (codeRow.max_uses !== null && codeRow.max_uses > 0 && codeRow.current_uses >= codeRow.max_uses) {
    return { ok: false, message: "Ce code a atteint sa limite d'utilisation." };
  }

  // Calculate expiry for the entitlement
  const entitlementExpiresAt = calculateExpiry(codeRow.duration, codeRow.custom_expires_at);

  // Increment usage count
  const now = new Date().toISOString();
  const { error: updateError } = await supabase
    .from("access_codes")
    .update({
      current_uses: codeRow.current_uses + 1,
      updated_at: now,
    })
    .eq("id", codeRow.id);

  if (updateError) {
    return { ok: false, message: "Erreur d'activation. Réessayez." };
  }

  // Record usage
  await supabase.from("access_code_usage").insert({
    access_code_id: codeRow.id,
    user_id: user.id,
    user_email: user.email ?? "",
    plan_at_activation: codeRow.plan,
    activated_at: now,
  });

  // Upsert user entitlement
  const { error: entitlementError } = await supabase
    .from("user_entitlements")
    .upsert({
      user_id: user.id,
      plan: codeRow.plan,
      activated_via: "activation_code",
      activation_code_id: codeRow.id,
      expires_at: entitlementExpiresAt,
      updated_at: now,
    }, { onConflict: "user_id" });

  if (entitlementError) {
    // Roll back usage count
    await supabase
      .from("access_codes")
      .update({ current_uses: codeRow.current_uses, updated_at: now })
      .eq("id", codeRow.id);
    return { ok: false, message: "Erreur d'enregistrement. Réessayez." };
  }

  const planLabels: Record<string, string> = {
    starter: "Starter",
    pro: "Pro",
    business: "Business",
    enterprise: "Enterprise",
  };

  return {
    ok: true,
    message: `Forfait ${planLabels[codeRow.plan] ?? codeRow.plan} activé avec succès !`,
    plan: codeRow.plan as PlanId,
  };
}

/** Fallback: activate legacy enterprise_activation_codes (for existing codes) */
async function activateLegacyCode(supabase: SupabaseClient | null, userId: string, code: string): Promise<ActivationResult> {
  if (!supabase) return { ok: false, message: "Service indisponible." };
  const { data: codeRow, error } = await supabase
    .from("enterprise_activation_codes")
    .select("id, code, company_name, plan, max_projects, max_operators, expires_at, used_at")
    .eq("code", code)
    .maybeSingle();

  if (error || !codeRow) {
    return { ok: false, message: "Code introuvable. Vérifiez et réessayez." };
  }

  if (codeRow.used_at) {
    return { ok: false, message: "Ce code a déjà été utilisé." };
  }

  if (codeRow.expires_at && new Date(codeRow.expires_at) < new Date()) {
    return { ok: false, message: "Ce code a expiré. Contactez votre représentant." };
  }

  const now = new Date().toISOString();
  await supabase
    .from("enterprise_activation_codes")
    .update({ used_at: now, used_by_user_id: userId })
    .eq("id", codeRow.id);

  const { error: entError } = await supabase
    .from("user_entitlements")
    .upsert({
      user_id: userId,
      plan: codeRow.plan,
      activated_via: "activation_code",
      activation_code_id: codeRow.id,
      updated_at: now,
    }, { onConflict: "user_id" });

  if (entError) {
    await supabase
      .from("enterprise_activation_codes")
      .update({ used_at: null, used_by_user_id: null })
      .eq("id", codeRow.id);
    return { ok: false, message: "Erreur d'enregistrement. Réessayez." };
  }

  return {
    ok: true,
    message: `Plan ${codeRow.plan === "enterprise" ? "Enterprise" : "Business"} activé avec succès !`,
    plan: codeRow.plan as PlanId,
  };
}
