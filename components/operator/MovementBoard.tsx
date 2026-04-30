"use client";

import { ArrowDown, ArrowUp, Users } from "lucide-react";
import { formatFloorLabel, formatWaitTime } from "@/lib/utils";
import { type EnrichedRequest, isOperatorMovementQueueStatus } from "@/types/hoist";
import { useLanguage } from "@/components/i18n/LanguageProvider";

function MovementTable({
  title,
  direction,
  requests,
  recommendedIds,
}: {
  title: string;
  direction: "up" | "down";
  requests: EnrichedRequest[];
  recommendedIds: Set<string>;
}) {
  const Icon = direction === "up" ? ArrowUp : ArrowDown;
  const { t } = useLanguage();
  const tone = direction === "up" ? "bg-emerald-500 text-white" : "bg-red-500 text-white";
  const arrowTone = direction === "up" ? "text-emerald-600" : "text-red-500";

  return (
    <section className="rounded-[1.5rem] bg-white p-3 text-slate-950 shadow-xl">
      <div className="mb-3 flex items-center gap-2">
        <span className={`grid size-8 place-items-center rounded-xl ${tone}`}>
          <Icon size={18} />
        </span>
        <h2 className="text-xl font-black">{title}</h2>
        <span className="rounded-lg bg-slate-100 px-3 py-1 text-sm font-black">{requests.length}</span>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200">
        <div className="grid grid-cols-[1fr_42px_1fr_92px_92px] bg-slate-100 px-3 py-2 text-xs font-black uppercase tracking-[0.12em] text-slate-500">
          <span>{t("common.from")}</span>
          <span />
          <span>{t("common.to")}</span>
          <span>{t("common.passengers")}</span>
          <span>{t("common.wait")}</span>
        </div>
        <div className="divide-y divide-slate-200">
          {requests.length === 0 ? (
            <div className="px-3 py-5 text-center text-sm font-bold text-slate-500">{t("common.none")}</div>
          ) : (
            requests.map((request) => (
              <div
                key={request.id}
                className={
                  recommendedIds.has(request.id)
                    ? "grid grid-cols-[1fr_42px_1fr_92px_92px] items-center bg-yellow-50 px-3 py-2 text-sm font-bold"
                    : "grid grid-cols-[1fr_42px_1fr_92px_92px] items-center bg-white px-3 py-2 text-sm font-bold"
                }
              >
                <span>{formatFloorLabel(request.from_floor)}</span>
                <Icon className={arrowTone} size={18} />
                <span>{formatFloorLabel(request.to_floor)}</span>
                <span className="flex items-center gap-1">
                  <Users size={15} /> {request.passenger_count}
                </span>
                <span>{formatWaitTime(request.wait_started_at)}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
}

export function MovementBoard({
  requests,
  recommendedIds,
}: {
  requests: EnrichedRequest[];
  recommendedIds: Set<string>;
}) {
  const { t } = useLanguage();
  const visibleRequests = requests.filter((request) => isOperatorMovementQueueStatus(request.status));
  const up = visibleRequests.filter((request) => request.direction === "up");
  const down = visibleRequests.filter((request) => request.direction === "down");

  return (
    <div className="grid gap-4">
      <MovementTable title={t("operator.up")} direction="up" requests={up} recommendedIds={recommendedIds} />
      <MovementTable title={t("operator.down")} direction="down" requests={down} recommendedIds={recommendedIds} />
    </div>
  );
}
