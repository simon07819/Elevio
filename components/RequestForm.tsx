"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Clock, Loader2, Send, ShieldAlert, Users, XCircle } from "lucide-react";
import { createPassengerRequest, resumePassengerRequest, updateRequestStatus } from "@/lib/actions";
import { createClient } from "@/lib/supabase/client";
import { subscribeToTable, unsubscribe, type ElevatorRealtimePayload } from "@/lib/realtime";
import { estimateArrivalWindow, formatFloorLabel, formatPostgresTimeToAmPm } from "@/lib/utils";
import { demoElevator, demoProject } from "@/lib/demoData";
import type { Elevator, Floor, HoistRequest, Project, RequestStatus } from "@/types/hoist";
import {
  analyzePassengerDispatch,
  passengerDispatchOperatorSummaries,
  uniqueServiceHourRanges,
  DEFAULT_PROJECT_TIMEZONE,
} from "@/lib/operatorDispatchAvailability";
import {
  clearPassengerPendingRequest,
  loadPassengerPendingSnapshot,
  passengerPendingRequestStorageKey,
  savePassengerPendingRequest,
} from "@/lib/passengerRequestPersistence";
import { FloorSelector } from "@/components/FloorSelector";
import { useLanguage } from "@/components/i18n/LanguageProvider";

type SubmittedRequest = {
  requestId: string;
  status: RequestStatus;
  waitStartedAt: string;
  fromFloorId: string;
  toFloorId: string;
  passengerCount: number;
};

function isTerminalPassengerRequestStatus(status: RequestStatus): boolean {
  return status === "completed" || status === "cancelled";
}

/** Après ramassage opérateur : plus de suivi passager — retour scan QR requis. */
function clearsPassengerPendingStorage(status: RequestStatus): boolean {
  return isTerminalPassengerRequestStatus(status) || status === "boarded";
}

function shouldRestoreSubmittedFromSnapshot(status: RequestStatus): boolean {
  return !clearsPassengerPendingStorage(status);
}

function requestInvalidatedMessage(status: RequestStatus, t: ReturnType<typeof useLanguage>["t"]) {
  return status === "cancelled" ? t("request.cancelled") : null;
}

export function RequestForm({
  project,
  floors,
  currentFloor,
  elevators,
}: {
  project: Project;
  floors: Floor[];
  currentFloor: Floor;
  elevators: Elevator[];
}) {
  const firstDestination = useMemo(
    () => floors.find((floor) => floor.id !== currentFloor.id && floor.active)?.id ?? "",
    [currentFloor.id, floors],
  );
  const [destinationId, setDestinationId] = useState(firstDestination);
  const [passengerCount, setPassengerCount] = useState(1);
  const [priority, setPriority] = useState(false);
  const [showSpecialNeed, setShowSpecialNeed] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [submittedRequest, setSubmittedRequest] = useState<SubmittedRequest | null>(null);
  const [liveElevators, setLiveElevators] = useState(elevators);
  const [passengerResumeReady, setPassengerResumeReady] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const { t } = useLanguage();
  const prioritiesEnabled = project.priorities_enabled !== false;
  const liveDispatch = useMemo(() => {
    const tz = project.service_timezone ?? DEFAULT_PROJECT_TIMEZONE;
    const analysis = analyzePassengerDispatch({ elevators: liveElevators, timeZone: tz });
    const hourRanges = uniqueServiceHourRanges(liveElevators.filter((elevator) => elevator.active !== false));
    return {
      canDispatch: analysis.canDispatch,
      blockReason: analysis.blockReason,
      hourRanges,
      dispatchOperators: analysis.canDispatch
        ? passengerDispatchOperatorSummaries(analysis.dispatchableElevators, tz)
        : [],
    };
  }, [liveElevators, project.service_timezone]);
  const currentElevatorFloor = floors.find((floor) => floor.id === demoElevator.current_floor_id);
  const estimatedArrival = estimateArrivalWindow({
    currentElevatorSortOrder: currentElevatorFloor?.sort_order ?? currentFloor.sort_order,
    passengerFloorSortOrder: currentFloor.sort_order,
    pendingRequestsAhead: 0,
  });

  const dispatchBlocked = !liveDispatch.canDispatch;
  const serviceHoursLabel =
    liveDispatch.hourRanges.length > 0
      ? liveDispatch.hourRanges
          .map((r) => `${formatPostgresTimeToAmPm(r.start)}–${formatPostgresTimeToAmPm(r.end)}`)
          .join(", ")
      : `${formatPostgresTimeToAmPm("07:00")}–${formatPostgresTimeToAmPm("15:00")}`;

  useEffect(() => {
    const id = window.setTimeout(() => setLiveElevators(elevators), 0);
    return () => window.clearTimeout(id);
  }, [elevators]);

  useEffect(() => {
    const client = createClient();
    const channel = subscribeToTable<ElevatorRealtimePayload>({
      client,
      table: "elevators",
      filter: `project_id=eq.${project.id}`,
      onChange: (payload) => {
        if (payload.eventType === "DELETE") {
          setLiveElevators((current) => current.filter((elevator) => elevator.id !== payload.old.id));
          return;
        }
        if (!payload.new?.id) return;
        setLiveElevators((current) =>
          current.some((elevator) => elevator.id === payload.new.id)
            ? current.map((elevator) => (elevator.id === payload.new.id ? { ...elevator, ...payload.new } : elevator))
            : [...current, payload.new],
        );
      },
    });

    return () => unsubscribe(client, channel);
  }, [project.id]);

  useEffect(() => {
    if (!prioritiesEnabled) {
      const id = window.setTimeout(() => {
        setPriority(false);
        setShowSpecialNeed(false);
      }, 0);
      return () => window.clearTimeout(id);
    }
  }, [prioritiesEnabled]);

  useEffect(() => {
    let cancelled = false;

    async function verifyStoredRequest() {
      const raw =
        typeof window !== "undefined"
          ? window.localStorage.getItem(passengerPendingRequestStorageKey(project.id, currentFloor.qr_token))
          : null;

      if (!raw) {
        setPassengerResumeReady(true);
        return;
      }

      const localSnap = loadPassengerPendingSnapshot(raw);
      if (!localSnap) {
        clearPassengerPendingRequest(project.id, currentFloor.qr_token);
        setPassengerResumeReady(true);
        return;
      }

      if (localSnap.requestId === "demo-local-request") {
        if (project.id !== demoProject.id) {
          clearPassengerPendingRequest(project.id, currentFloor.qr_token, "demo-local-request");
        } else if (!cancelled) {
          setSubmittedRequest({
            requestId: localSnap.requestId,
            status: localSnap.status ?? "pending",
            waitStartedAt: localSnap.waitStartedAt,
            fromFloorId: localSnap.fromFloorId,
            toFloorId: localSnap.toFloorId,
            passengerCount: localSnap.passengerCount,
          });
          setDestinationId(localSnap.toFloorId);
        }
        if (!cancelled) setPassengerResumeReady(true);
        return;
      }

      const res = await resumePassengerRequest(project.id, currentFloor.qr_token, localSnap.requestId);
      if (cancelled) return;

      if (!res.ok || !res.snapshot) {
        clearPassengerPendingRequest(project.id, currentFloor.qr_token);
        if (!cancelled) setPassengerResumeReady(true);
        return;
      }

      if (!shouldRestoreSubmittedFromSnapshot(res.snapshot.status)) {
        clearPassengerPendingRequest(project.id, currentFloor.qr_token);
        setMessage(requestInvalidatedMessage(res.snapshot.status, t));
        if (!cancelled) setPassengerResumeReady(true);
        return;
      }

      const normalized: typeof res.snapshot = res.snapshot;
      savePassengerPendingRequest(project.id, currentFloor.qr_token, {
        requestId: normalized.requestId,
        waitStartedAt: normalized.waitStartedAt,
        fromFloorId: normalized.fromFloorId,
        toFloorId: normalized.toFloorId,
        passengerCount: normalized.passengerCount,
        status: normalized.status,
      });

      if (!cancelled) {
        setSubmittedRequest({
          requestId: normalized.requestId,
          status: normalized.status ?? "pending",
          waitStartedAt: normalized.waitStartedAt,
          fromFloorId: normalized.fromFloorId,
          toFloorId: normalized.toFloorId,
          passengerCount: normalized.passengerCount,
        });
        setDestinationId(normalized.toFloorId);
      }

      if (!cancelled) setPassengerResumeReady(true);
    }

    void verifyStoredRequest();

    return () => {
      cancelled = true;
    };
  }, [project.id, currentFloor.qr_token, t]);

  useEffect(() => {
    if (!submittedRequest || submittedRequest.requestId === "demo-local-request") {
      return;
    }

    const requestIdTracked = submittedRequest.requestId;

    const client = createClient();
    const channel = subscribeToTable<{ new: HoistRequest }>({
      client,
      table: "requests",
      filter: `id=eq.${requestIdTracked}`,
      onChange: (payload) => {
        if (payload.new?.status) {
          const next = payload.new.status as RequestStatus;
          if (next === "boarded") {
            clearPassengerPendingRequest(project.id, currentFloor.qr_token, requestIdTracked);
            setSubmittedRequest(null);
            router.replace("/");
            return;
          }
          if (clearsPassengerPendingStorage(next)) {
            clearPassengerPendingRequest(project.id, currentFloor.qr_token, requestIdTracked);
            setSubmittedRequest(null);
            setMessage(requestInvalidatedMessage(next, t));
            return;
          }
          setSubmittedRequest((current) => current && { ...current, status: next });
        }
      },
    });

    return () => unsubscribe(client, channel);
  }, [submittedRequest, project.id, currentFloor.qr_token, router, t]);

  useEffect(() => {
    const requestId = submittedRequest?.requestId;
    if (!requestId || requestId === "demo-local-request") {
      return;
    }
    const trackedRequestId = requestId;

    async function pollOnce() {
      const res = await resumePassengerRequest(project.id, currentFloor.qr_token, trackedRequestId);
      if (!res.ok || !res.snapshot) return;
      const snap = res.snapshot;
      if (snap.status === "boarded") {
        clearPassengerPendingRequest(project.id, currentFloor.qr_token, trackedRequestId);
        setSubmittedRequest(null);
        router.replace("/");
        return;
      }
      if (clearsPassengerPendingStorage(snap.status)) {
        clearPassengerPendingRequest(project.id, currentFloor.qr_token, trackedRequestId);
        setSubmittedRequest(null);
        setMessage(requestInvalidatedMessage(snap.status, t));
        return;
      }
      setSubmittedRequest((prev) =>
        prev?.requestId === snap.requestId
          ? {
              ...prev,
              status: snap.status,
              passengerCount: snap.passengerCount,
              waitStartedAt: snap.waitStartedAt,
            }
          : prev,
      );
    }

    const intervalId = window.setInterval(() => void pollOnce(), 15_000);
    void pollOnce();
    return () => window.clearInterval(intervalId);
  }, [submittedRequest?.requestId, project.id, currentFloor.qr_token, router, t]);

  if (!passengerResumeReady) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-[1.75rem] bg-white p-8 text-center text-slate-950 shadow-sm">
        <Loader2 className="size-10 animate-spin text-slate-400" aria-hidden />
        <p className="text-sm font-bold text-slate-600">{t("request.resumeLoading")}</p>
      </div>
    );
  }

  if (submittedRequest) {
    const tripToFloor = floors.find((floor) => floor.id === submittedRequest.toFloorId);
    const canCancel = submittedRequest.status !== "boarded" && submittedRequest.status !== "completed";
    const submittedRequestId = submittedRequest.requestId;

    async function cancelAndReset() {
      const result = await updateRequestStatus(submittedRequestId, "cancelled", "Annule par le passager.");
      if (result.ok) {
        clearPassengerPendingRequest(project.id, currentFloor.qr_token, submittedRequestId);
        setSubmittedRequest(null);
        setMessage(t("request.cancelled"));
        setPassengerCount(1);
        setPriority(false);
        setShowSpecialNeed(false);
      } else {
        setMessage(result.message);
      }
    }

    return (
      <section className="flex flex-1 flex-col justify-between gap-4 rounded-[1.75rem] bg-white p-5 text-slate-950 shadow-sm">
        <div className="grid gap-4">
          <div
            className={
              liveDispatch.canDispatch
                ? "rounded-[1.5rem] bg-emerald-50 p-5 text-emerald-950"
                : "rounded-[1.5rem] border border-red-200 bg-red-50 p-5 text-red-950"
            }
          >
            {liveDispatch.canDispatch ? (
              <CheckCircle2 className="text-emerald-600" size={44} />
            ) : (
              <ShieldAlert className="text-red-700" size={44} />
            )}
            <h2 className="mt-4 text-3xl font-black">{t("request.sent")}</h2>
            <p className="mt-3 text-base font-bold leading-7">
              {liveDispatch.canDispatch ? t("request.sentBody") : t("request.dispatchNoOperator")}
            </p>
          </div>

          <div className="rounded-[1.5rem] border-2 border-slate-100 bg-slate-50 p-4">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-500">{t("request.trip")}</p>
            <p className="mt-2 text-4xl font-black">
              {formatFloorLabel(currentFloor)} {"->"} {formatFloorLabel(tripToFloor)}
            </p>
            <p className="mt-2 text-sm font-bold text-slate-600">
              {submittedRequest.passengerCount} {t("common.passengers").toLowerCase()}
            </p>
          </div>

          <div
            className={
              liveDispatch.canDispatch
                ? "rounded-[1.5rem] bg-yellow-300 p-4 text-slate-950"
                : "rounded-[1.5rem] bg-slate-100 p-4 text-slate-700"
            }
          >
            <div className="flex items-center gap-3">
              {liveDispatch.canDispatch ? <Clock size={28} /> : <ShieldAlert size={28} />}
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] opacity-70">{t("request.eta")}</p>
                <p className="text-xl font-black">
                  {liveDispatch.canDispatch
                    ? t("eta.label", { min: estimatedArrival.min, max: estimatedArrival.max })
                    : t("request.dispatchNoOperator")}
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-[1.5rem] border border-slate-200 bg-white p-4">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">{t("common.status")}</p>
            <p className="mt-1 text-2xl font-black">{t(`status.${submittedRequest.status}` as const)}</p>
          </div>
        </div>

        {canCancel ? (
          <button
            type="button"
            onClick={cancelAndReset}
            className="touch-target flex w-full items-center justify-center gap-2 rounded-[1.35rem] border-2 border-red-200 bg-red-50 px-5 py-4 text-lg font-black text-red-800"
          >
            <XCircle size={22} />
            {t("request.cancelRestart")}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => {
              clearPassengerPendingRequest(project.id, currentFloor.qr_token, submittedRequest.requestId);
              setSubmittedRequest(null);
              setMessage(null);
            }}
            className="touch-target flex w-full items-center justify-center rounded-[1.35rem] bg-slate-100 px-5 py-4 text-lg font-black text-slate-700"
          >
            {t("request.backToRequest")}
          </button>
        )}
      </section>
    );
  }

  return (
    <>
      {liveDispatch.canDispatch ? (
        <div className="shrink-0 rounded-[1.25rem] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-950">
          {liveDispatch.dispatchOperators.length > 0 ? (
            <ul className="list-none space-y-3 leading-snug">
              {liveDispatch.dispatchOperators.map((op, idx) => {
                const name = op.displayName?.trim() || t("request.dispatchOperatorFallback");
                return (
                  <li
                    key={`${op.displayName ?? ""}-${op.hoursRange}-${op.outsideScheduledHours}-${idx}`}
                    className={
                      op.outsideScheduledHours
                        ? "rounded-xl border border-amber-300/80 bg-amber-50/90 px-3 py-2 text-amber-950"
                        : ""
                    }
                  >
                    {op.outsideScheduledHours ? (
                      <>
                        <p>
                          <span className="font-black">{name}</span> {t("request.dispatchOperatorOnlineStatus")}
                        </p>
                        <p className="mt-1.5 text-[13px] font-bold leading-snug opacity-95">
                          {t("request.dispatchOutsideScheduleExplainer")}
                        </p>
                      </>
                    ) : (
                      <p>
                        <span className="font-black">{name}</span>{" "}
                        <span className="font-bold opacity-90">({op.hoursRange})</span>
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p>
              <span className="font-black">{t("request.dispatchOperatorFallback")}</span>{" "}
              <span className="font-bold opacity-90">({serviceHoursLabel})</span>
            </p>
          )}
        </div>
      ) : (
        <div className="shrink-0 rounded-[1.25rem] border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-950">
          {t("request.dispatchNoOperator")}
        </div>
      )}

      <form
        action={(formData) => {
          startTransition(async () => {
            const result = await createPassengerRequest(formData);
            setMessage(result.message);
            if (result.ok && result.requestId) {
              savePassengerPendingRequest(project.id, currentFloor.qr_token, {
                requestId: result.requestId,
                waitStartedAt: result.waitStartedAt ?? new Date().toISOString(),
                fromFloorId: result.fromFloorId ?? currentFloor.id,
                toFloorId: result.toFloorId ?? destinationId,
                passengerCount: result.passengerCount ?? passengerCount,
                status: result.status ?? "pending",
              });
              setSubmittedRequest({
                requestId: result.requestId,
                status: result.status ?? "pending",
                waitStartedAt: result.waitStartedAt ?? new Date().toISOString(),
                fromFloorId: result.fromFloorId ?? currentFloor.id,
                toFloorId: result.toFloorId ?? destinationId,
                passengerCount: result.passengerCount ?? passengerCount,
              });
            }
          });
        }}
        className={`flex min-h-0 flex-1 flex-col gap-3${dispatchBlocked ? " pointer-events-none opacity-50" : ""}`}
      >
      <input type="hidden" name="projectId" value={project.id} />
      <input type="hidden" name="fromFloorId" value={currentFloor.id} />
      <input type="hidden" name="toFloorId" value={destinationId} />

      <section className="flex min-h-0 flex-col rounded-[1.5rem] bg-white p-3 text-slate-950 shadow-sm">
        <div className="mb-3 shrink-0 rounded-[1.25rem] bg-yellow-300 p-3 text-slate-950">
          <p className="text-xs font-black uppercase tracking-[0.2em] opacity-70">{t("request.currentFloor")}</p>
          <div className="mt-1 flex items-end justify-between gap-3">
            <p className="text-5xl font-black leading-none">{formatFloorLabel(currentFloor)}</p>
            <p className="pb-1 text-right text-xs font-black leading-4">{t("request.detectedQr")}</p>
          </div>
        </div>

        <h2 className="mb-2 shrink-0 text-xl font-black text-slate-950">{t("request.where")}</h2>
        <FloorSelector
          floors={floors}
          currentFloorId={currentFloor.id}
          selectedFloorId={destinationId}
          onSelect={setDestinationId}
        />
      </section>

      <section className="sticky bottom-3 z-20 shrink-0 rounded-[1.5rem] bg-white p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] text-slate-950 shadow-[0_-14px_40px_rgba(15,23,42,0.18)]">
        <label className="block">
          <span className="flex items-center gap-2 text-base font-black">
            <Users size={18} /> {t("common.passengers")}
          </span>
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPassengerCount((value) => Math.max(1, value - 1))}
              className="touch-target size-14 rounded-2xl border-2 border-slate-200 bg-slate-100 text-3xl font-black text-slate-950 active:scale-95"
            >
              -
            </button>
            <input
              name="passengerCount"
              type="number"
              min="1"
              value={passengerCount}
              onChange={(event) => setPassengerCount(Number(event.target.value))}
              className="h-14 w-full rounded-2xl border-2 border-slate-200 bg-white px-4 text-center text-3xl font-black text-slate-950 outline-none focus:border-yellow-300"
            />
            <button
              type="button"
              onClick={() => setPassengerCount((value) => value + 1)}
              className="touch-target size-14 rounded-2xl bg-yellow-300 text-3xl font-black text-slate-950 active:scale-95"
            >
              +
            </button>
          </div>
        </label>

        {prioritiesEnabled ? (
          <>
            <button
              type="button"
              onClick={() => setShowSpecialNeed((value) => !value)}
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-black text-slate-700 active:scale-[0.99]"
            >
              <ShieldAlert size={16} />
              {t("request.special")}
            </button>

            {showSpecialNeed ? (
              <div className="mt-2 rounded-2xl border border-orange-200 bg-orange-50 p-3">
                <label className="flex cursor-pointer items-center justify-between gap-4">
                  <span className="text-sm font-black text-slate-950">{t("request.urgent")}</span>
                  <input
                    name="priority"
                    type="checkbox"
                    checked={priority}
                    onChange={(event) => setPriority(event.target.checked)}
                    className="size-8 accent-yellow-300"
                  />
                </label>
                <textarea
                  name="priorityReason"
                  required={priority}
                  rows={1}
                  className="mt-2 w-full rounded-2xl border border-orange-200 bg-white p-3 text-sm text-slate-950 outline-none focus:border-yellow-300"
                  placeholder={t("request.urgentPlaceholder")}
                />
              </div>
            ) : null}
          </>
        ) : null}

        <button
          type="submit"
          disabled={isPending || dispatchBlocked}
          className="touch-target mt-3 flex w-full items-center justify-center gap-3 rounded-[1.35rem] bg-slate-950 px-5 py-4 text-lg font-black text-white shadow-xl transition active:scale-[0.99] disabled:opacity-60"
        >
          <Send size={22} />
          {isPending ? t("request.sending") : t("request.submit")}
        </button>

        {message && (
          <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-900">
            {message}
          </div>
        )}
      </section>
    </form>
    </>
  );
}
