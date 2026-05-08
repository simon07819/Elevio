"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Ban, DoorOpen, Loader2, Pause, TriangleAlert, UserCheck } from "lucide-react";
import { advanceRequestStatus, applyCombinedOperatorAction, skipRequestForCurrentPassage } from "@/lib/actions";
import { trackRequestPickedUp, trackRequestDroppedOff } from "@/lib/analyticsEvents";
import { captureError } from "@/lib/errorTracking";
import { startPickupToDbTimer } from "@/lib/analyticsEvents";
import { structuredLog } from "@/lib/structuredLogger";
import type { TranslationKey } from "@/lib/i18n";
import { formatDispatchRecommendationReason } from "@/lib/recommendationReason";
import { resolveRequestState, logAction } from "@/lib/stateResolution";
import type { DispatchRecommendation, EnrichedRequest } from "@/types/hoist";
import { useLanguage } from "@/components/i18n/LanguageProvider";
import { SkipForward } from "lucide-react";

/**
 * A pickup is "opportunistic" when:
 * - There is at least 1 boarded/onboard passenger for this elevator
 * - AND the recommended action is a pickup (pending/assigned/arriving)
 * - AND the pickup candidate was NOT the original reason the elevator started moving
 *
 * In other words: the operator already has passengers onboard and the dispatch
 * suggests picking up more along the way. This is the ONLY case where "Sauter ce passage"
 * makes sense — the operator may have already passed the floor.
 *
 * It is NOT opportunistic when:
 * - The elevator is idle with no onboard passengers (normal pickup)
 * - The only work is a pickup (no one onboard yet)
 * - The action is a dropoff (always mandatory)
 */
function isOpportunisticPickup(
  actionRequest: EnrichedRequest | null,
  onboardRequests: EnrichedRequest[],
): boolean {
  if (!actionRequest) return false;
  if (onboardRequests.length === 0) return false;
  // The request must be a pickup candidate (pending/assigned/arriving)
  const status = actionRequest.status;
  if (status !== "pending" && status !== "assigned" && status !== "arriving") return false;
  return true;
}

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
  onboardRequests = [],
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
  /** Boarded requests for this elevator — used to detect opportunistic pickup and prevent Pause. */
  onboardRequests?: EnrichedRequest[];
}) {
  const [completedDropoffIds, setCompletedDropoffIds] = useState<Set<string>>(() => new Set());
  const [pendingDropoffIds, setPendingDropoffIds] = useState<Set<string>>(() => new Set());
  const [skippedIds, setSkippedIds] = useState<Set<string>>(() => new Set());
  const [skipConfirmation, setSkipConfirmation] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const { t, locale } = useLanguage();
  // Track pickup click time for performance logging (<200ms target)
  const pickupClickTimeRef = useRef<number>(0);
  // Anti-spam: prevents double-tap from firing pickup twice before optimistic update disables the button
  const pickupRunningRef = useRef(false);
  // Anti-spam: prevents double-tap on skip
  const skipRunningRef = useRef(false);

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
  // Whether the brain recommends a pickup (before effective overrides).
  // Used to decide if we should show dropoff from onboard when the
  // pickup is skipped — without creating a circular reference with showPickup.
  const hasPickupCandidate = actionRequest !== null;
  // Compute dropoff from onboard requests INDEPENDENTLY of the brain.
  // This ensures that after skipping a pickup, Déposer still appears if
  // there are boarded passengers, instead of falling through to Pause.
  const onboardDropoffIds = useMemo(() => {
    if (onboardRequests.length === 0) return [];
    // Find the nearest dropoff floor among onboard passengers
    const allDestFloorIds = [...new Set(onboardRequests.map((r) => r.to_floor_id))];
    return allDestFloorIds;
  }, [onboardRequests]);

  const onboardDropFloorId = onboardDropoffIds.length > 0 ? onboardDropoffIds[0] : "";

  // If the brain says pickup but we've skipped it, AND we have onboard passengers,
  // show dropoff instead of pause. This is the guard against "Pause after skip".
  const effectiveShowDropoff = showDropoff || (onboardRequests.length > 0 && !hasPickupCandidate && onboardDropFloorId !== "");
  const effectiveDropoffIds = effectiveShowDropoff && !showDropoff ? onboardDropoffIds : dropoffIds;
  const effectiveDropFloorId = effectiveShowDropoff && !showDropoff ? onboardDropFloorId : dropFloorId;
  // Find any pickup at the dropoff floor, even if brain didn't recommend it as primary
  const pickupCandidateAtDropFloor = effectiveShowDropoff
    ? actionRequests.find(
        (request) =>
          !skippedIds.has(request.id) &&
          (request.status === "pending" || request.status === "assigned" || request.status === "arriving") &&
          request.from_floor_id === effectiveDropFloorId,
      ) ?? null
    : null;
  const pickupAtDropFloor = effectiveShowDropoff && pickupCandidateAtDropFloor !== null;
  const showPickup = !effectiveShowDropoff && actionRequest !== null;
  const showCombined = effectiveShowDropoff && pickupAtDropFloor;

  // Reverse-order combined: brain primary action is a PICKUP at floor X, AND
  // there are already-boarded passengers whose drop floor is also X. This is
  // the "Ramasser + Déposer" variant (pickup first, then dropoff). Order
  // matters because operators may want to load incoming passengers before
  // letting the existing ones out (priority case, mixed direction with shared
  // floor, etc.). Both buttons go through the SAME atomic server action so
  // the resulting state is always consistent.
  const dropoffIdsAtPickupFloor = useMemo(() => {
    if (!showPickup || !actionRequest) return [];
    return onboardRequests
      .filter((r) => r.to_floor_id === actionRequest.from_floor_id)
      .map((r) => r.id);
  }, [showPickup, actionRequest, onboardRequests]);
  const showPickupThenDropoff = showPickup && dropoffIdsAtPickupFloor.length > 0;

  const showPrimaryAction = effectiveShowDropoff || showPickup;

  // ── Debug: log when recommendation recalculates after key actions ──
  const prevActionTypeRef = useRef<string>("");
  useEffect(() => {
    const actionType = showCombined ? "combined"
      : showPickupThenDropoff ? "combined_pickup_first"
      : effectiveShowDropoff ? "dropoff"
      : showPickup ? "pickup"
      : "pause";
    if (prevActionTypeRef.current && prevActionTypeRef.current !== actionType) {
      structuredLog("Performance", "recalculated_after_action", {
        from: prevActionTypeRef.current,
        to: actionType,
        onboardCount: onboardRequests.length,
        skippedIdsSize: skippedIds.size,
        primaryPickupId: recommendation.primaryPickupRequestId?.slice(0, 8),
      });
    }
    prevActionTypeRef.current = actionType;
  }, [showCombined, showPickupThenDropoff, effectiveShowDropoff, showPickup, onboardRequests.length, skippedIds.size, recommendation.primaryPickupRequestId]);

  // Skip button only for opportunistic pickup (operator already has onboard passengers)
  const isOpportunistic = isOpportunisticPickup(actionRequest, onboardRequests);
  const isActionPending = pendingDropoffIds.size > 0;

  // ── SAFETY: Clear stuck "En cours" after 10 seconds ──
  // If pendingDropoffIds stays non-empty for >10s (server timeout, network error
  // that doesn't reach .catch/.finally), force-clear to unstick the button.
  const pendingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  if (isActionPending && !pendingTimeoutRef.current) {
    pendingTimeoutRef.current = setTimeout(() => {
      setPendingDropoffIds(new Set());
      pendingTimeoutRef.current = null;
    }, 10_000);
  }
  if (!isActionPending && pendingTimeoutRef.current) {
    clearTimeout(pendingTimeoutRef.current);
    pendingTimeoutRef.current = null;
  }

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
  ) : effectiveShowDropoff ? (
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
  ) : showPickupThenDropoff ? (
    <button
      type="button"
      onClick={pickupAndDropoff}
      disabled={isActionPending}
      className="touch-target group relative flex min-h-36 w-full overflow-hidden rounded-3xl bg-gradient-to-r from-sky-400 via-cyan-300 to-emerald-400 px-6 py-7 text-slate-950 shadow-[0_20px_52px_rgba(56,189,248,0.42)] ring-4 ring-sky-100/40 transition active:scale-[0.98] disabled:opacity-70 disabled:cursor-wait"
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
              <UserCheck size={36} strokeWidth={2.8} />
              <span>+</span>
              <DoorOpen size={36} strokeWidth={2.8} />
            </span>
            <span className="text-lg font-black uppercase tracking-wide">{t("operator.pickupAndDropoff")}</span>
          </>
        )}
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
      {isOpportunistic && (
        <button
          type="button"
          onClick={skipPickup}
          className="touch-target flex items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-sm font-black text-slate-300 transition hover:bg-white/10 active:scale-[0.98]"
        >
          <SkipForward size={16} />
          {t("operator.skipPassage")}
        </button>
      )}
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

    // ── ANTI-SPAM: prevent double-tap from firing pickup twice ──
    if (pickupRunningRef.current) {
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
      // Clear any stuck loading state — this is a guard, not a user error
      setActionError(null);
      return;
    }

    // ── GUARD: Don't fire pickup if request is already boarded ──
    // This can happen if the user double-clicks or if optimistic state
    // hasn't updated yet. Fire-and-forget might still be in-flight.
    if (actionRequest.status === "boarded") {
      console.warn("[Elevio Guard] duplicate pickup ignored", {
        requestId: actionRequest.id,
        status: actionRequest.status,
      });
      return;
    }

    const requestId = actionRequest.id;
    const targetRequest = actionRequest;
    setActionError(null);

    // ── PERFORMANCE: measure pickup click → UI update ──
    pickupClickTimeRef.current = performance.now();

    // ── ANTI-SPAM: mark pickup as running ──
    pickupRunningRef.current = true;

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
          pickupRunningRef.current = false;
        } else {
          // Real server rejection — rollback the optimistic state
          stopPickupDbTimer();
          setActionError(result.message);
          structuredLog("Error", "pickup_server_error", { requestId, message: result.message });
          captureError(new Error("pickup_failed: " + result.message), { projectId, elevatorId: operatorElevatorId, requestId, userType: "operator", action: "pickup" });
          onPickupFailure?.(targetRequest);
          pickupRunningRef.current = false;
        }
      })
      .catch((err) => {
        // Real exception (network down, server crash) — rollback
        stopPickupDbTimer();
        setActionError("Action impossible. Verifiez la connexion et reessayez.");
        structuredLog("Error", "pickup_exception", { requestId, error: String(err) });
        captureError(err, { projectId, elevatorId: operatorElevatorId, requestId, userType: "operator", action: "pickup" });
        onPickupFailure?.(targetRequest);
        pickupRunningRef.current = false;
      });
  }

  function skipPickup() {
    if (!actionRequest) return;

    // Anti-spam: prevent double-tap
    if (skipRunningRef.current) return;
    skipRunningRef.current = true;

    const requestId = actionRequest.id;
    const targetRequest = actionRequest;
    setActionError(null);

    // Instant optimistic — remove from recommendation immediately
    setSkippedIds((current) => new Set(current).add(requestId));
    onSkipSuccess?.(targetRequest);
    setSkipConfirmation(t("operator.skipConfirmation"));
    structuredLog("Performance", "skip_optimistic_success", { requestId, elevatorId: operatorElevatorId });
    // Clear confirmation after 3 seconds
    setTimeout(() => setSkipConfirmation(null), 3000);

    // Fire-and-forget server action — no rollback needed on error
    void skipRequestForCurrentPassage(requestId, operatorElevatorId)
      .then((result) => {
        skipRunningRef.current = false;
        if (result.ok) {
          structuredLog("Performance", "skip_server_confirmed", { requestId, elevatorId: operatorElevatorId });
        } else {
          setActionError(result.message);
        }
      })
      .catch((err) => {
        skipRunningRef.current = false;
        captureError(err, { projectId, elevatorId: operatorElevatorId, requestId, userType: "operator", action: "skip" });
      });
  }

  function dropoff() {
    const ids = effectiveDropoffIds;
    if (ids.length === 0 || !effectiveDropFloorId) {
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
    onDropoffSuccess?.({ requestIds: ids, dropFloorId: effectiveDropFloorId });

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

  /**
   * Atomic combined action: dropoff + pickup (or pickup + dropoff) at the same
   * floor. All optimistic UI happens immediately; a SINGLE server call applies
   * both transitions in the correct order, then revalidates ONCE.
   *
   * Replaces the previous parallel `Promise.all([advanceRequestStatus(...),
   * advanceRequestStatus(...)])` which suffered from race conditions on
   * `syncElevatorWithRequestStatus` and double `revalidatePath("/operator")`,
   * causing 10–15s lag, "old request reappearing" and wrong next move.
   */
  function runCombined(
    actionOrder: "dropoff_then_pickup" | "pickup_then_dropoff",
    args?: { dropoffIds?: string[]; pickupRequest?: EnrichedRequest | null; dropFloorId?: string },
  ) {
    if (pickupRunningRef.current) return;

    const ids = args?.dropoffIds ?? dropoffIds;
    const targetRequest = args?.pickupRequest ?? pickupCandidateAtDropFloor;
    const sharedFloorId = args?.dropFloorId ?? effectiveDropFloorId;
    if (ids.length === 0 || !sharedFloorId || !targetRequest) {
      return;
    }

    setActionError(null);

    // ── INSTANT OPTIMISTIC UI ───────────────────────────────────────────
    // Both transitions are reflected locally before the server responds, so
    // the operator sees the next correct action without waiting on realtime.
    pickupClickTimeRef.current = performance.now();
    pickupRunningRef.current = true;

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

    // Fire optimistic callbacks in the requested order so OperatorDashboard's
    // optimistic state reflects what the cabin will look like next.
    if (actionOrder === "pickup_then_dropoff") {
      onPickupSuccess?.(targetRequest);
      onDropoffSuccess?.({ requestIds: ids, dropFloorId: sharedFloorId });
    } else {
      onDropoffSuccess?.({ requestIds: ids, dropFloorId: sharedFloorId });
      onPickupSuccess?.(targetRequest);
    }

    const uiUpdateMs = Math.round(performance.now() - pickupClickTimeRef.current);
    structuredLog("Performance", "pickup_click_to_ui", {
      requestId: targetRequest.id,
      durationMs: uiUpdateMs,
      context: `combined:${actionOrder}`,
      target: "<200ms",
    });

    void applyCombinedOperatorAction({
      elevatorId: operatorElevatorId,
      projectId: projectId ?? "",
      dropoffRequestIds: ids,
      pickupRequestId: targetRequest.id,
      actionOrder,
    })
      .then((result) => {
        if (result.ok) {
          trackRequestPickedUp(targetRequest.id, projectId ?? "", operatorElevatorId);
          for (const requestId of ids) {
            trackRequestDroppedOff(requestId, projectId ?? "", operatorElevatorId);
          }
          structuredLog("Performance", "combined_server_confirmed", {
            requestId: targetRequest.id,
            dropoffIds: ids,
            actionOrder,
          });
          onPickupConfirmed?.(targetRequest);
          pickupRunningRef.current = false;
        } else {
          // Server rejected the combined action — roll back BOTH sides.
          setActionError(result.message);
          structuredLog("Error", "combined_server_error", {
            requestId: targetRequest.id,
            dropoffIds: ids,
            actionOrder,
            message: result.message,
          });
          captureError(new Error("combined_action_failed: " + result.message), {
            projectId,
            elevatorId: operatorElevatorId,
            requestId: targetRequest.id,
            requestIds: ids,
            userType: "operator",
            action: `combined_${actionOrder}`,
          });
          setCompletedDropoffIds((current) => {
            const next = new Set(current);
            for (const id of ids) next.delete(id);
            return next;
          });
          onDropoffFailure?.({ requestIds: ids });
          onPickupFailure?.(targetRequest);
          pickupRunningRef.current = false;
        }
      })
      .catch((err) => {
        setActionError("Action impossible. Verifiez la connexion et reessayez.");
        structuredLog("Error", "combined_exception", {
          requestId: targetRequest.id,
          dropoffIds: ids,
          actionOrder,
          error: String(err),
        });
        captureError(err, {
          projectId,
          elevatorId: operatorElevatorId,
          requestId: targetRequest.id,
          requestIds: ids,
          userType: "operator",
          action: `combined_${actionOrder}`,
        });
        setCompletedDropoffIds((current) => {
          const next = new Set(current);
          for (const id of ids) next.delete(id);
          return next;
        });
        onDropoffFailure?.({ requestIds: ids });
        onPickupFailure?.(targetRequest);
        pickupRunningRef.current = false;
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
    runCombined("dropoff_then_pickup");
  }

  function pickupAndDropoff() {
    if (!actionRequest) return;
    runCombined("pickup_then_dropoff", {
      dropoffIds: dropoffIdsAtPickupFloor,
      pickupRequest: actionRequest,
      dropFloorId: actionRequest.from_floor_id,
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
