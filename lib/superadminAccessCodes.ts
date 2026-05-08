"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { PlanId } from "@/lib/billing/plans";

export type AccessCodeSource =
  | "free"
  | "manual"
  | "manual_code"
  | "revenuecat"
  | "app_store"
  | "stripe";

export type AccessCodeBillingInterval = "monthly" | "annual" | "permanent";

export type AccessCodeDuration = "permanent" | "7d" | "30d" | "1y" | "custom";

export type AccessCodeRow = {
  id: string;
  code: string;
  name: string;
  description: string;
  plan: PlanId;
  source: AccessCodeSource;
  billing_interval: AccessCodeBillingInterval;
  company_name: string;
  notes: string;
  discount_percent: number | null;
  duration: AccessCodeDuration;
  custom_expires_at: string | null;
  expires_at: string | null;
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

const VALID_PLANS: PlanId[] = ["free", "starter", "pro", "business", "enterprise"];
const VALID_SOURCES: AccessCodeSource[] = [
  "free",
  "manual",
  "manual_code",
  "revenuecat",
  "app_store",
  "stripe",
];
const VALID_INTERVALS: AccessCodeBillingInterval[] = ["monthly", "annual", "permanent"];
const VALID_DURATIONS: AccessCodeDuration[] = ["permanent", "7d", "30d", "1y", "custom"];

function generateCode(prefix: string): string {
  const safePrefix = (prefix || "ELEV").replace(/[^A-Z0-9]/gi, "").toUpperCase().slice(0, 10) || "ELEV";
  const suffix = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `${safePrefix}-${suffix}`;
}

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

/** Create one or many access codes (used by the superadmin "Codes achat" page) */
export async function createAccessCode(formData: FormData) {
  const supabase = await createClient();
  if (!supabase) return { ok: false, message: "Service indisponible." };

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Non autorisé." };

  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const plan = String(formData.get("plan") ?? "starter") as PlanId;
  const source = String(formData.get("source") ?? "manual_code") as AccessCodeSource;
  const billingInterval = String(
    formData.get("billing_interval") ?? "monthly",
  ) as AccessCodeBillingInterval;
  const duration = String(formData.get("duration") ?? "permanent") as AccessCodeDuration;
  const maxUsesRaw = formData.get("max_uses");
  const maxUses = maxUsesRaw && String(maxUsesRaw).length > 0 ? Number(maxUsesRaw) : null;
  const customExpiresAt = formData.get("custom_expires_at")
    ? String(formData.get("custom_expires_at"))
    : null;
  const expiresAt = formData.get("expires_at") ? String(formData.get("expires_at")) : null;
  const discountRaw = formData.get("discount_percent");
  const discountPercent =
    discountRaw && String(discountRaw).length > 0 ? Number(discountRaw) : null;
  const companyName = String(formData.get("company_name") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  const codePrefix = String(formData.get("code_prefix") ?? "ELEV").trim().toUpperCase();
  const countRaw = formData.get("count");
  const count = Math.max(1, Math.min(50, Number(countRaw ?? 1) || 1));

  if (!VALID_PLANS.includes(plan)) return { ok: false, message: "Forfait invalide." };
  if (!VALID_SOURCES.includes(source)) return { ok: false, message: "Source invalide." };
  if (!VALID_INTERVALS.includes(billingInterval))
    return { ok: false, message: "Cycle de facturation invalide." };
  if (!VALID_DURATIONS.includes(duration))
    return { ok: false, message: "Durée invalide." };
  if (duration === "custom" && !customExpiresAt)
    return { ok: false, message: "Date d'expiration requise pour durée personnalisée." };
  if (
    discountPercent !== null &&
    (Number.isNaN(discountPercent) || discountPercent < 0 || discountPercent > 100)
  ) {
    return { ok: false, message: "Rabais invalide (0-100)." };
  }
  if (maxUses !== null && (Number.isNaN(maxUses) || maxUses < 1)) {
    return { ok: false, message: "Nombre d'utilisations invalide." };
  }

  const rows = Array.from({ length: count }).map(() => ({
    code: generateCode(codePrefix),
    name,
    description,
    plan,
    source,
    billing_interval: billingInterval,
    duration,
    custom_expires_at: customExpiresAt,
    expires_at: expiresAt,
    max_uses: maxUses,
    current_uses: 0,
    enabled: true,
    company_name: companyName,
    notes,
    discount_percent: discountPercent,
    created_by: user.id,
  }));

  const { data, error } = await supabase
    .from("access_codes")
    .insert(rows)
    .select("code");

  if (error) {
    return { ok: false, message: `Erreur : ${error.message}` };
  }

  revalidatePath("/superadmin/codes");

  const created = (data ?? []).map((r) => (r as { code: string }).code);
  return {
    ok: true,
    message: count === 1
      ? `Code créé : ${created[0] ?? ""}`
      : `${created.length} codes créés.`,
    codes: created,
  };
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

  revalidatePath("/superadmin/codes");
  return { ok: true, message: enabled ? "Code activé." : "Code désactivé." };
}

/** Delete an access code (only safe if it has never been redeemed) */
export async function deleteAccessCode(codeId: string) {
  const supabase = await createClient();
  if (!supabase) return { ok: false, message: "Service indisponible." };

  const { data: existing, error: readError } = await supabase
    .from("access_codes")
    .select("id, current_uses")
    .eq("id", codeId)
    .maybeSingle();

  if (readError) return { ok: false, message: `Erreur : ${readError.message}` };
  if (!existing) return { ok: false, message: "Code introuvable." };
  if ((existing.current_uses ?? 0) > 0) {
    return {
      ok: false,
      message: "Ce code a déjà été utilisé — désactivez-le plutôt que de le supprimer.",
    };
  }

  const { error } = await supabase
    .from("access_codes")
    .delete()
    .eq("id", codeId);

  if (error) return { ok: false, message: `Erreur : ${error.message}` };

  revalidatePath("/superadmin/codes");
  return { ok: true, message: "Code supprimé." };
}
