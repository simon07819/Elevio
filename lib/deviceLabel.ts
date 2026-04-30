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

/** Exclut les marques génériques (Mozilla seul quand un autre navigateur est listé, Not=A?Brand, Gecko). */
function meaningfulBrandEntries(brands: { brand: string; version: string }[] | undefined): { brand: string; version: string }[] {
  if (!brands?.length) return [];
  const names = brands.map((b) => b.brand.trim()).filter(Boolean);
  return brands.filter((b) => {
    const brand = b.brand.trim();
    if (!brand || /^not/i.test(brand)) return false;
    if (brand === "Gecko") return false;
    if (brand === "Mozilla" && names.some((n) => n !== "Mozilla" && n !== "Gecko")) return false;
    return true;
  });
}

function brandsSummaryLowEntropy(brands: { brand: string; version: string }[] | undefined): string {
  const entries = meaningfulBrandEntries(brands);
  if (!entries.length) return "";
  return entries.map((b) => `${b.brand} ${b.version}`.trim()).join(", ");
}

function brandsSummaryNamesOnly(brands: { brand: string; version: string }[] | undefined): string {
  const entries = meaningfulBrandEntries(brands);
  if (!entries.length) return "";
  return entries.map((b) => b.brand).join(", ");
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
        const brandsStr = brandsSummaryNamesOnly(uaData.brands);
        const parts = [
          hints.model != null && String(hints.model).trim(),
          uaData.platform,
          hints.platformVersion != null && String(hints.platformVersion),
          uaData.mobile ? "Mobile" : "Desktop",
          brandsStr || undefined,
        ].filter(Boolean);
        if (parts.length > 0) {
          return truncate(parts.join(" · "));
        }
      }
    } catch {
      /* fall through */
    }

    const brands = brandsSummaryLowEntropy(uaData.brands);
    const coarse = [uaData.platform, uaData.mobile ? "Mobile" : "Desktop", brands].filter(Boolean).join(" · ");
    if (coarse) {
      return truncate(coarse);
    }
  }

  const ua = navigator.userAgent?.trim();
  const platform = navigator.platform?.trim();
  return truncate(ua || platform || "Web client");
}
