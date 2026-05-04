"use server";

import { createClient } from "@/lib/supabase/server";

export type SiteSetting = {
  key: string;
  value: string;
  label: string;
  updated_at: string | null;
};

/** Keys that the superadmin can edit */
export const EDITABLE_SETTINGS: Array<{ key: string; label: string; defaultValue: string }> = [
  { key: "support_email", label: "Courriel support", defaultValue: "support@elevio.app" },
  { key: "support_phone", label: "Téléphone support", defaultValue: "" },
  { key: "footer_text", label: "Texte footer", defaultValue: "© Elevio — Gestion intelligente d'ascenseurs de chantier" },
  { key: "faq_content", label: "FAQ (JSON ou texte)", defaultValue: "[]" },
  { key: "contact_enterprise_message", label: "Message contact enterprise", defaultValue: "Décrivez votre projet et nous vous recontacterons sous 24h." },
  { key: "help_app_text", label: "Texte aide dans l'app", defaultValue: "" },
  { key: "legal_privacy_url", label: "URL politique confidentialité", defaultValue: "/legal/privacy" },
  { key: "legal_terms_url", label: "URL conditions d'utilisation", defaultValue: "/legal/terms" },
  { key: "maintenance_message", label: "Message maintenance (vide = aucun)", defaultValue: "" },
  { key: "product_name", label: "Nom du produit", defaultValue: "Elevio" },
  { key: "site_url", label: "URL du site", defaultValue: "" },
];

/** Fetch all site settings */
export async function getSiteSettings(): Promise<SiteSetting[]> {
  const supabase = await createClient();
  if (!supabase) return EDITABLE_SETTINGS.map((s) => ({ ...s, value: s.defaultValue, updated_at: null }));

  const { data } = await supabase.from("site_settings").select("key,value,updated_at");

  const map = new Map((data ?? []).map((r: { key: string; value: string; updated_at: string | null }) => [r.key, r]));

  return EDITABLE_SETTINGS.map((s) => ({
    key: s.key,
    label: s.label,
    value: map.get(s.key)?.value ?? s.defaultValue,
    updated_at: map.get(s.key)?.updated_at ?? null,
  }));
}

/** Save a site setting */
export async function saveSiteSetting(key: string, value: string): Promise<{ ok: boolean; message: string }> {
  const supabase = await createClient();
  if (!supabase) return { ok: false, message: "Service indisponible." };

  const { error } = await supabase
    .from("site_settings")
    .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" });

  if (error) return { ok: false, message: error.message };
  return { ok: true, message: "Sauvegardé." };
}
