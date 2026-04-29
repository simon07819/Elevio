import { BarChart3, Clock, TrendingUp, XCircle } from "lucide-react";
import { T } from "@/components/i18n/LanguageProvider";
import { demoFloors, demoRequests } from "@/lib/demoData";
import { formatFloorLabel, formatWaitTime } from "@/lib/utils";
import type { TranslationKey } from "@/lib/i18n";

export function StatsDashboard() {
  const completed = demoRequests.filter((request) => request.status === "completed").length;
  const cancelled = demoRequests.filter((request) => request.status === "cancelled").length;
  const busiestFloorId = demoRequests.reduce<Record<string, number>>((acc, request) => {
    acc[request.from_floor_id] = (acc[request.from_floor_id] ?? 0) + 1;
    return acc;
  }, {});
  const busiest = Object.entries(busiestFloorId).sort((a, b) => b[1] - a[1])[0];
  const busiestFloor = demoFloors.find((floor) => floor.id === busiest?.[0]);

  const cards = [
    { label: "stats.today", value: demoRequests.length, icon: BarChart3, color: "text-yellow-200" },
    { label: "stats.average", value: formatWaitTime(demoRequests[0].wait_started_at), icon: Clock, color: "text-sky-200" },
    { label: "stats.busiestFloor", value: formatFloorLabel(busiestFloor), icon: TrendingUp, color: "text-emerald-200" },
    { label: "stats.cancelled", value: cancelled, icon: XCircle, color: "text-red-200" },
  ] satisfies Array<{ label: TranslationKey; value: string | number; icon: typeof BarChart3; color: string }>;

  return (
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
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
      <div className="glass-panel rounded-[2rem] p-5 sm:col-span-2 xl:col-span-4">
        <p className="text-xs font-black uppercase tracking-[0.25em] text-yellow-200"><T k="stats.busyHours" /></p>
        <div className="mt-5 grid grid-cols-8 gap-2">
          {[35, 70, 55, 88, 64, 40, 22, 10].map((height, index) => (
            <div key={index} className="flex h-32 items-end rounded-2xl bg-white/8 p-2">
              <div className="w-full rounded-xl bg-yellow-300" style={{ height: `${height}%` }} />
            </div>
          ))}
        </div>
        <p className="mt-3 text-sm text-slate-400"><T k="stats.demoNote" values={{ count: completed }} /></p>
      </div>
    </section>
  );
}
