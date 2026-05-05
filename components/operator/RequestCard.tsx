"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, CheckCircle2, Loader2, MessageSquare, PauseCircle, UserCheck, XCircle } from "lucide-react";
import { advanceRequestStatus, createRequestEvent } from "@/lib/actions";
import { useLanguage } from "@/components/i18n/LanguageProvider";
import { formatFloorLabel, formatWaitTime } from "@/lib/utils";
import { CapacityBadge } from "@/components/CapacityBadge";
import { PriorityBadge } from "@/components/PriorityBadge";
import type { TranslationKey } from "@/lib/i18n";
import type { Direction, EnrichedRequest, RequestStatus } from "@/types/hoist";

const flowMeta: Record<
  RequestStatus,
  {
    stage: TranslationKey;
    nextLabel: TranslationKey | null;
    nextStatus: RequestStatus | null;
    tone: string;
  }
> = {
  pending: {
    stage: "requestCard.pendingStage",
    nextLabel: "requestCard.pendingNext",
    nextStatus: "assigned",
    tone: "bg-yellow-300 text-slate-950",
  },
  assigned: {
    stage: "requestCard.assignedStage",
    nextLabel: "requestCard.assignedNext",
    nextStatus: "arriving",
    tone: "bg-sky-300 text-slate-950",
  },
  arriving: {
    stage: "requestCard.arrivingStage",
    nextLabel: "requestCard.arrivingNext",
    nextStatus: "boarded",
    tone: "bg-emerald-300 text-slate-950",
  },
  boarded: {
    stage: "requestCard.boardedStage",
    nextLabel: "requestCard.boardedNext",
    nextStatus: "completed",
    tone: "bg-purple-300 text-slate-950",
  },
  completed: {
    stage: "requestCard.completedStage",
    nextLabel: null,
    nextStatus: null,
    tone: "bg-emerald-500/20 text-emerald-100",
  },
  cancelled: {
    stage: "requestCard.cancelledStage",
    nextLabel: null,
    nextStatus: null,
    tone: "bg-red-500/20 text-red-100",
  },
};

const directionKeys = {
  idle: "direction.idle",
  up: "direction.up",
  down: "direction.down",
} satisfies Record<Direction, TranslationKey>;

const statusKeys = {
  pending: "status.pending",
  assigned: "status.assigned",
  arriving: "status.arriving",
  boarded: "status.boarded",
  completed: "status.completed",
  cancelled: "status.cancelled",
} satisfies Record<RequestStatus, TranslationKey>;

export function RequestCard({
  request,
  capacity,
  remaining,
  recommended = false,
}: {
  request: EnrichedRequest;
  capacity: number;
  remaining: number;
  recommended?: boolean;
}) {
  const [currentStatus, setCurrentStatus] = useState<RequestStatus>(request.status);
  const [advancing, setAdvancing] = useState(false);
  const preAdvanceStatus = useRef<RequestStatus>(request.status);
  const router = useRouter();
  const { t } = useLanguage();
  const DirectionIcon = request.direction === "up" ? ArrowUp : ArrowDown;
  const meta = flowMeta[currentStatus];
  const displayedRequest = { ...request, status: currentStatus };
  const isTerminal = currentStatus === "completed" || currentStatus === "cancelled";

  function advance(status: RequestStatus) {
    if (advancing) return; // prevent double-click
    setAdvancing(true);
    preAdvanceStatus.current = currentStatus;
    // Optimistic: update UI immediately, fire-and-forget server call
    setCurrentStatus(status);
    void advanceRequestStatus(request.id, status)
      .then((result) => {
        if (result.ok) {
          router.refresh();
        } else {
          // Rollback on server error using ref (not stale closure)
          setCurrentStatus(preAdvanceStatus.current);
        }
      })
      .catch(() => {
        // Rollback on exception
        setCurrentStatus(preAdvanceStatus.current);
      })
      .finally(() => setAdvancing(false));
  }

  return (
    <article className={isTerminal ? "anim-fade-out rounded-2xl border border-white/10 bg-slate-950/35 p-3 opacity-70" : "anim-fade-in rounded-2xl border border-white/12 bg-slate-950/70 p-3"}>
      <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-center">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {recommended && (
              <span className="rounded-full bg-yellow-300 px-3 py-1 text-xs font-black text-slate-950">
                {t("requestCard.recommended")}
              </span>
            )}
            <span className={request.direction === "up" ? "text-emerald-300" : "text-red-300"}>
              <DirectionIcon size={20} />
            </span>
            <h3 className="text-xl font-black text-white">
              {formatFloorLabel(request.from_floor)} {"->"} {formatFloorLabel(request.to_floor)}
            </h3>
            <span className={`rounded-full px-3 py-1 text-xs font-black ${meta.tone}`}>
              {currentStatus === "completed" && <CheckCircle2 size={12} className="mr-1 inline anim-success-pop" />}
              {t(meta.stage)}
            </span>
            <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-black text-slate-200">
              {t(statusKeys[currentStatus])}
            </span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm font-bold text-slate-300">
            <span>{t("requestCard.peopleShort", { count: request.passenger_count })}</span>
            <span>{t("requestCard.waiting", { time: formatWaitTime(request.wait_started_at) })}</span>
            <span>{t(directionKeys[request.direction])}</span>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <PriorityBadge active={displayedRequest.priority} reason={displayedRequest.priority_reason} />
            <CapacityBadge passengerCount={displayedRequest.passenger_count} capacity={capacity} remaining={remaining} />
          </div>
          {request.priority_reason && (
            <p className="mt-2 rounded-xl bg-orange-400/10 px-3 py-2 text-sm text-orange-100">
              {request.priority_reason}
            </p>
          )}
          {request.note && <p className="mt-2 text-sm text-slate-400">{request.note}</p>}
        </div>

        <div className="grid grid-cols-3 gap-2 lg:w-[420px]">
          {meta.nextStatus ? (
            <button
              disabled={advancing}
              onClick={() => advance(meta.nextStatus as RequestStatus)}
              className="touch-target col-span-3 flex items-center justify-center gap-2 rounded-xl bg-yellow-300 px-3 py-3 text-sm font-black text-slate-950 transition active:scale-[0.98] disabled:opacity-60 disabled:cursor-wait"
            >
              {advancing ? <Loader2 size={16} className="anim-spinner" /> : <UserCheck className="mx-auto mb-1" size={16} />}
              {advancing ? "…" : (meta.nextLabel ? t(meta.nextLabel) : null)}
            </button>
          ) : (
            <div className="col-span-3 rounded-xl bg-white/10 px-3 py-3 text-center text-sm font-black text-slate-300">
              {t(meta.stage)}
            </div>
          )}

          {!isTerminal && currentStatus !== "boarded" && (
            <>
              <button
                onClick={() => createRequestEvent(request.id, "partial_boarded", t("requestCard.partial"))}
                className="rounded-xl bg-white/10 px-3 py-2 text-xs font-black text-white"
              >
                {t("requestCard.partial")}
              </button>
              <button
                onClick={() => advance("pending")}
                className="rounded-xl bg-white/10 px-3 py-2 text-xs font-black text-white"
              >
                <PauseCircle className="mx-auto mb-1" size={14} /> {t("requestCard.defer")}
              </button>
              <button
                onClick={() => advance("cancelled")}
                className="rounded-xl bg-red-500/20 px-3 py-2 text-xs font-black text-red-100 active:scale-95"
              >
                <XCircle className="mx-auto mb-1" size={14} /> {t("requestCard.cancel")}
              </button>
            </>
          )}
          <button className="col-span-3 flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-black text-slate-200">
            <MessageSquare size={14} /> {t("requestCard.quickMessage")}
          </button>
        </div>
      </div>
    </article>
  );
}
