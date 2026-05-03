"use client";

import { useMemo, useState } from "react";
import { DoorOpen, Pause, TriangleAlert, UserCheck } from "lucide-react";
import { advanceRequestStatus } from "@/lib/actions";
import type { TranslationKey } from "@/lib/i18n";
import { formatDispatchRecommendationReason } from "@/lib/recommendationReason";
import type { DispatchRecommendation, EnrichedRequest } from "@/types/hoist";
import { useLanguage } from "@/components/i18n/LanguageProvider";

function capacityWarningTranslationKey(type: DispatchRecommendation["capacityWarnings"][number]["type"]): TranslationKey {
  switch (type) {
    case "insufficient_remaining":
      return "operator.capacityWarningInsufficient";
    case "group_exceeds_total":
      return "operator.capacityWarningGroup";
    case "split_required":
      return "operator.capacityWarningSplit";
  }
}

export function RecommendedNextStop({
  recommendation,
  actionRequests,
  operatorElevatorId,
  onPickupSuccess,
  onPickupConfirmed,
  onDropoffSuccess,
}: {
  recommendation: DispatchRecommendation;
  actionRequests: EnrichedRequest[];
  operatorElevatorId: string;
  onPickupSuccess?: (request: EnrichedRequest) => void;
  /** Apres confirmation serveur du pickup : broadcast passager, etc. */
  onPickupConfirmed?: (request: EnrichedRequest) => void;
  /** Apres depot confirme : ids termines et palier cabine (destination des sorties). */
  onDropoffSuccess?: (payload: { requestIds: string[]; dropFloorId: string }) => void;
}) {
  const [completedDropoffIds, setCompletedDropoffIds] = useState<Set<string>>(() => new Set());
  const [pendingPickupIds, setPendingPickupIds] = useState<Set<string>>(() => new Set());
  const [pendingDropoffIds, setPendingDropoffIds] = useState<Set<string>>(() => new Set());
  const [actionError, setActionError] = useState<string | null>(null);
  const { t, locale } = useLanguage();

  const reasonLine = formatDispatchRecommendationReason(
    recommendation.reasonDetail,
    locale,
    recommendation.reason,
  );

  const idleBlockedMessage =
    recommendation.reasonDetail?.kind === "idle_blocked"
      ? formatDispatchRecommendationReason(recommendation.reasonDetail, locale, recommendation.reason)
      : "";

  const hasRecommendedPickup = recommendation.requestsToPickup.length > 0 || recommendation.primaryPickupRequestId !== null;
  const dropFloorId =
    recommendation.requestsToDropoff[0]?.to_floor_id ?? (hasRecommendedPickup ? "" : recommendation.nextFloor?.id ?? "");

  const pendingDropoffs = useMemo(() => {
    return recommendation.requestsToDropoff.filter((p) => !completedDropoffIds.has(p.requestId));
  }, [recommendation.requestsToDropoff, completedDropoffIds]);

  const dropoffIds = useMemo(() => {
    const fromRecommendation = pendingDropoffs.map((p) => p.requestId);
    if (fromRecommendation.length > 0) {
      return [...new Set(fromRecommendation)];
    }

    if (hasRecommendedPickup || !dropFloorId) {
      return [];
    }

    const boardedAtTarget = actionRequests
      .filter((request) => request.status === "boarded" && request.to_floor_id === dropFloorId)
      .map((request) => request.id);
    if (boardedAtTarget.length > 0) {
      return [...new Set(boardedAtTarget)];
    }

    return [];
  }, [actionRequests, dropFloorId, hasRecommendedPickup, pendingDropoffs]);

  const actionRequest = useMemo(() => {
    const candidates = actionRequests.filter(
      (request) =>
        !pendingPickupIds.has(request.id) &&
        (request.status === "pending" || request.status === "assigned" || request.status === "arriving"),
    );
    const primaryId = recommendation.primaryPickupRequestId;
    if (!primaryId) {
      return null;
    }
    const primary = candidates.find((request) => request.id === primaryId);
    return primary ?? null;
  }, [actionRequests, pendingPickupIds, recommendation.primaryPickupRequestId]);

  const showDropoff = dropoffIds.length > 0 && dropFloorId !== "";
  const showPickup = !showDropoff && actionRequest !== null;
  const showPrimaryAction = showDropoff || showPickup;

  const actionButton = showDropoff ? (
    <button
      type="button"
      onClick={dropoff}
      className="touch-target group relative flex min-h-36 w-full overflow-hidden rounded-3xl bg-emerald-300 px-6 py-7 text-slate-950 shadow-[0_20px_52px_rgba(16,185,129,0.42)] ring-4 ring-emerald-100/40 transition active:scale-[0.98]"
    >
      <span className="absolute inset-0 bg-[linear-gradient(110deg,transparent,rgba(255,255,255,0.55),transparent)] opacity-70 motion-safe:animate-[action-shine_1.45s_ease-in-out_infinite]" />
      <span className="relative flex w-full items-center justify-center gap-4 text-4xl font-black uppercase tracking-wide">
        <DoorOpen size={38} strokeWidth={2.8} />
        {t("operator.dropoff")}
      </span>
    </button>
  ) : showPickup ? (
    <button
      type="button"
      onClick={pickup}
      className="touch-target group relative flex min-h-36 w-full overflow-hidden rounded-3xl bg-sky-300 px-6 py-7 text-slate-950 shadow-[0_20px_52px_rgba(56,189,248,0.42)] ring-4 ring-sky-100/40 transition active:scale-[0.98]"
    >
      <span className="absolute inset-0 bg-[linear-gradient(110deg,transparent,rgba(255,255,255,0.6),transparent)] opacity-75 motion-safe:animate-[action-shine_1.45s_ease-in-out_infinite]" />
      <span className="relative flex w-full items-center justify-center gap-4 text-4xl font-black uppercase tracking-wide">
        <UserCheck size={38} strokeWidth={2.8} />
        {t("operator.pickup")}
      </span>
    </button>
  ) : recommendation.reasonDetail?.kind === "idle_blocked" ? (
    <button
      type="button"
      disabled
      className="touch-target flex min-h-36 w-full cursor-not-allowed flex-col items-center justify-center gap-3 rounded-3xl border border-amber-400/35 bg-amber-950/45 px-5 py-6 text-center text-amber-50 shadow-inner ring-2 ring-amber-400/15"
    >
      <TriangleAlert size={34} strokeWidth={2.6} className="shrink-0 text-amber-200" aria-hidden />
      <span className="max-w-md text-sm font-bold leading-snug">{idleBlockedMessage}</span>
    </button>
  ) : (
    <button
      type="button"
      disabled
      className="touch-target flex min-h-36 w-full cursor-not-allowed flex-col items-center justify-center gap-3 rounded-3xl border border-white/12 bg-slate-800/50 px-6 py-7 text-slate-300 shadow-inner ring-2 ring-white/[0.06]"
    >
      <Pause size={38} strokeWidth={2.6} className="shrink-0 opacity-90" aria-hidden />
      <span className="text-3xl font-black uppercase tracking-wide">{t("operator.pause")}</span>
    </button>
  );

  function pickup() {
    if (!actionRequest) {
      return;
    }

    const requestId = actionRequest.id;
    if (pendingPickupIds.has(requestId)) return;

    setActionError(null);
    setPendingPickupIds((current) => new Set(current).add(requestId));
    onPickupSuccess?.(actionRequest);

    void advanceRequestStatus(requestId, "boarded", {
      assignElevatorId: operatorElevatorId,
    })
      .then((result) => {
        if (result.ok) {
          onPickupConfirmed?.(targetRequest);
        } else {
          setActionError(result.message);
        }
      })
      .catch(() => {
        setActionError("Action impossible. Verifiez la connexion et reessayez.");
      })
      .finally(() => {
        setPendingPickupIds((current) => {
          const next = new Set(current);
          next.delete(requestId);
          return next;
        });
      });
  }

  function dropoff() {
    const ids = dropoffIds;
    if (ids.length === 0 || !dropFloorId) {
      return;
    }

    const alreadyPending = ids.some((id) => pendingDropoffIds.has(id));
    if (alreadyPending) return;

    setActionError(null);
    setPendingDropoffIds((current) => {
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

    void Promise.all(ids.map((requestId) => advanceRequestStatus(requestId, "completed")))
      .then((results) => {
        const failed = results.find((result) => !result.ok);
        if (failed) {
          setActionError(failed.message);
          setCompletedDropoffIds((current) => {
            const next = new Set(current);
            for (const id of ids) next.delete(id);
            return next;
          });
        }
      })
      .catch(() => {
        setActionError("Action impossible. Verifiez la connexion et reessayez.");
        setCompletedDropoffIds((current) => {
          const next = new Set(current);
          for (const id of ids) next.delete(id);
          return next;
        });
      })
      .finally(() => {
        setPendingDropoffIds((current) => {
          const next = new Set(current);
          for (const id of ids) next.delete(id);
          return next;
        });
      });
  }

  return (
    <section className="w-full">
      {showPrimaryAction && reasonLine.trim() ? (
        <p className="mb-3 rounded-2xl border border-white/10 bg-slate-950/55 px-4 py-3 text-center text-base font-bold leading-snug text-slate-100">
          {reasonLine}
        </p>
      ) : null}
      {actionButton}
      {actionError ? (
        <p className="mt-3 rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-center text-sm font-bold text-red-100">
          {actionError}
        </p>
      ) : null}
      {recommendation.capacityWarnings.length > 0 && (
        <div className="mt-3 rounded-2xl bg-slate-950/90 p-3 text-yellow-100">
          <p className="flex items-center gap-2 text-sm font-black">
            <TriangleAlert size={18} />
            {t("operator.capacityAlerts")}
          </p>
          <ul className="mt-2 space-y-1 text-sm">
            {recommendation.capacityWarnings.slice(0, 3).map((warning) => (
              <li key={`${warning.requestId}-${warning.type}`}>{t(capacityWarningTranslationKey(warning.type))}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
