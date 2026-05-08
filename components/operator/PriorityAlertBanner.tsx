"use client";

import { AlertTriangle } from "lucide-react";
import type { EnrichedRequest } from "@/types/hoist";
import { formatFloorLabel } from "@/lib/utils";

/**
 * Full-width priority alert banner shown at the top of the operator dashboard.
 * Impossible to miss — red gradient, pulsing border, large text.
 * Shows the most urgent active priority request(s) with reason and floor info.
 */
export function PriorityAlertBanner({ priorityRequests }: { priorityRequests: EnrichedRequest[] }) {
  if (priorityRequests.length === 0) return null;

  return (
    <div className="anim-pulse-priority-banner rounded-3xl border-2 border-red-500/70 bg-gradient-to-r from-red-600 via-red-500 to-orange-500 p-4 shadow-2xl shadow-red-500/30">
      {priorityRequests.map((req) => (
        <div key={req.id} className="flex items-start gap-4 first:mb-3">
          <div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-white/20">
            <AlertTriangle size={28} className="text-white anim-pulse-priority-icon" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3">
              <span className="text-lg font-black uppercase tracking-wider text-white">
                Demande prioritaire
              </span>
              <span className="rounded-xl bg-white/20 px-3 py-1 text-base font-black text-white">
                {formatFloorLabel(req.from_floor)} → {formatFloorLabel(req.to_floor)}
              </span>
            </div>
            {req.priority_reason ? (
              <p className="mt-2 text-xl font-black text-white leading-snug">
                {req.priority_reason}
              </p>
            ) : (
              <p className="mt-2 text-base font-bold text-white/80">
                Action requise immédiatement
              </p>
            )}
            {req.note && (
              <p className="mt-1 text-base font-bold text-white/70">
                {req.note}
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
