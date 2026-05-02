"use client";

import { useMemo, useState } from "react";
import { DoorOpen, Pause, TriangleAlert, UserCheck } from "lucide-react";
import { advanceRequestStatus } from "@/lib/actions";
import { pickupAwaitingRequestsFromRecommendation } from "@/lib/operatorPickupBatch";
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
  hasActiveOperatorWork = false,
  manualFull = false,
  computePickupsAfterDropoff,
  onPickupSuccess,
  onDropoffSuccess,
}: {
  recommendation: DispatchRecommendation;
  actionRequests: EnrichedRequest[];
  operatorElevatorId: string;
  /** File ou cabine non vide : évite « PAUSE » pendant un recalcul ou un état transitoire. */
  hasActiveOperatorWork?: boolean;
  /** Cabine en pause manuelle : pas de ramassage dans le bouton combiné. */
  manualFull?: boolean;
  /** Après dépose réussie (état optimiste), IDs à ramasser au palier, selon `getRecommendedNextStop`. */
  computePickupsAfterDropoff?: (completedDropoffIds: string[], dropFloorId: string) => string[];
  /** Une ou plusieurs demandes passées à « à bord » (même palier / même frappe). */
  onPickupSuccess?: (requests: EnrichedRequest[]) => void;
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

  const pendingDropoffs = useMemo(() => {
    return recommendation.requestsToDropoff.filter((passenger) => {
      if (completedDropoffIds.has(passenger.requestId)) {
        return false;
      }
      const live = actionRequests.find((request) => request.id === passenger.requestId);
      return live?.status === "boarded";
    });
  }, [actionRequests, recommendation.requestsToDropoff, completedDropoffIds]);

  const dropFloorId =
    pendingDropoffs[0]?.to_floor_id ??
    (hasRecommendedPickup ? "" : recommendation.nextFloor?.id ?? "");

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

  const pickupBatchPreview = useMemo(() => {
    let batch = pickupAwaitingRequestsFromRecommendation(
      recommendation.requestsToPickup,
      actionRequests,
      pendingPickupIds,
    );
    if (
      batch.length === 0 &&
      recommendation.primaryPickupRequestId &&
      !pendingPickupIds.has(recommendation.primaryPickupRequestId)
    ) {
      const fallback = actionRequests.find(
        (request) =>
          request.id === recommendation.primaryPickupRequestId &&
          (request.status === "pending" || request.status === "assigned" || request.status === "arriving"),
      );
      if (fallback) {
        batch = [fallback];
      }
    }
    return batch;
  }, [
    actionRequests,
    recommendation.primaryPickupRequestId,
    recommendation.requestsToPickup,
    pendingPickupIds,
  ]);

  const awaitingPickupAtDropFloor = useMemo(() => {
    if (!dropFloorId) {
      return [];
    }
    return actionRequests.filter(
      (request) =>
        request.from_floor_id === dropFloorId &&
        (request.status === "pending" || request.status === "assigned" || request.status === "arriving"),
    );
  }, [actionRequests, dropFloorId]);

  const showDropoff = dropoffIds.length > 0 && dropFloorId !== "";
  const showCombined =
    showDropoff &&
    awaitingPickupAtDropFloor.length > 0 &&
    !manualFull &&
    typeof computePickupsAfterDropoff === "function";
  const showDropoffOnly = showDropoff && !showCombined;
  const showPickup = !showDropoff && pickupBatchPreview.length > 0;
  const showPrimaryAction = showCombined || showDropoffOnly || showPickup;

  async function dropoffThenPickup() {
    const ids = dropoffIds;
    const resolver = computePickupsAfterDropoff;
    if (ids.length === 0 || !dropFloorId || !resolver) {
      return;
    }

    const alreadyPending = ids.some((id) => pendingDropoffIds.has(id));
    if (alreadyPending) {
      return;
    }

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

    const requestById = new Map(actionRequests.map((request) => [request.id, request]));

    try {
      const results = await Promise.all(ids.map((requestId) => advanceRequestStatus(requestId, "completed")));
      const failed = results.find((result) => !result.ok);
      if (failed) {
        setActionError(failed.message);
        setCompletedDropoffIds((current) => {
          const next = new Set(current);
          for (const id of ids) next.delete(id);
          return next;
        });
        return;
      }

      const pickupIds = resolver(ids, dropFloorId);
      const boardedAfterDrop: EnrichedRequest[] = [];

      for (const pickupId of pickupIds) {
        const req = requestById.get(pickupId);
        if (!req) {
          continue;
        }
        if (req.status !== "pending" && req.status !== "assigned" && req.status !== "arriving") {
          continue;
        }

        setPendingPickupIds((current) => new Set(current).add(pickupId));

        let pickupResult: Awaited<ReturnType<typeof advanceRequestStatus>>;
        try {
          pickupResult = await advanceRequestStatus(pickupId, "boarded", {
            assignElevatorId: operatorElevatorId,
          });
        } catch {
          pickupResult = { ok: false, message: "Action impossible. Verifiez la connexion et reessayez." };
        }

        setPendingPickupIds((current) => {
          const next = new Set(current);
          next.delete(pickupId);
          return next;
        });

        if (!pickupResult.ok) {
          setActionError(pickupResult.message);
          break;
        }

        boardedAfterDrop.push(req);
      }

      if (boardedAfterDrop.length > 0) {
        onPickupSuccess?.(boardedAfterDrop);
      }
    } catch {
      setActionError("Action impossible. Verifiez la connexion et reessayez.");
      setCompletedDropoffIds((current) => {
        const next = new Set(current);
        for (const id of ids) next.delete(id);
        return next;
      });
    } finally {
      setPendingDropoffIds((current) => {
        const next = new Set(current);
        for (const id of ids) next.delete(id);
        return next;
      });
    }
  }

  async function pickup() {
    let batch = pickupAwaitingRequestsFromRecommendation(
      recommendation.requestsToPickup,
      actionRequests,
      pendingPickupIds,
    );
    if (
      batch.length === 0 &&
      recommendation.primaryPickupRequestId &&
      !pendingPickupIds.has(recommendation.primaryPickupRequestId)
    ) {
      const fallback = actionRequests.find(
        (request) =>
          request.id === recommendation.primaryPickupRequestId &&
          (request.status === "pending" || request.status === "assigned" || request.status === "arriving"),
      );
      if (fallback) {
        batch = [fallback];
      }
    }

    if (batch.length === 0) {
      return;
    }

    const ids = batch.map((request) => request.id);
    if (ids.some((id) => pendingPickupIds.has(id))) {
      return;
    }

    setActionError(null);
    setPendingPickupIds((current) => {
      const next = new Set(current);
      for (const id of ids) next.add(id);
      return next;
    });

    try {
      const succeeded: EnrichedRequest[] = [];
      for (const req of batch) {
        let result: Awaited<ReturnType<typeof advanceRequestStatus>>;
        try {
          result = await advanceRequestStatus(req.id, "boarded", {
            assignElevatorId: operatorElevatorId,
          });
        } catch {
          result = { ok: false, message: "Action impossible. Verifiez la connexion et reessayez." };
        }

        if (!result.ok) {
          setActionError(result.message);
          break;
        }

        succeeded.push(req);
      }

      if (succeeded.length > 0) {
        onPickupSuccess?.(succeeded);
      }
    } catch {
      setActionError("Action impossible. Verifiez la connexion et reessayez.");
    } finally {
      setPendingPickupIds((current) => {
        const next = new Set(current);
        for (const id of ids) next.delete(id);
        return next;
      });
    }
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

  const actionButton = showCombined ? (
    <button
      type="button"
      onClick={() => void dropoffThenPickup()}
      className="touch-target group relative flex min-h-36 w-full overflow-hidden rounded-3xl bg-gradient-to-r from-emerald-300 via-teal-200 to-sky-300 px-6 py-7 text-slate-950 shadow-[0_20px_52px_rgba(45,212,191,0.38)] ring-4 ring-teal-100/45 transition active:scale-[0.98]"
    >
      <span className="absolute inset-0 bg-[linear-gradient(110deg,transparent,rgba(255,255,255,0.5),transparent)] opacity-70 motion-safe:animate-[action-shine_1.45s_ease-in-out_infinite]" />
      <span className="relative flex w-full flex-wrap items-center justify-center gap-3 text-3xl font-black uppercase tracking-wide sm:text-4xl">
        <DoorOpen size={36} strokeWidth={2.8} className="shrink-0" />
        <UserCheck size={36} strokeWidth={2.8} className="shrink-0" />
        <span className="text-center leading-tight">{t("operator.dropoffThenPickup")}</span>
      </span>
    </button>
  ) : showDropoffOnly ? (
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
      onClick={() => void pickup()}
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
  ) : hasActiveOperatorWork ? (
    <button
      type="button"
      disabled
      className="touch-target flex min-h-36 w-full cursor-not-allowed flex-col items-center justify-center gap-3 rounded-3xl border border-white/12 bg-slate-800/50 px-6 py-7 text-slate-300 shadow-inner ring-2 ring-white/[0.06]"
    >
      <span className="text-center text-xl font-black uppercase leading-snug tracking-wide">{t("operator.noAction")}</span>
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
