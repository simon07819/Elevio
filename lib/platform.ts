/**
 * Platform detection for Elevio.
 *
 * iOS (Capacitor native) vs Web — used to enforce App Store rules:
 * - On iOS: only RevenueCat IAP allowed, no Stripe, no external payment links
 * - On Web: Stripe + RevenueCat both available
 */

/** Check if running inside Capacitor native shell (iOS/Android) */
export function isCapacitorNative(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const w = window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } };
    return typeof w.Capacitor?.isNativePlatform === "function"
      && w.Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

/** Check if running on iOS specifically */
export function isIOS(): boolean {
  if (typeof window === "undefined") return false;
  if (!isCapacitorNative()) return false;
  try {
    const w = window as unknown as { Capacitor?: { getPlatform?: () => string } };
    return w.Capacitor?.getPlatform?.() === "ios";
  } catch {
    return false;
  }
}

/**
 * Runtime guard: throw if Stripe is called on iOS.
 * Use at the top of any Stripe-related function that could be
 * accidentally invoked on iOS.
 */
export function assertNotIOS(action: string): void {
  if (isIOS()) {
    throw new Error(
      `[App Store] Blocked "${action}" — external payments not allowed on iOS. Use RevenueCat IAP instead.`
    );
  }
}
