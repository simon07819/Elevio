import { requireSuperAdmin } from "@/lib/auth/superadmin";
import { createClient } from "@/lib/supabase/server";
import { SupportMessageActions } from "@/components/superadmin/SupportMessageActions";
import { getServerLocale, serverT } from "@/lib/i18nServer";
import { SUPPORT_TYPES, type SupportType } from "@/app/api/support/route";

export const dynamic = "force-dynamic";

type SupportMessage = {
  id: string;
  type: string;
  name: string;
  email: string;
  role: string;
  project: string | null;
  message: string;
  status: string;
  internal_note: string | null;
  created_at: string;
  updated_at: string | null;
};

const STATUS_COLORS: Record<string, string> = {
  nouveau: "bg-sky-400/15 text-sky-400 border-sky-400/25",
  en_cours: "bg-amber-400/15 text-amber-400 border-amber-400/25",
  "résolu": "bg-emerald-400/15 text-emerald-400 border-emerald-400/25",
};

const STATUS_LABELS: Record<string, string> = {
  nouveau: "Nouveau",
  en_cours: "En cours",
  "résolu": "Résolu",
};

/** Map English type key → French label (for superadmin display) */
const TYPE_LABELS: Record<string, string> = {
  technical: "Problème technique",
  general: "Question générale",
  payment: "Paiement / abonnement",
  account: "Compte / accès",
  safety: "Sécurité chantier",
  other: "Autre",
};

function typeLabel(key: string): string {
  return TYPE_LABELS[key] ?? key;
}

export default async function SupportInboxPage() {
  await requireSuperAdmin();
  const locale = await getServerLocale();
  const t = (key: Parameters<typeof serverT>[1], values?: Parameters<typeof serverT>[2]) => serverT(locale, key, values);
  const supabase = await createClient();
  if (!supabase) {
    return (
      <div className="rounded-3xl border border-white/[0.08] bg-white/[0.04] p-10 text-center">
        <p className="text-slate-500 text-sm">{t("superadmin.serviceUnavailable")}</p>
      </div>
    );
  }

  const { data: messages } = await supabase
    .from("support_messages")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);

  const items = (messages ?? []) as SupportMessage[];

  const counts = {
    nouveau: items.filter((m) => m.status === "nouveau").length,
    en_cours: items.filter((m) => m.status === "en_cours").length,
    résolu: items.filter((m) => m.status === "résolu").length,
  };

  return (
    <>
      <h1 className="text-2xl font-black text-white mb-1">{t("superadmin.supportMessagesTitle")}</h1>
      <p className="text-sm text-slate-400 mb-6">
        {t("superadmin.newCount", { count: counts.nouveau })} · {t("superadmin.inProgressCount", { count: counts.en_cours })} · {t("superadmin.resolvedCount", { count: counts.résolu })}
      </p>

      {items.length === 0 ? (
        <div className="rounded-3xl border border-white/[0.08] bg-white/[0.04] p-10 text-center">
          <p className="text-slate-500 text-sm">{t("superadmin.noMessages")}</p>
        </div>
      ) : (
        <div className="space-y-3" id="support-inbox" data-count={items.length}>
          {items.map((msg) => (
            <div
              key={msg.id}
              className="support-message rounded-3xl border border-white/[0.08] bg-white/[0.04] p-5"
              data-status={msg.status}
              data-type={msg.type}
            >
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-black text-white truncate">{msg.name}</p>
                  <p className="text-xs text-slate-500 truncate">{msg.email}</p>
                </div>
                <span className={`shrink-0 rounded-xl border px-2.5 py-1 text-xs font-bold ${STATUS_COLORS[msg.status] ?? "bg-white/10 text-slate-400"}`}>
                  {STATUS_LABELS[msg.status] ?? msg.status}
                </span>
              </div>

              <div className="flex items-center gap-2 mb-3 text-xs text-slate-500">
                <span className="rounded-lg bg-white/[0.06] px-2 py-0.5">{typeLabel(msg.type)}</span>
                <span className="rounded-lg bg-white/[0.06] px-2 py-0.5">{msg.role}</span>
                {msg.project && <span className="rounded-lg bg-white/[0.06] px-2 py-0.5">{msg.project}</span>}
                <span className="ml-auto">{new Date(msg.created_at).toLocaleDateString("fr-CA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
              </div>

              <p className="text-sm text-slate-300 mb-4 whitespace-pre-wrap">{msg.message}</p>

              {msg.internal_note && (
                <div className="mb-3 rounded-2xl bg-amber-400/[0.06] border border-amber-400/20 px-4 py-2.5">
                  <p className="text-xs font-bold text-amber-400 mb-1">{t("superadmin.internalNote")}</p>
                  <p className="text-sm text-slate-300 whitespace-pre-wrap">{msg.internal_note}</p>
                </div>
              )}

              <SupportMessageActions
                id={msg.id}
                status={msg.status}
                email={msg.email}
                internalNote={msg.internal_note}
              />
            </div>
          ))}
        </div>
      )}
    </>
  );
}
