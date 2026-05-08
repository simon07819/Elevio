"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { Ban, CheckCircle2, Inbox, MapPin, ShieldAlert, Users } from "lucide-react";
import {
  demoElevator,
  demoFloors,
  demoRequests,
  enrichRequests,
} from "@/lib/demoData";
import { createClient } from "@/lib/supabase/client";
import { clearSkippedRequestsForElevator } from "@/lib/actions";
import { broadcastPassengerQueueCleared, broadcastPassengerRequestBoarded, broadcastPassengerRequestCancelled, broadcastPassengerRequestCompleted, passengerProjectBroadcastChannel } from "@/lib/passengerNotifyBroadcast";
import {
  bindRealtimeWithAuthSession,
  mergeOperatorPollRequest,
  mergeRealtimeRequest,
  mergeRequestsPropIntoLive,
  subscribeToTable,
  type RequestRealtimePayload,
} from "@/lib/realtime";
import { resolveRequestState, logState, logSync, logAction } from "@/lib/stateResolution";
import type { TranslationKey } from "@/lib/i18n";
import { formatDispatchRecommendationReason } from "@/lib/recommendationReason";
import { formatFloorLabel } from "@/lib/utils";
import { getRecommendedNextStop } from "@/services/dispatchEngine";
import {
  type Direction,
  type DispatchRequest,
  type Elevator,
  type EnrichedRequest,
  type Floor,
  type HoistRequest,
  isOperatorAwaitingPickup,
  isOperatorMovementQueueStatus,
} from "@/types/hoist";
import { CapacityPanel } from "@/components/operator/CapacityPanel";
import { T, useLanguage } from "@/components/i18n/LanguageProvider";
import { MovementBoard } from "@/components/operator/MovementBoard";
import { PriorityAlertBanner } from "@/components/operator/PriorityAlertBanner";
import { RecommendedNextStop } from "@/components/operator/RecommendedNextStop";
import { useNetworkStatus } from "@/lib/useNetworkStatus";

const directionKeys = {
  idle: "direction.idle",
  up: "direction.up",
  down: "direction.down",
} satisfies Record<Direction, TranslationKey>;
const OPERATOR_VISIBLE_REQUEST_STATUSES = ["pending", "assigned", "arriving", "boarded"] as const;
const OPTIMISTIC_REQUEST_TTL_MS = 30_000;

/** Trigger haptic feedback on iOS when a priority request arrives */
function tryHapticForPriority() {
  try {
    if (typeof window !== "undefined" && "Capacitor" in window) {
      // Use Capacitor bridge directly — no npm package needed
      (window as unknown as { Capacitor: { nativeCallback?: (method: string, opts: Record<string, string>) => void } }).Capacitor?.nativeCallback?.("haptic", { style: "heavy" });
    }
    if (typeof navigator !== "undefined" && navigator.vibrate) {
      navigator.vibrate([200, 100, 200]);
    }
  } catch { /* non-critical */ }
}

export function OperatorDashboard({
  floors = demoFloors,
  requests = demoRequests,
  elevator = demoElevator,
  prioritiesEnabled = true,
  capacityEnabled = true,
  onElevatorPatch,
  sessionStartedAt,
}: {
  floors?: Floor[];
  requests?: HoistRequest[];
  elevator?: Elevator;
  prioritiesEnabled?: boolean;
  capacityEnabled?: boolean;
  onElevatorPatch?: (elevatorId: string, patch: Partial<Elevator>) => void;
  /** ISO timestamp when the current operator session was activated.
   *  Requests created before this are from a previous session and must be
   *  filtered out to prevent stale data from reappearing after release/reactivate. */
  sessionStartedAt?: string | null;
}) {
  const { locale } = useLanguage();
  const [liveRequests, setLiveRequests] = useState(requests);
  const [operatorActionError, setOperatorActionError] = useState<string | null>(null);
  const [isTogglingFull, setIsTogglingFull] = useState(false);
  const [manualFullOverride, setManualFullOverride] = useState<boolean | null>(null);
  const [directionOverride, setDirectionOverride] = useState<Direction | null>(null);
  const [cancelingRequestIds, setCancelingRequestIds] = useState<Set<string>>(() => new Set());
  const [isClearingQueue, setIsClearingQueue] = useState(false);
  const isOnline = useNetworkStatus(() => {
    // Force immediate re-sync from DB when network comes back: merge the
    // current SSR snapshot AND fire one explicit refetch (never a polling
    // loop) so the operator iPad burns minimal LTE data.
    logSync("networkBackOnline", { source: "useNetworkStatus" });
    setLiveRequests((current) => mergeRequestsPropIntoLive(current, requests));
    void syncRequestsRef.current?.();
  });
  const projectId = elevator.project_id;
  const manualFullDesiredRef = useRef<boolean | null>(null);
  const manualFullSyncingRef = useRef(false);
  const optimisticRequestsRef = useRef<Map<string, { request: HoistRequest; expiresAt: number }>>(new Map());
  // IDs cancelled via clearVisibleQueue — never re-injected by stale poll/realtime.
  const clearedIdsRef = useRef<Set<string>>(new Set());
  // Persistent broadcast channel — pre-subscribed so passenger QR reset is near-instant.
  const broadcastChannelRef = useRef<{ channel: unknown; ready: boolean } | null>(null);
  // Tracks whether the requests realtime channel is currently SUBSCRIBED.
  // When true, the LTE-friendly fallback polling loop skips its DB fetch.
  // When false (CHANNEL_ERROR / TIMED_OUT / CLOSED) the slow poll resumes
  // so the operator stays live without aggressive 1–2s polling on LTE.
  const realtimeConnectedRef = useRef(false);
  // Imperative handle to the latest poll/refetch implementation. Used by the
  // visibility / online / appResume listeners to do ONE explicit refetch on
  // resume instead of constantly polling.
  const syncRequestsRef = useRef<(() => Promise<void>) | null>(null);

  function rememberOptimisticRequest(request: HoistRequest) {
    optimisticRequestsRef.current.set(request.id, {
      request,
      expiresAt: Date.now() + OPTIMISTIC_REQUEST_TTL_MS,
    });
  }

  function applyOptimisticRequest(request: HoistRequest): HoistRequest {
    const optimistic = optimisticRequestsRef.current.get(request.id);
    if (!optimistic) {
      return request;
    }
    if (Date.now() > optimistic.expiresAt || request.status === optimistic.request.status) {
      optimisticRequestsRef.current.delete(request.id);
      return request;
    }
    return { ...request, ...optimistic.request };
  }

  /** Check if there are optimistic "boarded" requests (pickup just happened, server may not have confirmed yet). */
  function hasOptimisticBoardedRequests(): boolean {
    for (const entry of optimisticRequestsRef.current.values()) {
      if (entry.request.status === "boarded" && Date.now() <= entry.expiresAt) return true;
    }
    return false;
  }

  useEffect(() => {
    const id = window.setTimeout(() => {
      setLiveRequests((current) => mergeRequestsPropIntoLive(current, requests));
    }, 0);
    return () => window.clearTimeout(id);
  }, [requests]);

  // Re-sync requests from SSR props on bfcache restore (browser back/forward)
  // and on visibility change (tab switch back to operator).
  useEffect(() => {
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        logSync("bfcacheRestore", { source: "pageshow" });
        setLiveRequests((current) => mergeRequestsPropIntoLive(current, requests));
        void syncRequestsRef.current?.();
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        // Single explicit refetch on tab/app focus — no polling loop on LTE.
        logSync("visibilityChange", { source: "visibilitychange" });
        setLiveRequests((current) => mergeRequestsPropIntoLive(current, requests));
        void syncRequestsRef.current?.();
      }
    };

    window.addEventListener("pageshow", onPageShow);
    document.addEventListener("visibilitychange", onVisibilityChange);

    // Capacitor iOS AppState listener — visibilitychange is unreliable on iOS.
    let capacitorCleanup: (() => void) | null = null;
    (async () => {
      try {
        const mod = await import(/* webpackIgnore: true */ "@capacitor/app");
        const handler = await mod.App.addListener("appStateChange", (state: { isActive: boolean }) => {
          if (state.isActive) {
            logSync("appResume", { source: "capacitor_appStateChange" });
            setLiveRequests((current) => mergeRequestsPropIntoLive(current, requests));
            void syncRequestsRef.current?.();
          }
        });
        capacitorCleanup = () => handler.remove();
      } catch {
        // Not running on Capacitor — ignore
      }
    })();

    return () => {
      window.removeEventListener("pageshow", onPageShow);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      capacitorCleanup?.();
    };
  }, [requests]);

  useEffect(() => {
    const client = createClient();
    return bindRealtimeWithAuthSession(client, () =>
      subscribeToTable<RequestRealtimePayload>({
        client,
        table: "requests",
        filter: `project_id=eq.${projectId}`,
        onChange: (payload) => {
          // Never re-inject a cleared request via stale realtime
          if (payload.eventType !== "DELETE" && clearedIdsRef.current.has(payload.new.id) && OPERATOR_VISIBLE_REQUEST_STATUSES.includes(payload.new.status as (typeof OPERATOR_VISIBLE_REQUEST_STATUSES)[number])) {
            return;
          }
          const nextPayload =
            payload.eventType === "DELETE"
              ? payload
              : ({ ...payload, new: applyOptimisticRequest(payload.new) } satisfies RequestRealtimePayload);
          setLiveRequests((current) => mergeRealtimeRequest(current, nextPayload));
          // Haptic + sound alert for priority requests
          if (payload.eventType !== "DELETE" && payload.new.priority === true && payload.new.status === "pending") {
            tryHapticForPriority();
          }
        },
        onStatus: (status) => {
          if (status === "SUBSCRIBED") {
            realtimeConnectedRef.current = true;
            logSync("realtimeConnected", { table: "requests", projectId });
          } else {
            realtimeConnectedRef.current = false;
            logSync("realtimeDegraded", { table: "requests", projectId, status });
            // On reconnect/error: do ONE explicit refetch to recover any missed events.
            void syncRequestsRef.current?.();
          }
        },
      }),
    );
  }, [projectId]);

  // Pre-subscribe to the passenger broadcast channel so that when the operator
  // confirms a pickup, the broadcast is sent immediately (no 500ms–5s subscribe wait).
  useEffect(() => {
    const client = createClient();
    if (!client) return;
    const ch = client.channel(passengerProjectBroadcastChannel(projectId));
    const ref = { channel: ch, ready: false };
    ch.subscribe((status: string) => {
      if (status === "SUBSCRIBED") ref.ready = true;
    });
    broadcastChannelRef.current = ref;
    return () => {
      client.removeChannel(ch);
      broadcastChannelRef.current = null;
    };
  }, [projectId]);

  useEffect(() => {
    const client = createClient();
    let cancelled = false;

    async function syncRequests() {
      if (!client) return;
      let query = client
        .from("requests")
        .select(
          "id,project_id,elevator_id,from_floor_id,to_floor_id,direction,passenger_count,original_passenger_count,remaining_passenger_count,split_required,priority,priority_reason,note,status,sequence_number,wait_started_at,created_at,updated_at,completed_at,skipped_by_elevator_id,skipped_at",
        )
        .eq("project_id", projectId)
        .eq("elevator_id", elevator.id)
        .in("status", OPERATOR_VISIBLE_REQUEST_STATUSES);
      // ── SESSION FILTER: Only fetch requests created after this session started.
      // Prevents old requests from a previous session (that should have been
      // cancelled but maybe weren't due to silent DB errors) from being returned.
      if (sessionStartedAt) {
        const sessionStartIso = new Date(new Date(sessionStartedAt).getTime() - 5000).toISOString();
        query = query.gte("created_at", sessionStartIso);
      }
      const { data } = await query
        .order("created_at", { ascending: false })
        .limit(250);

      if (cancelled || !data) return;
      setLiveRequests((current) => {
        // Compute kept BEFORE liveById so that applyOptimisticRequest
        // side-effects (deleting confirmed optimistic entries) don't
        // cause the kept filter to discard requests that were just confirmed.
        const kept = current.filter(
          (request) =>
            request.elevator_id !== elevator.id ||
            !OPERATOR_VISIBLE_REQUEST_STATUSES.includes(request.status as (typeof OPERATOR_VISIBLE_REQUEST_STATUSES)[number]) ||
            optimisticRequestsRef.current.has(request.id),
        );
        const liveById = new Map((data as HoistRequest[]).map((request) => [request.id, applyOptimisticRequest(request)]));
        const mergedById = new Map<string, HoistRequest>();
        for (const row of kept) {
          mergedById.set(row.id, row);
        }
        for (const [id, incoming] of liveById) {
          const existing = mergedById.get(id);
          mergedById.set(id, mergeOperatorPollRequest(existing, incoming));
        }
        const next = [...mergedById.values()];
        // Never re-inject requests that were cleared via "Vider la liste"
        // even if stale poll returns them with a non-terminal status.
        const cleared = clearedIdsRef.current;
        if (cleared.size > 0) {
          for (let i = next.length - 1; i >= 0; i--) {
            if (cleared.has(next[i].id) && OPERATOR_VISIBLE_REQUEST_STATUSES.includes(next[i].status as (typeof OPERATOR_VISIBLE_REQUEST_STATUSES)[number])) {
              next.splice(i, 1);
            }
          }
        }
        if (next.length === current.length && next.every((r, i) => r.id === current[i]?.id && r.status === current[i]?.status && r.elevator_id === current[i]?.elevator_id)) {
          return current;
        }
        // ── DEBUG: poll merge diagnostic (always log boarded changes) ──
        {
          const prevBoarded = current.filter(r => r.elevator_id === elevator.id && r.status === "boarded");
          const nextBoarded = next.filter(r => r.elevator_id === elevator.id && r.status === "boarded");
          const dropped = prevBoarded.filter(pb => !nextBoarded.find(nb => nb.id === pb.id));
          if (dropped.length > 0 || prevBoarded.length !== nextBoarded.length) {
            console.warn("[POLL-MERGE] boarded changed", {
              prevBoarded: prevBoarded.length,
              nextBoarded: nextBoarded.length,
              droppedIds: dropped.map(r => r.id),
              pollDataLen: (data as HoistRequest[])?.length ?? 0,
              optimisticCount: optimisticRequestsRef.current.size,
              keptLen: kept.length,
            });
            logState("pollBoardedChange", {
              prev: prevBoarded.map(r => ({ id: r.id.slice(0,8), status: r.status, resolved: resolveRequestState(r).action })),
              next: nextBoarded.map(r => ({ id: r.id.slice(0,8), status: r.status, resolved: resolveRequestState(r).action })),
              dropped: dropped.map(r => r.id.slice(0,8)),
            });
          }
        }
        return next;
      });
    }

    // Expose syncRequests so visibility / online / appResume / realtime-degraded
    // listeners can fire a single explicit refetch instead of constantly polling.
    syncRequestsRef.current = syncRequests;

    // Initial fetch on mount: ensures the operator sees the freshest snapshot
    // even if the SSR `requests` prop is slightly stale.
    void syncRequests();

    // ── LTE-FRIENDLY FALLBACK POLL ────────────────────────────────────────
    // Realtime (Supabase Postgres CDC channel) is the primary live source for
    // operator requests. This 30s loop only fires a DB fetch when realtime is
    // NOT currently SUBSCRIBED, so a healthy realtime channel costs ~zero
    // bytes/min on the operator iPad LTE. If realtime fails (CHANNEL_ERROR /
    // TIMED_OUT / CLOSED), the loop resumes refetching at a calm 30s cadence
    // until the channel re-subscribes.
    const FALLBACK_POLL_MS = 30_000;
    const id = window.setInterval(() => {
      if (realtimeConnectedRef.current) return;
      void syncRequests();
    }, FALLBACK_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      if (syncRequestsRef.current === syncRequests) {
        syncRequestsRef.current = null;
      }
    };
  }, [elevator.id, projectId, sessionStartedAt]);

  const floorById = useMemo(() => new Map(floors.map((floor) => [floor.id, floor])), [floors]);
  const elevatorRequests = useMemo(
    () => {
      let filtered = liveRequests.filter((request) => request.elevator_id === elevator.id);
      // ── SESSION GUARD: Filter out requests from a previous session ──
      // When an operator releases and re-activates, stale requests from the
      // previous session should NOT appear. If sessionStartedAt is set, only
      // show requests created after the session was activated.
      if (sessionStartedAt) {
        const sessionStartMs = new Date(sessionStartedAt).getTime();
        filtered = filtered.filter((request) => {
          const createdMs = new Date(request.created_at).getTime();
          return createdMs >= sessionStartMs - 5000; // 5s tolerance for clock skew
        });
      }
      return filtered;
    },
    [elevator.id, liveRequests, sessionStartedAt],
  );
  const currentFloor = floorById.get(elevator.current_floor_id ?? "") ?? floors[0] ?? demoFloors[2];
  const enriched = useMemo(() => enrichRequests(elevatorRequests, floors), [elevatorRequests, floors]);
  const dispatchRequests: DispatchRequest[] = useMemo(
    () =>
      elevatorRequests.map((request) => ({
        ...request,
        from_sort_order: floorById.get(request.from_floor_id)?.sort_order ?? 0,
        to_sort_order: floorById.get(request.to_floor_id)?.sort_order ?? 0,
      })),
    [elevatorRequests, floorById],
  );
  const liveActivePassengers = useMemo(
    () =>
      elevatorRequests
        .filter((request) => request.status === "boarded")
        .map((request) => {
          const from = floorById.get(request.from_floor_id);
          const to = floorById.get(request.to_floor_id);

          return {
            requestId: request.id,
            from_floor_id: request.from_floor_id,
            to_floor_id: request.to_floor_id,
            from_sort_order: from?.sort_order ?? 0,
            to_sort_order: to?.sort_order ?? 0,
            passenger_count: request.passenger_count,
            boarded_at: request.updated_at,
          };
        }),
    [floorById, elevatorRequests],
  );
  const realCurrentLoad = liveActivePassengers.reduce((sum, passenger) => sum + passenger.passenger_count, 0);
  const reservedLoad = elevatorRequests
    .filter((request) => request.status === "assigned" || request.status === "arriving")
    .reduce((sum, request) => sum + request.passenger_count, 0);
  const effectiveElevator = {
    ...elevator,
    current_load: realCurrentLoad,
    manual_full: manualFullOverride ?? elevator.manual_full,
    direction: directionOverride ?? elevator.direction,
  };
  const remaining = capacityEnabled ? Math.max(0, effectiveElevator.capacity - effectiveElevator.current_load - reservedLoad) : Number.POSITIVE_INFINITY;
  const recommendation = useMemo(
    () =>
      getRecommendedNextStop({
        currentFloor,
        direction: effectiveElevator.direction,
        requests: dispatchRequests,
        capacity: effectiveElevator.capacity,
        currentLoad: effectiveElevator.current_load,
        activePassengers: liveActivePassengers,
        floors,
        prioritiesEnabled,
        capacityEnabled,
        manualFull: effectiveElevator.manual_full === true,
        elevatorId: elevator.id,
      }),
    [
      currentFloor,
      effectiveElevator.direction,
      effectiveElevator.capacity,
      effectiveElevator.current_load,
      effectiveElevator.manual_full,
      dispatchRequests,
      liveActivePassengers,
      floors,
      prioritiesEnabled,
      capacityEnabled,
      elevator.id,
    ],
  );
  const recommendedIds = new Set(recommendation.requestsToPickup.map((request) => request.id));
  const liveQueue = [...enriched].sort((a, b) => {
    const aTerminal = a.status === "completed" || a.status === "cancelled" ? 1 : 0;
    const bTerminal = b.status === "completed" || b.status === "cancelled" ? 1 : 0;
    const aCapacityValid = !capacityEnabled || a.passenger_count <= remaining ? 1 : 0;
    const bCapacityValid = !capacityEnabled || b.passenger_count <= remaining ? 1 : 0;
    const aRecommended = recommendedIds.has(a.id) ? 1 : 0;
    const bRecommended = recommendedIds.has(b.id) ? 1 : 0;

    return (
      aTerminal - bTerminal ||
      bRecommended - aRecommended ||
      (prioritiesEnabled ? Number(b.priority) - Number(a.priority) : 0) ||
      bCapacityValid - aCapacityValid ||
      new Date(a.wait_started_at).getTime() - new Date(b.wait_started_at).getTime() ||
      a.sequence_number - b.sequence_number
    );
  });
  const priorityCount = prioritiesEnabled ? enriched.filter((request) => request.priority).length : 0;
  const capacityBlockedRequests = capacityEnabled ? enriched.filter((request) => request.passenger_count > remaining) : [];
  const capacityBlockedCount = capacityBlockedRequests.length;
  const activeQueue = liveQueue.filter((request) => isOperatorMovementQueueStatus(request.status));
  const hasBoardedPassengers = liveActivePassengers.length > 0;
  const hasOperatorWork = activeQueue.length > 0 || hasBoardedPassengers;
  /** Aligné sur le cerveau : ordre chantier = sequence_number croissant (pas l’ordre DB / created_at). */
  const fallbackPickup =
    [...liveQueue]
      .filter((request) => isOperatorAwaitingPickup(request.status))
      .sort((a, b) => a.sequence_number - b.sequence_number)[0] ?? null;
  const fallbackPickupFloor = fallbackPickup ? floorById.get(fallbackPickup.from_floor_id) ?? null : null;
  const fallbackSuggestedDirection: Direction =
    fallbackPickupFloor && Number(fallbackPickupFloor.sort_order) > Number(currentFloor.sort_order)
      ? "up"
      : fallbackPickupFloor && Number(fallbackPickupFloor.sort_order) < Number(currentFloor.sort_order)
        ? "down"
        : "idle";
  let visibleRecommendation = recommendation;
  // ── PAUSE INTERDICT ──────────────────────────────────────────────────────
  // If the brain returns "wait" (PAUSE) but we have boarded passengers on the
  // elevator, the brain MUST show a dropoff action instead.  This can happen
  // when the elevator direction / current_floor_id from the server is stale
  // (not yet updated by syncElevatorWithRequestStatus), causing the brain's
  // pendingBoardedDestinations() to return empty and the idle branch to fire.
  // Guard: boarded passengers = active work = NEVER PAUSE.
  // Also check optimistic boarded: pickup just happened, poll/realtime may
  // have overwritten with stale data before server confirmation.
  const hasAnyBoardedWork = hasBoardedPassengers || hasOptimisticBoardedRequests();
  if (!recommendation.nextFloor && recommendation.requestsToDropoff.length === 0 && hasAnyBoardedWork) {
    const boardedSource = liveActivePassengers.length > 0 ? liveActivePassengers : (
      // Reconstruct from optimistic requests if live state was overwritten
      [...optimisticRequestsRef.current.values()]
        .filter(e => e.request.status === "boarded" && Date.now() <= e.expiresAt)
        .map(e => {
          const r = e.request;
          const from = floorById.get(r.from_floor_id);
          const to = floorById.get(r.to_floor_id);
          return {
            requestId: r.id,
            from_floor_id: r.from_floor_id,
            to_floor_id: r.to_floor_id,
            from_sort_order: from?.sort_order ?? 0,
            to_sort_order: to?.sort_order ?? 0,
            passenger_count: r.passenger_count,
            boarded_at: r.updated_at,
          };
        })
    );
    const currentSort = Number(currentFloor.sort_order);
    const sortedPassengers = [...boardedSource].sort((a, b) =>
      Math.abs(Number(a.to_sort_order) - currentSort) -
      Math.abs(Number(b.to_sort_order) - currentSort),
    );
    const nearest = sortedPassengers[0];
    if (nearest) {
      const dropSort = Number(nearest.to_sort_order);
      const dropFloor = floors.find((f) => Number(f.sort_order) === dropSort) ?? currentFloor;
      const dropoffs = boardedSource.filter((p) => Number(p.to_sort_order) === dropSort);
      const passengers = dropoffs.reduce((s, p) => s + p.passenger_count, 0);
      const dropDetail: { kind: "dropoff_before_pickups"; passengers: number } = {
        kind: "dropoff_before_pickups",
        passengers,
      };
      const travelDir: Direction =
        dropSort > currentSort ? "up" : dropSort < currentSort ? "down" : "idle";
      visibleRecommendation = {
        ...recommendation,
        nextFloor: dropFloor,
        nextFloorSortOrder: Number(dropFloor.sort_order),
        primaryPickupRequestId: null,
        reasonDetail: dropDetail,
        reason: formatDispatchRecommendationReason(dropDetail, locale, ""),
        requestsToPickup: [],
        requestsToDropoff: dropoffs,
        suggestedDirection: travelDir,
        capacityWarnings: [],
      };
    }
  }
  // ── PAUSE INTERDICT (hasOperatorWork guard) ──────────────────────────────
  // Also prevent idle_empty PAUSE when optimistic boarded requests exist
  // but poll/realtime haven't caught up yet.
  const realHasOperatorWork = activeQueue.length > 0 || hasAnyBoardedWork;
  if (!realHasOperatorWork) {
    // ── DEBUG: PAUSE diagnostic (always log, even in prod) ──
    console.warn("[PAUSE-DIAG]", {
        reason: "idle_empty",
        activeQueueLen: activeQueue.length,
        hasBoardedPassengers,
        hasOptimisticBoarded: hasOptimisticBoardedRequests(),
        liveRequestsLen: liveRequests.filter(r => r.elevator_id === elevator.id).length,
        liveRequestsStatuses: liveRequests.filter(r => r.elevator_id === elevator.id).map(r => r.status),
        elevatorDir: elevator.direction,
        elevatorLoad: elevator.current_load,
        elevatorFloorId: elevator.current_floor_id,
        sessionId: elevator.operator_session_id,
        heartbeatAt: elevator.operator_session_heartbeat_at,
        now: new Date().toISOString(),
      });
    const idleDetail = { kind: "idle_empty" as const };
    visibleRecommendation = {
      ...recommendation,
      nextFloor: null,
      nextFloorSortOrder: null,
      primaryPickupRequestId: null,
      reasonDetail: idleDetail,
      reason: formatDispatchRecommendationReason(idleDetail, locale, recommendation.reason),
      requestsToPickup: [],
      requestsToDropoff: [],
      suggestedDirection: "idle" as const,
      capacityWarnings: [],
    };
  } else if (
    !recommendation.nextFloor &&
    recommendation.requestsToDropoff.length === 0 &&
    fallbackPickup &&
    fallbackPickupFloor &&
    recommendation.reasonDetail?.kind !== "idle_blocked" &&
    recommendation.reasonDetail?.kind !== "idle_manual_full" &&
    !effectiveElevator.manual_full
  ) {
    const fbDetail = { kind: "pickup_fallback" as const, passengerCount: fallbackPickup.passenger_count };
    visibleRecommendation = {
      ...recommendation,
      nextFloor: fallbackPickupFloor,
      nextFloorSortOrder: Number(fallbackPickupFloor.sort_order),
      primaryPickupRequestId: fallbackPickup.id,
      reasonDetail: fbDetail,
      reason: formatDispatchRecommendationReason(fbDetail, locale, recommendation.reason),
      requestsToPickup: dispatchRequests.filter((request) => request.from_floor_id === fallbackPickup.from_floor_id),
      requestsToDropoff: [],
      suggestedDirection: fallbackSuggestedDirection,
      capacityWarnings: recommendation.capacityWarnings,
    };
  }
  const visibleRecommendedIds = new Set(visibleRecommendation.requestsToPickup.map((request) => request.id));
  const actionRequests = [
    ...activeQueue.filter((request) => visibleRecommendedIds.has(request.id)),
    ...activeQueue.filter((request) => !visibleRecommendedIds.has(request.id)),
  ];

  /** Pas de palier invente quand le cerveau dit pause. */
  const displayFloor = visibleRecommendation.nextFloor;

  /** Toujours dériver de la géométrie étages : évite direction passager / état ascenseur périmé (« monter » vers P1 alors qu’il faut descendre). */
  const targetSort = Number(displayFloor?.sort_order ?? currentFloor.sort_order);
  const currentSort = Number(currentFloor.sort_order);
  const displayDirection: Direction =
    displayFloor == null ? "idle" : targetSort > currentSort ? "up" : targetSort < currentSort ? "down" : "idle";

  function clearVisibleQueue() {
    if (activeQueue.length === 0 && liveActivePassengers.length === 0) {
      return;
    }
    logAction("clearVisibleQueue", {
      activeQueueLen: activeQueue.length,
      boardedCount: liveActivePassengers.length,
      spared: liveRequests.filter(r => r.elevator_id === elevator.id && r.status === "boarded").length,
    });
    const now = new Date().toISOString();
    const clearedIds = liveRequests
      .filter(
        (request) =>
          request.elevator_id === elevator.id &&
          (request.status === "pending" ||
            request.status === "assigned" ||
            request.status === "arriving"),
      )
      .map((request) => request.id);
    const previousRequests = liveRequests;
    // Remember cleared IDs so stale poll/realtime can never re-inject them.
    for (const id of clearedIds) {
      clearedIdsRef.current.add(id);
    }
    flushSync(() => {
      setOperatorActionError(null);
      setLiveRequests((current) =>
        current.map((request) =>
          request.elevator_id === elevator.id &&
          (request.status === "pending" ||
            request.status === "assigned" ||
            request.status === "arriving")
            ? { ...request, status: "cancelled" as const, completed_at: now, updated_at: now }
            : request,
        ),
      );
    });
    onElevatorPatch?.(elevator.id, { current_load: 0, direction: "idle" });

    setIsClearingQueue(true);
    void (async () => {
      try {
        const client = createClient();
        if (!client) {
          return;
        }
        const payload = {
          status: "cancelled" as const,
          completed_at: now,
          updated_at: now,
          note: "File videe par l'operateur.",
        };

        const [reqResult, elevResult] = await Promise.all([
          client
            .from("requests")
            .update(payload)
            .eq("project_id", projectId)
            .eq("elevator_id", elevator.id)
            .in("status", ["pending", "assigned", "arriving"]),
          client
            .from("elevators")
            .update({ current_load: 0, direction: "idle" })
            .eq("id", elevator.id)
            .eq("project_id", projectId),
        ]);

        if (reqResult.error) {
          setLiveRequests(previousRequests);
          setOperatorActionError(reqResult.error.message);
          return;
        }

        if (elevResult.error) {
          setLiveRequests(previousRequests);
          setOperatorActionError(elevResult.error.message);
          return;
        }

        // Use persistent broadcast channel for faster delivery.
        const ref = broadcastChannelRef.current;
        if (ref?.ready && ref.channel && typeof (ref.channel as { send: (msg: unknown) => Promise<unknown> }).send === "function") {
          void (ref.channel as { send: (msg: unknown) => Promise<unknown> }).send({
            type: "broadcast",
            event: "queue_cleared",
            payload: { requestIds: clearedIds },
          });
        } else {
          broadcastPassengerQueueCleared(client, projectId, clearedIds);
        }
      } finally {
        setIsClearingQueue(false);
      }
    })();
  }

  function cancelMovementRequest(request: EnrichedRequest) {
    if (request.status === "boarded" || cancelingRequestIds.has(request.id)) {
      logAction("cancelMovementBlocked", { requestId: request.id, status: request.status, reason: request.status === "boarded" ? "boarded passengers cannot be cancelled" : "already cancelling" });
      return;
    }
    logAction("cancelMovementRequest", { requestId: request.id, fromStatus: request.status, toStatus: "cancelled" });

    const now = new Date().toISOString();
    const cancelledRequest: HoistRequest = {
      ...request,
      status: "cancelled",
      completed_at: now,
      updated_at: now,
    };
    const previousRequests = liveRequests;

    setOperatorActionError(null);
    rememberOptimisticRequest(cancelledRequest);
    setCancelingRequestIds((current) => new Set(current).add(request.id));
    setLiveRequests((current) =>
      current.map((item) => (item.id === request.id ? cancelledRequest : item)),
    );

    void (async () => {
      const client = createClient();
      const { data, error } = await client
        ?.from("requests")
        .update({
          status: "cancelled",
          completed_at: now,
          updated_at: now,
          note: "Demande supprimee par l'operateur.",
        })
        .eq("id", request.id)
        .eq("project_id", projectId)
        .eq("elevator_id", elevator.id)
        .in("status", ["pending", "assigned", "arriving"])
        .select("id")
        .maybeSingle() ?? { data: null, error: new Error("Client Supabase indisponible.") };

      if (error || !data) {
        return {
          ok: false,
          message: error?.message ?? "Impossible de supprimer cette demande.",
        };
      }

      return { ok: true, message: "Demande supprimee." };
    })()
      .then((result) => {
        if (!result.ok) {
          optimisticRequestsRef.current.delete(request.id);
          setLiveRequests(previousRequests);
          setOperatorActionError(result.message);
        } else {
          // Notify passenger instantly that their request was cancelled
          const client = createClient();
          if (client) broadcastPassengerRequestCancelled(client, projectId, request.id);
        }
      })
      .catch(() => {
        optimisticRequestsRef.current.delete(request.id);
        setLiveRequests(previousRequests);
        setOperatorActionError("Impossible de supprimer cette demande. Verifiez la connexion et reessayez.");
      })
      .finally(() => {
        setCancelingRequestIds((current) => {
          const next = new Set(current);
          next.delete(request.id);
          return next;
        });
      });
  }

  function queueManualFullSync(manualFull: boolean) {
    setOperatorActionError(null);
    setManualFullOverride(manualFull);
    onElevatorPatch?.(elevator.id, { manual_full: manualFull });
    manualFullDesiredRef.current = manualFull;

    if (manualFullSyncingRef.current) {
      return;
    }

    manualFullSyncingRef.current = true;
    setIsTogglingFull(true);

    void (async () => {
      const client = createClient();
      let lastSent: boolean | null = null;
      try {
        while (manualFullDesiredRef.current !== null) {
          const desired = manualFullDesiredRef.current;
          manualFullDesiredRef.current = null;
          lastSent = desired;
          const { error } = await client
            ?.from("elevators")
            .update({ manual_full: desired })
            .eq("id", elevator.id)
            .eq("project_id", projectId) ?? { error: new Error("Client Supabase indisponible.") };
          if (error) {
            setOperatorActionError(error.message);
            if (manualFullDesiredRef.current === null) {
              setManualFullOverride(!desired);
              onElevatorPatch?.(elevator.id, { manual_full: !desired });
            }
            break;
          }
        }
      } catch {
        setOperatorActionError("Impossible de changer l'etat PLEIN. Verifiez la connexion et reessayez.");
        if (lastSent !== null && manualFullDesiredRef.current === null) {
          setManualFullOverride(!lastSent);
          onElevatorPatch?.(elevator.id, { manual_full: !lastSent });
        }
      } finally {
        manualFullSyncingRef.current = false;
        setIsTogglingFull(false);
      }
    })();
  }

  return (
    <div className="mx-auto grid max-w-7xl gap-4">
      <section className="grid gap-3 lg:grid-cols-[1fr_340px]">
        <div className="grid gap-3 sm:grid-cols-4">
          <div className="operator-target-floor-card overflow-hidden rounded-3xl border-2 border-emerald-300/60 bg-gradient-to-br from-emerald-950/90 via-teal-950/55 to-emerald-900/70 p-4 md:p-5">
            <div className="flex items-start justify-between gap-3">
              <p className="text-[11px] font-black uppercase tracking-[0.22em] text-emerald-100 md:text-xs">
                <T k="operator.goToFloorCue" />
              </p>
              <span
                aria-hidden
                className="grid size-11 shrink-0 place-items-center rounded-2xl border border-emerald-400/35 bg-emerald-950/50 text-emerald-100 shadow-[inset_0_1px_0_rgba(167,243,208,0.35)]"
              >
                <MapPin size={22} strokeWidth={2.25} className="drop-shadow-[0_0_10px_rgba(167,243,208,0.85)]" />
              </span>
            </div>
            <p
              className={
                displayFloor
                  ? "mt-3 text-4xl font-black tabular-nums tracking-tight text-white drop-shadow-[0_2px_18px_rgba(0,0,0,0.5)] md:text-5xl md:leading-none"
                  : "mt-3 min-w-0 text-xl font-black leading-tight tracking-tight text-white drop-shadow-[0_2px_18px_rgba(0,0,0,0.5)] sm:text-2xl md:text-3xl"
              }
            >
              {displayFloor ? formatFloorLabel(displayFloor) : <T k="operator.pause" />}
            </p>
          </div>
          <div className="rounded-3xl border border-white/10 bg-white/8 p-4">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-400"><T k="operator.direction" /></p>
            <p
              className={
                displayDirection === "up"
                  ? "mt-2 text-2xl font-black text-emerald-200"
                  : displayDirection === "down"
                    ? "mt-2 text-2xl font-black text-red-300"
                    : "mt-2 text-2xl font-black text-yellow-200"
              }
            >
              <T k={directionKeys[displayDirection]} />
            </p>
          </div>
          <div className="rounded-3xl border border-white/10 bg-white/8 p-4">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-400"><T k="operator.requests" /></p>
            <p className="mt-2 text-2xl font-black text-white">{activeQueue.length}</p>
            {prioritiesEnabled ? (
              <p className="text-xs font-bold text-orange-200">
                {priorityCount} <T k="operator.priority" />
              </p>
            ) : null}
          </div>
          {capacityEnabled ? (
            <div className="rounded-3xl border border-white/10 bg-white/8 p-4">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-400"><T k="operator.capacity" /></p>
              <p className="mt-2 text-2xl font-black text-emerald-200">{remaining} <T k="operator.places" /></p>
              <p className="text-xs font-bold text-yellow-200">{capacityBlockedCount} <T k="operator.nextPass" /></p>
            </div>
          ) : (
            <div
              className={
                effectiveElevator.manual_full
                  ? "rounded-3xl border border-red-400/40 bg-red-500/12 p-4"
                  : "rounded-3xl border border-white/10 bg-white/8 p-4"
              }
            >
              <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-400"><T k="operator.full" /></p>
              <button
                type="button"
                aria-busy={isTogglingFull}
                onClick={() => queueManualFullSync(!effectiveElevator.manual_full)}
                className={
                  effectiveElevator.manual_full
                    ? "touch-target mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-300 px-4 py-4 text-sm font-black uppercase tracking-wide text-slate-950 shadow-[0_14px_34px_rgba(16,185,129,0.28)] active:scale-[0.99]"
                    : "touch-target mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-red-500 px-4 py-4 text-sm font-black uppercase tracking-wide text-white shadow-[0_14px_34px_rgba(239,68,68,0.28)] active:scale-[0.99]"
                }
              >
                {effectiveElevator.manual_full ? <CheckCircle2 size={20} /> : <Ban size={20} />}
                {effectiveElevator.manual_full ? <T k="operator.resumePickup" /> : <T k="operator.full" />}
              </button>
            </div>
          )}
        </div>
        {capacityEnabled ? (
          <CapacityPanel
            elevator={effectiveElevator}
            showCapacityStats
            isTogglingFull={isTogglingFull}
            onToggleFull={queueManualFullSync}
          />
        ) : null}
      </section>

      <RecommendedNextStop
        recommendation={visibleRecommendation}
        actionRequests={actionRequests}
        operatorElevatorId={elevator.id}
        projectId={projectId}
        onboardRequests={enriched.filter((r) => r.status === "boarded")}
        onPickupSuccess={(req) => {
          const now = new Date().toISOString();
          logAction("pickupSuccess", { requestId: req.id, fromStatus: req.status, toStatus: "boarded" });
          // ── INSTANT DIRECTION OVERRIDE ──
          // After pickup, set the direction to match the request's direction
          // so the brain immediately computes opportunistic pickups on the way.
          // Without this, the brain uses stale elevator.direction from the DB
          // and may show Pause or Déposer instead of Ramasser (opportunistic).
          setDirectionOverride(req.direction);
          rememberOptimisticRequest({
            ...req,
            status: "boarded",
            updated_at: now,
            elevator_id: req.elevator_id ?? elevator.id,
          });
          setLiveRequests((prev) => {
            const next = prev.map((r) =>
              r.id === req.id
                ? {
                    ...r,
                    status: "boarded" as const,
                    updated_at: now,
                    elevator_id: r.elevator_id ?? elevator.id,
                  }
                : r,
            );
            const boardedLoad = next
              .filter((r) => r.elevator_id === elevator.id && r.status === "boarded")
              .reduce((sum, r) => sum + r.passenger_count, 0);
            onElevatorPatch?.(elevator.id, {
              current_floor_id: req.from_floor_id,
              direction: req.direction,
              current_load: boardedLoad,
            });
            return next;
          });
          // ── BUG 3 FIX: Broadcast passenger pickup IMMEDIATELY on optimistic update ──
          // Don't wait for server confirmation. The passenger poll will confirm
          // once the DB commits, but the broadcast gives instant feedback.
          // If the server action fails, onPickupFailure will roll back.
          const ref = broadcastChannelRef.current;
          if (ref?.ready && ref.channel && typeof (ref.channel as { send: (msg: unknown) => Promise<unknown> }).send === "function") {
            void (ref.channel as { send: (msg: unknown) => Promise<unknown> }).send({
              type: "broadcast",
              event: "request_boarded",
              payload: { requestIds: [req.id] },
            });
          }
          // Also send via one-shot channel as backup
          const client = createClient();
          if (client) {
            broadcastPassengerRequestBoarded(client, projectId, [req.id]);
          }
        }}
        onPickupFailure={(req) => {
          logAction("pickupFailure", { requestId: req.id, rollbackTo: req.status });
          optimisticRequestsRef.current.delete(req.id);
          // Clear direction override on failure — stale direction would confuse the brain
          setDirectionOverride(null);
          setLiveRequests((prev) => {
            const next = prev.map((r) =>
              r.id === req.id
                ? {
                    ...r,
                    status: req.status,
                    updated_at: req.updated_at,
                    elevator_id: req.elevator_id,
                  }
                : r,
            );
            const boardedLoad = next
              .filter((r) => r.elevator_id === elevator.id && r.status === "boarded")
              .reduce((sum, r) => sum + r.passenger_count, 0);
            onElevatorPatch?.(elevator.id, {
              current_load: boardedLoad,
            });
            return next;
          });
        }}
        onPickupConfirmed={(req) => {
          logAction("pickupConfirmed", { requestId: req.id, action: resolveRequestState(req).action });
          // Broadcast passenger pickup confirmation via pre-subscribed channel
          // for near-instant delivery (already subscribed → no subscribe wait).
          const ref = broadcastChannelRef.current;
          let sentViaPreSubbed = false;
          if (ref?.ready && ref.channel && typeof (ref.channel as { send: (msg: unknown) => Promise<unknown> }).send === "function") {
            void (ref.channel as { send: (msg: unknown) => Promise<unknown> }).send({
              type: "broadcast",
              event: "request_boarded",
              payload: { requestIds: [req.id] },
            });
            sentViaPreSubbed = true;
          }
          // Belt-and-suspenders: ALSO send via one-shot channel as backup.
          // The pre-subscribed channel is fast but might miss if the passenger
          // just refreshed or the channel subscription lapsed. The one-shot
          // channel creates a fresh subscribe (500ms–5s) but is more reliable.
          const client = createClient();
          if (client) {
            broadcastPassengerRequestBoarded(client, projectId, [req.id]);
          }
        }}
        onDropoffSuccess={({ requestIds, dropFloorId }) => {
          const now = new Date().toISOString();
          logAction("dropoffSuccess", { requestIds, dropFloorId, count: requestIds.length });

          // Broadcast passenger dropoff completion — passenger can now re-request
          const client = createClient();
          if (client) {
            broadcastPassengerRequestCompleted(client, projectId, requestIds);
          }
          // Clear direction override after dropoff — cycle changes
          setDirectionOverride(null);
          // Clear skip markers after dropoff — cycle changes, skipped requests become eligible again
          void clearSkippedRequestsForElevator(elevator.id);
          setLiveRequests((prev) => {
            const next = prev.map((r) => {
              // Clear skip markers for all requests on this elevator
              if (r.skipped_by_elevator_id === elevator.id) {
                return { ...r, skipped_by_elevator_id: null, skipped_at: null };
              }
              // Complete the dropped-off requests
              if (requestIds.includes(r.id)) {
                const completed = {
                  ...r,
                  status: "completed" as const,
                  completed_at: now,
                  updated_at: now,
                };
                rememberOptimisticRequest(completed);
                return completed;
              }
              return r;
            });
            const boardedLoad = next
              .filter((r) => r.elevator_id === elevator.id && r.status === "boarded")
              .reduce((sum, r) => sum + r.passenger_count, 0);
            onElevatorPatch?.(elevator.id, {
              current_floor_id: dropFloorId,
              direction: boardedLoad === 0 ? "idle" : elevator.direction,
              current_load: boardedLoad,
            });
            return next;
          });
        }}
        onDropoffFailure={({ requestIds }) => {
          const now = new Date().toISOString();
          for (const id of requestIds) {
            optimisticRequestsRef.current.delete(id);
          }
          setLiveRequests((prev) => {
            const next = prev.map((r) =>
              requestIds.includes(r.id) && r.status === "completed"
                ? { ...r, status: "boarded" as const, completed_at: null, updated_at: now }
                : r,
            );
            const boardedLoad = next
              .filter((r) => r.elevator_id === elevator.id && r.status === "boarded")
              .reduce((sum, r) => sum + r.passenger_count, 0);
            onElevatorPatch?.(elevator.id, {
              current_load: boardedLoad,
            });
            return next;
          });
        }}
        onSkipSuccess={(req) => {
          logAction("skipSuccess", { requestId: req.id, fromStatus: req.status });
          // Optimistically mark the request as skipped in live state
          // so the dispatch engine won't recommend it again this cycle
          setLiveRequests((prev) => {
            const next = prev.map((r) =>
              r.id === req.id
                ? {
                    ...r,
                    skipped_by_elevator_id: elevator.id,
                    skipped_at: new Date().toISOString(),
                  }
                : r,
            );
            return next;
          });
        }}
      />

      <section className="rounded-3xl border border-white/10 bg-white/8 p-4">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-yellow-300"><T k="operator.tablet" /></p>
            <h2 className="text-2xl font-black text-white"><T k="operator.movements" /></h2>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <p className="text-xs font-bold text-emerald-200"><T k="operator.requestsSynced" /></p>
              {liveActivePassengers.length > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-sky-500/20 px-2.5 py-0.5 text-xs font-black text-sky-100">
                  <Users size={12} /> {liveActivePassengers.length} <T k="operator.onboardCount" />
                </span>
              )}
              {activeQueue.filter(r => r.status !== "boarded").length > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-yellow-500/20 px-2.5 py-0.5 text-xs font-black text-yellow-100">
                  {activeQueue.filter(r => r.status !== "boarded").length} <T k="operator.pendingCount" />
                </span>
              )}
            </div>
          </div>
          <button
            type="button"
            disabled={isClearingQueue || (activeQueue.length === 0 && liveActivePassengers.length === 0)}
            onClick={clearVisibleQueue}
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-black text-slate-300 transition hover:bg-white/10 disabled:opacity-35"
          >
            <T k="operator.clearQueue" />
          </button>
        </div>
        {operatorActionError ? (
          <p className="anim-shake mb-3 rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm font-bold text-red-100">
            {operatorActionError}
          </p>
        ) : null}
        {!isOnline && (
          <p className="mb-3 flex items-center gap-2 rounded-2xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm font-bold text-amber-100">
            <ShieldAlert size={16} />
            <T k="common.offline" />
          </p>
        )}

        {activeQueue.length === 0 && liveActivePassengers.length === 0 ? (
          <div className="anim-fade-in flex flex-col items-center justify-center gap-3 rounded-2xl border border-white/8 bg-white/4 px-6 py-12 text-center">
            <Inbox size={40} className="text-slate-500" />
            <p className="text-lg font-black text-slate-300"><T k="operator.emptyQueue" /></p>
            <p className="text-sm font-bold text-slate-500"><T k="operator.emptyQueueHint" /></p>
          </div>
        ) : (
          <>
            {/* Priority alert banner — impossible to miss at the top */}
            {prioritiesEnabled && priorityCount > 0 && (
              <PriorityAlertBanner priorityRequests={activeQueue.filter((r) => r.priority)} />
            )}
            <MovementBoard
            requests={activeQueue}
            recommendedIds={visibleRecommendedIds}
            onCancelRequest={cancelMovementRequest}
              cancelingIds={cancelingRequestIds}
            />
          </>
        )}
      </section>
    </div>
  );
}
