"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { LockKeyhole, TabletSmartphone } from "lucide-react";
import {
  activateOperatorElevator,
  heartbeatOperatorElevator,
  releaseOperatorElevator,
} from "@/lib/actions";
import { useLanguage } from "@/components/i18n/LanguageProvider";
import { formatFloorLabel } from "@/lib/utils";
import type { ActivePassenger, Elevator, Floor, HoistRequest, Project } from "@/types/hoist";
import { OperatorDashboard } from "@/components/operator/OperatorDashboard";

function sessionStorageKey(projectId: string) {
  return `elevio-operator-session-id:${projectId}`;
}

function elevatorStorageKey(projectId: string) {
  return `elevio-operator-elevator-id:${projectId}`;
}

function makeSessionId(projectId: string) {
  if (typeof window === "undefined") {
    return "";
  }

  const key = sessionStorageKey(projectId);
  const scoped = window.localStorage.getItem(key);
  if (scoped) {
    return scoped;
  }

  const legacy = window.localStorage.getItem("elevio-operator-session-id");
  if (legacy) {
    window.localStorage.setItem(key, legacy);
    window.localStorage.removeItem("elevio-operator-session-id");
    return legacy;
  }

  const next = window.crypto?.randomUUID?.() ?? `operator-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  window.localStorage.setItem(key, next);
  return next;
}

function storedElevatorId(projectId: string) {
  if (typeof window === "undefined") {
    return null;
  }

  const key = elevatorStorageKey(projectId);
  const scoped = window.localStorage.getItem(key);
  if (scoped) {
    return scoped;
  }

  const legacy = window.localStorage.getItem("elevio-operator-elevator-id");
  if (legacy) {
    window.localStorage.setItem(key, legacy);
    window.localStorage.removeItem("elevio-operator-elevator-id");
    return legacy;
  }

  return null;
}

export function OperatorWorkspace({
  project,
  floors,
  elevators,
  requests,
  activePassengers,
}: {
  project: Project;
  floors: Floor[];
  elevators: Elevator[];
  requests: HoistRequest[];
  activePassengers: ActivePassenger[];
}) {
  const { t } = useLanguage();
  const [sessionId] = useState(() => makeSessionId(project.id));
  const [localElevators, setLocalElevators] = useState(elevators);
  const [selectedElevatorId, setSelectedElevatorId] = useState<string | null>(() => storedElevatorId(project.id));
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const selectedElevator = useMemo(
    () =>
      localElevators.find(
        (elevator) => elevator.id === selectedElevatorId && elevator.operator_session_id === sessionId,
      ) ?? null,
    [localElevators, selectedElevatorId, sessionId],
  );

  useEffect(() => {
    if (!selectedElevator) {
      return;
    }

    const heartbeat = () => heartbeatOperatorElevator(project.id, selectedElevator.id, sessionId);
    heartbeat();
    const interval = window.setInterval(heartbeat, 30_000);

    return () => window.clearInterval(interval);
  }, [project.id, selectedElevator, sessionId]);

  function activate(elevator: Elevator, formData: FormData) {
    const currentFloorId = String(formData.get("currentFloorId") ?? "");

    startTransition(async () => {
      const result = await activateOperatorElevator(project.id, elevator.id, sessionId, currentFloorId);
      setMessage(result.message);

      if (result.ok) {
        window.localStorage.setItem(elevatorStorageKey(project.id), elevator.id);
        setSelectedElevatorId(elevator.id);
        setLocalElevators((current) =>
          current.map((item) =>
            item.id === elevator.id
              ? {
                  ...item,
                  operator_session_id: sessionId,
                  operator_session_started_at: new Date().toISOString(),
                  operator_session_heartbeat_at: new Date().toISOString(),
                  current_floor_id: currentFloorId || item.current_floor_id,
                  direction: "idle",
                  current_load: 0,
                }
              : item,
          ),
        );
      }
    });
  }

  function release() {
    if (!selectedElevator) {
      return;
    }

    startTransition(async () => {
      const result = await releaseOperatorElevator(project.id, selectedElevator.id, sessionId);
      setMessage(result.message);

      if (result.ok) {
        window.localStorage.removeItem(elevatorStorageKey(project.id));
        setSelectedElevatorId(null);
        setLocalElevators((current) =>
          current.map((item) =>
            item.id === selectedElevator.id
              ? {
                  ...item,
                  operator_session_id: null,
                  operator_session_started_at: null,
                  operator_session_heartbeat_at: null,
                  operator_user_id: null,
                }
              : item,
          ),
        );
      }
    });
  }

  if (selectedElevator) {
    return (
      <div className="mx-auto grid max-w-7xl gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-emerald-400/20 bg-emerald-400/10 p-3">
          <p className="text-sm font-black text-emerald-100">
            <TabletSmartphone className="mr-2 inline" size={18} />
            {selectedElevator.name}
          </p>
          <button
            type="button"
            disabled={isPending}
            onClick={release}
            className="rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-sm font-black text-white disabled:opacity-60"
          >
            {t("operator.releaseTablet")}
          </button>
        </div>
        {message && <div className="rounded-2xl bg-white/10 p-3 text-sm font-bold text-slate-100">{message}</div>}
        <OperatorDashboard
          floors={floors}
          requests={requests}
          elevator={selectedElevator}
          activePassengers={activePassengers.filter((passenger) =>
            requests.some((request) => request.id === passenger.requestId && request.elevator_id === selectedElevator.id),
          )}
        />
      </div>
    );
  }

  return (
    <section className="mx-auto grid max-w-7xl gap-4 rounded-3xl border border-white/10 bg-white/8 p-5">
      <div>
        <p className="text-xs font-black uppercase tracking-[0.25em] text-yellow-200">
          {t("operator.activateTablet")}
        </p>
        <h2 className="mt-2 text-3xl font-black text-white">{project.name}</h2>
        <p className="mt-2 max-w-2xl text-sm font-bold text-slate-400">{t("operator.activateBody")}</p>
      </div>

      {message && <div className="rounded-2xl bg-white/10 p-3 text-sm font-bold text-slate-100">{message}</div>}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {localElevators.map((elevator) => {
          const locked = Boolean(elevator.operator_session_id && elevator.operator_session_id !== sessionId);
          const defaultFloorId = elevator.current_floor_id ?? floors.find((floor) => floor.sort_order === 0)?.id ?? floors[0]?.id ?? "";

          return (
            <form
              key={elevator.id}
              action={(formData) => activate(elevator, formData)}
              className="rounded-[1.5rem] border border-white/10 bg-slate-950/50 p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-xl font-black text-white">{elevator.name}</h3>
                  <p className="mt-1 text-sm font-bold text-slate-400">
                    {elevator.capacity} {t("operator.places")}
                  </p>
                </div>
                <span className={locked ? "rounded-full bg-red-500/20 px-3 py-1 text-xs font-black text-red-100" : "rounded-full bg-emerald-400/15 px-3 py-1 text-xs font-black text-emerald-100"}>
                  {locked ? t("operator.locked") : t("operator.available")}
                </span>
              </div>

              <label className="mt-4 grid gap-2 text-sm font-black text-slate-200">
                {t("operator.currentFloor")}
                <select
                  name="currentFloorId"
                  defaultValue={defaultFloorId}
                  disabled={locked || isPending}
                  className="rounded-2xl bg-white px-4 py-3 font-bold text-slate-950 outline-none disabled:opacity-60"
                >
                  {floors.map((floor) => (
                    <option key={floor.id} value={floor.id}>
                      {formatFloorLabel(floor)}
                    </option>
                  ))}
                </select>
              </label>

              <button
                disabled={locked || isPending}
                className="touch-target mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-yellow-300 px-5 py-4 font-black text-slate-950 disabled:opacity-50"
              >
                <LockKeyhole size={18} />
                {t("operator.activate")}
              </button>
            </form>
          );
        })}
      </div>
    </section>
  );
}
