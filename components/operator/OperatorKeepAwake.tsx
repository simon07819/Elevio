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

  return (
    <div className="rounded-full bg-emerald-400/15 px-4 py-2 text-sm font-black text-emerald-100">
      <TabletSmartphone className="mr-2 inline" size={16} />
      {text}
    </div>
  );
}
