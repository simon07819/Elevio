/** Libellé navigateur pour distinguer la tablette (pas le nom Bluetooth / reglages OS — non expose au web). */
const MAX_LEN = 72;

function truncate(label: string): string {
  const t = label.trim();
  if (t.length <= MAX_LEN) return t;
  return `${t.slice(0, MAX_LEN - 1)}…`;
}

/** Resume le User-Agent brut (ex. Safari macOS) sans la chaine Mozilla/5.0… */
export function shortLabelFromUserAgent(ua: string): string {
  const u = ua.trim();
  if (!u) return "Web";

  const isSafari = /\bSafari\//.test(u) && !/\bChrome\b|Chromium|CriOS/.test(u);
  if (isSafari) {
    const ver = u.match(/\bVersion\/([\d.]+)/)?.[1];
    const platform = /\biPhone\b/.test(u) ? "iPhone" : /\biPad\b/.test(u) ? "iPad" : /\bMac OS X\b/.test(u) ? "macOS" : "";
    const parts = ["Safari", ver, platform].filter(Boolean);
    return parts.join(" ");
  }

  if (/\bFirefox\//.test(u)) {
    const ver = u.match(/\bFirefox\/([\d.]+)/)?.[1];
    return ver ? `Firefox ${ver}` : "Firefox";
  }

  if (/\bEdg\//.test(u)) {
    const ver = u.match(/\bEdg\/([\d.]+)/)?.[1];
    return ver ? `Edge ${ver}` : "Edge";
  }

  if (/\bChrome\//.test(u) && !/\bEdg\b/.test(u)) {
    const ver = u.match(/\bChrome\/([\d.]+)/)?.[1];
    return ver ? `Chrome ${ver}` : "Chrome";
  }

  if (/\bAndroid\b/.test(u)) return "Android";

  return u.length > 52 ? `${u.slice(0, 51)}…` : u;
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
  const shortUa = ua ? shortLabelFromUserAgent(ua) : "";
  return truncate(shortUa || platform || "Web client");
}

const STORED_LABEL_MAX = 64;

/** Libelle appareil deja stocke en base (parfois ancien UA complet). */
export function formatStoredTabletLabel(raw: string): string {
  const t = raw.trim();
  if (!t) return "";
  const looksLikeUa = t.length >= 40 && /\bMozilla\b/.test(t);
  let out = looksLikeUa ? shortLabelFromUserAgent(t) : t;
  if (out.length > STORED_LABEL_MAX) {
    out = `${out.slice(0, STORED_LABEL_MAX - 1)}…`;
  }
  return out;
}
