"use client";

import { useEffect, useMemo, useState } from "react";
import {
  demoActivePassengers,
  demoElevator,
  demoFloors,
  demoRequests,
  enrichRequests,
} from "@/lib/demoData";
import { createClient } from "@/lib/supabase/client";
import { mergeRealtimeRequest, subscribeToTable, unsubscribe, type RequestRealtimePayload } from "@/lib/realtime";
import type { TranslationKey } from "@/lib/i18n";
import { formatFloorLabel } from "@/lib/utils";
import { getRecommendedNextStop } from "@/services/dispatchEngine";
import {
  type ActivePassenger,
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
  activePassengers = demoActivePassengers,
  prioritiesEnabled = true,
}: {
  floors?: Floor[];
  requests?: HoistRequest[];
  elevator?: Elevator;
  activePassengers?: ActivePassenger[];
  prioritiesEnabled?: boolean;
}) {
  const [liveRequests, setLiveRequests] = useState(requests);
  const projectId = elevator.project_id;

  useEffect(() => {
    const client = createClient();
    const channel = subscribeToTable<RequestRealtimePayload>({
      client,
      table: "requests",
      filter: `project_id=eq.${projectId}`,
      onChange: (payload) => {
        setLiveRequests((current) => mergeRealtimeRequest(current, payload));
      },
    });

    return () => unsubscribe(client, channel);
  }, [projectId]);

  const elevatorRequests = useMemo(
    () => liveRequests.filter((request) => request.elevator_id === elevator.id),
    [elevator.id, liveRequests],
  );
  const currentFloor = floors.find((floor) => floor.id === elevator.current_floor_id) ?? floors[0] ?? demoFloors[2];
  const enriched = enrichRequests(elevatorRequests, floors);
  const remaining = Math.max(0, elevator.capacity - elevator.current_load);
  const dispatchRequests: DispatchRequest[] = elevatorRequests.map((request) => ({
    ...request,
    from_sort_order: floors.find((floor) => floor.id === request.from_floor_id)?.sort_order ?? 0,
    to_sort_order: floors.find((floor) => floor.id === request.to_floor_id)?.sort_order ?? 0,
  }));
  const liveActivePassengers = useMemo(
    () =>
      elevatorRequests
        .filter((request) => request.status === "boarded")
        .map((request) => {
          const from = floors.find((floor) => floor.id === request.from_floor_id);
          const to = floors.find((floor) => floor.id === request.to_floor_id);

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
    [floors, elevatorRequests],
  );
  const recommendation = getRecommendedNextStop({
    currentFloor,
    direction: elevator.direction,
    requests: dispatchRequests,
    capacity: elevator.capacity,
    currentLoad: elevator.current_load,
    activePassengers: liveActivePassengers.length > 0 ? liveActivePassengers : activePassengers,
    floors,
    prioritiesEnabled,
  });
  const displayDirection: Direction =
    elevator.direction !== "idle"
      ? elevator.direction
      : recommendation.suggestedDirection !== "idle"
        ? recommendation.suggestedDirection
        : "idle";
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

  return (
    <div className="mx-auto grid max-w-7xl gap-4">
      <section className="grid gap-3 lg:grid-cols-[1fr_340px]">
        <div className="grid gap-3 sm:grid-cols-4">
          <div className="rounded-3xl border border-white/10 bg-white/8 p-4">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-400"><T k="operator.floor" /></p>
            <p className="mt-1 text-4xl font-black text-white">{formatFloorLabel(currentFloor)}</p>
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
        <CapacityPanel elevator={elevator} />
      </section>

      <RecommendedNextStop recommendation={recommendation} actionRequests={actionRequests} />

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
