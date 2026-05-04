"use client";

import { useMemo, useState } from "react";
import { Ban, DoorOpen, Pause, TriangleAlert, UserCheck } from "lucide-react";
import { advanceRequestStatus } from "@/lib/actions";
import type { TranslationKey } from "@/lib/i18n";
import { formatDispatchRecommendationReason } from "@/lib/recommendationReason";
import { resolveRequestState, logAction } from "@/lib/stateResolution";
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
  onPickupFailure,
  onPickupConfirmed,
  onDropoffSuccess,
  onDropoffFailure,
}: {
  recommendation: DispatchRecommendation;
  actionRequests: EnrichedRequest[];
  operatorElevatorId: string;
  onPickupSuccess?: (request: EnrichedRequest) => void;
  /** Rollback du pickup : appele quand advanceRequestStatus retourne ok=false ou throw. */
  onPickupFailure?: (request: EnrichedRequest) => void;
  /** Apres confirmation serveur du pickup : broadcast passager, etc. */
  onPickupConfirmed?: (request: EnrichedRequest) => void;
  /** Apres depot confirme : ids termines et palier cabine (destination des sorties). */
  onDropoffSuccess?: (payload: { requestIds: string[]; dropFloorId: string }) => void;
  /** Rollback du dropoff : appele quand au moins un advanceRequestStatus echoue ou throw. */
  onDropoffFailure?: (payload: { requestIds: string[] }) => void;
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
    recommendation.reasonDetail?.kind === "idle_blocked" || recommendation.reasonDetail?.kind === "idle_manual_full"
      ? formatDispatchRecommendationReason(recommendation.reasonDetail, locale, recommendation.reason)
      : "";

  const hasRecommendedPickup = recommendation.requestsToPickup.length > 0 || recommendation.primaryPickupRequestId !== null;
  const dropFloorId =
    recommendation.requestsToDropoff[0]?.to_floor_id ?? (hasRecommendedPickup ? "" : recommendation.nextFloor?.id ?? "");

  // Race condition guard: IDs in completedDropoffIds that still appear in
  // recommendation.requestsToDropoff must be stale (the DB reverted the
  // "completed" status, e.g. realtime delivered an older state). Exclude
  // them so the dropoff button can reappear instead of being permanently hidden.
  const effectiveCompletedDropoffIds = useMemo(() => {
    const activeDropIds = new Set(recommendation.requestsToDropoff.map((p) => p.requestId));
    const next = new Set<string>();
    for (const id of completedDropoffIds) {
      if (!activeDropIds.has(id)) {
        next.add(id);
      }
    }
    return next;
  }, [recommendation.requestsToDropoff, completedDropoffIds]);

  const pendingDropoffs = useMemo(() => {
    return recommendation.requestsToDropoff.filter((p) => !effectiveCompletedDropoffIds.has(p.requestId));
  }, [recommendation.requestsToDropoff, effectiveCompletedDropoffIds]);

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
  // Find any pickup at the dropoff floor, even if brain didn't recommend it as primary
  const pickupCandidateAtDropFloor = showDropoff
    ? actionRequests.find(
        (request) =>
          !pendingPickupIds.has(request.id) &&
          (request.status === "pending" || request.status === "assigned" || request.status === "arriving") &&
          request.from_floor_id === dropFloorId,
      ) ?? null
    : null;
  const pickupAtDropFloor = showDropoff && pickupCandidateAtDropFloor !== null;
  const showPickup = !showDropoff && actionRequest !== null;
  const showCombined = showDropoff && pickupAtDropFloor;
  const showPrimaryAction = showDropoff || showPickup;
  // ── DEBUG: Combined button diagnostic ──
  console.log("[COMBINED-BTN]", {
    showDropoff,
    showPickup,
    showCombined,
    pickupAtDropFloor,
    dropFloorId,
    pickupCandidateId: pickupCandidateAtDropFloor?.id ?? null,
    pickupCandidateStatus: pickupCandidateAtDropFloor?.status ?? null,
    actionRequestsLen: actionRequests.length,
    boardedAtDrop: actionRequests.filter(r => r.status === "boarded" && r.to_floor_id === dropFloorId).length,
    waitingAtDrop: actionRequests.filter(r => ["pending","assigned","arriving"].includes(r.status) && r.from_floor_id === dropFloorId).length,
  });

  const actionButton = showCombined ? (
    <button
      type="button"
      onClick={dropoffAndPickup}
      className="touch-target group relative flex min-h-36 w-full overflow-hidden rounded-3xl bg-gradient-to-r from-emerald-400 via-teal-300 to-sky-400 px-6 py-7 text-slate-950 shadow-[0_20px_52px_rgba(16,185,129,0.42)] ring-4 ring-teal-100/40 transition active:scale-[0.98]"
    >
      <span className="absolute inset-0 bg-[linear-gradient(110deg,transparent,rgba(255,255,255,0.55),transparent)] opacity-70 motion-safe:animate-[action-shine_1.45s_ease-in-out_infinite]" />
      <span className="relative flex w-full flex-col items-center justify-center gap-1">
        <span className="flex w-full items-center justify-center gap-4 text-4xl font-black uppercase tracking-wide">
          <DoorOpen size={36} strokeWidth={2.8} />
          <span>+</span>
          <UserCheck size={36} strokeWidth={2.8} />
        </span>
        <span className="text-lg font-black uppercase tracking-wide">{t("operator.dropoffAndPickup")}</span>
      </span>
    </button>
  ) : showDropoff ? (
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
  ) : recommendation.reasonDetail?.kind === "idle_manual_full" ? (
    <div className="flex min-h-36 w-full flex-col items-center justify-center gap-3 rounded-3xl border border-red-400/35 bg-red-950/45 px-5 py-6 text-center shadow-inner ring-2 ring-red-400/15">
      <Ban size={34} strokeWidth={2.6} className="shrink-0 text-red-200" aria-hidden />
      <span className="max-w-md text-sm font-bold leading-snug text-red-50">{idleBlockedMessage}</span>
    </div>
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

    // SAFETY: boarded requests MUST NEVER show pickup button
    const resolved = resolveRequestState(actionRequest);
    if (resolved.action !== "pickup") {
      console.error("[Elevio SAFETY] pickup() called on non-pickup request", {
        requestId: actionRequest.id,
        status: actionRequest.status,
        resolvedAction: resolved.action,
      });
      return;
    }

    const requestId = actionRequest.id;
    if (pendingPickupIds.has(requestId)) return;

    const targetRequest = actionRequest;
    setActionError(null);
    // ── DEBUG: Ramasser diagnostic (always log, even in prod) ──
    console.log("[RAMASSER]", {
      requestId,
      fromFloor: targetRequest.from_floor_id,
      toFloor: targetRequest.to_floor_id,
      oldStatus: targetRequest.status,
      newStatus: "boarded",
      passengerCount: targetRequest.passenger_count,
      operatorElevatorId,
      timestamp: new Date().toISOString(),
    });
    setPendingPickupIds((current) => new Set(current).add(requestId));
    onPickupSuccess?.(targetRequest);

    void advanceRequestStatus(requestId, "boarded", {
      assignElevatorId: operatorElevatorId,
    })
      .then((result) => {
        // ── DEBUG: always log server result ──
        console.log("[RAMASSER-RESULT]", {
          requestId,
          ok: result.ok,
          message: result.message,
          timestamp: new Date().toISOString(),
        });
        if (result.ok) {
          onPickupConfirmed?.(targetRequest);
        } else {
          setActionError(result.message);
          onPickupFailure?.(targetRequest);
        }
      })
      .catch(() => {
        setActionError("Action impossible. Verifiez la connexion et reessayez.");
        onPickupFailure?.(targetRequest);
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
          onDropoffFailure?.({ requestIds: ids });
        }
      })
      .catch(() => {
        setActionError("Action impossible. Verifiez la connexion et reessayez.");
        setCompletedDropoffIds((current) => {
          const next = new Set(current);
          for (const id of ids) next.delete(id);
          return next;
        });
        onDropoffFailure?.({ requestIds: ids });
      })
      .finally(() => {
        setPendingDropoffIds((current) => {
          const next = new Set(current);
          for (const id of ids) next.delete(id);
          return next;
        });
      });
  }

  function dropoffAndPickup() {
    // Combined action: first dropoff, then pickup — one click for same-floor actions.
    // Order: Déposer (dropoff) first, then Ramasser (pickup).
    // Dropoff completes the boarded passengers; pickup boards the waiting ones.
    console.log("[COMBINED-ACTION]", {
      dropoffIds: dropoffIds.length,
      dropFloorId: dropFloorId?.slice(0,8),
      pickupCandidateId: pickupCandidateAtDropFloor?.id?.slice(0,8) ?? null,
      pickupCandidateStatus: pickupCandidateAtDropFloor?.status ?? null,
    });

    // 1. Dropoff
    const ids = dropoffIds;
    if (ids.length === 0 || !dropFloorId) return;

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

    // 2. Pickup — optimistically update immediately (use pickupCandidateAtDropFloor for combined)
    const targetRequest = pickupCandidateAtDropFloor;
    if (targetRequest) {
      const requestId = targetRequest.id;
      setPendingPickupIds((current) => new Set(current).add(requestId));
      onPickupSuccess?.(targetRequest);
    }

    // 3. Fire server actions — pickup FIRST for instant passenger QR return
    if (targetRequest) {
      advanceRequestStatus(targetRequest.id, "boarded", { assignElevatorId: operatorElevatorId })
        .then((pickupResult) => {
          console.log("[RAMASSER-RESULT]", {
            requestId: targetRequest.id,
            ok: pickupResult.ok,
            message: pickupResult.message,
            timestamp: new Date().toISOString(),
          });
          if (pickupResult.ok) {
            onPickupConfirmed?.(targetRequest);
          } else {
            setActionError(pickupResult.message);
            onPickupFailure?.(targetRequest);
          }
        })
        .catch(() => {
          if (targetRequest) onPickupFailure?.(targetRequest);
        });
    }
    // Fire dropoff separately (don't block pickup confirmation)
    void Promise.all(ids.map((requestId) => advanceRequestStatus(requestId, "completed")))
      .then((results) => {
        const dropoffFailed = results.find((result) => !result.ok);
        if (dropoffFailed) {
          setActionError(dropoffFailed.message);
          setCompletedDropoffIds((current) => {
            const next = new Set(current);
            for (const id of ids) next.delete(id);
            return next;
          });
          onDropoffFailure?.({ requestIds: ids });
        }
      })
      .catch(() => {
        setActionError("Action impossible. Verifiez la connexion et reessayez.");
        setCompletedDropoffIds((current) => {
          const next = new Set(current);
          for (const id of ids) next.delete(id);
          return next;
        });
        onDropoffFailure?.({ requestIds: ids });
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
