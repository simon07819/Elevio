"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { TabletSmartphone } from "lucide-react";
import { adminDeactivateOperatorTablet } from "@/lib/actions";
import { useLanguage } from "@/components/i18n/LanguageProvider";
import { elevatorHasOperatorTabletBinding, elevatorOperatorSessionAppearsLive } from "@/lib/operatorTablet";
import type { Elevator } from "@/types/hoist";

/** Même logique que la barre opérateur : libellé navigateur à jour pour cette tablette, sinon valeur stockée. */
function tabletDeviceDisplayLine(elevator: Elevator, sessionId: string | null | undefined, liveDeviceLabel: string): string {
  const stored = elevator.operator_tablet_label?.trim() ?? "";
  const live = liveDeviceLabel.trim();
  const isThisTablet = Boolean(sessionId && elevator.operator_session_id === sessionId);
  if (isThisTablet) {
    return live || stored;
  }
  return stored;
}

export function OperatorTabletSessionsPanel({
  projectId,
  elevators,
  sessionId,
  deviceLabel = "",
}: {
  projectId: string;
  elevators: Elevator[];
  /** Session navigateur courante : permet d’afficher le même libellé appareil que dans la barre opérateur. */
  sessionId?: string | null;
  /** Résultat de `getOperatorDeviceLabel()` sur cet appareil. */
  deviceLabel?: string;
}) {
  const router = useRouter();
  const { t } = useLanguage();
  const [isPending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const bound = elevators.filter((e) => elevatorHasOperatorTabletBinding(e));

  if (bound.length === 0) {
    return null;
  }

  function deactivate(elevatorId: string) {
    if (!window.confirm(t("elevator.deactivateTabletConfirm"))) return;
    setErrorMessage(null);
    startTransition(async () => {
      const result = await adminDeactivateOperatorTablet(projectId, elevatorId);
      if (!result.ok) {
        setErrorMessage(result.message);
        return;
      }
      router.refresh();
    });
  }

  return (
    <section className="mx-auto mb-4 max-w-7xl rounded-3xl border border-white/10 bg-white/8 p-4">
      <p className="text-xs font-black uppercase tracking-[0.25em] text-yellow-200">{t("operator.tabletSessionsEyebrow")}</p>
      <h2 className="mt-1 text-xl font-black text-white">{t("operator.tabletSessionsTitle")}</h2>
      <p className="mt-2 max-w-3xl text-sm font-bold text-slate-400">{t("operator.tabletSessionsBody")}</p>

      {errorMessage ? (
        <p className="mt-3 rounded-2xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm font-bold text-red-100">
          {errorMessage}
        </p>
      ) : null}

      <ul className="mt-4 grid gap-3">
        {bound.map((elevator) => {
          const live = elevatorOperatorSessionAppearsLive(elevator);
          const displayLine = tabletDeviceDisplayLine(elevator, sessionId, deviceLabel);
          return (
            <li
              key={elevator.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-slate-950/50 px-4 py-3"
            >
              <div className="min-w-0">
                <p className="font-black text-white">{elevator.name}</p>
                <p className="mt-1 text-xs font-bold text-slate-400">
                  {displayLine ? t("operator.tabletSessionsDeviceLine", { device: displayLine }) : t("operator.tabletNoDeviceName")}
                </p>
                <p className={`mt-2 inline-block rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-wide ${live ? "bg-emerald-500/15 text-emerald-100" : "bg-amber-500/15 text-amber-100"}`}>
                  {live ? t("operator.tabletStatusConnected") : t("operator.tabletStatusQuiet")}
                </p>
              </div>
              <button
                type="button"
                disabled={isPending}
                onClick={() => deactivate(elevator.id)}
                className="touch-target inline-flex shrink-0 items-center gap-2 rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-sm font-black text-white disabled:opacity-50"
              >
                <TabletSmartphone size={18} />
                {t("operator.tabletDeactivate")}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
