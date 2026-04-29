"use client";

import { useEffect, useState } from "react";
import { TabletSmartphone } from "lucide-react";
import { useLanguage } from "@/components/i18n/LanguageProvider";

type WakeLockSentinel = {
  release: () => Promise<void>;
  addEventListener: (type: "release", listener: () => void) => void;
};

export function OperatorKeepAwake() {
  const [state, setState] = useState<"active" | "unsupported" | "blocked">("unsupported");
  const { t } = useLanguage();

  useEffect(() => {
    let sentinel: WakeLockSentinel | null = null;
    let cancelled = false;

    async function requestWakeLock() {
      const wakeLock = (
        navigator as Navigator & {
          wakeLock?: { request: (type: "screen") => Promise<WakeLockSentinel> };
        }
      ).wakeLock;

      if (!wakeLock) {
        setState("unsupported");
        return;
      }

      try {
        sentinel = await wakeLock.request("screen");
        if (!cancelled) {
          setState("active");
        }
        sentinel.addEventListener("release", () => {
          if (!cancelled) {
            setState("blocked");
          }
        });
      } catch {
        setState("blocked");
      }
    }

    function handleVisibility() {
      if (document.visibilityState === "visible") {
        requestWakeLock();
      }
    }

    requestWakeLock();
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", handleVisibility);
      sentinel?.release().catch(() => undefined);
    };
  }, []);

  const text =
    state === "active"
      ? t("operator.wakeActive")
      : t("operator.wakeUnavailable");

  /* Wake Lock uniquement (anti-veille) — pas l’activation ascenseur (voir OperatorWorkspace). */
  const tone =
    state === "active"
      ? "border border-sky-400/25 bg-sky-500/10 text-sky-100"
      : "border border-amber-400/25 bg-amber-500/10 text-amber-100";

  return (
    <div title={state === "active" ? "Wake Lock navigateur" : undefined} className={`rounded-full px-4 py-2 text-sm font-black ${tone}`}>
      <TabletSmartphone className="mr-2 inline opacity-90" size={16} />
      {text}
    </div>
  );
}
