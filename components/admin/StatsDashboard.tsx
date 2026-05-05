import { BarChart3, Clock, TrendingUp, XCircle, SkipForward, Users } from "lucide-react";
import { T } from "@/components/i18n/LanguageProvider";
import type { TranslationKey } from "@/lib/i18n";
import type { ProjectAnalytics } from "@/lib/analytics";

function fmtSeconds(seconds: number): string {
  if (seconds <= 0) return "—";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}m${s > 0 ? ` ${s}s` : ""}`;
}

export function StatsDashboard({ analytics }: { analytics: ProjectAnalytics }) {
  const cards = [
    { label: "stats.totalRequests", value: analytics.total_requests, icon: BarChart3, color: "text-yellow-200" },
    { label: "stats.avgWait", value: fmtSeconds(analytics.avg_wait_seconds), icon: Clock, color: "text-sky-200" },
    { label: "stats.avgTravel", value: fmtSeconds(analytics.avg_travel_seconds), icon: TrendingUp, color: "text-emerald-200" },
    { label: "stats.cancelled", value: analytics.cancelled_requests, icon: XCircle, color: "text-red-200" },
    { label: "stats.skipped", value: analytics.skipped_count, icon: SkipForward, color: "text-orange-200" },
    { label: "stats.fullEvents", value: analytics.full_events, icon: Users, color: "text-purple-200" },
  ] satisfies Array<{ label: TranslationKey; value: string | number; icon: typeof BarChart3; color: string }>;

  return (
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <div key={card.label} className="glass-panel rounded-[2rem] p-5">
            <Icon className={card.color} />
            <p className="mt-5 text-sm font-bold text-slate-400"><T k={card.label} /></p>
            <p className="mt-2 text-3xl font-black text-white">{card.value}</p>
          </div>
        );
      })}

      {analytics.busiest_hours.length > 0 && (
        <div className="glass-panel rounded-[2rem] p-5 sm:col-span-2 xl:col-span-3">
          <p className="text-xs font-black uppercase tracking-[0.25em] text-yellow-200"><T k="stats.busyHours" /></p>
          <div className="mt-5 grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(analytics.busiest_hours.length, 8)}, 1fr)` }}>
            {analytics.busiest_hours.slice(0, 8).map(({ hour, count }) => {
              const maxCount = Math.max(...analytics.busiest_hours.map((h) => h.count), 1);
              const pct = Math.round((count / maxCount) * 100);
              return (
                <div key={hour} className="flex h-32 items-end rounded-2xl bg-white/8 p-2">
                  <div className="w-full rounded-xl bg-yellow-300" style={{ height: `${pct}%` }} />
                </div>
              );
            })}
          </div>
          <div className="mt-2 flex gap-2 text-xs font-bold text-slate-400">
            {analytics.busiest_hours.slice(0, 8).map(({ hour }) => (
              <span key={hour} className="flex-1 text-center">{hour}h</span>
            ))}
          </div>
        </div>
      )}

      {analytics.top_floors.length > 0 && (
        <div className="glass-panel rounded-[2rem] p-5 sm:col-span-2 xl:col-span-3">
          <p className="text-xs font-black uppercase tracking-[0.25em] text-emerald-200"><T k="stats.topFloors" /></p>
          <div className="mt-4 space-y-2">
            {analytics.top_floors.slice(0, 5).map(({ floor_label, count }) => {
              const maxCount = Math.max(...analytics.top_floors.map((f) => f.count), 1);
              const pct = Math.round((count / maxCount) * 100);
              return (
                <div key={floor_label} className="flex items-center gap-3">
                  <span className="w-16 text-sm font-black text-white">{floor_label}</span>
                  <div className="flex-1 rounded-full bg-white/10 h-6 overflow-hidden">
                    <div className="h-full rounded-full bg-emerald-400/60" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-sm font-black text-slate-300">{count}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
