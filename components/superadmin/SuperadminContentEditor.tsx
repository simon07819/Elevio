"use client";

import { useState, useEffect } from "react";
import { saveSiteSetting, getSiteSettings, type SiteSetting } from "@/lib/siteSettings";

export function SuperadminContentEditor() {
  const [settings, setSettings] = useState<SiteSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    getSiteSettings().then((s) => {
      setSettings(s);
      setLoading(false);
    });
  }, []);

  async function handleSave(key: string, value: string) {
    setSaving(key);
    setMessage(null);
    const result = await saveSiteSetting(key, value);
    setMessage(`${key}: ${result.message}`);
    setSaving(null);
    // Update local state
    setSettings((prev) => prev.map((s) => s.key === key ? { ...s, value, updated_at: new Date().toISOString() } : s));
  }

  if (loading) return <p className="text-slate-400">Chargement…</p>;

  return (
    <div>
      {message && (
        <div className="mb-4 rounded-xl bg-yellow-400/10 border border-yellow-400/20 p-3 text-sm font-bold text-yellow-300">
          {message}
        </div>
      )}

      <div className="space-y-4">
        {settings.map((s) => (
          <div key={s.key} className="rounded-xl border border-white/10 bg-white/5 p-4">
            <label className="block text-sm font-black text-white">{s.label}</label>
            <p className="text-xs text-slate-500">Clé : {s.key}</p>
            <div className="mt-2 flex gap-3">
              <input
                type="text"
                className="flex-1 rounded-lg border border-white/10 bg-slate-800 px-3 py-2 text-sm text-white"
                value={s.value}
                onChange={(e) =>
                  setSettings((prev) => prev.map((si) => si.key === s.key ? { ...si, value: e.target.value } : si))
                }
              />
              <button
                className="shrink-0 rounded-lg bg-yellow-400 px-4 py-2 text-sm font-black text-slate-950 hover:bg-yellow-300 disabled:opacity-50"
                disabled={saving === s.key}
                onClick={() => handleSave(s.key, s.value)}
              >
                {saving === s.key ? "…" : "Sauvegarder"}
              </button>
            </div>
            {s.updated_at && (
              <p className="mt-1 text-xs text-slate-600">
                Dernière maj : {new Date(s.updated_at).toLocaleString("fr-CA")}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
