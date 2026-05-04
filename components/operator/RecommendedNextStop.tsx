"use client";

import { useMemo, useRef, useState } from "react";
import { Ban, DoorOpen, Loader2, Pause, TriangleAlert, UserCheck } from "lucide-react";
import { advanceRequestStatus, skipRequestForCurrentPassage } from "@/lib/actions";
import { trackRequestPickedUp, trackRequestDroppedOff } from "@/lib/analytics";
import { captureError } from "@/lib/errorTracking";
import { startPickupToDbTimer } from "@/lib/performanceMonitor";
import { structuredLog } from "@/lib/structuredLogger";
import type { TranslationKey } from "@/lib/i18n";
import { formatDispatchRecommendationReason } from "@/lib/recommendationReason";
import { resolveRequestState, logAction } from "@/lib/stateResolution";
import type { DispatchRecommendation, EnrichedRequest } from "@/types/hoist";
import { useLanguage } from "@/components/i18n/LanguageProvider";
import { SkipForward } from "lucide-react";

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
  projectId,
  onPickupSuccess,
  onPickupFailure,
  onPickupConfirmed,
  onSkipSuccess,
  onDropoffSuccess,
  onDropoffFailure,
}: {
  recommendation: DispatchRecommendation;
  actionRequests: EnrichedRequest[];
  operatorElevatorId: string;
  projectId?: string;
  onPickupSuccess?: (request: EnrichedRequest) => void;
  /** Rollback du pickup : appele quand advanceRequestStatus retourne ok=false ou throw. */
  onPickupFailure?: (request: EnrichedRequest) => void;
  /** Apres confirmation serveur du pickup : broadcast passager, etc. */
  onPickupConfirmed?: (request: EnrichedRequest) => void;
  /** Apres skip: la requete disparait de la recommandation courante. */
  onSkipSuccess?: (request: EnrichedRequest) => void;
  /** Apres depot confirme : ids termines et palier cabine (destination des sorties). */
  onDropoffSuccess?: (payload: { requestIds: string[]; dropFloorId: string }) => void;
  /** Rollback du dropoff : appele quand au moins un advanceRequestStatus echoue ou throw. */
  onDropoffFailure?: (payload: { requestIds: string[] }) => void;
}) {
  const [completedDropoffIds, setCompletedDropoffIds] = useState<Set<string>>(() => new Set());
  const [pendingDropoffIds, setPendingDropoffIds] = useState<Set<string>>(() => new Set());
  const [skippedIds, setSkippedIds] = useState<Set<string>>(() => new Set());
  const [skipConfirmation, setSkipConfirmation] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const { t, locale } = useLanguage();
  // Track pickup click time for performance logging (<200ms target)
  const pickupClickTimeRef = useRef<number>(0);

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
        !skippedIds.has(request.id) &&
        (request.status === "pending" || request.status === "assigned" || request.status === "arriving"),
    );
    const primaryId = recommendation.primaryPickupRequestId;
    if (!primaryId) {
      return null;
    }
    const primary = candidates.find((request) => request.id === primaryId);
    return primary ?? null;
  }, [actionRequests, skippedIds, recommendation.primaryPickupRequestId]);

  const showDropoff = dropoffIds.length > 0 && dropFloorId !== "";
  // Find any pickup at the dropoff floor, even if brain didn't recommend it as primary
  const pickupCandidateAtDropFloor = showDropoff
    ? actionRequests.find(
        (request) =>
          !skippedIds.has(request.id) &&
          (request.status === "pending" || request.status === "assigned" || request.status === "arriving") &&
          request.from_floor_id === dropFloorId,
      ) ?? null
    : null;
  const pickupAtDropFloor = showDropoff && pickupCandidateAtDropFloor !== null;
  const showPickup = !showDropoff && actionRequest !== null;
  const showCombined = showDropoff && pickupAtDropFloor;
  const showPrimaryAction = showDropoff || showPickup;
  const isActionPending = pendingDropoffIds.size > 0;

  const actionButton = showCombined ? (
    <button
      type="button"
      onClick={dropoffAndPickup}
      disabled={isActionPending}
      className="touch-target group relative flex min-h-36 w-full overflow-hidden rounded-3xl bg-gradient-to-r from-emerald-400 via-teal-300 to-sky-400 px-6 py-7 text-slate-950 shadow-[0_20px_52px_rgba(16,185,129,0.42)] ring-4 ring-teal-100/40 transition active:scale-[0.98] disabled:opacity-70 disabled:cursor-wait"
    >
      {isActionPending && <span className="absolute inset-0 bg-slate-950/20" />}
      <span className="absolute inset-0 bg-[linear-gradient(110deg,transparent,rgba(255,255,255,0.55),transparent)] opacity-70 motion-safe:animate-[action-shine_1.45s_ease-in-out_infinite]" />
      <span className="relative flex w-full flex-col items-center justify-center gap-1">
        {isActionPending ? (
          <span className="flex items-center gap-3 text-3xl font-black uppercase tracking-wide">
            <Loader2 size={36} className="anim-spinner" />
            <span className="text-lg font-black uppercase tracking-wide">{t("operator.actionInProgress")}</span>
          </span>
        ) : (
          <>
            <span className="flex w-full items-center justify-center gap-4 text-4xl font-black uppercase tracking-wide">
              <DoorOpen size={36} strokeWidth={2.8} />
              <span>+</span>
              <UserCheck size={36} strokeWidth={2.8} />
            </span>
            <span className="text-lg font-black uppercase tracking-wide">{t("operator.dropoffAndPickup")}</span>
          </>
        )}
      </span>
    </button>
  ) : showDropoff ? (
    <button
      type="button"
      onClick={dropoff}
      disabled={isActionPending}
      className="touch-target group relative flex min-h-36 w-full overflow-hidden rounded-3xl bg-emerald-300 px-6 py-7 text-slate-950 shadow-[0_20px_52px_rgba(16,185,129,0.42)] ring-4 ring-emerald-100/40 transition active:scale-[0.98] disabled:opacity-70 disabled:cursor-wait"
    >
      {isActionPending && <span className="absolute inset-0 bg-slate-950/20" />}
      <span className="absolute inset-0 bg-[linear-gradient(110deg,transparent,rgba(255,255,255,0.55),transparent)] opacity-70 motion-safe:animate-[action-shine_1.45s_ease-in-out_infinite]" />
      <span className="relative flex w-full items-center justify-center gap-4 text-4xl font-black uppercase tracking-wide">
        {isActionPending ? <Loader2 size={38} className="anim-spinner" /> : <DoorOpen size={38} strokeWidth={2.8} />}
        {isActionPending ? t("operator.actionInProgress") : t("operator.dropoff")}
      </span>
    </button>
  ) : showPickup ? (
    <div className="grid gap-3">
      <button
        type="button"
        onClick={pickup}
        disabled={isActionPending}
        className="touch-target group relative flex min-h-36 w-full overflow-hidden rounded-3xl bg-sky-300 px-6 py-7 text-slate-950 shadow-[0_20px_52px_rgba(56,189,248,0.42)] ring-4 ring-sky-100/40 transition active:scale-[0.98] disabled:opacity-70 disabled:cursor-wait"
      >
        {isActionPending && <span className="absolute inset-0 bg-slate-950/20" />}
        <span className="absolute inset-0 bg-[linear-gradient(110deg,transparent,rgba(255,255,255,0.6),transparent)] opacity-75 motion-safe:animate-[action-shine_1.45s_ease-in-out_infinite]" />
        <span className="relative flex w-full items-center justify-center gap-4 text-4xl font-black uppercase tracking-wide">
          <UserCheck size={38} strokeWidth={2.8} />
          {t("operator.pickup")}
        </span>
      </button>
      <button
        type="button"
        onClick={skipPickup}
        className="touch-target flex items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-sm font-black text-slate-300 transition hover:bg-white/10 active:scale-[0.98]"
      >
        <SkipForward size={16} />
        {t("operator.skipPassage")}
      </button>
    </div>
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
    const targetRequest = actionRequest;
    setActionError(null);

    // ── PERFORMANCE: measure pickup click → UI update ──
    pickupClickTimeRef.current = performance.now();

    // ── INSTANT OPTIMISTIC UPDATE ──────────────────────────────
    // The UI must update IMMEDIATELY. No spinner, no waiting.
    // onPickupSuccess sets status "boarded" in client state,
    // hides Ramasser, shows Déposer — all before server responds.
    onPickupSuccess?.(targetRequest);
    structuredLog("Performance", "pickup_optimistic_success", { requestId, action: "boarded" });

    // ── Performance log: click → UI update time ────────────────
    const uiUpdateMs = Math.round(performance.now() - pickupClickTimeRef.current);
    structuredLog("Performance", "pickup_click_to_ui", {
      requestId,
      durationMs: uiUpdateMs,
      target: "<200ms",
    });
    if (uiUpdateMs > 200) {
      console.warn("[Elevio Performance] pickup click → UI update SLOW", { uiUpdateMs, target: "<200ms" });
    }

    // ── FIRE-AND-FORGET SERVER CALL ────────────────────────────
    // The server action does: DB update + syncElevator + insertEvent + revalidate.
    // This can take 500ms–10s but the user already sees the optimistic result.
    // NEVER rollback on timeout/delay — only rollback on real server error (ok: false or exception).
    // The poll/realtime will confirm the state eventually.
    const stopPickupDbTimer = startPickupToDbTimer({ projectId: projectId ?? "", elevatorId: operatorElevatorId, requestId });

    void advanceRequestStatus(requestId, "boarded", { assignElevatorId: operatorElevatorId })
      .then((result) => {
        if (result.ok) {
          const pickupDbMs = stopPickupDbTimer();
          trackRequestPickedUp(requestId, projectId ?? "", operatorElevatorId);
          structuredLog("Performance", "pickup_server_confirmed", { requestId, durationMs: Math.round(pickupDbMs) });
          onPickupConfirmed?.(targetRequest);
        } else {
          // Real server rejection — rollback the optimistic state
          stopPickupDbTimer();
          setActionError(result.message);
          structuredLog("Error", "pickup_server_error", { requestId, message: result.message });
          captureError(new Error("pickup_failed: " + result.message), { projectId, elevatorId: operatorElevatorId, requestId, userType: "operator", action: "pickup" });
          onPickupFailure?.(targetRequest);
        }
      })
      .catch((err) => {
        // Real exception (network down, server crash) — rollback
        stopPickupDbTimer();
        setActionError("Action impossible. Verifiez la connexion et reessayez.");
        structuredLog("Error", "pickup_exception", { requestId, error: String(err) });
        captureError(err, { projectId, elevatorId: operatorElevatorId, requestId, userType: "operator", action: "pickup" });
        onPickupFailure?.(targetRequest);
      });
  }

  function skipPickup() {
    if (!actionRequest) return;

    const requestId = actionRequest.id;
    const targetRequest = actionRequest;
    setActionError(null);

    // Instant optimistic — remove from recommendation immediately
    setSkippedIds((current) => new Set(current).add(requestId));
    onSkipSuccess?.(targetRequest);
    setSkipConfirmation(t("operator.skipConfirmation"));
    // Clear confirmation after 3 seconds
    setTimeout(() => setSkipConfirmation(null), 3000);

    // Fire-and-forget server action — no rollback needed on error
    void skipRequestForCurrentPassage(requestId, operatorElevatorId)
      .then((result) => {
        if (result.ok) {
          structuredLog("Performance", "skip_server_confirmed", { requestId, elevatorId: operatorElevatorId });
        } else {
          setActionError(result.message);
          // Don't rollback the optimistic skip — the request is still skipped locally
          // and will come back naturally from poll/realtime
        }
      })
      .catch((err) => {
        captureError(err, { projectId, elevatorId: operatorElevatorId, requestId, userType: "operator", action: "skip" });
        // Same — don't rollback
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
          captureError(new Error("dropoff_failed: " + failed.message), { projectId, elevatorId: operatorElevatorId, requestIds: ids, userType: "operator", action: "dropoff" });
          setCompletedDropoffIds((current) => {
            const next = new Set(current);
            for (const id of ids) next.delete(id);
            return next;
          });
          onDropoffFailure?.({ requestIds: ids });
        } else {
          for (const requestId of ids) {
            trackRequestDroppedOff(requestId, projectId ?? "", operatorElevatorId);
          }
          structuredLog("Analytics", "request_dropped_off", { projectId, elevatorId: operatorElevatorId, requestIds: ids });
        }
      })
      .catch((err) => {
        setActionError("Action impossible. Verifiez la connexion et reessayez.");
        captureError(err, { projectId, elevatorId: operatorElevatorId, requestIds: ids, userType: "operator", action: "dropoff" });
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
      // Instant optimistic pickup — no spinner, no delay
      pickupClickTimeRef.current = performance.now();
      onPickupSuccess?.(targetRequest);
      const uiUpdateMs = Math.round(performance.now() - pickupClickTimeRef.current);
      structuredLog("Performance", "pickup_click_to_ui", {
        requestId: targetRequest.id,
        durationMs: uiUpdateMs,
        context: "combined",
        target: "<200ms",
      });
    }

    // 3. Fire server actions — pickup FIRST for instant passenger QR return
    if (targetRequest) {
      void advanceRequestStatus(targetRequest.id, "boarded", { assignElevatorId: operatorElevatorId })
        .then((pickupResult) => {
          if (pickupResult.ok) {
            trackRequestPickedUp(targetRequest.id, projectId ?? "", operatorElevatorId);
            structuredLog("Performance", "pickup_server_confirmed", { requestId: targetRequest.id, context: "combined" });
            onPickupConfirmed?.(targetRequest);
          } else {
            // Real server rejection — rollback
            setActionError(pickupResult.message);
            structuredLog("Error", "pickup_server_error", { requestId: targetRequest.id, context: "combined", message: pickupResult.message });
            captureError(new Error("combined_pickup_failed: " + pickupResult.message), { projectId, elevatorId: operatorElevatorId, requestId: targetRequest.id, userType: "operator", action: "combined_pickup" });
            onPickupFailure?.(targetRequest);
          }
        })
        .catch((err) => {
          // Real exception — rollback
          setActionError("Action impossible. Verifiez la connexion et reessayez.");
          structuredLog("Error", "pickup_exception", { requestId: targetRequest.id, context: "combined", error: String(err) });
          captureError(err, { projectId, elevatorId: operatorElevatorId, requestId: targetRequest.id, userType: "operator", action: "combined_pickup" });
          onPickupFailure?.(targetRequest);
        });
    }
    // Fire dropoff separately (don't block pickup confirmation)
    void Promise.all(ids.map((requestId) => advanceRequestStatus(requestId, "completed")))
      .then((results) => {
        const dropoffFailed = results.find((result) => !result.ok);
        if (dropoffFailed) {
          setActionError(dropoffFailed.message);
          captureError(new Error("combined_dropoff_failed: " + dropoffFailed.message), { projectId, elevatorId: operatorElevatorId, requestIds: ids, userType: "operator", action: "combined_dropoff" });
          setCompletedDropoffIds((current) => {
            const next = new Set(current);
            for (const id of ids) next.delete(id);
            return next;
          });
          onDropoffFailure?.({ requestIds: ids });
        } else {
          for (const requestId of ids) {
            trackRequestDroppedOff(requestId, projectId ?? "", operatorElevatorId);
          }
        }
      })
      .catch((err) => {
        captureError(err, { projectId, elevatorId: operatorElevatorId, requestIds: ids, userType: "operator", action: "combined_dropoff" });
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
      {skipConfirmation ? (
        <p className="mt-3 rounded-2xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-center text-sm font-bold text-emerald-100">
          {skipConfirmation}
        </p>
      ) : null}
      {actionError ? (
        <p className="anim-shake mt-3 rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-center text-sm font-bold text-red-100">
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
