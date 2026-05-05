"use client";

import { useMemo } from "react";
import {
  Clock, CheckCircle2, XCircle, SkipForward, Users, BarChart3,
  Activity, Timer, TrendingUp, Lightbulb, Sparkles, ClipboardList,
} from "lucide-react";
import { T } from "@/components/i18n/LanguageProvider";
import type { ProjectAnalytics } from "@/lib/analytics";
import type { PlanId } from "@/lib/billing/plans";
import { UpgradeCTA } from "@/components/admin/UpgradeCTA";

function fmtTime(seconds: number): string {
  if (seconds <= 0) return "—";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

function efficiencyScore(a: ProjectAnalytics): { score: number; label: string; color: string } {
  if (a.total_requests === 0) return { score: 0, label: "—", color: "text-slate-400" };
  const completionRate = a.completed_requests / a.total_requests;
  const skipRate = a.skipped_count / a.total_requests;
  const cancelRate = a.cancelled_requests / a.total_requests;
  const waitPenalty = Math.min(a.avg_wait_seconds / 600, 1);
  const raw = completionRate * 40 + (1 - skipRate) * 20 + (1 - cancelRate) * 20 + (1 - waitPenalty) * 20;
  const score = Math.round(Math.max(0, Math.min(100, raw)));
  if (score >= 80) return { score, label: "Excellent", color: "text-emerald-400" };
  if (score >= 60) return { score, label: "Good", color: "text-sky-400" };
  return { score, label: "Needs attention", color: "text-amber-400" };
}

function insightCards(a: ProjectAnalytics): Array<{ icon: typeof Lightbulb; text: string; accent: string }> {
  const cards: Array<{ icon: typeof Lightbulb; text: string; accent: string }> = [];
  if (a.avg_wait_seconds > 0 && a.completed_requests > 0) {
    const minutesSaved = Math.round((a.avg_wait_seconds * a.completed_requests) / 60);
    if (minutesSaved > 0) {
      cards.push({ icon: Timer, text: `${minutesSaved} min saved today with Elevio`, accent: "from-emerald-500/20 to-teal-500/20" });
    }
  }
  if (a.busiest_hours.length > 0) {
    const peak = a.busiest_hours[0];
    const end = Math.min(peak.hour + 2, 23);
    cards.push({ icon: Activity, text: `Peak congestion between ${peak.hour}:00 and ${end}:00`, accent: "from-sky-500/20 to-blue-500/20" });
  }
  if (a.top_floors.length > 0) {
    cards.push({ icon: BarChart3, text: `${a.top_floors[0].floor_label} is your busiest destination`, accent: "from-violet-500/20 to-purple-500/20" });
  }
  if (a.skipped_count > a.completed_requests * 0.1 && a.completed_requests > 0) {
    cards.push({ icon: Users, text: "Consider adding another operator during peak hours", accent: "from-amber-500/20 to-orange-500/20" });
  }
  if (a.full_events > 3) {
    cards.push({ icon: Sparkles, text: `${a.full_events} full-load events — capacity upgrade may help`, accent: "from-rose-500/20 to-pink-500/20" });
  }
  if (cards.length === 0) {
    cards.push({ icon: CheckCircle2, text: "Operations running smoothly", accent: "from-emerald-500/20 to-teal-500/20" });
  }
  return cards;
}

function MiniBarChart({ data, color = "bg-yellow-400", height = 120 }: { data: Array<{ label: string; value: number }>; color?: string; height?: number }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="flex items-end gap-1.5" style={{ height }}>
      {data.map((d, i) => {
        const pct = Math.round((d.value / max) * 100);
        return (
          <div key={i} className="group relative flex flex-1 flex-col items-center justify-end" style={{ height: "100%" }}>
            <div
              className={`w-full rounded-lg ${color} transition-all duration-500 group-hover:opacity-80`}
              style={{ height: `${Math.max(pct, 4)}%` }}
            />
            <span className="mt-2 text-[10px] font-bold text-slate-500 truncate w-full text-center">{d.label}</span>
            <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-[10px] font-black text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity">{d.value}</span>
          </div>
        );
      })}
    </div>
  );
}

function HorizontalBarChart({ data, color = "bg-emerald-400/60" }: { data: Array<{ label: string; value: number }>; color?: string }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="space-y-3">
      {data.map((d) => {
        const pct = Math.round((d.value / max) * 100);
        return (
          <div key={d.label} className="flex items-center gap-3">
            <span className="w-14 text-sm font-black text-white truncate">{d.label}</span>
            <div className="flex-1 h-7 rounded-full bg-white/[0.06] overflow-hidden">
              <div className={`h-full rounded-full ${color} transition-all duration-700`} style={{ width: `${Math.max(pct, 2)}%` }} />
            </div>
            <span className="w-8 text-right text-sm font-black text-slate-300 tabular-nums">{d.value}</span>
          </div>
        );
      })}
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="rounded-3xl border border-white/[0.08] bg-white/[0.04] p-6 animate-pulse">
      <div className="h-4 w-20 rounded bg-white/10" />
      <div className="mt-4 h-8 w-24 rounded bg-white/10" />
      <div className="mt-2 h-3 w-16 rounded bg-white/5" />
    </div>
  );
}

function MetricCard({ icon: Icon, label, value, sub, accent }: {
  icon: typeof Clock; label: string; value: string | number; sub?: string; accent: string;
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

function LockedSection({ feature, requiredPlan }: { feature: string; requiredPlan: "pro" | "enterprise" }) {
  return <UpgradeCTA feature={feature} requiredPlan={requiredPlan} />;
}

export function AdminAnalyticsDashboard({ analytics, projectName, planId }: { analytics?: ProjectAnalytics; projectName?: string; planId?: PlanId }) {
  const plan = planId ?? "starter";
  const isProOrAbove = plan === "pro" || plan === "business" || plan === "enterprise";
  const isEnterprise = plan === "business" || plan === "enterprise";

  if (!analytics) {
    return (
      <div className="space-y-6">
        <p className="text-sm text-slate-400">No active project found.</p>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      </div>
    );
  }

  const eff = efficiencyScore(analytics);
  const insights = useMemo(() => insightCards(analytics), [analytics]);
  const hourData = analytics.busiest_hours
    .slice()
    .sort((a, b) => a.hour - b.hour)
    .map((h) => ({ label: `${h.hour}h`, value: h.count }));
  const floorData = analytics.top_floors.slice(0, 8).map((f) => ({ label: f.floor_label, value: f.count }));
  const hasData = analytics.total_requests > 0;

  return (
    <div className="space-y-8">
      {/* Project badge */}
      {projectName && (
        <div className="inline-flex items-center gap-2 rounded-full bg-white/[0.06] border border-white/[0.08] px-4 py-2">
          <BarChart3 size={14} className="text-yellow-400" />
          <span className="text-xs font-black uppercase tracking-wider text-slate-300">{projectName}</span>
          <span className="text-xs text-slate-500">• 7 days</span>
        </div>
      )}

      {/* ── Today Overview ─────────────────────────────────────────── */}
      <section>
        <h2 className="mb-4 text-xs font-black uppercase tracking-[0.25em] text-slate-500">Today Overview</h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
          <MetricCard icon={ClipboardList} label="Requests" value={analytics.total_requests} sub="last 7 days" accent="from-white/[0.05] to-white/[0.02]" />
          <MetricCard icon={Clock} label="Avg Wait" value={fmtTime(analytics.avg_wait_seconds)} sub="pickup time" accent="from-sky-500/[0.08] to-sky-500/[0.02]" />
          <MetricCard icon={Timer} label="Avg Ride" value={fmtTime(analytics.avg_travel_seconds)} sub="travel time" accent="from-violet-500/[0.08] to-violet-500/[0.02]" />
          <MetricCard icon={CheckCircle2} label="Completed" value={analytics.completed_requests} sub={`${analytics.total_requests > 0 ? Math.round((analytics.completed_requests / analytics.total_requests) * 100) : 0}% rate`} accent="from-emerald-500/[0.08] to-emerald-500/[0.02]" />
          <MetricCard icon={XCircle} label="Cancelled" value={analytics.cancelled_requests} accent="from-red-500/[0.08] to-red-500/[0.02]" />
        </div>
      </section>

      {/* ── Efficiency Score (Pro+) ──────────────────────────────── */}
      <section>
        <h2 className="mb-4 text-xs font-black uppercase tracking-[0.25em] text-slate-500">Efficiency Score</h2>
        {isProOrAbove ? (
          <div className="rounded-3xl border border-white/[0.08] bg-gradient-to-br from-white/[0.06] to-white/[0.02] p-8 backdrop-blur-sm">
            <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start sm:gap-8">
              <div className="relative flex size-32 shrink-0 items-center justify-center">
                <svg viewBox="0 0 120 120" className="size-full -rotate-90">
                  <circle cx="60" cy="60" r="52" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="8" />
                  <circle
                    cx="60" cy="60" r="52" fill="none"
                    stroke={eff.score >= 80 ? "#34d399" : eff.score >= 60 ? "#38bdf8" : "#fbbf24"}
                    strokeWidth="8" strokeLinecap="round"
                    strokeDasharray={`${(eff.score / 100) * 2 * Math.PI * 52} ${2 * Math.PI * 52}`}
                    className="transition-all duration-1000"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className={`text-4xl font-black tabular-nums ${eff.color}`}>{eff.score}</span>
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">/ 100</span>
                </div>
              </div>
              <div className="flex-1 space-y-3">
                <div className="flex items-center gap-3">
                  <span className={`text-xl font-black ${eff.color}`}>{eff.label}</span>
                </div>
                <div className="grid gap-2 text-sm">
                  <div className="flex justify-between rounded-xl bg-white/[0.04] px-4 py-2">
                    <span className="text-slate-400">Completion rate</span>
                    <span className="font-black text-white tabular-nums">{analytics.total_requests > 0 ? Math.round((analytics.completed_requests / analytics.total_requests) * 100) : 0}%</span>
                  </div>
                  <div className="flex justify-between rounded-xl bg-white/[0.04] px-4 py-2">
                    <span className="text-slate-400">Skip rate</span>
                    <span className="font-black text-white tabular-nums">{analytics.total_requests > 0 ? Math.round((analytics.skipped_count / analytics.total_requests) * 100) : 0}%</span>
                  </div>
                  <div className="flex justify-between rounded-xl bg-white/[0.04] px-4 py-2">
                    <span className="text-slate-400">Cancel rate</span>
                    <span className="font-black text-white tabular-nums">{analytics.total_requests > 0 ? Math.round((analytics.cancelled_requests / analytics.total_requests) * 100) : 0}%</span>
                  </div>
                  <div className="flex justify-between rounded-xl bg-white/[0.04] px-4 py-2">
                    <span className="text-slate-400">Avg wait</span>
                    <span className="font-black text-white tabular-nums">{fmtTime(analytics.avg_wait_seconds)}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <LockedSection feature="Efficiency score with breakdown" requiredPlan="pro" />
        )}
      </section>

      {/* ── Peak Hours + Floor Usage ─────────────────────────────── */}
      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-3xl border border-white/[0.08] bg-gradient-to-br from-white/[0.05] to-white/[0.02] p-6 backdrop-blur-sm">
          <div className="mb-5 flex items-center gap-2">
            <Activity size={16} className="text-yellow-400" />
            <h3 className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">Peak Hours</h3>
          </div>
          {hasData && hourData.length > 0 ? (
            <MiniBarChart data={hourData} color="bg-yellow-400/70" height={140} />
          ) : (
            <div className="flex h-36 items-center justify-center text-sm text-slate-500">No data yet</div>
          )}
        </div>

        <div className="rounded-3xl border border-white/[0.08] bg-gradient-to-br from-white/[0.05] to-white/[0.02] p-6 backdrop-blur-sm">
          <div className="mb-5 flex items-center gap-2">
            <TrendingUp size={16} className="text-emerald-400" />
            <h3 className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">Floor Usage</h3>
          </div>
          {hasData && floorData.length > 0 ? (
            <HorizontalBarChart data={floorData} color="bg-emerald-400/60" />
          ) : (
            <div className="flex h-36 items-center justify-center text-sm text-slate-500">No data yet</div>
          )}
        </div>
      </section>

      {/* ── Operator Performance (Pro+) ──────────────────────────── */}
      <section>
        <h2 className="mb-4 text-xs font-black uppercase tracking-[0.25em] text-slate-500">Operator Performance</h2>
        {isProOrAbove ? (
          <div className="grid gap-4 sm:grid-cols-3">
            <MetricCard icon={CheckCircle2} label="Pickups" value={analytics.completed_requests} accent="from-teal-500/[0.08] to-teal-500/[0.02]" />
            <MetricCard icon={SkipForward} label="Skipped" value={analytics.skipped_count} sub={analytics.skipped_count > 0 ? `${Math.round((analytics.skipped_count / Math.max(analytics.total_requests, 1)) * 100)}% of requests` : undefined} accent="from-orange-500/[0.08] to-orange-500/[0.02]" />
            <MetricCard icon={Users} label="Full Events" value={analytics.full_events} sub="capacity limit reached" accent="from-pink-500/[0.08] to-pink-500/[0.02]" />
          </div>
        ) : (
          <LockedSection feature="Operator performance metrics" requiredPlan="pro" />
        )}
      </section>

      {/* ── Business Insight Cards (Pro+) ─────────────────────────── */}
      <section>
        <h2 className="mb-4 text-xs font-black uppercase tracking-[0.25em] text-slate-500">Insights</h2>
        {isProOrAbove ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {insights.map((ins, i) => {
              const Icon = ins.icon;
              return (
                <div key={i} className={`rounded-3xl border border-white/[0.08] bg-gradient-to-br ${ins.accent} p-5 backdrop-blur-sm`}>
                  <div className="flex items-start gap-3">
                    <Icon size={20} className="mt-0.5 shrink-0 text-slate-300" />
                    <p className="text-sm font-bold text-slate-200 leading-relaxed">{ins.text}</p>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="space-y-4">
            <UpgradeCTA feature="Business insights — identify peak congestion & prove productivity gains" requiredPlan="pro" />
            <div className="grid gap-4 sm:grid-cols-2 opacity-40 pointer-events-none">
              {insights.slice(0, 2).map((ins, i) => {
                const Icon = ins.icon;
                return (
                  <div key={i} className={`rounded-3xl border border-white/[0.08] bg-gradient-to-br ${ins.accent} p-5 backdrop-blur-sm blur-[3px]`}>
                    <div className="flex items-start gap-3">
                      <Icon size={20} className="mt-0.5 shrink-0 text-slate-300" />
                      <p className="text-sm font-bold text-slate-200 leading-relaxed">{ins.text}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
