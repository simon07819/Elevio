"use client";

import type { FormEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { flushSync } from "react-dom";
import { LockKeyhole, Loader2, TabletSmartphone } from "lucide-react";
import {
  activateOperatorElevator,
  heartbeatOperatorElevator,
  releaseOperatorElevator,
} from "@/lib/actions";
import { trackOperatorActivated, trackOperatorReleased } from "@/lib/analyticsEvents";
import { captureError } from "@/lib/errorTracking";
import { startReleaseToActivateTimer } from "@/lib/performanceMonitor";
import { structuredLog } from "@/lib/structuredLogger";
import { createClient } from "@/lib/supabase/client";
import { bindRealtimeWithAuthSession, subscribeToTable, type ElevatorRealtimePayload } from "@/lib/realtime";
import {
  OPERATOR_BROADCAST_ELEVATOR_SESSION_CLEARED,
  broadcastOperatorElevatorSessionCleared,
  operatorProjectBroadcastChannel,
} from "@/lib/operatorNotifyBroadcast";
import { broadcastPassengerQueueCleared } from "@/lib/passengerNotifyBroadcast";
import { useLanguage } from "@/components/i18n/LanguageProvider";
import { formatFloorLabel } from "@/lib/utils";
import { ServiceTimePicker } from "@/components/ServiceTimePicker";
import {
  elevatorHasOperatorTabletBinding,
  isOperatorTabletSessionStale,
} from "@/lib/operatorTablet";
import { formatStoredTabletLabel, getOperatorDeviceLabel } from "@/lib/deviceLabel";
import type { Elevator, Floor, HoistRequest, Project } from "@/types/hoist";
import { OperatorDashboard } from "@/components/operator/OperatorDashboard";
import { OperatorTabletSessionsPanel } from "@/components/operator/OperatorTabletSessionsPanel";
import { logAction } from "@/lib/stateResolution";

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

/** Convertit les valeurs cachées du ServiceTimePicker (`HH:MM`) en `HH:MM:SS` pour l'état local. */
function hhmmToPostgresTime(hhmm: string): string {
  const t = hhmm.trim();
  return /^\d{2}:\d{2}$/.test(t) ? `${t}:00` : t;
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

function mergeElevatorRows(current: Elevator[], incoming: Elevator[]) {
  const mergedById = new Map(current.map((elevator) => [elevator.id, elevator]));
  for (const elevator of incoming) {
    mergedById.set(elevator.id, { ...(mergedById.get(elevator.id) ?? {}), ...elevator });
  }
  return [...mergedById.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function clearOperatorSessionFields(elevator: Elevator): Elevator {
  return {
    ...elevator,
    operator_session_id: null,
    operator_session_started_at: null,
    operator_session_heartbeat_at: null,
    operator_user_id: null,
    operator_tablet_label: null,
    operator_display_name: null,
  };
}

export function OperatorWorkspace({
  project,
  floors,
  elevators,
  requests,
  operatorDisplayName,
  hydrationNowMs,
}: {
  project: Project;
  floors: Floor[];
  elevators: Elevator[];
  requests: HoistRequest[];
  operatorDisplayName: string;
  /** Horloge figée côté serveur pour le 1er rendu ; évite mismatch hydration Activer/Reprendre. */
  hydrationNowMs: number;
}) {
  const router = useRouter();
  const { t } = useLanguage();
  const [sessionId] = useState(() => makeSessionId(project.id));
  const [localElevators, setLocalElevators] = useState(elevators);
  const [selectedElevatorId, setSelectedElevatorId] = useState<string | null>(() => storedElevatorId(project.id));
  const [message, setMessage] = useState<string | null>(null);
  const [activatingElevatorId, setActivatingElevatorId] = useState<string | null>(null);
  const [releasingElevatorId, setReleasingElevatorId] = useState<string | null>(null);
  const [deviceLabel, setDeviceLabel] = useState("");
  const [operatorClockMs, setOperatorClockMs] = useState(() => Date.now());
  const [localSessionClaim, setLocalSessionClaim] = useState(() => ({
    elevatorId: storedElevatorId(project.id),
    updatedAt: Date.now(),
  }));
  const [locallyReleasedElevatorIds, setLocallyReleasedElevatorIds] = useState<Set<string>>(() => new Set());
  const localElevatorsRef = useRef(localElevators);
  // Tracks whether the elevators realtime channel is currently SUBSCRIBED.
  // When true, the LTE-friendly fallback polling loop skips its DB fetch.
  const realtimeConnectedRef = useRef(false);
  // Imperative handle to the latest elevators refetch implementation. Used by
  // the visibility / online / appResume listeners to do ONE explicit refetch.
  const syncElevatorsRef = useRef<(() => Promise<void>) | null>(null);

  useEffect(() => {
    localElevatorsRef.current = localElevators;
  }, [localElevators]);

  const effectiveNowMs = operatorClockMs || hydrationNowMs;
  const capacityEnabled = project.capacity_enabled !== false;
  const localClaimActive =
    localSessionClaim.elevatorId != null && effectiveNowMs - localSessionClaim.updatedAt < 15_000;

  const mergeWithLocalClaim = useCallback(
    (current: Elevator[], incoming: Elevator[]) => {
      let merged = mergeElevatorRows(current, incoming);
      if (locallyReleasedElevatorIds.size > 0) {
        merged = merged.map((elevator) =>
          locallyReleasedElevatorIds.has(elevator.id) && elevator.operator_session_id === sessionId
            ? clearOperatorSessionFields(elevator)
            : elevator,
        );
      }
      if (!localClaimActive || !localSessionClaim.elevatorId) {
        return merged;
      }
      return merged.map((elevator) =>
        elevator.id === localSessionClaim.elevatorId &&
        !locallyReleasedElevatorIds.has(elevator.id) &&
        !elevator.operator_session_id
          ? {
              ...elevator,
              operator_session_id: sessionId,
              operator_session_started_at: elevator.operator_session_started_at ?? new Date().toISOString(),
              operator_session_heartbeat_at: new Date().toISOString(),
            }
          : elevator,
      );
    },
    [localClaimActive, localSessionClaim.elevatorId, locallyReleasedElevatorIds, sessionId],
  );

  useEffect(() => {
    const id = window.setInterval(() => setOperatorClockMs(Date.now()), 5_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    void getOperatorDeviceLabel().then(setDeviceLabel);
  }, []);

  useEffect(() => {
    const id = window.setTimeout(() => {
      setLocalElevators((current) => mergeWithLocalClaim(current, elevators));
    }, 0);
    return () => window.clearTimeout(id);
  }, [elevators, mergeWithLocalClaim]);

  const patchElevator = useCallback((elevatorId: string, patch: Partial<Elevator>) => {
    setLocalElevators((current) =>
      current.map((item) => (item.id === elevatorId ? { ...item, ...patch } : item)),
    );
  }, []);

  useEffect(() => {
    const client = createClient();
    const cleanupRealtime = bindRealtimeWithAuthSession(client, () =>
      subscribeToTable<ElevatorRealtimePayload>({
        client,
        table: "elevators",
        filter: `project_id=eq.${project.id}`,
        onChange: (payload) => {
          if (!payload.new?.id) {
            return;
          }

          const nid = payload.new;
          const oldPartial = payload.old as Partial<Elevator> | undefined;
          const oldSessionId = oldPartial?.operator_session_id;
          const revokedThisTablet =
            payload.eventType === "UPDATE" &&
            nid.operator_session_id == null &&
            Boolean(oldSessionId) &&
            oldSessionId === sessionId &&
            storedElevatorId(project.id) === nid.id;

          if (revokedThisTablet) {
            try {
              window.localStorage.removeItem(elevatorStorageKey(project.id));
            } catch {
              /* ignore */
            }
            flushSync(() => {
              setLocalSessionClaim({ elevatorId: null, updatedAt: Date.now() });
              setSelectedElevatorId(null);
            });
          }

          setLocalElevators((current) => mergeWithLocalClaim(current, [nid]));
        },
        onStatus: (status) => {
          if (status === "SUBSCRIBED") {
            realtimeConnectedRef.current = true;
          } else {
            realtimeConnectedRef.current = false;
            // On reconnect/error: do ONE explicit refetch to recover any missed events.
            void syncElevatorsRef.current?.();
          }
        },
      }),
    );

    let cancelled = false;
    async function syncElevators() {
      if (!client) return;
      const { data } = await client
        .from("elevators")
        .select("*")
        .eq("project_id", project.id)
        .order("name", { ascending: true });
      if (cancelled || !data) return;
      const rows = data as Elevator[];
      const current = localElevatorsRef.current;
      for (const row of rows) {
        // Only skip poll merge for elevators being ACTIVATED (not released).
        // For releasing: the locallyReleasedElevatorIds handles stale session data;
        // we want to confirm the DB update as soon as it happens.
        if (activatingElevatorId === row.id) {
          continue;
        }
        const prev = current.find((e) => e.id === row.id);
        if (
          prev?.operator_session_id === sessionId &&
          row.operator_session_id == null &&
          storedElevatorId(project.id) === row.id
        ) {
          try {
            window.localStorage.removeItem(elevatorStorageKey(project.id));
          } catch {
            /* ignore */
          }
          flushSync(() => {
            setLocalSessionClaim({ elevatorId: null, updatedAt: Date.now() });
            setSelectedElevatorId(null);
          });
          break;
        }
      }
      setLocalElevators((c) => mergeWithLocalClaim(c, rows));
    }

    // Expose syncElevators so visibility / online / appResume / realtime-degraded
    // listeners can fire a single explicit refetch instead of constantly polling.
    syncElevatorsRef.current = syncElevators;

    void syncElevators();

    // ── LTE-FRIENDLY FALLBACK POLL ────────────────────────────────────────
    // Realtime is the primary live source for the elevators table. The 30s
    // loop only fires a DB fetch when realtime is NOT currently SUBSCRIBED.
    // On a healthy realtime channel this costs ~zero bytes/min on LTE.
    const FALLBACK_POLL_MS = 30_000;
    const poll = window.setInterval(() => {
      if (realtimeConnectedRef.current) return;
      void syncElevators();
    }, FALLBACK_POLL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(poll);
      if (syncElevatorsRef.current === syncElevators) {
        syncElevatorsRef.current = null;
      }
      cleanupRealtime();
    };
  }, [activatingElevatorId, mergeWithLocalClaim, project.id, releasingElevatorId, sessionId]);

  useEffect(() => {
    const client = createClient();
    return bindRealtimeWithAuthSession(client, () => {
      if (!client) {
        return null;
      }
      const channel = client
        .channel(operatorProjectBroadcastChannel(project.id))
        .on(
          "broadcast",
          { event: OPERATOR_BROADCAST_ELEVATOR_SESSION_CLEARED },
          (msg: { payload?: { elevatorId?: string } }) => {
            const elevatorId = msg.payload?.elevatorId;
            if (!elevatorId || typeof elevatorId !== "string") {
              return;
            }
            if (storedElevatorId(project.id) === elevatorId) {
              try {
                window.localStorage.removeItem(elevatorStorageKey(project.id));
              } catch {
                /* ignore */
              }
              flushSync(() => {
                setLocalSessionClaim({ elevatorId: null, updatedAt: Date.now() });
                setSelectedElevatorId(null);
              });
            }
            setLocalElevators((prev) =>
              prev.map((e) => (e.id === elevatorId ? clearOperatorSessionFields(e) : e)),
            );
          },
        )
        .subscribe();
      return channel;
    });
  }, [project.id]);

  useEffect(() => {
    // Single explicit refetch on focus/online/resume — never a polling loop.
    // `router.refresh()` re-renders SSR with fresh props; the elevators
    // refetch via syncElevatorsRef recovers any realtime events missed while
    // the tab was hidden or LTE was offline.
    const bump = () => {
      router.refresh();
      void syncElevatorsRef.current?.();
    };

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        bump();
      }
    };

    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        // bfcache restore: force full re-sync from DB
        bump();
        // Also re-merge SSR props to clear stale bfcache state
        setLocalElevators((current) => mergeWithLocalClaim(current, elevators));
      }
    };

    const onOnline = () => bump();

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("online", onOnline);

    // Capacitor iOS AppState listener — visibilitychange is unreliable on iOS.
    // When the app resumes from background, force a full re-sync from DB.
    let capacitarCleanup: (() => void) | null = null;
    (async () => {
      try {
        const mod = await import(/* webpackIgnore: true */ "@capacitor/app");
        const handler = await mod.App.addListener("appStateChange", (state: { isActive: boolean }) => {
          if (state.isActive) {
            bump();
            // Also re-merge SSR props to clear stale state from background
            setLocalElevators((current) => mergeWithLocalClaim(current, elevators));
            // Send heartbeat immediately on resume so session stays live
            if (selectedElevator) {
              heartbeatOperatorElevator(project.id, selectedElevator.id, sessionId);
            }
          }
        });
        // Note: bump() already calls syncElevatorsRef internally, so iOS
        // resume gets an explicit refetch without any polling loop.
        capacitarCleanup = () => handler.remove();
      } catch {
        // Not running on Capacitor — ignore
      }
    })();

    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("online", onOnline);
      capacitarCleanup?.();
    };
  }, [elevators, mergeWithLocalClaim, router]);

  const selectedElevator = useMemo(() => {
    const elevator = localElevators.find((item) => item.id === selectedElevatorId) ?? null;
    if (!elevator) return null;

    const heldByAnotherLiveSession =
      Boolean(elevator.operator_session_id) &&
      elevator.operator_session_id !== sessionId &&
      !isOperatorTabletSessionStale(elevator.operator_session_heartbeat_at, effectiveNowMs);

    return heldByAnotherLiveSession ? null : elevator;
  }, [effectiveNowMs, localElevators, selectedElevatorId, sessionId]);

  useEffect(() => {
    if (!selectedElevator) {
      return;
    }

    const heartbeat = () => heartbeatOperatorElevator(project.id, selectedElevator.id, sessionId);
    heartbeat();
    const interval = window.setInterval(heartbeat, 30_000);

    return () => window.clearInterval(interval);
  }, [project.id, selectedElevator, sessionId]);

  function handleActivate(elevator: Elevator, formData: FormData) {
    // Guard: don't start if another operation is already in progress
    if (activatingElevatorId || releasingElevatorId) return;
    const currentFloorId = String(formData.get("currentFloorId") ?? "");
    const serviceStart = String(formData.get("serviceStart") ?? "");
    const serviceEnd = String(formData.get("serviceEnd") ?? "");
    const capacityRaw = formData.get("capacity");
    const now = new Date().toISOString();
    const nowMs = Date.parse(now);
    const activatedCapacity = Number.parseInt(String(capacityRaw ?? "").trim(), 10);
    const optimisticTabletLabel = deviceLabel.trim() || elevator.operator_tablet_label?.trim() || "Web";

    window.localStorage.setItem(elevatorStorageKey(project.id), elevator.id);
    setSelectedElevatorId(elevator.id);
    setLocalSessionClaim({ elevatorId: elevator.id, updatedAt: nowMs });
    setOperatorClockMs(nowMs);
    setLocallyReleasedElevatorIds((current) => {
      if (!current.has(elevator.id)) return current;
      const next = new Set(current);
      next.delete(elevator.id);
      return next;
    });
    setMessage(null);
    setLocalElevators((current) =>
      current.map((item) =>
        item.id === elevator.id
          ? {
              ...item,
              operator_session_id: sessionId,
              operator_session_started_at: now,
              operator_session_heartbeat_at: now,
              operator_tablet_label: optimisticTabletLabel,
              capacity:
                capacityEnabled && Number.isFinite(activatedCapacity) && activatedCapacity >= 1
                  ? activatedCapacity
                  : item.capacity,
              service_start_time: hhmmToPostgresTime(serviceStart),
              service_end_time: hhmmToPostgresTime(serviceEnd),
              current_floor_id: currentFloorId || item.current_floor_id,
              direction: "idle",
              current_load: 0,
              manual_full: false,
            }
          : item.operator_session_id === sessionId
            ? {
                ...item,
                operator_session_id: null,
                operator_session_started_at: null,
                operator_session_heartbeat_at: null,
                operator_user_id: null,
                operator_tablet_label: null,
                operator_display_name: null,
              }
            : item,
      ),
    );

    setActivatingElevatorId(elevator.id);
    void (async () => {
      try {
        const tabletLabel = await getOperatorDeviceLabel();
        if (tabletLabel !== optimisticTabletLabel) {
          patchElevator(elevator.id, { operator_tablet_label: tabletLabel });
        }

        const result = await activateOperatorElevator(
          project.id,
          elevator.id,
          sessionId,
          currentFloorId,
          tabletLabel,
          serviceStart,
          serviceEnd,
          capacityEnabled && capacityRaw != null ? String(capacityRaw) : String(elevator.capacity),
          operatorDisplayName,
        );
        setMessage(result.ok ? null : result.message);

        if (result.ok) {
          trackOperatorActivated(project.id, elevator.id);
          structuredLog("Analytics", "operator_activated", { projectId: project.id, elevatorId: elevator.id });
          // Refresh SSR data so the requests prop reflects the DB state
          // after the previous session's cleanup
          router.refresh();
        } else {
          captureError(new Error("activate_failed: " + result.message), {
            projectId: project.id,
            elevatorId: elevator.id,
            userType: "operator",
            action: "activate",
          });
          const rollbackMs = Date.parse(new Date().toISOString());
          window.localStorage.removeItem(elevatorStorageKey(project.id));
          setSelectedElevatorId(null);
          setLocalSessionClaim({ elevatorId: null, updatedAt: rollbackMs });
          setLocalElevators((current) =>
            current.map((item) =>
              item.id === elevator.id && item.operator_session_id === sessionId
                ? {
                    ...item,
                    operator_session_id: null,
                    operator_session_started_at: null,
                    operator_session_heartbeat_at: null,
                    operator_user_id: null,
                    operator_tablet_label: null,
                    operator_display_name: null,
                  }
                : item,
            ),
          );
        }
      } catch (err) {
        const rollbackMs = Date.parse(new Date().toISOString());
        setMessage(t("operator.activateFailed") || "Impossible d'activer cette tablette.");
        captureError(err, { projectId: project.id, elevatorId: elevator.id, userType: "operator", action: "activate" });
        window.localStorage.removeItem(elevatorStorageKey(project.id));
        setSelectedElevatorId(null);
        setLocalSessionClaim({ elevatorId: null, updatedAt: rollbackMs });
        setLocalElevators((current) =>
          current.map((item) =>
            item.id === elevator.id && item.operator_session_id === sessionId
              ? {
                  ...item,
                  operator_session_id: null,
                  operator_session_started_at: null,
                  operator_session_heartbeat_at: null,
                  operator_user_id: null,
                  operator_tablet_label: null,
                  operator_display_name: null,
                }
              : item,
            ),
          );
      } finally {
        setActivatingElevatorId(null);
      }
    })();
  }

  function release() {
    if (!selectedElevator) {
      return;
    }
    // Guard: don't release if another operation is already in progress
    if (activatingElevatorId || releasingElevatorId) return;

    logAction("releaseStart", { elevatorId: selectedElevator.id, elevatorName: selectedElevator.name });
    const stopReleaseTimer = startReleaseToActivateTimer({ projectId: project.id, elevatorId: selectedElevator.id });

    const releasingElevator = selectedElevator;
    const releaseMs = Date.parse(new Date().toISOString());
    window.localStorage.removeItem(elevatorStorageKey(project.id));
    setSelectedElevatorId(null);
    setLocalSessionClaim({ elevatorId: null, updatedAt: releaseMs });
    setLocallyReleasedElevatorIds((current) => new Set(current).add(releasingElevator.id));
    setMessage(null);
    setOperatorClockMs(Date.now());
    setReleasingElevatorId(releasingElevator.id);
    setLocalElevators((current) =>
      current.map((item) =>
        item.id === releasingElevator.id
          ? {
              ...item,
              operator_session_id: null,
              operator_session_started_at: null,
              operator_session_heartbeat_at: null,
              operator_user_id: null,
              operator_tablet_label: null,
              operator_display_name: null,
            }
          : item,
      ),
    );

    void (async () => {
      try {
        const result = await releaseOperatorElevator(project.id, releasingElevator.id, sessionId);

        if (!result.ok) {
          const rollbackMs = Date.parse(new Date().toISOString());
          setMessage(result.message);
          window.localStorage.setItem(elevatorStorageKey(project.id), releasingElevator.id);
          setSelectedElevatorId(releasingElevator.id);
          setLocalSessionClaim({ elevatorId: releasingElevator.id, updatedAt: rollbackMs });
          setLocallyReleasedElevatorIds((current) => {
            const next = new Set(current);
            next.delete(releasingElevator.id);
            return next;
          });
          setLocalElevators((current) =>
            current.map((item) =>
              item.id === releasingElevator.id
                ? {
                    ...item,
                    operator_session_id: sessionId,
                    operator_session_started_at: releasingElevator.operator_session_started_at ?? new Date().toISOString(),
                    operator_session_heartbeat_at: new Date().toISOString(),
                    operator_user_id: releasingElevator.operator_user_id,
                    operator_tablet_label: releasingElevator.operator_tablet_label,
                    operator_display_name: releasingElevator.operator_display_name,
                  }
                : item,
            ),
          );
        } else {
          const releaseDurationMs = stopReleaseTimer();
          trackOperatorReleased(project.id, releasingElevator.id);
          structuredLog("Analytics", "operator_released", { projectId: project.id, elevatorId: releasingElevator.id, releaseDurationMs: Math.round(releaseDurationMs) });
          logAction("releaseSuccess", { elevatorId: releasingElevator.id, hasOtherOperator: result.hasOtherOperator });
          // Refresh SSR data so the requests prop is updated after cleanup
          router.refresh();
          // Broadcast release to other operators always.
          // Broadcast to passengers only if no other operator is available
          // (otherwise requests were reassigned — passenger should NOT be reset).
          const client = createClient();
          if (client) {
            broadcastOperatorElevatorSessionCleared(client, project.id, releasingElevator.id);
            if (!result.hasOtherOperator) {
              const releasedRequestIds = requests
                .filter((r) => r.elevator_id === releasingElevator.id && r.status !== "completed" && r.status !== "cancelled")
                .map((r) => r.id);
              if (releasedRequestIds.length > 0) {
                broadcastPassengerQueueCleared(client, project.id, releasedRequestIds);
              }
            }
          }
        }
      } catch (err) {
        const rollbackMs = Date.parse(new Date().toISOString());
        setMessage(t("operator.releaseFailed"));
        captureError(err, { projectId: project.id, elevatorId: releasingElevator.id, userType: "operator", action: "release" });
        window.localStorage.setItem(elevatorStorageKey(project.id), releasingElevator.id);
        setSelectedElevatorId(releasingElevator.id);
        setLocalSessionClaim({ elevatorId: releasingElevator.id, updatedAt: rollbackMs });
        setLocallyReleasedElevatorIds((current) => {
          const next = new Set(current);
          next.delete(releasingElevator.id);
          return next;
        });
        setLocalElevators((current) =>
          current.map((item) =>
            item.id === releasingElevator.id
              ? {
                  ...item,
                  operator_session_id: sessionId,
                  operator_session_started_at: releasingElevator.operator_session_started_at ?? new Date().toISOString(),
                  operator_session_heartbeat_at: new Date().toISOString(),
                  operator_user_id: releasingElevator.operator_user_id,
                  operator_tablet_label: releasingElevator.operator_tablet_label,
                  operator_display_name: releasingElevator.operator_display_name,
                }
              : item,
            ),
        );
      } finally {
        setReleasingElevatorId(null);
      }
    })();
  }

  const rawDeviceSubtitle =
    deviceLabel.trim() || selectedElevator?.operator_tablet_label?.trim() || "";
  const activeDeviceSubtitle = rawDeviceSubtitle
    ? formatStoredTabletLabel(rawDeviceSubtitle)
    : t("operator.tabletNoDeviceName");

  if (selectedElevator) {
    return (
      <div className="mx-auto grid max-w-7xl gap-4">
        <OperatorDashboard
          floors={floors}
          requests={requests}
          elevator={selectedElevator}
          prioritiesEnabled={project.priorities_enabled !== false}
          capacityEnabled={capacityEnabled}
          onElevatorPatch={patchElevator}
          sessionStartedAt={selectedElevator.operator_session_started_at}
        />
        {message ? <div className="rounded-2xl bg-white/10 p-3 text-sm font-bold text-slate-100">{message}</div> : null}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-emerald-400/20 bg-emerald-400/10 p-3">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-sm font-black text-emerald-100">
              <TabletSmartphone className="shrink-0" size={18} />
              <span className="truncate">{selectedElevator.name}</span>
            </p>
            <p className="mt-1 truncate text-xs font-bold text-emerald-200/90">
              {operatorDisplayName}
              <span className="mx-1.5 text-emerald-300/80">·</span>
              <span title={activeDeviceSubtitle}>{activeDeviceSubtitle}</span>
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              disabled={releasingElevatorId === selectedElevator.id}
              onClick={release}
              className="touch-target flex items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-sm font-black text-white transition disabled:opacity-60 disabled:cursor-wait"
            >
              {releasingElevatorId === selectedElevator.id ? <Loader2 size={16} className="anim-spinner" /> : null}
              {releasingElevatorId === selectedElevator.id ? t("operator.actionInProgress") : t("operator.releaseTablet")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <OperatorTabletSessionsPanel
        projectId={project.id}
        elevators={localElevators}
        sessionId={sessionId}
        deviceLabel={deviceLabel}
        operatorDisplayName={operatorDisplayName}
        nowMs={effectiveNowMs}
        onSessionCleared={(elevatorId) => {
          setLocalElevators((current) =>
            current.map((elevator) =>
              elevator.id === elevatorId
                ? {
                    ...elevator,
                    operator_session_id: null,
                    operator_session_started_at: null,
                    operator_session_heartbeat_at: null,
                    operator_user_id: null,
                    operator_tablet_label: null,
                    operator_display_name: null,
                  }
                : elevator,
            ),
          );
        }}
      />
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
            const isActivatingThisElevator = activatingElevatorId === elevator.id;
            const heldByOtherSession =
              Boolean(elevator.operator_session_id) && elevator.operator_session_id !== sessionId;
            const heartbeatStale = isOperatorTabletSessionStale(elevator.operator_session_heartbeat_at, effectiveNowMs);
            const lockActive = heldByOtherSession && !heartbeatStale;
            const locked = lockActive;
            // After release, our own stale session should show "Activer", not "Reprendre"
            const justReleased = locallyReleasedElevatorIds.has(elevator.id);
            const staleOtherBinding =
              !justReleased &&
              heldByOtherSession &&
              heartbeatStale &&
              elevatorHasOperatorTabletBinding(elevator);
            const defaultFloorId = elevator.current_floor_id ?? floors.find((floor) => floor.sort_order === 0)?.id ?? floors[0]?.id ?? "";

            function onActivateSubmit(event: FormEvent<HTMLFormElement>) {
              event.preventDefault();
              const formData = new FormData(event.currentTarget);
              handleActivate(elevator, formData);
            }

            return (
              <form
                key={elevator.id}
                onSubmit={onActivateSubmit}
                className="rounded-[1.5rem] border border-white/10 bg-slate-950/50 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-xl font-black text-white">{elevator.name}</h3>
                    {capacityEnabled ? (
                      <p className="mt-1 text-sm font-bold text-slate-400">
                        {elevator.capacity} {t("operator.places")}
                      </p>
                    ) : null}
                  </div>
                  <span
                    className={
                      locked
                        ? "rounded-full bg-red-500/20 px-3 py-1 text-xs font-black text-red-100"
                        : staleOtherBinding
                          ? "rounded-full bg-amber-400/15 px-3 py-1 text-xs font-black text-amber-100"
                          : "rounded-full bg-emerald-400/15 px-3 py-1 text-xs font-black text-emerald-100"
                    }
                  >
                    {locked ? t("operator.locked") : staleOtherBinding ? t("operator.sessionInactive") : t("operator.available")}
                  </span>
                </div>

                {staleOtherBinding ? (
                  <>
                    <p className="mt-3 rounded-2xl border border-amber-400/25 bg-amber-500/10 px-3 py-2 text-xs font-bold text-amber-50">
                      {t("operator.sessionInactiveHint")}
                    </p>
                    <button
                      type="button"
                      disabled={activatingElevatorId === elevator.id || !!releasingElevatorId}
                      onClick={async () => {
                        if (activatingElevatorId || releasingElevatorId) return;
                        try {
                          const res = await fetch("/api/operator/force-release", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ projectId: project.id, elevatorId: elevator.id }),
                          });
                          if (res.ok) {
                            setLocalElevators((prev) =>
                              prev.map((e) => (e.id === elevator.id ? clearOperatorSessionFields(e) : e)),
                            );
                            const client = createClient();
                            if (client) broadcastOperatorElevatorSessionCleared(client, project.id, elevator.id);
                            setMessage(t("operator.releaseSuccess"));
                          } else {
                            setMessage(t("operator.releaseFailed"));
                          }
                        } catch {
                          setMessage(t("operator.releaseFailed"));
                        }
                      }}
                      className="mt-2 rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs font-black text-red-200 hover:bg-red-500/20 disabled:opacity-50 disabled:cursor-wait"
                    >
                      {t("operator.forceRelease")}
                    </button>
                  </>
                ) : null}

                <label className="mt-4 grid gap-2 text-sm font-black text-slate-200">
                  {t("operator.currentFloor")}
                  <select
                    name="currentFloorId"
                    defaultValue={defaultFloorId}
                    disabled={locked || isActivatingThisElevator}
                    className="rounded-2xl bg-white px-4 py-3 font-bold text-slate-950 outline-none disabled:opacity-60"
                  >
                    {floors.map((floor) => (
                      <option key={floor.id} value={floor.id}>
                        {formatFloorLabel(floor)}
                      </option>
                    ))}
                  </select>
                </label>

                {capacityEnabled ? (
                  <label className="mt-3 grid gap-2 text-sm font-black text-slate-200" htmlFor={`op-cap-${elevator.id}`}>
                    {t("elevator.capacityLabel")}
                    <input
                      id={`op-cap-${elevator.id}`}
                      name="capacity"
                      type="number"
                      min={1}
                      step={1}
                      defaultValue={elevator.capacity}
                      required
                      disabled={locked || isActivatingThisElevator}
                      className="max-w-[8rem] rounded-2xl bg-white px-4 py-3 text-center text-base font-black tabular-nums text-slate-950 outline-none disabled:opacity-60"
                    />
                  </label>
                ) : null}

                <div className="mt-3 grid gap-2">
                  <span className="text-sm font-black text-slate-200">{t("elevator.serviceStartLabel")}</span>
                  <ServiceTimePicker
                    key={`${elevator.id}-op-serviceStart-${elevator.service_start_time ?? ""}`}
                    name="serviceStart"
                    defaultTime={elevator.service_start_time ?? "07:00:00"}
                    ariaLabel={t("elevator.serviceStartLabel")}
                    disabled={locked || isActivatingThisElevator}
                  />
                </div>
                <div className="mt-3 grid gap-2">
                  <span className="text-sm font-black text-slate-200">{t("elevator.serviceEndLabel")}</span>
                  <ServiceTimePicker
                    key={`${elevator.id}-op-serviceEnd-${elevator.service_end_time ?? ""}`}
                    name="serviceEnd"
                    defaultTime={elevator.service_end_time ?? "15:00:00"}
                    ariaLabel={t("elevator.serviceEndLabel")}
                    disabled={locked || isActivatingThisElevator}
                  />
                </div>

                <button
                  type="submit"
                  disabled={locked || isActivatingThisElevator}
                  className="touch-target mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-yellow-300 px-5 py-4 font-black text-slate-950 transition disabled:opacity-50 disabled:cursor-wait"
                >
                  {isActivatingThisElevator ? <Loader2 size={18} className="anim-spinner" /> : <LockKeyhole size={18} />}
                  {isActivatingThisElevator ? t("operator.actionInProgress") : staleOtherBinding ? t("operator.retakeTablet") : t("operator.activate")}
                </button>
              </form>
            );
          })}
        </div>
      </section>
    </>
  );
}
