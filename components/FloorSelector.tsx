"use client";

import type { Floor } from "@/types/hoist";
import { cn, formatFloorLabel } from "@/lib/utils";
import { useLanguage } from "@/components/i18n/LanguageProvider";

export function FloorSelector({
  floors,
  currentFloorId,
  selectedFloorId,
  onSelect,
}: {
  floors: Floor[];
  currentFloorId: string;
  selectedFloorId: string;
  onSelect: (floorId: string) => void;
}) {
  const availableFloors = floors.filter((floor) => floor.active && floor.id !== currentFloorId);
  const { t } = useLanguage();

  return (
    <div className="max-h-[32svh] overflow-y-auto overscroll-contain rounded-[1.25rem] pr-1 sm:max-h-[45vh]">
      <div className="grid grid-cols-2 gap-2">
        {availableFloors.map((floor) => {
          const isSelected = floor.id === selectedFloorId;

          return (
            <button
              key={floor.id}
              type="button"
              onClick={() => onSelect(floor.id)}
              className={cn(
                "touch-target min-h-20 rounded-[1.2rem] border px-3 py-3 text-center transition active:scale-[0.98]",
                isSelected
                  ? "border-yellow-300 bg-yellow-300 text-slate-950 shadow-md"
                  : "border-slate-200 bg-slate-50 text-slate-950 shadow-sm hover:border-yellow-300",
              )}
            >
              <span className="block text-[11px] font-black uppercase tracking-[0.16em] opacity-70">
                {t("request.goTo")}
              </span>
              <span className="mt-1 block text-3xl font-black leading-none">{formatFloorLabel(floor)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
