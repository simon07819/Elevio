"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Clock, Loader2, Navigation, Send, ShieldAlert, UserCheck, Users, XCircle } from "lucide-react";
import { createPassengerRequest, resumePassengerRequest, updateRequestStatus } from "@/lib/actions";
import { createClient } from "@/lib/supabase/client";
import { cancelPassengerRequestClient } from "@/lib/passengerCancelClient";
import { resumePassengerRequestClient } from "@/lib/passengerResumeClient";
import { useNetworkStatus } from "@/lib/useNetworkStatus";
import {
  PASSENGER_BROADCAST_QUEUE_CLEARED,
  PASSENGER_BROADCAST_REQUEST_BOARDED,
  PASSENGER_BROADCAST_REQUEST_CANCELLED,
  passengerProjectBroadcastChannel,
} from "@/lib/passengerNotifyBroadcast";
import { subscribeToTable, unsubscribe, type ElevatorRealtimePayload } from "@/lib/realtime";
import { logSync, logAction } from "@/lib/stateResolution";
import { formatFloorLabel } from "@/lib/utils";
import { demoProject } from "@/lib/demoData";
import type { Elevator, Floor, Project, RequestStatus } from "@/types/hoist";
import {
  analyzePassengerDispatch,
  passengerDispatchOperatorSummaries,
  DEFAULT_PROJECT_TIMEZONE,
} from "@/lib/operatorDispatchAvailability";
import { maxPassengerPartySize } from "@/lib/passengerPartyLimits";
import { getOrCreatePassengerDeviceKey } from "@/lib/passengerDeviceKey";
import {
  clearPassengerPendingRequest,
  qrTokenForFloorId,
  passengerPendingSnapshotIndicatesTracking,
  readPassengerPendingProjectScoped,
  savePassengerPendingRequest,
} from "@/lib/passengerRequestPersistence";
import { FloorSelector } from "@/components/FloorSelector";
import { useLanguage } from "@/components/i18n/LanguageProvider";

async function fetchPassengerResumeSnapshot(projectId: string, floorQrToken: string, requestId: string) {
  const client = createClient();
  if (client) {
    const fromBrowser = await resumePassengerRequestClient(projectId, floorQrToken, requestId);
    if (fromBrowser.ok) {
      return fromBrowser;
    }
  }
  return resumePassengerRequest(projectId, floorQrToken, requestId);
}

type SubmittedRequest = {
  requestId: string;
  status: RequestStatus;
  waitStartedAt: string;
  fromFloorId: string;
  toFloorId: string;
  passengerCount: number;
};

const PASSENGER_ELEVATORS_SELECT =
  "id,project_id,name,current_floor_id,direction,capacity,current_load,active,operator_session_id,operator_display_name,operator_session_heartbeat_at,service_start_time,service_end_time,manual_full";
const PASSENGER_ACTIVE_REQUEST_POLL_MS = 250;

function isTerminalPassengerRequestStatus(status: RequestStatus): boolean {
  return status === "completed" || status === "cancelled";
}

/** Après ramassage opérateur : plus de suivi passager — retour scan QR requis. */
function clearsPassengerPendingStorage(status: RequestStatus): boolean {
  return status === "boarded" || status === "completed";
}

/** Quand le passager annule lui-même : on reste dans le flow de sélection. */
function isPassengerSelfCancelStatus(status: RequestStatus): boolean {
  return status === "cancelled";
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
  onActivePassengerSessionChange,
}: {
  project: Project;
  floors: Floor[];
  currentFloor: Floor;
  elevators: Elevator[];
  onActivePassengerSessionChange?: (hideScanLink: boolean) => void;
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
  const [dispatchSyncReady, setDispatchSyncReady] = useState(() => {
    const tz = project.service_timezone ?? DEFAULT_PROJECT_TIMEZONE;
    return analyzePassengerDispatch({ elevators, timeZone: tz }).canDispatch;
  });
  const [passengerDeviceKey, setPassengerDeviceKey] = useState(() =>
    typeof window === "undefined" ? "" : getOrCreatePassengerDeviceKey(project.id),
  );
  const [passengerResumeReady, setPassengerResumeReady] = useState(false);
  const [isSubmittingRequest, setIsSubmittingRequest] = useState(false);
  const [isCancellingRequest, setIsCancellingRequest] = useState(false);
  const [isPending, startTransition] = useTransition();
  const isOnline = useNetworkStatus(() => {
    // On back online: force a sync refresh of elevators + router refresh
    router.refresh();
  });
  const router = useRouter();
  const { t } = useLanguage();
  const prioritiesEnabled = project.priorities_enabled !== false;
  const capacityEnabled = project.capacity_enabled !== false;
  // Pre-subscribed passenger broadcast channel for instant QR reset on pickup.
  // requestIdRef is always current so the .on() handlers registered at mount time
  // can check against the latest request — no race with the submittedRequest effect.
  const requestIdRef = useRef<string | null>(null);
  const passengerBroadcastRef = useRef<{ channel: unknown; ready: boolean } | null>(null);
  useEffect(() => {
    const client = createClient();
    if (!client) return;
    const ch = client.channel(passengerProjectBroadcastChannel(project.id));
    const ref = { channel: ch, ready: false };

    // Register .on() handlers IMMEDIATELY on the pre-subscribed channel.
    // This eliminates the race where the broadcast arrives between channel
    // subscription and the submittedRequest effect attaching handlers.
    (ch as ReturnType<typeof client.channel>)
      .on(
        "broadcast",
        { event: PASSENGER_BROADCAST_REQUEST_BOARDED },
        (msg: { payload?: { requestIds?: string[] } | string[] }) => {
          const rid = requestIdRef.current;
          const raw = msg.payload;
          const ids = Array.isArray(raw) ? raw : raw?.requestIds;
          logSync("passengerBroadcast", { event: "request_boarded", rid: rid?.slice(0,8), match: ids?.includes(rid ?? "") });
          if (!rid) return;
          if (!ids?.includes(rid)) return;
          logAction("passengerPickupRedirect", { requestId: rid.slice(0,8), source: "broadcast_pre_subbed" });
          clearPassengerPendingRequest(project.id, rid);
          setSubmittedRequest(null);
          router.replace("/");
        },
      )
      .on(
        "broadcast",
        { event: PASSENGER_BROADCAST_QUEUE_CLEARED },
        (msg: { payload?: { requestIds?: string[] } | string[] }) => {
          const rid = requestIdRef.current;
          const raw = msg.payload;
          const ids = Array.isArray(raw) ? raw : raw?.requestIds;
          logSync("passengerBroadcast", { event: "queue_cleared", rid: rid?.slice(0,8), match: ids?.includes(rid ?? "") });
          if (!rid) return;
          if (!ids?.includes(rid)) return;
          logAction("passengerQueueCleared", { requestId: rid.slice(0,8), source: "broadcast_pre_subbed" });
          clearPassengerPendingRequest(project.id, rid);
          setSubmittedRequest(null);
          setMessage(t("request.cancelled"));
        },
      )
      .on(
        "broadcast",
        { event: PASSENGER_BROADCAST_REQUEST_CANCELLED },
        (msg: { payload?: { requestIds?: string[] } | string[] }) => {
          const rid = requestIdRef.current;
          const raw = msg.payload;
          const ids = Array.isArray(raw) ? raw : raw?.requestIds;
          logSync("passengerBroadcast", { event: "request_cancelled", rid: rid?.slice(0,8), match: ids?.includes(rid ?? "") });
          if (!rid) return;
          if (!ids?.includes(rid)) return;
          logAction("passengerRequestCancelled", { requestId: rid.slice(0,8), source: "broadcast_pre_subbed" });
          clearPassengerPendingRequest(project.id, rid);
          setSubmittedRequest(null);
          setMessage(t("request.cancelledByOperator"));
        },
      );

    ch.subscribe((status: string) => {
      if (status === "SUBSCRIBED") ref.ready = true;
    });
    passengerBroadcastRef.current = ref;
    return () => {
      client.removeChannel(ch);
      passengerBroadcastRef.current = null;
    };
  }, [project.id]);
  // Keep requestIdRef in sync with submittedRequest so that the .on() handlers
  // registered on the pre-subscribed channel (at mount time) always check the
  // correct request ID — no race condition.
  useEffect(() => {
    requestIdRef.current = submittedRequest?.requestId ?? null;
  }, [submittedRequest?.requestId]);
  const passengerMax = useMemo(
    () => maxPassengerPartySize(capacityEnabled, liveElevators),
    [capacityEnabled, liveElevators],
  );
  const liveDispatch = useMemo(() => {
    const tz = project.service_timezone ?? DEFAULT_PROJECT_TIMEZONE;
    const analysis = analyzePassengerDispatch({ elevators: liveElevators, timeZone: tz });
    return {
      canDispatch: analysis.canDispatch,
      blockReason: analysis.blockReason,
      dispatchOperators: analysis.canDispatch
        ? passengerDispatchOperatorSummaries(analysis.dispatchableElevators, tz)
        : [],
    };
  }, [liveElevators, project.service_timezone]);

  useEffect(() => {
    const id = window.setTimeout(() => setPassengerDeviceKey(getOrCreatePassengerDeviceKey(project.id)), 0);
    return () => window.clearTimeout(id);
  }, [project.id]);

  useEffect(() => {
    if (!onActivePassengerSessionChange) return;
    const snap = typeof window !== "undefined" ? readPassengerPendingProjectScoped(project.id) : null;
    const resumeBlocking =
      !passengerResumeReady && passengerPendingSnapshotIndicatesTracking(snap);
    const hideScanLink = submittedRequest !== null || resumeBlocking;
    onActivePassengerSessionChange(hideScanLink);
  }, [submittedRequest, passengerResumeReady, project.id, onActivePassengerSessionChange]);

  const dispatchResolving = !dispatchSyncReady && !liveDispatch.canDispatch;
  const dispatchBlocked = !liveDispatch.canDispatch;

  useEffect(() => {
    const id = window.setTimeout(() => setLiveElevators(elevators), 0);
    return () => window.clearTimeout(id);
  }, [elevators]);

  useEffect(() => {
    const id = window.setTimeout(() => {
      setPassengerCount((current) => {
        const base = Number.isFinite(current) ? Math.floor(current) : 1;
        return Math.min(Math.max(1, base), passengerMax);
      });
    }, 0);
    return () => window.clearTimeout(id);
  }, [passengerMax]);

  useEffect(() => {
    const client = createClient();

    async function syncElevators() {
      if (!client) {
        setDispatchSyncReady(true);
        return;
      }
      const { data } = await client
        .from("elevators")
        .select(PASSENGER_ELEVATORS_SELECT)
        .eq("project_id", project.id)
        .eq("active", true);

      if (data) {
        setLiveElevators(data as Elevator[]);
      }
      setDispatchSyncReady(true);
    }

    void syncElevators();
    const pollId = window.setInterval(syncElevators, 2_000);

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

    return () => {
      window.clearInterval(pollId);
      unsubscribe(client, channel);
    };
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
      const localSnap = readPassengerPendingProjectScoped(project.id);

      if (!localSnap) {
        setPassengerResumeReady(true);
        return;
      }

      if (localSnap.requestId === "demo-local-request") {
        if (project.id !== demoProject.id) {
          clearPassengerPendingRequest(project.id, "demo-local-request");
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

      const originQr = qrTokenForFloorId(floors, localSnap.fromFloorId);
      if (!originQr) {
        clearPassengerPendingRequest(project.id);
        if (!cancelled) setPassengerResumeReady(true);
        return;
      }

      const res = await fetchPassengerResumeSnapshot(project.id, originQr, localSnap.requestId);
      if (cancelled) return;

      if (!res.ok || !res.snapshot) {
        clearPassengerPendingRequest(project.id);
        if (!cancelled) setPassengerResumeReady(true);
        return;
      }

      if (!shouldRestoreSubmittedFromSnapshot(res.snapshot.status)) {
        clearPassengerPendingRequest(project.id);
        setMessage(requestInvalidatedMessage(res.snapshot.status, t));
        if (!cancelled) setPassengerResumeReady(true);
        return;
      }

      const normalized: typeof res.snapshot = res.snapshot;
      savePassengerPendingRequest(project.id, {
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
  }, [project.id, floors, t]);

  useEffect(() => {
    const client = createClient();
    const rid = submittedRequest?.requestId;
    if (!client || !rid || rid === "demo-local-request") {
      return;
    }

    // The pre-subscribed channel already has .on() handlers registered at mount
    // time (using requestIdRef). Only create a fallback channel if the
    // pre-subscribed channel wasn't ready when this effect runs.
    const preSubbed = passengerBroadcastRef.current;
    if (preSubbed?.channel && preSubbed.ready) {
      // Pre-subscribed channel is already listening — no extra work needed.
      return;
    }

    // Fallback: create a new channel with its own .on() handlers.
    const channel = client.channel(passengerProjectBroadcastChannel(project.id));

    channel
      .on(
        "broadcast",
        { event: PASSENGER_BROADCAST_QUEUE_CLEARED },
        (msg: { payload?: { requestIds?: string[] } | string[] }) => {
          const raw = msg.payload;
          const ids = Array.isArray(raw) ? raw : raw?.requestIds;
          if (!ids?.includes(rid)) return;
          clearPassengerPendingRequest(project.id, rid);
          setSubmittedRequest(null);
          setMessage(t("request.cancelled"));
        },
      )
      .on(
        "broadcast",
        { event: PASSENGER_BROADCAST_REQUEST_BOARDED },
        (msg: { payload?: { requestIds?: string[] } | string[] }) => {
          const raw = msg.payload;
          const ids = Array.isArray(raw) ? raw : raw?.requestIds;
          if (!ids?.includes(rid)) return;
          clearPassengerPendingRequest(project.id, rid);
          setSubmittedRequest(null);
          router.replace("/");
        },
      )
      .on(
        "broadcast",
        { event: PASSENGER_BROADCAST_REQUEST_CANCELLED },
        (msg: { payload?: { requestIds?: string[] } | string[] }) => {
          const raw = msg.payload;
          const ids = Array.isArray(raw) ? raw : raw?.requestIds;
          if (!ids?.includes(rid)) return;
          clearPassengerPendingRequest(project.id, rid);
          setSubmittedRequest(null);
          setMessage(t("request.cancelledByOperator"));
        },
      )
      .subscribe();

    return () => {
      client.removeChannel(channel);
    };
  }, [submittedRequest?.requestId, project.id, router]);

  useEffect(() => {
    const requestId = submittedRequest?.requestId;
    const fromFloorIdResolved = submittedRequest?.fromFloorId;
    if (!requestId || requestId === "demo-local-request" || !fromFloorIdResolved) {
      return;
    }
    const trackedRequestId = requestId;
    const trackedFromFloorId = fromFloorIdResolved;

    async function pollOnce() {
      const originQr = qrTokenForFloorId(floors, trackedFromFloorId) ?? currentFloor.qr_token;
      const res = await fetchPassengerResumeSnapshot(project.id, originQr, trackedRequestId);
      if (!res.ok || !res.snapshot) return;
      const snap = res.snapshot;
      logSync("passengerPollOnce", { requestId: trackedRequestId.slice(0,8), status: snap.status });
      if (snap.status === "boarded") {
        logAction("passengerPickupRedirect", { requestId: trackedRequestId.slice(0,8), source: "poll" });
        clearPassengerPendingRequest(project.id, trackedRequestId);
        setSubmittedRequest(null);
        router.replace("/");
        return;
      }
      if (isPassengerSelfCancelStatus(snap.status)) {
        // Cancelled (by passenger or operator) — stay in flow, don't force to QR.
        clearPassengerPendingRequest(project.id, trackedRequestId);
        setSubmittedRequest(null);
        setMessage(t("request.cancelled"));
        return;
      }
      if (clearsPassengerPendingStorage(snap.status)) {
        clearPassengerPendingRequest(project.id, trackedRequestId);
        setSubmittedRequest(null);
        router.replace("/");
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

    const intervalId = window.setInterval(() => void pollOnce(), PASSENGER_ACTIVE_REQUEST_POLL_MS);
    void pollOnce();

    function onVisible() {
      if (document.visibilityState === "visible") {
        void pollOnce();
      }
    }
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [submittedRequest?.requestId, submittedRequest?.fromFloorId, project.id, floors, currentFloor.qr_token, router, t]);

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
    const canCancel = isOnline && submittedRequest.status !== "boarded" && submittedRequest.status !== "completed";
    const submittedRequestId = submittedRequest.requestId;
    const submittedRequestSnapshot = submittedRequest;

    async function cancelAndReset() {
      if (isCancellingRequest) {
        return;
      }

      try {
        setIsCancellingRequest(true);
        setMessage(null);
        const note = t("request.cancelNoteByPassenger");
        const originQr = qrTokenForFloorId(floors, submittedRequestSnapshot.fromFloorId) ?? currentFloor.qr_token;
        const supabase = createClient();
        if (supabase) {
          const rpcResult = await cancelPassengerRequestClient(
            project.id,
            originQr,
            submittedRequestId,
            note,
          );
          if (rpcResult.ok) {
            clearPassengerPendingRequest(project.id, submittedRequestId);
            setSubmittedRequest(null);
            setMessage(t("request.cancelled"));
            setPassengerCount(1);
            setPriority(false);
            setShowSpecialNeed(false);
            router.refresh();
            return;
          }
        }

        const result = await updateRequestStatus(submittedRequestId, "cancelled", note, {
          cancelRelatedSplit: {
            projectId: project.id,
            fromFloorId: submittedRequestSnapshot.fromFloorId,
            toFloorId: submittedRequestSnapshot.toFloorId,
            waitStartedAt: submittedRequestSnapshot.waitStartedAt,
            originalPassengerCount: submittedRequestSnapshot.passengerCount,
          },
        });
        if (result.ok) {
          clearPassengerPendingRequest(project.id, submittedRequestId);
          setSubmittedRequest(null);
          setMessage(t("request.cancelled"));
          setPassengerCount(1);
          setPriority(false);
          setShowSpecialNeed(false);
        } else {
          setMessage(result.message || t("request.cancelFailed"));
        }
      } catch {
        setMessage(t("request.cancelFailed"));
      } finally {
        setIsCancellingRequest(false);
      }
    }

    return (
      <section className="anim-fade-in flex flex-1 flex-col justify-between gap-4 rounded-[1.75rem] bg-white p-5 text-slate-950 shadow-sm">
        {!isOnline && (
          <div className="flex items-center gap-2 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900">
            <ShieldAlert size={18} />
            {t("common.offline")}
          </div>
        )}
        <div className="grid gap-4">
          <div
            className={
              !liveDispatch.canDispatch
                ? "rounded-[1.5rem] border border-red-200 bg-red-50 p-5 text-red-950"
                : submittedRequest.status === "arriving"
                  ? "rounded-[1.5rem] bg-sky-50 p-5 text-sky-950"
                  : submittedRequest.status === "assigned"
                    ? "rounded-[1.5rem] bg-blue-50 p-5 text-blue-950"
                    : submittedRequest.status === "boarded"
                      ? "rounded-[1.5rem] bg-emerald-50 p-5 text-emerald-950"
                      : "rounded-[1.5rem] bg-yellow-50 p-5 text-yellow-950"
            }
          >
            {!liveDispatch.canDispatch ? (
              <ShieldAlert className="text-red-700" size={44} />
            ) : submittedRequest.status === "arriving" ? (
              <Navigation className="text-sky-600" size={44} />
            ) : submittedRequest.status === "assigned" ? (
              <UserCheck className="text-blue-600" size={44} />
            ) : submittedRequest.status === "boarded" ? (
              <CheckCircle2 className="anim-success-pop text-emerald-600" size={44} />
            ) : (
              <span className="relative inline-flex">
                <Clock className="text-yellow-600" size={44} />
                <span className="absolute right-0 top-0 size-3 rounded-full bg-yellow-400 anim-pulse-dot" />
              </span>
            )}
            <h2 className="mt-4 text-2xl font-black">
              {!liveDispatch.canDispatch
                ? t("request.dispatchNoOperator")
                : submittedRequest.status === "cancelled"
                  ? t("request.statusCancelled")
                  : submittedRequest.status === "arriving"
                    ? t("request.statusArriving")
                    : submittedRequest.status === "assigned"
                      ? t("request.statusAssigned")
                      : submittedRequest.status === "boarded"
                        ? t("request.statusBoarded")
                        : t("request.waitingForOperator")}
            </h2>
            {liveDispatch.canDispatch && submittedRequest.status === "pending" && (
              <p className="mt-3 text-base font-bold leading-7">{t("request.sentBody")}</p>
            )}
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
        </div>

        {canCancel ? (
          <button
            type="button"
            disabled={isCancellingRequest}
            onClick={cancelAndReset}
            className="touch-target flex w-full items-center justify-center gap-2 rounded-[1.35rem] border-2 border-red-200 bg-red-50 px-5 py-4 text-lg font-black text-red-800 disabled:opacity-60"
          >
            <XCircle size={22} />
            {isCancellingRequest ? t("request.sending") : t("request.cancelRestart")}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => {
              clearPassengerPendingRequest(project.id, submittedRequest.requestId);
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
      {!isOnline && (
        <div className="mb-3 flex items-center gap-2 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900">
          <ShieldAlert size={18} />
          {t("common.offline")}
        </div>
      )}
      {dispatchResolving ? (
        <div className="flex shrink-0 items-center gap-3 rounded-[1.25rem] border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700">
          <Loader2 className="size-5 animate-spin text-slate-400" aria-hidden />
          {t("request.resumeLoading")}
        </div>
      ) : liveDispatch.canDispatch ? (
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
                        <p className="mt-1 text-[13px] font-bold leading-snug opacity-90">
                          {t("request.dispatchOperatorHours", { hours: op.hoursRange })}
                        </p>
                        <p className="mt-1.5 text-[13px] font-bold leading-snug opacity-95">
                          {t("request.dispatchOutsideScheduleExplainer")}
                        </p>
                      </>
                    ) : (
                      <>
                        <p>
                          <span className="font-black">{name}</span> {t("request.dispatchOperatorOnlineStatus")}
                        </p>
                        <p className="mt-1 text-[13px] font-bold leading-snug opacity-90">
                          {t("request.dispatchOperatorHours", { hours: op.hoursRange })}
                        </p>
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p>
              <span className="font-black">{t("request.dispatchOperatorFallback")}</span>{" "}
              {t("request.dispatchOperatorOnlineStatus")}
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
          if (isSubmittingRequest || submittedRequest) {
            return;
          }
          setIsSubmittingRequest(true);
          startTransition(async () => {
            try {
              const existing = readPassengerPendingProjectScoped(project.id);
              if (existing && shouldRestoreSubmittedFromSnapshot(existing.status ?? "pending")) {
                setSubmittedRequest({
                  requestId: existing.requestId,
                  status: existing.status ?? "pending",
                  waitStartedAt: existing.waitStartedAt,
                  fromFloorId: existing.fromFloorId,
                  toFloorId: existing.toFloorId,
                  passengerCount: existing.passengerCount,
                });
                setDestinationId(existing.toFloorId);
                setMessage(t("request.sentBody"));
                return;
              }
              if (existing) {
                clearPassengerPendingRequest(project.id, existing.requestId);
              }

              const result = await createPassengerRequest(formData);
              console.log("[PASSENGER-REQUEST-RESULT]", { ok: result.ok, requestId: result.requestId?.slice(0, 8), message: result.message?.slice(0, 80) });
              setMessage(result.message);
              if (result.ok && result.requestId) {
                savePassengerPendingRequest(project.id, {
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
            } finally {
              setIsSubmittingRequest(false);
            }
          });
        }}
        className={`flex min-h-0 flex-1 flex-col gap-3${dispatchBlocked ? " pointer-events-none opacity-50" : ""}`}
      >
      <input type="hidden" name="projectId" value={project.id} />
      <input type="hidden" name="passengerDeviceKey" value={passengerDeviceKey} />
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
              min={1}
              max={passengerMax}
              value={passengerCount}
              onChange={(event) => {
                const raw = event.target.value;
                if (raw === "") {
                  setPassengerCount(1);
                  return;
                }
                const next = Number(raw);
                if (!Number.isFinite(next)) return;
                setPassengerCount(Math.min(Math.max(1, Math.floor(next)), passengerMax));
              }}
              className="h-14 w-full rounded-2xl border-2 border-slate-200 bg-white px-4 text-center text-3xl font-black text-slate-950 outline-none focus:border-yellow-300"
            />
            <button
              type="button"
              onClick={() => setPassengerCount((value) => Math.min(passengerMax, value + 1))}
              className="touch-target size-14 rounded-2xl bg-yellow-300 text-3xl font-black text-slate-950 active:scale-95"
            >
              +
            </button>
          </div>
          <p className="mt-1.5 text-center text-xs font-bold text-slate-500">
            {t("request.passengerMaxHint", { max: passengerMax })}
          </p>
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
          disabled={isPending || isSubmittingRequest || dispatchBlocked || !isOnline}
          className="touch-target mt-3 flex w-full items-center justify-center gap-3 rounded-[1.35rem] bg-slate-950 px-5 py-4 text-lg font-black text-white shadow-xl transition active:scale-[0.99] disabled:opacity-60"
        >
          <Send size={22} />
          {isPending || isSubmittingRequest ? t("request.sending") : t("request.submit")}
        </button>

        {message && (
          <div className="anim-shake mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-900">
            {message}
          </div>
        )}
      </section>
    </form>
    </>
  );
}
