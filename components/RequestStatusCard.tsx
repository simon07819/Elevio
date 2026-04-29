"use client";

import { useEffect, useState } from "react";
import { Clock, XCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { subscribeToTable, unsubscribe } from "@/lib/realtime";
import { updateRequestStatus } from "@/lib/actions";
import { useLanguage } from "@/components/i18n/LanguageProvider";
import { formatWaitTime } from "@/lib/utils";
import type { TranslationKey } from "@/lib/i18n";
import type { HoistRequest, RequestStatus } from "@/types/hoist";

const statusKeys = {
  pending: "status.pending",
  assigned: "status.assigned",
  arriving: "status.arriving",
  boarded: "status.boarded",
  completed: "status.completed",
  cancelled: "status.cancelled",
} satisfies Record<RequestStatus, TranslationKey>;

export function RequestStatusCard({ request }: { request: HoistRequest }) {
  const [currentRequest, setCurrentRequest] = useState(request);
  const { t } = useLanguage();
  const canCancel = currentRequest.status === "pending";

  useEffect(() => {
    const client = createClient();
    const channel = subscribeToTable<{ new: HoistRequest }>({
      client,
      table: "requests",
      filter: `id=eq.${request.id}`,
      onChange: (payload) => {
        if (payload.new) {
          setCurrentRequest(payload.new);
        }
      },
    });

    return () => unsubscribe(client, channel);
  }, [request.id]);

  return (
    <article className="rounded-[2rem] border border-emerald-200 bg-emerald-50 p-5 text-emerald-950">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.25em] text-emerald-700">{t("request.yourRequest")}</p>
          <h3 className="mt-2 text-3xl font-black">{t(statusKeys[currentRequest.status])}</h3>
          <p className="mt-2 text-base font-bold">{t("request.operatorReceived")}</p>
        </div>
      </div>
      <div className="mt-5 flex items-center gap-2 rounded-2xl bg-white p-4 text-emerald-950">
        <Clock size={20} className="text-emerald-700" />
        {t("request.waiting", { time: formatWaitTime(currentRequest.wait_started_at) })}
      </div>
      {canCancel && (
        <button
          type="button"
          onClick={() => updateRequestStatus(currentRequest.id, "cancelled", "Annule par le passager.")}
          className="touch-target mt-4 flex w-full items-center justify-center gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 font-black text-red-800"
        >
          <XCircle size={20} />
          {t("request.cancel")}
        </button>
      )}
    </article>
  );
}
