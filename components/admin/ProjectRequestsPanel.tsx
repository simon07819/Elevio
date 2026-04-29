"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { CheckCircle, Clock, XCircle } from "lucide-react";
import { assignRequestElevator, updateRequestStatus } from "@/lib/actions";
import { createClient } from "@/lib/supabase/client";
import { mergeRealtimeRequest, subscribeToTable, unsubscribe, type RequestRealtimePayload } from "@/lib/realtime";
import { useLanguage } from "@/components/i18n/LanguageProvider";
import { formatFloorLabel, formatWaitTime } from "@/lib/utils";
import type { TranslationKey } from "@/lib/i18n";
import type { Direction, Elevator, Floor, HoistRequest, RequestStatus } from "@/types/hoist";

const nextStatuses: RequestStatus[] = ["pending", "assigned", "arriving", "boarded", "completed", "cancelled"];
const directionKeys = {
  idle: "direction.idle",
  up: "direction.up",
  down: "direction.down",
} satisfies Record<Direction, TranslationKey>;
const statusKeys = {
  pending: "status.pending",
  assigned: "status.assigned",
  arriving: "status.arriving",
  boarded: "status.boarded",
  completed: "status.completed",
  cancelled: "status.cancelled",
} satisfies Record<RequestStatus, TranslationKey>;

export function ProjectRequestsPanel({
  projectId,
  requests,
  floors,
  elevators,
}: {
  projectId: string;
  requests: HoistRequest[];
  floors: Floor[];
  elevators: Elevator[];
}) {
  const [localRequests, setLocalRequests] = useState(requests);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const { t } = useLanguage();
  const floorMap = useMemo(() => new Map(floors.map((floor) => [floor.id, floor])), [floors]);
  const elevatorMap = useMemo(() => new Map(elevators.map((elevator) => [elevator.id, elevator])), [elevators]);
  const activeCount = localRequests.filter((request) => request.status !== "completed" && request.status !== "cancelled").length;
  const totalPassengers = localRequests.reduce((sum, request) => sum + request.passenger_count, 0);

  useEffect(() => {
    const client = createClient();
    const channel = subscribeToTable<RequestRealtimePayload>({
      client,
      table: "requests",
      filter: `project_id=eq.${projectId}`,
      onChange: (payload) => {
        setLocalRequests((current) => mergeRealtimeRequest(current, payload));
      },
    });

    return () => unsubscribe(client, channel);
  }, [projectId]);

  function changeStatus(requestId: string, status: RequestStatus) {
    startTransition(async () => {
      const result = await updateRequestStatus(requestId, status, `Statut modifie par l'admin: ${status}.`);
      setMessage(result.message);
      if (result.ok) {
        setLocalRequests((current) =>
          current.map((request) => (request.id === requestId ? { ...request, status } : request)),
        );
      }
    });
  }

  function changeElevator(requestId: string, elevatorId: string | null) {
    startTransition(async () => {
      const result = await assignRequestElevator(requestId, elevatorId);
      setMessage(result.message);
      if (result.ok) {
        setLocalRequests((current) =>
          current.map((request) => (request.id === requestId ? { ...request, elevator_id: elevatorId } : request)),
        );
      }
    });
  }

  return (
    <section className="glass-panel rounded-[2rem] p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.25em] text-yellow-200">{t("requests.title")}</p>
          <h2 className="text-2xl font-black text-white">{t("requests.adminTitle")}</h2>
          <p className="mt-1 text-sm font-bold text-slate-400">
            {t("requests.body")}
          </p>
          <p className="mt-1 text-xs font-black text-emerald-200">{t("requests.synced")}</p>
        </div>
        <div className="grid grid-cols-2 gap-2 text-center">
          <div className="rounded-2xl bg-white/10 px-4 py-3">
            <p className="text-2xl font-black text-white">{activeCount}</p>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">{t("requests.active")}</p>
          </div>
          <div className="rounded-2xl bg-white/10 px-4 py-3">
            <p className="text-2xl font-black text-white">{totalPassengers}</p>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">{t("requests.peopleShort")}</p>
          </div>
        </div>
      </div>

      {message && <div className="mt-4 rounded-2xl bg-white/10 p-3 text-sm font-bold text-slate-100">{message}</div>}

      <div className="mt-5 overflow-hidden rounded-3xl border border-white/10">
        <div className="grid grid-cols-[1fr_1fr_110px_120px_120px_180px] bg-white/10 px-4 py-3 text-xs font-black uppercase tracking-[0.14em] text-slate-400">
          <span>{t("requests.trip")}</span>
          <span>{t("common.wait")}</span>
          <span>{t("requests.peopleShort")}</span>
          <span>{t("requests.elevator")}</span>
          <span>{t("common.status")}</span>
          <span>{t("requests.actions")}</span>
        </div>
        <div className="divide-y divide-white/10">
          {localRequests.length === 0 ? (
            <div className="p-5 text-center text-sm font-bold text-slate-400">{t("requests.empty")}</div>
          ) : (
            localRequests.map((request) => {
              const from = floorMap.get(request.from_floor_id);
              const to = floorMap.get(request.to_floor_id);

              return (
                <article key={request.id} className="grid grid-cols-[1fr_1fr_110px_120px_120px_180px] items-center gap-2 px-4 py-3 text-sm font-bold text-slate-100">
                  <div>
                    <p className="text-lg font-black text-white">
                      {formatFloorLabel(from)} {"->"} {formatFloorLabel(to)}
                    </p>
                    <p className="text-xs text-slate-400">
                      {request.priority ? t("requests.priority") : t(directionKeys[request.direction])}
                      {request.split_required ? ` / ${t("requests.split")}` : ""}
                    </p>
                  </div>
                  <span className="flex items-center gap-2">
                    <Clock size={16} className="text-yellow-200" />
                    {formatWaitTime(request.wait_started_at)}
                  </span>
                  <span>
                    {request.passenger_count}
                    {request.split_required ? ` / ${request.original_passenger_count}` : ""}
                  </span>
                  <select
                    disabled={isPending}
                    value={request.elevator_id ?? ""}
                    onChange={(event) => changeElevator(request.id, event.target.value || null)}
                    className="rounded-xl bg-white px-2 py-2 text-xs font-black text-slate-950"
                  >
                    <option value="">{t("requests.unassigned")}</option>
                    {elevators.map((elevator) => (
                      <option key={elevator.id} value={elevator.id}>
                        {elevatorMap.get(elevator.id)?.name ?? elevator.name}
                      </option>
                    ))}
                  </select>
                  <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-black">{t(statusKeys[request.status])}</span>
                  <div className="flex flex-wrap gap-2">
                    <select
                      disabled={isPending}
                      value={request.status}
                      onChange={(event) => changeStatus(request.id, event.target.value as RequestStatus)}
                      className="rounded-xl bg-white px-2 py-2 text-xs font-black text-slate-950"
                    >
                      {nextStatuses.map((status) => (
                        <option key={status} value={status}>
                          {t(statusKeys[status])}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => changeStatus(request.id, "completed")}
                      className="rounded-xl bg-emerald-400/20 px-2 py-2 text-emerald-100"
                      aria-label={t("requests.complete")}
                    >
                      <CheckCircle size={16} />
                    </button>
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => changeStatus(request.id, "cancelled")}
                      className="rounded-xl bg-red-500/20 px-2 py-2 text-red-100"
                      aria-label={t("requests.cancel")}
                    >
                      <XCircle size={16} />
                    </button>
                  </div>
                </article>
              );
            })
          )}
        </div>
      </div>
    </section>
  );
}
