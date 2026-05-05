"use client";

import { useMemo } from "react";
import {
  Users, Building2, ClipboardList, AlertTriangle, CreditCard,
  TrendingUp, BarChart3, Clock, ArrowUpRight, Shield,
} from "lucide-react";
import type { PlatformAnalytics } from "@/lib/analytics";
import type { DashboardData } from "@/lib/superadmin";

function fmtTime(seconds: number): string {
  if (seconds <= 0) return "—";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

function MetricCard({ icon: Icon, label, value, sub, accent }: {
  icon: typeof Users; label: string; value: string | number; sub?: string; accent: string;
}) {
  return (
    <div className={`rounded-3xl border border-white/[0.08] bg-gradient-to-br ${accent} p-6 backdrop-blur-sm transition hover:border-white/[0.14]`}>
      <div className="flex items-center gap-2">
        <Icon size={16} className="text-slate-400" />
        <span className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">{label}</span>
      </div>
      <p className="mt-3 text-4xl font-black text-white tabular-nums tracking-tight">{value}</p>
      {sub && <p className="mt-1 text-xs font-bold text-slate-500">{sub}</p>}
    </div>
  );
}

function TrendChart({ data }: { data: Array<{ date: string; count: number }> }) {
  if (data.length === 0) return null;
  const max = Math.max(...data.map((d) => d.count), 1);
  return (
    <div>
      <div className="flex items-end gap-1.5" style={{ height: 100 }}>
        {data.map((d, i) => {
          const pct = Math.round((d.count / max) * 100);
          return (
            <div key={i} className="group relative flex flex-1 flex-col items-center justify-end" style={{ height: "100%" }}>
              <div
                className="w-full rounded-lg bg-yellow-400/60 transition-all duration-500 group-hover:bg-yellow-400/80"
                style={{ height: `${Math.max(pct, 4)}%` }}
              />
              <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-[10px] font-black text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity">{d.count}</span>
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex gap-1.5">
        {data.map((d) => (
          <span key={d.date} className="flex-1 text-center text-[9px] font-bold text-slate-500">{d.date.slice(5)}</span>
        ))}
      </div>
    </div>
  );
}

function PlanDonut({ distribution }: { distribution: Array<{ plan: string; count: number }> }) {
  if (distribution.length === 0) return null;
  const total = distribution.reduce((s, d) => s + d.count, 0);
  const COLORS = ["#facc15", "#38bdf8", "#a78bfa", "#34d399", "#fb923c"];
  let cumulative = 0;
  const arcs = distribution.map((d, i) => {
    const pct = d.count / total;
    const start = cumulative;
    cumulative += pct;
    return { ...d, pct, start, color: COLORS[i % COLORS.length] };
  });

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
      <div className="relative flex size-28 shrink-0 items-center justify-center">
        <svg viewBox="0 0 120 120" className="size-full -rotate-90">
          {arcs.map((a) => {
            const r = 48;
            const circumference = 2 * Math.PI * r;
            const dashLen = a.pct * circumference;
            const gap = circumference - dashLen;
            return (
              <circle
                key={a.plan}
                cx="60" cy="60" r={r}
                fill="none"
                stroke={a.color}
                strokeWidth="12"
                strokeDasharray={`${dashLen} ${gap}`}
                strokeDashoffset={-a.start * circumference}
                className="transition-all duration-700"
              />
            );
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-black text-white tabular-nums">{total}</span>
          <span className="text-[9px] font-bold text-slate-500 uppercase">total</span>
        </div>
      </div>
      <div className="flex-1 space-y-2">
        {arcs.map((a) => (
          <div key={a.plan} className="flex items-center gap-3">
            <div className="size-3 rounded-full" style={{ background: a.color }} />
            <span className="flex-1 text-sm font-bold text-slate-300 capitalize">{a.plan}</span>
            <span className="text-sm font-black text-white tabular-nums">{a.count}</span>
            <span className="w-10 text-right text-xs font-bold text-slate-500 tabular-nums">{Math.round(a.pct * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ErrorList({ errors }: { errors: Array<{ message?: string; error?: string; created_at?: string }> }) {
  if (errors.length === 0) {
    return <p className="py-6 text-center text-sm text-slate-500">No errors in the last 24 hours</p>;
  }
  return (
    <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
      {errors.slice(0, 10).map((err, i) => (
        <div key={i} className="rounded-xl border border-red-400/20 bg-red-400/[0.06] px-4 py-2.5">
          <p className="text-sm font-bold text-red-300 truncate">{err.message || err.error || "Unknown error"}</p>
          <p className="mt-0.5 text-[10px] font-bold text-slate-500">{err.created_at ?? ""}</p>
        </div>
      ))}
    </div>
  );
}

export function SuperadminAnalyticsDashboard({ data, platform }: { data: DashboardData; platform: PlatformAnalytics }) {
  return (
    <div className="space-y-8">
      {/* ── Platform Overview ──────────────────────────────────────── */}
      <section>
        <h2 className="mb-4 text-xs font-black uppercase tracking-[0.25em] text-slate-500">Platform Overview</h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
          <MetricCard icon={Users} label="Total Users" value={platform.total_users} sub={`+${data.newAccounts7d} this week`} accent="from-sky-500/[0.08] to-sky-500/[0.02]" />
          <MetricCard icon={Building2} label="Active Projects" value={platform.active_projects} accent="from-yellow-500/[0.08] to-yellow-500/[0.02]" />
          <MetricCard icon={ClipboardList} label="Requests (7d)" value={platform.total_requests} sub={`${platform.completed_requests} completed`} accent="from-violet-500/[0.08] to-violet-500/[0.02]" />
          <MetricCard icon={CreditCard} label="MRR" value={`$${data.estimatedMonthlyRevenue}`} sub={data.plansSold} accent="from-emerald-500/[0.08] to-emerald-500/[0.02]" />
          <MetricCard icon={AlertTriangle} label="Errors (24h)" value={platform.errors_24h} sub={platform.errors_24h > 5 ? "Needs attention" : "Healthy"} accent="from-red-500/[0.08] to-red-500/[0.02]" />
        </div>
      </section>

      {/* ── Usage Trend + Plan Distribution ──────────────────────────── */}
      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-3xl border border-white/[0.08] bg-gradient-to-br from-white/[0.05] to-white/[0.02] p-6 backdrop-blur-sm">
          <div className="mb-5 flex items-center gap-2">
            <TrendingUp size={16} className="text-yellow-400" />
            <h3 className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">Usage Trend (7d)</h3>
          </div>
          {platform.requests_per_day.length > 0 ? (
            <TrendChart data={platform.requests_per_day} />
          ) : (
            <div className="flex h-28 items-center justify-center text-sm text-slate-500">No data yet</div>
          )}
        </div>

        <div className="rounded-3xl border border-white/[0.08] bg-gradient-to-br from-white/[0.05] to-white/[0.02] p-6 backdrop-blur-sm">
          <div className="mb-5 flex items-center gap-2">
            <Shield size={16} className="text-sky-400" />
            <h3 className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">Plan Distribution</h3>
          </div>
          {data.planDistribution.length > 0 ? (
            <PlanDonut distribution={data.planDistribution} />
          ) : (
            <div className="flex h-28 items-center justify-center text-sm text-slate-500">No subscriptions yet</div>
          )}
        </div>
      </section>

      {/* ── Performance + Errors ──────────────────────────────────── */}
      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-3xl border border-white/[0.08] bg-gradient-to-br from-white/[0.05] to-white/[0.02] p-6 backdrop-blur-sm">
          <div className="mb-5 flex items-center gap-2">
            <Clock size={16} className="text-emerald-400" />
            <h3 className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">Performance</h3>
          </div>
          <div className="space-y-3">
            <div className="flex justify-between rounded-xl bg-white/[0.04] px-4 py-3">
              <span className="text-sm text-slate-400">Avg Wait</span>
              <span className="font-black text-white tabular-nums">{fmtTime(platform.avg_wait_seconds)}</span>
            </div>
            <div className="flex justify-between rounded-xl bg-white/[0.04] px-4 py-3">
              <span className="text-sm text-slate-400">Completion Rate</span>
              <span className="font-black text-white tabular-nums">{platform.total_requests > 0 ? Math.round((platform.completed_requests / platform.total_requests) * 100) : 0}%</span>
            </div>
            <div className="flex justify-between rounded-xl bg-white/[0.04] px-4 py-3">
              <span className="text-sm text-slate-400">Cancellation Rate</span>
              <span className="font-black text-white tabular-nums">{platform.total_requests > 0 ? Math.round((platform.cancelled_requests / platform.total_requests) * 100) : 0}%</span>
            </div>
            <div className="flex justify-between rounded-xl bg-white/[0.04] px-4 py-3">
              <span className="text-sm text-slate-400">Active Operators</span>
              <span className="font-black text-white tabular-nums">{data.activeOperators}</span>
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-white/[0.08] bg-gradient-to-br from-red-500/[0.04] to-white/[0.02] p-6 backdrop-blur-sm">
          <div className="mb-5 flex items-center gap-2">
            <AlertTriangle size={16} className="text-red-400" />
            <h3 className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">Error Trends</h3>
          </div>
          <ErrorList errors={data.recentErrors} />
        </div>
      </section>
    </div>
  );
}
