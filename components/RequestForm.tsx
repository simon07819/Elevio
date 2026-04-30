"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { CheckCircle2, Clock, Send, ShieldAlert, Users, XCircle } from "lucide-react";
import { createPassengerRequest, updateRequestStatus } from "@/lib/actions";
import { createClient } from "@/lib/supabase/client";
import { subscribeToTable, unsubscribe } from "@/lib/realtime";
import { estimateArrivalWindow, formatFloorLabel, formatPostgresTimeToAmPm } from "@/lib/utils";
import { demoElevator } from "@/lib/demoData";
import type { Floor, HoistRequest, Project, RequestStatus } from "@/types/hoist";
import type { PassengerDispatchState } from "@/lib/operatorDispatchAvailability";
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

export function RequestForm({
  project,
  floors,
  currentFloor,
  dispatch,
}: {
  project: Project;
  floors: Floor[];
  currentFloor: Floor;
  dispatch: PassengerDispatchState;
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
  const [isPending, startTransition] = useTransition();
  const { t } = useLanguage();
  const prioritiesEnabled = project.priorities_enabled !== false;
  const destinationFloor = floors.find((floor) => floor.id === destinationId);
  const currentElevatorFloor = floors.find((floor) => floor.id === demoElevator.current_floor_id);
  const estimatedArrival = estimateArrivalWindow({
    currentElevatorSortOrder: currentElevatorFloor?.sort_order ?? currentFloor.sort_order,
    passengerFloorSortOrder: currentFloor.sort_order,
    pendingRequestsAhead: 0,
  });

  const dispatchBlocked = !dispatch.canDispatch;
  const serviceHoursLabel =
    dispatch.hourRanges.length > 0
      ? dispatch.hourRanges
          .map((r) => `${formatPostgresTimeToAmPm(r.start)}–${formatPostgresTimeToAmPm(r.end)}`)
          .join(", ")
      : `${formatPostgresTimeToAmPm("07:00")}–${formatPostgresTimeToAmPm("15:00")}`;

  useEffect(() => {
    if (!prioritiesEnabled) {
      setPriority(false);
      setShowSpecialNeed(false);
    }
  }, [prioritiesEnabled]);

  useEffect(() => {
    if (!submittedRequest || submittedRequest.requestId === "demo-local-request") {
      return;
    }

    const client = createClient();
    const channel = subscribeToTable<{ new: HoistRequest }>({
      client,
      table: "requests",
      filter: `id=eq.${submittedRequest.requestId}`,
      onChange: (payload) => {
        if (payload.new?.status) {
          setSubmittedRequest((current) => current && { ...current, status: payload.new.status });
        }
      },
    });

    return () => unsubscribe(client, channel);
  }, [submittedRequest]);

  if (submittedRequest) {
    const canCancel = submittedRequest.status !== "boarded" && submittedRequest.status !== "completed";
    const submittedRequestId = submittedRequest.requestId;

    async function cancelAndReset() {
      const result = await updateRequestStatus(submittedRequestId, "cancelled", "Annule par le passager.");
      if (result.ok) {
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
          <div className="rounded-[1.5rem] bg-emerald-50 p-5 text-emerald-950">
            <CheckCircle2 className="text-emerald-600" size={44} />
            <h2 className="mt-4 text-3xl font-black">{t("request.sent")}</h2>
            <p className="mt-3 text-base font-bold leading-7">
              {t("request.sentBody")}
            </p>
          </div>

          <div className="rounded-[1.5rem] border-2 border-slate-100 bg-slate-50 p-4">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-500">{t("request.trip")}</p>
            <p className="mt-2 text-4xl font-black">
              {formatFloorLabel(currentFloor)} {"->"} {formatFloorLabel(destinationFloor)}
            </p>
            <p className="mt-2 text-sm font-bold text-slate-600">
              {submittedRequest.passengerCount} {t("common.passengers").toLowerCase()}
            </p>
          </div>

          <div className="rounded-[1.5rem] bg-yellow-300 p-4 text-slate-950">
            <div className="flex items-center gap-3">
              <Clock size={28} />
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] opacity-70">{t("request.eta")}</p>
                <p className="text-xl font-black">
                  {t("eta.label", { min: estimatedArrival.min, max: estimatedArrival.max })}
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
      {dispatch.canDispatch ? (
        <div className="shrink-0 rounded-[1.25rem] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-950">
          {dispatch.dispatchOperators.length > 0 ? (
            <ul className="list-none space-y-3 leading-snug">
              {dispatch.dispatchOperators.map((op, idx) => {
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
