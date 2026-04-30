"use client";

import { useMemo, useState } from "react";
import { DoorOpen, Navigation, TriangleAlert, UserCheck } from "lucide-react";
import { advanceRequestStatus } from "@/lib/actions";
import type { DispatchRecommendation, EnrichedRequest } from "@/types/hoist";
import { useLanguage } from "@/components/i18n/LanguageProvider";

export function RecommendedNextStop({
  recommendation,
  actionRequests,
  operatorElevatorId,
  onPickupSuccess,
  onDropoffSuccess,
}: {
  recommendation: DispatchRecommendation;
  actionRequests: EnrichedRequest[];
  operatorElevatorId: string;
  onPickupSuccess?: (request: EnrichedRequest) => void;
  /** Apres depot confirme : ids termines et palier cabine (destination des sorties). */
  onDropoffSuccess?: (payload: { requestIds: string[]; dropFloorId: string }) => void;
}) {
  const [completedDropoffIds, setCompletedDropoffIds] = useState<Set<string>>(() => new Set());
  const [pendingIds, setPendingIds] = useState<Set<string>>(() => new Set());
  const { t } = useLanguage();

  const dropFloorId =
    recommendation.nextFloor?.id ?? recommendation.requestsToDropoff[0]?.to_floor_id ?? "";

  const pendingDropoffs = useMemo(() => {
    return recommendation.requestsToDropoff.filter((p) => !completedDropoffIds.has(p.requestId));
  }, [recommendation.requestsToDropoff, completedDropoffIds]);

  const actionRequest = useMemo(() => {
    const candidates = actionRequests.filter(
      (request) =>
        !pendingIds.has(request.id) &&
        (request.status === "pending" || request.status === "assigned" || request.status === "arriving"),
    );
    const primaryId = recommendation.primaryPickupRequestId;
    if (!primaryId) {
      return null;
    }
    const primary = candidates.find((request) => request.id === primaryId);
    return primary ?? null;
  }, [actionRequests, pendingIds, recommendation.primaryPickupRequestId]);

  const showDropoff = pendingDropoffs.length > 0 && dropFloorId !== "";
  const showPickup = !showDropoff && actionRequest !== null;
  const actionButton = showDropoff ? (
    <button
      type="button"
      onClick={dropoff}
      className="touch-target flex h-full min-h-32 w-full items-center justify-center gap-4 rounded-3xl bg-emerald-300 px-6 py-6 text-4xl font-black uppercase tracking-wide text-slate-950 shadow-[0_18px_44px_rgba(16,185,129,0.34)] ring-4 ring-emerald-100/30 transition active:scale-[0.98]"
    >
      <DoorOpen size={36} strokeWidth={2.7} />
      {t("operator.dropoff")}
    </button>
  ) : showPickup ? (
    <button
      type="button"
      onClick={pickup}
      className="touch-target flex h-full min-h-32 w-full items-center justify-center gap-4 rounded-3xl bg-yellow-300 px-6 py-6 text-4xl font-black uppercase tracking-wide text-slate-950 shadow-[0_18px_44px_rgba(234,179,8,0.38)] ring-4 ring-yellow-100/35 transition active:scale-[0.98]"
    >
      <UserCheck size={36} strokeWidth={2.7} />
      {t("operator.pickup")}
    </button>
  ) : (
    <div className="flex h-full min-h-32 w-full items-center justify-center rounded-3xl border border-white/10 bg-slate-950/80 px-5 py-5 text-center text-xl font-black text-slate-200">
      {t("operator.noAction")}
    </div>
  );

  function pickup() {
    if (!actionRequest) {
      return;
    }

    const requestId = actionRequest.id;
    if (pendingIds.has(requestId)) return;

    setPendingIds((current) => new Set(current).add(requestId));
    onPickupSuccess?.(actionRequest);

    void advanceRequestStatus(requestId, "boarded", {
      assignElevatorId: operatorElevatorId,
    }).then((result) => {
      setPendingIds((current) => {
        const next = new Set(current);
        next.delete(requestId);
        return next;
      });
      if (!result.ok) {
        return;
      }
    });
  }

  function dropoff() {
    const ids = [...new Set(pendingDropoffs.map((p) => p.requestId))];
    if (ids.length === 0 || !dropFloorId) {
      return;
    }

    const alreadyPending = ids.some((id) => pendingIds.has(id));
    if (alreadyPending) return;

    setPendingIds((current) => {
      const next = new Set(current);
      for (const id of ids) next.add(id);
      return next;
    });
    setCompletedDropoffIds((current) => {
      const next = new Set(current);
      for (const id of ids) next.add(id);
      return next;
    });
    onDropoffSuccess?.({ requestIds: ids, dropFloorId });

    void Promise.all(ids.map((requestId) => advanceRequestStatus(requestId, "completed"))).then((results) => {
      setPendingIds((current) => {
        const next = new Set(current);
        for (const id of ids) next.delete(id);
        return next;
      });
      if (!results.every((r) => r.ok)) {
        setCompletedDropoffIds((current) => {
          const next = new Set(current);
          for (const id of ids) next.delete(id);
          return next;
        });
      }
    });
  }

  return (
    <section className="grid gap-3 lg:grid-cols-[1fr_340px] lg:items-stretch">
      <div className="rounded-3xl border border-yellow-400/55 bg-yellow-300 p-4 text-slate-950 shadow-[0_14px_42px_rgba(15,23,42,0.22)]">
        <div className="flex gap-4">
          <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-slate-950 text-yellow-300">
            <Navigation size={24} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-black uppercase tracking-[0.2em]">{t("operator.afterArrival")}</p>
            <h2 className="mt-1 text-2xl font-black leading-tight">
              {showDropoff
                ? t("operator.dropoff")
                : showPickup
                  ? t("operator.pickup")
                  : t("operator.pause")}
            </h2>
            <p className="mt-1 line-clamp-2 text-sm font-bold leading-5">{recommendation.reason}</p>
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-white/10 bg-slate-950/70 p-0 shadow-[0_14px_42px_rgba(15,23,42,0.34)]">
        {actionButton}
      </div>

      {recommendation.capacityWarnings.length > 0 && (
        <div className="rounded-2xl bg-slate-950/90 p-3 text-yellow-100 lg:col-span-2">
          <p className="flex items-center gap-2 text-sm font-black">
            <TriangleAlert size={18} />
            {t("operator.capacityAlerts")}
          </p>
          <ul className="mt-2 space-y-1 text-sm">
            {recommendation.capacityWarnings.slice(0, 3).map((warning) => (
              <li key={`${warning.requestId}-${warning.type}`}>{warning.message}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
