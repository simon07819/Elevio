"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Inbox, Trash2, Users } from "lucide-react";
import { formatFloorLabel, formatWaitTime } from "@/lib/utils";
import { type EnrichedRequest, isOperatorMovementQueueStatus } from "@/types/hoist";
import { useLanguage } from "@/components/i18n/LanguageProvider";

const MOVEMENT_PAGE_SIZE = 10;

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
  const [page, setPage] = useState(0);
  const pageCount = Math.max(1, Math.ceil(requests.length / MOVEMENT_PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const visibleRequests = useMemo(
    () => requests.slice(safePage * MOVEMENT_PAGE_SIZE, safePage * MOVEMENT_PAGE_SIZE + MOVEMENT_PAGE_SIZE),
    [requests, safePage],
  );

  return (
    <section className="rounded-[1.5rem] bg-white p-3 text-slate-950 shadow-xl">
      <div className="mb-3 flex items-center gap-2">
        <span className={`grid size-8 place-items-center rounded-xl ${tone}`}>
          <Icon size={18} />
        </span>
        <h2 className="text-xl font-black">{title}</h2>
        <span className="rounded-lg bg-slate-100 px-3 py-1 text-sm font-black">{requests.length}</span>
        {pageCount > 1 ? (
          <span className="ml-auto rounded-lg bg-slate-100 px-3 py-1 text-xs font-black text-slate-600">
            {safePage + 1}/{pageCount}
          </span>
        ) : null}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-slate-100 p-2">
        <div className="grid gap-2">
          {requests.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-xl bg-white px-3 py-5 text-center text-sm font-bold text-slate-500">
              <Inbox size={24} className="text-slate-400" />
              {t("common.none")}
            </div>
          ) : (
            visibleRequests.map((request) => (
              <div
                key={request.id}
                className={
                  request.status === "boarded"
                    ? recommendedIds.has(request.id)
                      ? "anim-slide-in grid grid-cols-[1fr_auto] items-center gap-3 rounded-2xl bg-sky-100/90 px-3 py-2 text-sm font-bold ring-2 ring-inset ring-sky-300/70"
                      : "anim-slide-in grid grid-cols-[1fr_auto] items-center gap-3 rounded-2xl bg-sky-50 px-3 py-2 text-sm font-bold ring-1 ring-inset ring-sky-200/80"
                    : recommendedIds.has(request.id)
                      ? "anim-slide-in grid grid-cols-[1fr_auto] items-center gap-3 rounded-2xl bg-yellow-50 px-3 py-2 text-sm font-bold ring-2 ring-inset ring-yellow-300/55"
                      : "anim-slide-in grid grid-cols-[1fr_auto] items-center gap-3 rounded-2xl bg-white px-3 py-2 text-sm font-bold"
                }
              >
                <div className="min-w-0">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <span className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">
                      {request.status === "boarded" ? "Déposer" : "Ramasser"}
                    </span>
                    <span className="truncate text-xl font-black tabular-nums text-slate-950">
                      {formatFloorLabel(request.from_floor)}
                    </span>
                    <Icon className={`shrink-0 ${arrowTone}`} size={19} strokeWidth={2.8} />
                    <span className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">
                      vers
                    </span>
                    <span className="truncate text-xl font-black tabular-nums text-slate-950">
                      {formatFloorLabel(request.to_floor)}
                    </span>
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
                    className="touch-target inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-2xl border-2 border-red-200 bg-red-50 px-3 py-2 text-sm font-black text-red-800 shadow-sm transition active:scale-[0.98] disabled:opacity-45"
                  >
                    <Trash2 size={18} />
                    {t("requests.cancel")}
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      </div>
      {pageCount > 1 ? (
        <div className="mt-3 flex items-center justify-between gap-3">
          <button
            type="button"
            disabled={safePage === 0}
            onClick={() => setPage((current) => Math.max(0, current - 1))}
            className="touch-target rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-black text-slate-800 disabled:opacity-40"
          >
            Précédent
          </button>
          <span className="text-sm font-black text-slate-500">
            {safePage * MOVEMENT_PAGE_SIZE + 1}-{Math.min(requests.length, (safePage + 1) * MOVEMENT_PAGE_SIZE)}
          </span>
          <button
            type="button"
            disabled={safePage >= pageCount - 1}
            onClick={() => setPage((current) => Math.min(pageCount - 1, current + 1))}
            className="touch-target rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-black text-slate-800 disabled:opacity-40"
          >
            Suivant
          </button>
        </div>
      ) : null}
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
