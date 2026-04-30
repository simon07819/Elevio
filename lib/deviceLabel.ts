/** Libellé navigateur pour distinguer la tablette (pas le nom Bluetooth / reglages OS — non expose au web). */
const MAX_LEN = 120;

function truncate(label: string): string {
  const t = label.trim();
  if (t.length <= MAX_LEN) return t;
  return `${t.slice(0, MAX_LEN - 1)}…`;
}

/** Typage minimal — User-Agent Client Hints absents du lib DOM standard. */
type UADataHints = {
  brands?: { brand: string; version: string }[];
  mobile?: boolean;
  platform?: string;
  getHighEntropyValues?(hints: string[]): Promise<Record<string, string | boolean>>;
};

function readNavigatorUAData(): UADataHints | undefined {
  if (typeof navigator === "undefined" || !("userAgentData" in navigator)) {
    return undefined;
  }
  return (navigator as Navigator & { userAgentData: UADataHints }).userAgentData;
}

export async function getOperatorDeviceLabel(): Promise<string> {
  if (typeof navigator === "undefined") {
    return "Web";
  }

  const uaData = readNavigatorUAData();
  if (uaData) {
    try {
      if (typeof uaData.getHighEntropyValues === "function") {
        const hints = await uaData.getHighEntropyValues(["model", "platformVersion"]);
        const brands = uaData.brands?.map((b) => b.brand).join(", ") ?? "";
        const parts = [
          hints.model != null && String(hints.model),
          uaData.platform,
          hints.platformVersion != null && String(hints.platformVersion),
          uaData.mobile ? "Mobile" : "Desktop",
          brands,
        ].filter(Boolean);
        if (parts.length > 0) {
          return truncate(parts.join(" · "));
        }
      }
    } catch {
      /* fall through */
    }

    const brands = uaData.brands?.map((b) => `${b.brand} ${b.version}`).join(", ");
    const coarse = [uaData.platform, uaData.mobile ? "Mobile" : "Desktop", brands].filter(Boolean).join(" · ");
    if (coarse) {
      return truncate(coarse);
    }
  }

  const ua = navigator.userAgent?.trim();
  const platform = navigator.platform?.trim();
  return truncate(ua || platform || "Web client");
}
