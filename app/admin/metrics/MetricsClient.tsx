"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, BarChart3, CheckCircle2, Clock, Inbox, XCircle } from "lucide-react";
import { getLogHistory, getPerformanceLogs, getErrorLogs, type ElevioLogEntry } from "@/lib/structuredLogger";

interface Metrics {
  totalToday: number;
  completedToday: number;
  cancelledToday: number;
  activeToday: number;
  avgPickupMs: number;
  avgDropoffMs: number;
  errorCount: number;
}

interface RecentEvent {
  id: string;
  eventType: string;
  createdAt: string;
  requestId: string | null;
  elevatorId: string | null;
  note: string | null;
}

function formatDuration(ms: number): string {
  if (ms === 0) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("fr-CA", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch {
    return iso;
  }
}

export function MetricsClient({
  metrics,
  recentEvents,
}: {
  metrics: Metrics;
  recentEvents: RecentEvent[];
}) {
  const [clientLogs, setClientLogs] = useState<ElevioLogEntry[]>([]);
  const [perfLogs, setPerfLogs] = useState<ElevioLogEntry[]>([]);
  const [errorLogs, setErrorLogs] = useState<ElevioLogEntry[]>([]);

  useEffect(() => {
    setClientLogs(getLogHistory(50));
    setPerfLogs(getPerformanceLogs(20));
    setErrorLogs(getErrorLogs(20));
  }, []);

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div>
        <p className="text-xs font-black uppercase tracking-[0.25em] text-yellow-300">Elevio PRO++</p>
        <h1 className="text-3xl font-black text-white">Metrics Dashboard</h1>
        <p className="mt-1 text-sm font-bold text-slate-400">Today&apos;s performance overview</p>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-white/10 bg-white/8 p-4">
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-slate-400">
            <BarChart3 size={16} /> Requests Today
          </div>
          <p className="mt-2 text-3xl font-black text-white">{metrics.totalToday}</p>
          <p className="text-xs font-bold text-slate-500">{metrics.activeToday} active</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/8 p-4">
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-slate-400">
            <CheckCircle2 size={16} /> Completed
          </div>
          <p className="mt-2 text-3xl font-black text-emerald-300">{metrics.completedToday}</p>
          <p className="text-xs font-bold text-slate-500">{metrics.cancelledToday} cancelled</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/8 p-4">
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-slate-400">
            <Clock size={16} /> Avg Pickup
          </div>
          <p className="mt-2 text-3xl font-black text-sky-300">{formatDuration(metrics.avgPickupMs)}</p>
          <p className="text-xs font-bold text-slate-500">created → boarded</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/8 p-4">
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-slate-400">
            <AlertTriangle size={16} /> Errors
          </div>
          <p className="mt-2 text-3xl font-black text-red-300">{metrics.errorCount}</p>
          <p className="text-xs font-bold text-slate-500">recent events</p>
        </div>
      </div>

      {/* Performance Logs (client-side) */}
      {perfLogs.length > 0 && (
        <section className="rounded-2xl border border-white/10 bg-white/8 p-4">
          <h2 className="text-lg font-black text-white">Performance Logs</h2>
          <div className="mt-3 space-y-2">
            {perfLogs.map((log, i) => (
              <div key={i} className="rounded-xl border border-white/5 bg-white/4 p-2 text-xs font-bold">
                <span className="text-yellow-300">{formatTime(log.timestamp)}</span>
                <span className="ml-2 text-slate-300">{log.action}</span>
                {log.durationMs != null && (
                  <span className={Number(log.durationMs) > 2000 ? "ml-2 text-red-300" : "ml-2 text-emerald-300"}>
                    {String(log.durationMs)}ms
                  </span>
                )}
                {Boolean(log.requestId) && <span className="ml-2 text-slate-500">req:{String(log.requestId).slice(0, 8)}</span>}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Error Logs (client-side) */}
      {errorLogs.length > 0 && (
        <section className="rounded-2xl border border-red-400/20 bg-red-500/5 p-4">
          <h2 className="text-lg font-black text-red-200">Error Logs</h2>
          <div className="mt-3 space-y-2">
            {errorLogs.map((log, i) => (
              <div key={i} className="rounded-xl border border-red-400/10 bg-red-500/10 p-2 text-xs font-bold text-red-100">
                <span>{formatTime(log.timestamp)}</span>
                <span className="ml-2">{log.action}</span>
                {Boolean(log.message) && <span className="ml-2 opacity-80">{String(log.message).slice(0, 80)}</span>}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Recent DB Events */}
      <section className="rounded-2xl border border-white/10 bg-white/8 p-4">
        <h2 className="text-lg font-black text-white">Recent Events</h2>
        {recentEvents.length === 0 ? (
          <div className="mt-3 flex items-center gap-2 text-sm font-bold text-slate-500">
            <Inbox size={20} /> No events today
          </div>
        ) : (
          <div className="mt-3 space-y-2">
            {recentEvents.map((event) => (
              <div key={event.id} className="rounded-xl border border-white/5 bg-white/4 p-2 text-xs font-bold">
                <span className="text-yellow-300">{formatTime(event.createdAt)}</span>
                <span className="ml-2 rounded-full bg-white/10 px-2 py-0.5 text-slate-200">{event.eventType}</span>
                {event.requestId && <span className="ml-2 text-slate-500">req:{event.requestId.slice(0, 8)}</span>}
                {event.note && <span className="ml-2 text-slate-400">{event.note.slice(0, 60)}</span>}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Client-side log buffer */}
      {clientLogs.length > 0 && (
        <section className="rounded-2xl border border-white/10 bg-white/8 p-4">
          <h2 className="text-lg font-black text-white">Client Log Buffer ({clientLogs.length})</h2>
          <div className="mt-3 max-h-60 overflow-y-auto space-y-1">
            {clientLogs.map((log, i) => (
              <div key={i} className="text-xs font-mono text-slate-400">
                <span className="text-slate-600">{formatTime(log.timestamp)}</span>
                <span className="ml-1 text-yellow-500">[{log.tag}]</span>
                <span className="ml-1">{log.action}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
