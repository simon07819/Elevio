import { Hash } from "lucide-react";
import { T } from "@/components/i18n/LanguageProvider";
import { demoFloors } from "@/lib/demoData";
import { formatFloorLabel } from "@/lib/utils";

export function AdminFloorManager() {
  return (
    <section className="glass-panel rounded-[2rem] p-5">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.25em] text-yellow-200"><T k="setup.floors" /></p>
          <h2 className="text-2xl font-black text-white"><T k="floors.verticalConfig" /></h2>
          <p className="mt-1 text-sm font-bold text-slate-400">
            <T k="floors.demoConfigured" values={{ count: demoFloors.length }} />
          </p>
        </div>
        <Hash className="text-slate-400" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {demoFloors.map((floor) => (
          <div key={floor.id} className="rounded-3xl border border-white/10 bg-white/8 p-4">
            <p className="text-4xl font-black text-white">{formatFloorLabel(floor)}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
