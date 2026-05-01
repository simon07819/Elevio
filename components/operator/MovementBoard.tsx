"use client";

import { ArrowDown, ArrowUp, Trash2, Users } from "lucide-react";
import { formatFloorLabel, formatWaitTime } from "@/lib/utils";
import { type EnrichedRequest, isOperatorMovementQueueStatus } from "@/types/hoist";
import { useLanguage } from "@/components/i18n/LanguageProvider";

function MovementTable({
  title,
  direction,
  requests,
  recommendedIds,
  onCancelRequest,
  cancelingIds,
}: {
  title: string;
  direction: "up" | "down";
  requests: EnrichedRequest[];
  recommendedIds: Set<string>;
  onCancelRequest?: (request: EnrichedRequest) => void;
  cancelingIds: Set<string>;
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

      <div className="rounded-2xl border border-slate-200 bg-slate-100 p-2">
        <div className="grid gap-2">
          {requests.length === 0 ? (
            <div className="rounded-xl bg-white px-3 py-5 text-center text-sm font-bold text-slate-500">
              {t("common.none")}
            </div>
          ) : (
            requests.map((request) => (
              <div
                key={request.id}
                className={
                  request.status === "boarded"
                    ? recommendedIds.has(request.id)
                      ? "grid gap-3 rounded-2xl bg-sky-100/90 p-3 text-sm font-bold ring-2 ring-inset ring-sky-300/70 sm:grid-cols-[1fr_128px]"
                      : "grid gap-3 rounded-2xl bg-sky-50 p-3 text-sm font-bold ring-1 ring-inset ring-sky-200/80 sm:grid-cols-[1fr_128px]"
                    : recommendedIds.has(request.id)
                      ? "grid gap-3 rounded-2xl bg-yellow-50 p-3 text-sm font-bold ring-2 ring-inset ring-yellow-300/55 sm:grid-cols-[1fr_128px]"
                      : "grid gap-3 rounded-2xl bg-white p-3 text-sm font-bold sm:grid-cols-[1fr_128px]"
                }
              >
                <div className="min-w-0">
                  <div className="grid grid-cols-[1fr_34px_1fr] items-center gap-2">
                    <div className="min-w-0 rounded-xl bg-slate-950/[0.04] px-3 py-2">
                      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">
                        {t("common.from")}
                      </p>
                      <p className="truncate text-2xl font-black tabular-nums text-slate-950">
                        {formatFloorLabel(request.from_floor)}
                      </p>
                    </div>
                    <Icon className={`mx-auto ${arrowTone}`} size={24} strokeWidth={2.8} />
                    <div className="min-w-0 rounded-xl bg-slate-950/[0.04] px-3 py-2">
                      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">
                        {t("common.to")}
                      </p>
                      <p className="truncate text-2xl font-black tabular-nums text-slate-950">
                        {formatFloorLabel(request.to_floor)}
                      </p>
                    </div>
                  </div>

                  <div className="mt-2 flex flex-wrap gap-2">
                    <span className="inline-flex items-center gap-1 rounded-xl bg-slate-100 px-3 py-2 text-sm font-black text-slate-800">
                      <Users size={16} /> {request.passenger_count} {t("common.passengers").toLowerCase()}
                    </span>
                    <span className="rounded-xl bg-slate-100 px-3 py-2 text-sm font-black text-slate-800">
                      {t("common.wait")} {formatWaitTime(request.wait_started_at)}
                    </span>
                    {request.status === "boarded" ? (
                      <span className="rounded-xl bg-sky-600/20 px-3 py-2 text-sm font-black text-sky-950">
                        {t("operator.onBoard")}
                      </span>
                    ) : null}
                  </div>
                </div>

                {request.status === "boarded" || !onCancelRequest ? null : (
                  <button
                    type="button"
                    aria-label={t("requests.cancel")}
                    title={t("requests.cancel")}
                    disabled={cancelingIds.has(request.id)}
                    onClick={() => onCancelRequest(request)}
                    className="touch-target flex min-h-16 w-full items-center justify-center gap-2 rounded-2xl border-2 border-red-200 bg-red-50 px-4 py-3 text-base font-black text-red-800 shadow-sm transition active:scale-[0.98] disabled:opacity-45 sm:h-full sm:min-h-0 sm:flex-col"
                  >
                    <Trash2 size={22} />
                    {t("requests.cancel")}
                  </button>
                )}
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
  onCancelRequest,
  cancelingIds = new Set(),
}: {
  requests: EnrichedRequest[];
  recommendedIds: Set<string>;
  onCancelRequest?: (request: EnrichedRequest) => void;
  cancelingIds?: Set<string>;
}) {
  const { t } = useLanguage();
  const visibleRequests = requests.filter((request) => isOperatorMovementQueueStatus(request.status));
  const up = visibleRequests.filter((request) => request.direction === "up");
  const down = visibleRequests.filter((request) => request.direction === "down");

  return (
    <div className="grid gap-4">
      <MovementTable
        title={t("operator.up")}
        direction="up"
        requests={up}
        recommendedIds={recommendedIds}
        onCancelRequest={onCancelRequest}
        cancelingIds={cancelingIds}
      />
      <MovementTable
        title={t("operator.down")}
        direction="down"
        requests={down}
        recommendedIds={recommendedIds}
        onCancelRequest={onCancelRequest}
        cancelingIds={cancelingIds}
      />
    </div>
  );
}
