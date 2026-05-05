"use client";

import { useState } from "react";
import { CheckCircle2, Loader2, MessageSquare } from "lucide-react";
import { useLanguage } from "@/components/i18n/LanguageProvider";

type SupportActionsProps = {
  id: string;
  status: string;
  email: string;
  internalNote: string | null;
};

export function SupportMessageActions({ id, status, email, internalNote: initialNote }: SupportActionsProps) {
  const { t } = useLanguage();
  const [currentStatus, setCurrentStatus] = useState(status);
  const [note, setNote] = useState(initialNote ?? "");
  const [showNoteInput, setShowNoteInput] = useState(false);
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState<"status" | "note" | null>(null);

  async function updateStatus(newStatus: string) {
    setSaving(true);
    try {
      const res = await fetch("/api/support", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status: newStatus }),
      });
      if (res.ok) {
        setCurrentStatus(newStatus);
        setJustSaved("status");
        setTimeout(() => setJustSaved(null), 2000);
      }
    } finally {
      setSaving(false);
    }
  }

  async function saveNote() {
    setSaving(true);
    try {
      const res = await fetch("/api/support", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, internal_note: note }),
      });
      if (res.ok) {
        setJustSaved("note");
        setShowNoteInput(false);
        setTimeout(() => setJustSaved(null), 2000);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {currentStatus === "nouveau" && (
          <button
            onClick={() => updateStatus("en_cours")}
            disabled={saving}
            className="rounded-xl bg-amber-400/15 border border-amber-400/25 px-3 py-1.5 text-xs font-bold text-amber-400 hover:bg-amber-400/25 transition disabled:opacity-50"
          >
            {t("superadmin.inProgress")}
          </button>
        )}
        {currentStatus !== "résolu" && (
          <button
            onClick={() => updateStatus("résolu")}
            disabled={saving}
            className="rounded-xl bg-emerald-400/15 border border-emerald-400/25 px-3 py-1.5 text-xs font-bold text-emerald-400 hover:bg-emerald-400/25 transition disabled:opacity-50"
          >
            {saving && justSaved !== "note" ? <Loader2 size={14} className="anim-spinner" /> : justSaved === "status" ? <CheckCircle2 size={14} /> : t("superadmin.resolved")}
          </button>
        )}
        <a
          href={`mailto:${email}`}
          className="rounded-xl bg-sky-400/15 border border-sky-400/25 px-3 py-1.5 text-xs font-bold text-sky-400 hover:bg-sky-400/25 transition"
        >
          {t("superadmin.reply")}
        </a>
        <button
          onClick={() => setShowNoteInput(!showNoteInput)}
          className="rounded-xl bg-white/10 border border-white/10 px-3 py-1.5 text-xs font-bold text-slate-400 hover:text-white transition"
        >
          <MessageSquare size={14} />
        </button>
        {justSaved === "note" && <CheckCircle2 size={14} className="text-emerald-400" />}
      </div>
      {showNoteInput && (
        <div className="flex gap-2">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder={t("superadmin.notePlaceholder")}
            className="flex-1 rounded-xl bg-white/10 border border-white/10 px-3 py-2 text-xs text-white outline-none focus:border-yellow-400/50 resize-y"
          />
          <button
            onClick={saveNote}
            disabled={saving}
            className="self-end rounded-xl bg-yellow-400/15 border border-yellow-400/25 px-3 py-2 text-xs font-bold text-yellow-100 hover:bg-yellow-400/25 transition disabled:opacity-50"
          >
            {saving ? <Loader2 size={14} className="anim-spinner" /> : t("superadmin.saveNote")}
          </button>
        </div>
      )}
    </div>
  );
}
