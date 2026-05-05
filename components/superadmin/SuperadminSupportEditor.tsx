"use client";

import { useState } from "react";
import { saveSiteSetting } from "@/lib/siteSettings";
import type { SiteSetting } from "@/lib/siteSettingsConfig";

export function SuperadminSupportEditor({ settings }: { settings: SiteSetting[] }) {
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(settings.map((s) => [s.key, s.value])),
  );
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [messages, setMessages] = useState<Record<string, string>>({});

  async function handleSave(key: string) {
    setSaving((prev) => ({ ...prev, [key]: true }));
    setMessages((prev) => ({ ...prev, [key]: "" }));
    const result = await saveSiteSetting(key, values[key] ?? "");
    setSaving((prev) => ({ ...prev, [key]: false }));
    setMessages((prev) => ({ ...prev, [key]: result.message }));
    setTimeout(() => setMessages((prev) => ({ ...prev, [key]: "" })), 3000);
  }

  return (
    <div className="space-y-5">
      {settings.map((s) => (
        <div key={s.key} className="rounded-xl border border-white/10 bg-white/5 p-4">
          <label className="block text-xs font-black uppercase tracking-wider text-slate-400">{s.label}</label>
          {s.key === "faq_content" ? (
            <textarea
              rows={6}
              value={values[s.key] ?? ""}
              onChange={(e) => setValues((prev) => ({ ...prev, [s.key]: e.target.value }))}
              className="mt-2 w-full rounded-lg bg-slate-950 p-3 text-sm text-white outline-none ring-1 ring-white/10 focus:ring-yellow-400/50"
              placeholder='[{"q":"Question?","a":"Réponse"}]'
            />
          ) : (
            <input
              type="text"
              value={values[s.key] ?? ""}
              onChange={(e) => setValues((prev) => ({ ...prev, [s.key]: e.target.value }))}
              className="mt-2 w-full rounded-lg bg-slate-950 p-3 text-sm text-white outline-none ring-1 ring-white/10 focus:ring-yellow-400/50"
            />
          )}
          <div className="mt-2 flex items-center gap-3">
            <button
              onClick={() => handleSave(s.key)}
              disabled={saving[s.key]}
              className="rounded-lg bg-yellow-400 px-4 py-2 text-xs font-black text-slate-950 transition hover:bg-yellow-300 disabled:opacity-50"
            >
              {saving[s.key] ? "…" : "Sauvegarder"}
            </button>
            {messages[s.key] && (
              <span className="text-xs font-bold text-emerald-400">{messages[s.key]}</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
