import { ArrowDown, ArrowUp, Minus, Radio } from "lucide-react";
import { T } from "@/components/i18n/LanguageProvider";
import { formatFloorLabel } from "@/lib/utils";
import type { TranslationKey } from "@/lib/i18n";
import type { Direction, Elevator, Floor } from "@/types/hoist";

const directionKeys = {
  idle: "direction.idle",
  up: "direction.up",
  down: "direction.down",
} satisfies Record<Direction, TranslationKey>;

export function ElevatorStatusPanel({ elevator, currentFloor }: { elevator: Elevator; currentFloor?: Floor }) {
  const DirectionIcon = elevator.direction === "up" ? ArrowUp : elevator.direction === "down" ? ArrowDown : Minus;

  return (
    <section className="glass-panel rounded-[2rem] p-5">
      <p className="text-xs font-black uppercase tracking-[0.25em] text-yellow-200"><T k="operator.cabinState" /></p>
      <div className="mt-4 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-4xl font-black text-white">{formatFloorLabel(currentFloor)}</h2>
          <p className="mt-1 text-sm text-slate-400">{elevator.name}</p>
        </div>
        <span className="grid size-16 place-items-center rounded-3xl border border-white/15 bg-white/10 text-yellow-200">
          <DirectionIcon size={34} />
        </span>
      </div>
      <div className="mt-5 flex items-center gap-2 rounded-2xl bg-emerald-400/10 p-3 text-sm font-bold text-emerald-100">
        <Radio size={16} />
        <T k="operator.direction" />: <T k={directionKeys[elevator.direction]} />
      </div>
    </section>
  );
}
