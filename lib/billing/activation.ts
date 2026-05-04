/**
 * Enterprise activation code logic.
 *
 * Server action to validate and redeem an activation code,
 * granting the user a Business or Enterprise plan.
 */
"use server";

import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/utils";
import type { PlanId } from "./plans";

export interface ActivationResult {
  ok: boolean;
  message: string;
  plan?: PlanId;
  companyName?: string;
  maxProjects?: number | null;
  maxOperators?: number | null;
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

  // Look up the code
  const { data: codeRow, error: codeError } = await supabase
    .from("enterprise_activation_codes")
    .select("id, code, company_name, plan, max_projects, max_operators, expires_at, used_at")
    .eq("code", trimmed)
    .maybeSingle();

  if (codeError) {
    return { ok: false, message: "Erreur de vérification. Réessayez." };
  }

  if (!codeRow) {
    return { ok: false, message: "Code introuvable. Vérifiez et réessayez." };
  }

  // Check if already used
  if (codeRow.used_at) {
    return { ok: false, message: "Ce code a déjà été utilisé." };
  }

  // Check if expired
  if (codeRow.expires_at && new Date(codeRow.expires_at) < new Date()) {
    return { ok: false, message: "Ce code a expiré. Contactez votre représentant." };
  }

  // Mark the code as used
  const now = new Date().toISOString();
  const { error: updateError } = await supabase
    .from("enterprise_activation_codes")
    .update({
      used_at: now,
      used_by_user_id: user.id,
    })
    .eq("id", codeRow.id);

  if (updateError) {
    return { ok: false, message: "Erreur d'activation. Réessayez." };
  }

  // Upsert user entitlement
  const { error: entitlementError } = await supabase
    .from("user_entitlements")
    .upsert({
      user_id: user.id,
      plan: codeRow.plan,
      activated_via: "activation_code",
      activation_code_id: codeRow.id,
      updated_at: now,
    }, { onConflict: "user_id" });

  if (entitlementError) {
    // Roll back the code usage
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
    companyName: codeRow.company_name,
    maxProjects: codeRow.max_projects,
    maxOperators: codeRow.max_operators,
  };
}
