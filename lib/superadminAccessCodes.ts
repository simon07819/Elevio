"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { PlanId } from "@/lib/billing/plans";

export type AccessCodeRow = {
  id: string;
  code: string;
  name: string;
  description: string;
  plan: PlanId;
  duration: "permanent" | "7d" | "30d" | "1y" | "custom";
  custom_expires_at: string | null;
  max_uses: number | null;
  current_uses: number;
  enabled: boolean;
  created_at: string;
};

export type AccessCodeUsageRow = {
  id: string;
  access_code_id: string;
  user_id: string;
  user_email: string;
  plan_at_activation: string;
  activated_at: string;
};

/** Get all access codes for superadmin */
export async function getAccessCodes(): Promise<AccessCodeRow[]> {
  const supabase = await createClient();
  if (!supabase) return [];

  const { data } = await supabase
    .from("access_codes")
    .select("*")
    .order("created_at", { ascending: false });

  return (data ?? []) as AccessCodeRow[];
}

/** Get usage history for a specific access code */
export async function getAccessCodeUsage(codeId: string): Promise<AccessCodeUsageRow[]> {
  const supabase = await createClient();
  if (!supabase) return [];

  const { data } = await supabase
    .from("access_code_usage")
    .select("*")
    .eq("access_code_id", codeId)
    .order("activated_at", { ascending: false });

  return (data ?? []) as AccessCodeUsageRow[];
}

/** Create a new access code */
export async function createAccessCode(formData: FormData) {
  const supabase = await createClient();
  if (!supabase) return { ok: false, message: "Service indisponible." };

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Non autorisé." };

  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const plan = String(formData.get("plan") ?? "starter") as PlanId;
  const duration = String(formData.get("duration") ?? "permanent") as AccessCodeRow["duration"];
  const maxUses = formData.get("max_uses") ? Number(formData.get("max_uses")) : null;
  const customExpiresAt = formData.get("custom_expires_at") ? String(formData.get("custom_expires_at")) : null;
  const codePrefix = String(formData.get("code_prefix") ?? "ELEV").trim().toUpperCase();

  // Auto-generate a unique code
  const suffix = Math.random().toString(36).substring(2, 8).toUpperCase();
  const code = `${codePrefix}-${suffix}`;

  const validPlans: PlanId[] = ["starter", "pro", "business", "enterprise"];
  const validDurations = ["permanent", "7d", "30d", "1y", "custom"];
  if (!validPlans.includes(plan)) return { ok: false, message: "Forfait invalide." };
  if (!validDurations.includes(duration)) return { ok: false, message: "Durée invalide." };
  if (duration === "custom" && !customExpiresAt) return { ok: false, message: "Date d'expiration requise pour durée personnalisée." };

  const { error } = await supabase.from("access_codes").insert({
    code,
    name,
    description,
    plan,
    duration,
    custom_expires_at: customExpiresAt,
    max_uses: maxUses,
    current_uses: 0,
    enabled: true,
    created_by: user.id,
  });

  if (error) {
    return { ok: false, message: `Erreur : ${error.message}` };
  }

  revalidatePath("/superadmin");
  return { ok: true, message: `Code créé : ${code}`, code };
}

/** Toggle access code enabled/disabled */
export async function toggleAccessCode(codeId: string, enabled: boolean) {
  const supabase = await createClient();
  if (!supabase) return { ok: false, message: "Service indisponible." };

  const { error } = await supabase
    .from("access_codes")
    .update({ enabled, updated_at: new Date().toISOString() })
    .eq("id", codeId);

  if (error) return { ok: false, message: `Erreur : ${error.message}` };

  revalidatePath("/superadmin");
  return { ok: true, message: enabled ? "Code activé." : "Code désactivé." };
}

/** Delete an access code */
export async function deleteAccessCode(codeId: string) {
  const supabase = await createClient();
  if (!supabase) return { ok: false, message: "Service indisponible." };

  const { error } = await supabase
    .from("access_codes")
    .delete()
    .eq("id", codeId);

  if (error) return { ok: false, message: `Erreur : ${error.message}` };

  revalidatePath("/superadmin");
  return { ok: true, message: "Code supprimé." };
}
