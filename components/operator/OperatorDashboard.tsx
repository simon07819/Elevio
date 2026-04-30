"use client";

import { useEffect, useMemo, useState } from "react";
import { MapPin } from "lucide-react";
import {
  demoElevator,
  demoFloors,
  demoRequests,
  enrichRequests,
} from "@/lib/demoData";
import { createClient } from "@/lib/supabase/client";
import {
  bindRealtimeWithAuthSession,
  mergeRealtimeRequest,
  mergeServerRequestsWithLive,
  subscribeToTable,
  type RequestRealtimePayload,
} from "@/lib/realtime";
import type { TranslationKey } from "@/lib/i18n";
import { formatFloorLabel } from "@/lib/utils";
import { getRecommendedNextStop } from "@/services/dispatchEngine";
import {
  type Direction,
  type DispatchRequest,
  type Elevator,
  type Floor,
  type HoistRequest,
  isOperatorMovementQueueStatus,
} from "@/types/hoist";
import { CapacityPanel } from "@/components/operator/CapacityPanel";
import { T } from "@/components/i18n/LanguageProvider";
import { MovementBoard } from "@/components/operator/MovementBoard";
import { RecommendedNextStop } from "@/components/operator/RecommendedNextStop";

const directionKeys = {
  idle: "direction.idle",
  up: "direction.up",
  down: "direction.down",
} satisfies Record<Direction, TranslationKey>;

export function OperatorDashboard({
  floors = demoFloors,
  requests = demoRequests,
  elevator = demoElevator,
  prioritiesEnabled = true,
  onElevatorPatch,
}: {
  floors?: Floor[];
  requests?: HoistRequest[];
  elevator?: Elevator;
  prioritiesEnabled?: boolean;
  onElevatorPatch?: (elevatorId: string, patch: Partial<Elevator>) => void;
}) {
  const [liveRequests, setLiveRequests] = useState(requests);
  const projectId = elevator.project_id;

  useEffect(() => {
    const id = window.setTimeout(() => {
      setLiveRequests((prev) => mergeServerRequestsWithLive(prev, requests));
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
          setLiveRequests((current) => mergeRealtimeRequest(current, payload));
        },
      }),
    );
  }, [projectId]);

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
  const effectiveElevator = { ...elevator, current_load: realCurrentLoad };
  const remaining = Math.max(0, effectiveElevator.capacity - effectiveElevator.current_load);
  const recommendation = getRecommendedNextStop({
    currentFloor,
    direction: effectiveElevator.direction,
    requests: dispatchRequests,
    capacity: effectiveElevator.capacity,
    currentLoad: effectiveElevator.current_load,
    activePassengers: liveActivePassengers,
    floors,
    prioritiesEnabled,
  });
  const recommendedIds = new Set(recommendation.requestsToPickup.map((request) => request.id));
  const liveQueue = [...enriched].sort((a, b) => {
    const aTerminal = a.status === "completed" || a.status === "cancelled" ? 1 : 0;
    const bTerminal = b.status === "completed" || b.status === "cancelled" ? 1 : 0;
    const aCapacityValid = a.passenger_count <= remaining ? 1 : 0;
    const bCapacityValid = b.passenger_count <= remaining ? 1 : 0;
    const aRecommended = recommendedIds.has(a.id) ? 1 : 0;
    const bRecommended = recommendedIds.has(b.id) ? 1 : 0;

    return (
      aTerminal - bTerminal ||
      bRecommended - aRecommended ||
      (prioritiesEnabled ? Number(b.priority) - Number(a.priority) : 0) ||
      bCapacityValid - aCapacityValid ||
      new Date(a.wait_started_at).getTime() - new Date(b.wait_started_at).getTime()
    );
  });
  const priorityCount = prioritiesEnabled ? enriched.filter((request) => request.priority).length : 0;
  const capacityBlockedCount = enriched.filter((request) => request.passenger_count > remaining).length;
  const activeQueue = liveQueue.filter((request) => isOperatorMovementQueueStatus(request.status));
  const actionRequests = [
    ...activeQueue.filter((request) => recommendedIds.has(request.id)),
    ...activeQueue.filter((request) => !recommendedIds.has(request.id)),
  ];

  /** Pas de palier « inventé » depuis la file si capacité bloque — suit uniquement la reco dispatch. */
  const displayFloor = recommendation.nextFloor ?? currentFloor;

  /** Toujours dériver de la géométrie étages : évite direction passager / état ascenseur périmé (« monter » vers P1 alors qu’il faut descendre). */
  const targetSort = Number(displayFloor.sort_order);
  const currentSort = Number(currentFloor.sort_order);
  const displayDirection: Direction =
    targetSort > currentSort ? "up" : targetSort < currentSort ? "down" : "idle";

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
            <p className="mt-3 text-4xl font-black tabular-nums tracking-tight text-white drop-shadow-[0_2px_18px_rgba(0,0,0,0.5)] md:text-5xl md:leading-none">
              {formatFloorLabel(displayFloor)}
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
          <div className="rounded-3xl border border-white/10 bg-white/8 p-4">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-400"><T k="operator.capacity" /></p>
            <p className="mt-2 text-2xl font-black text-emerald-200">{remaining} <T k="operator.places" /></p>
            <p className="text-xs font-bold text-yellow-200">{capacityBlockedCount} <T k="operator.nextPass" /></p>
          </div>
        </div>
        <CapacityPanel elevator={effectiveElevator} />
      </section>

      <RecommendedNextStop
        recommendation={recommendation}
        actionRequests={actionRequests}
        operatorElevatorId={elevator.id}
        onPickupSuccess={(req) => {
          setLiveRequests((prev) => {
            const next = prev.map((r) =>
              r.id === req.id
                ? {
                    ...r,
                    status: "boarded" as const,
                    updated_at: new Date().toISOString(),
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
        onDropoffSuccess={({ requestIds, dropFloorId }) => {
          const now = new Date().toISOString();
          setLiveRequests((prev) => {
            const next = prev.map((r) =>
              requestIds.includes(r.id)
                ? {
                    ...r,
                    status: "completed" as const,
                    completed_at: now,
                    updated_at: now,
                  }
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
      />

      <section className="rounded-3xl border border-white/10 bg-white/8 p-4">
        <div className="mb-3">
          <p className="text-xs font-black uppercase tracking-[0.22em] text-yellow-300"><T k="operator.tablet" /></p>
          <h2 className="text-2xl font-black text-white"><T k="operator.movements" /></h2>
          <p className="mt-1 text-xs font-bold text-emerald-200"><T k="operator.requestsSynced" /></p>
        </div>

        <MovementBoard requests={activeQueue} recommendedIds={recommendedIds} />
      </section>
    </div>
  );
}
