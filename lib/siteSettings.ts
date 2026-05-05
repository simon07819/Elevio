"use server";

import { createClient } from "@/lib/supabase/server";
import { EDITABLE_SETTINGS, type SiteSetting } from "@/lib/siteSettingsConfig";

/** Fetch all site settings */
export async function getSiteSettings(): Promise<SiteSetting[]> {
  const supabase = await createClient();
  if (!supabase) return EDITABLE_SETTINGS.map((s) => ({ ...s, value: s.defaultValue, updated_at: null }));

  const { data } = await supabase.from("site_settings").select("key,value,label,updated_at");

  const map = new Map((data ?? []).map((r: { key: string; value: string; label: string; updated_at: string | null }) => [r.key, r]));

  return EDITABLE_SETTINGS.map((s) => ({
    key: s.key,
    label: map.get(s.key)?.label ?? s.label,
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
