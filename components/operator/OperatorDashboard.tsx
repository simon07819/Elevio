"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { Ban, CheckCircle2, MapPin } from "lucide-react";
import {
  demoElevator,
  demoFloors,
  demoRequests,
  enrichRequests,
} from "@/lib/demoData";
import { createClient } from "@/lib/supabase/client";
import { broadcastPassengerQueueCleared, broadcastPassengerRequestBoarded } from "@/lib/passengerNotifyBroadcast";
import {
  bindRealtimeWithAuthSession,
  mergeOperatorPollRequest,
  mergeRealtimeRequest,
  mergeRequestsPropIntoLive,
  subscribeToTable,
  type RequestRealtimePayload,
} from "@/lib/realtime";
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
import { RecommendedNextStop } from "@/components/operator/RecommendedNextStop";

const directionKeys = {
  idle: "direction.idle",
  up: "direction.up",
  down: "direction.down",
} satisfies Record<Direction, TranslationKey>;
const OPERATOR_VISIBLE_REQUEST_STATUSES = ["pending", "assigned", "arriving", "boarded"] as const;
const OPTIMISTIC_REQUEST_TTL_MS = 30_000;

export function OperatorDashboard({
  floors = demoFloors,
  requests = demoRequests,
  elevator = demoElevator,
  prioritiesEnabled = true,
  capacityEnabled = true,
  onElevatorPatch,
}: {
  floors?: Floor[];
  requests?: HoistRequest[];
  elevator?: Elevator;
  prioritiesEnabled?: boolean;
  capacityEnabled?: boolean;
  onElevatorPatch?: (elevatorId: string, patch: Partial<Elevator>) => void;
}) {
  const { locale } = useLanguage();
  const [liveRequests, setLiveRequests] = useState(requests);
  const [operatorActionError, setOperatorActionError] = useState<string | null>(null);
  const [isTogglingFull, setIsTogglingFull] = useState(false);
  const [manualFullOverride, setManualFullOverride] = useState<boolean | null>(null);
  const [cancelingRequestIds, setCancelingRequestIds] = useState<Set<string>>(() => new Set());
  const [isClearingQueue, setIsClearingQueue] = useState(false);
  const projectId = elevator.project_id;
  const manualFullDesiredRef = useRef<boolean | null>(null);
  const manualFullSyncingRef = useRef(false);
  const optimisticRequestsRef = useRef<Map<string, { request: HoistRequest; expiresAt: number }>>(new Map());

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

  useEffect(() => {
    const id = window.setTimeout(() => {
      setLiveRequests((current) => mergeRequestsPropIntoLive(current, requests));
    }, 0);
    return () => window.clearTimeout(id);
  }, [requests]);

  useEffect(() => {
    const client = createClient();
    return bindRealtimeWithAuthSession(client, () =>
      subscribeToTable<RequestRealtimePayload>({
        client,
        table: "requests",
        filter: `project_id=eq.${projectId}`,
        onChange: (payload) => {
          const nextPayload =
            payload.eventType === "DELETE"
              ? payload
              : ({ ...payload, new: applyOptimisticRequest(payload.new) } satisfies RequestRealtimePayload);
          setLiveRequests((current) => mergeRealtimeRequest(current, nextPayload));
        },
      }),
    );
  }, [projectId]);

  useEffect(() => {
    const client = createClient();
    let cancelled = false;

    async function syncRequests() {
      if (!client) return;
      const { data } = await client
        .from("requests")
        .select(
          "id,project_id,elevator_id,from_floor_id,to_floor_id,direction,passenger_count,original_passenger_count,remaining_passenger_count,split_required,priority,priority_reason,note,status,sequence_number,wait_started_at,created_at,updated_at,completed_at",
        )
        .eq("project_id", projectId)
        .eq("elevator_id", elevator.id)
        .in("status", OPERATOR_VISIBLE_REQUEST_STATUSES)
        .order("created_at", { ascending: false })
        .limit(250);

      if (cancelled || !data) return;
      setLiveRequests((current) => {
        const liveById = new Map((data as HoistRequest[]).map((request) => [request.id, applyOptimisticRequest(request)]));
        const kept = current.filter(
          (request) =>
            request.elevator_id !== elevator.id ||
            !OPERATOR_VISIBLE_REQUEST_STATUSES.includes(request.status as (typeof OPERATOR_VISIBLE_REQUEST_STATUSES)[number]),
        );
        const mergedById = new Map<string, HoistRequest>();
        for (const row of kept) {
          mergedById.set(row.id, row);
        }
        for (const [id, incoming] of liveById) {
          const existing = mergedById.get(id);
          mergedById.set(id, mergeOperatorPollRequest(existing, incoming));
        }
        return [...mergedById.values()];
      });
    }

    void syncRequests();
    const id = window.setInterval(syncRequests, 400);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [elevator.id, projectId]);

  const floorById = useMemo(() => new Map(floors.map((floor) => [floor.id, floor])), [floors]);
  const elevatorRequests = useMemo(
    () => liveRequests.filter((request) => request.elevator_id === elevator.id),
    [elevator.id, liveRequests],
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
  const effectiveElevator = {
    ...elevator,
    current_load: realCurrentLoad,
    manual_full: manualFullOverride ?? elevator.manual_full,
  };
  const remaining = capacityEnabled ? Math.max(0, effectiveElevator.capacity - effectiveElevator.current_load) : Number.POSITIVE_INFINITY;
  const recommendation = getRecommendedNextStop({
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
  });
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
  const capacityBlockedCount = capacityEnabled ? enriched.filter((request) => request.passenger_count > remaining).length : 0;
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
  if (!hasOperatorWork) {
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
    recommendation.reasonDetail?.kind !== "idle_blocked"
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
    const now = new Date().toISOString();
    const clearedIds = liveRequests
      .filter(
        (request) =>
          request.elevator_id === elevator.id &&
          (request.status === "pending" ||
            request.status === "assigned" ||
            request.status === "arriving" ||
            request.status === "boarded"),
      )
      .map((request) => request.id);
    const previousRequests = liveRequests;
    flushSync(() => {
      setOperatorActionError(null);
      setLiveRequests((current) =>
        current.map((request) =>
          request.elevator_id === elevator.id &&
          (request.status === "pending" ||
            request.status === "assigned" ||
            request.status === "arriving" ||
            request.status === "boarded")
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
            .in("status", [...OPERATOR_VISIBLE_REQUEST_STATUSES]),
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

        broadcastPassengerQueueCleared(client, projectId, clearedIds);
      } finally {
        setIsClearingQueue(false);
      }
    })();
  }

  function cancelMovementRequest(request: EnrichedRequest) {
    if (request.status === "boarded" || cancelingRequestIds.has(request.id)) {
      return;
    }

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
        onPickupSuccess={(req) => {
          const now = new Date().toISOString();
          const client = createClient();
          if (client) {
            broadcastPassengerRequestBoarded(client, projectId, [req.id]);
          }
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
        }}
        onPickupFailure={(req) => {
          optimisticRequestsRef.current.delete(req.id);
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
        onDropoffSuccess={({ requestIds, dropFloorId }) => {
          const now = new Date().toISOString();
          setLiveRequests((prev) => {
            const next = prev.map((r) =>
              requestIds.includes(r.id)
                ? (() => {
                    const completed = {
                      ...r,
                      status: "completed" as const,
                      completed_at: now,
                      updated_at: now,
                    };
                    rememberOptimisticRequest(completed);
                    return completed;
                  })()
                : r,
            );
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
      />

      <section className="rounded-3xl border border-white/10 bg-white/8 p-4">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-yellow-300"><T k="operator.tablet" /></p>
            <h2 className="text-2xl font-black text-white"><T k="operator.movements" /></h2>
            <p className="mt-1 text-xs font-bold text-emerald-200"><T k="operator.requestsSynced" /></p>
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
          <p className="mb-3 rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm font-bold text-red-100">
            {operatorActionError}
          </p>
        ) : null}

        <MovementBoard
          requests={activeQueue}
          recommendedIds={visibleRecommendedIds}
          onCancelRequest={cancelMovementRequest}
          cancelingIds={cancelingRequestIds}
        />
      </section>
    </div>
  );
}
