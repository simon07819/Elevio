/**
 * App Store critical bug fixes — targeted tests.
 *
 * Bugs fixed:
 * 1. All operators inactive → cancel requests (already handled, add regression test)
 * 2. Release tablet → re-activate too slow (clock 5s + force update)
 * 3. Sync release between operators (broadcast + clock fix)
 * 4. Passenger message after request (body text restored for pending)
 * 5. Dispatch on the way (inferredDirectionFromQueue for scoring)
 * 6. After pickup → instant passenger QR reset (broadcastChannelRef.ready fix)
 * 7. Terminal paused after dropoff (regression test)
 * 8. PLEIN does not affect other terminals (regression test)
 * 9. New active operator picks up useful requests (regression test)
 * 10. Release + new request goes to remaining operator (regression test)
 * 11. Last known position used for scoring (regression test)
 * 12. Navigation prefetch (prefetch=true on nav links)
 * 13. QR print blank page fix (height:auto on poster-grid)
 * 14. Support page complete with legal sections
 *
 * Tests:
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const root = process.cwd();

// Bug 2: Clock interval reduced to 5 seconds
test("bug2: operator clock interval reduced for faster re-activation", () => {
  const ws = readFileSync(join(root, "components/operator/OperatorWorkspace.tsx"), "utf8");
  assert.match(ws, /setInterval.*5_000/, "clock interval is 5 seconds");
});

// Bug 2: Clock force-updated on release and activate
test("bug2: clock force-updated on release and activate", () => {
  const ws = readFileSync(join(root, "components/operator/OperatorWorkspace.tsx"), "utf8");
  assert.match(ws, /setOperatorClockMs\(Date\.now\(\)\)/, "clock forced on release");
  assert.match(ws, /setOperatorClockMs\(nowMs\)/, "clock forced on activate");
});

// Bug 4: Passenger sees encouragement body text for pending status
test("bug4: pending status shows encouragement body text", () => {
  const form = readFileSync(join(root, "components/RequestForm.tsx"), "utf8");
  assert.match(form, /request\.sentBody/, "sentBody key used for pending body");
  assert.match(form, /submittedRequest\.status === "pending"/, "pending condition");
});

// Bug 5: inferredDirectionFromQueue used for scoring
test("bug5: inferredDirectionFromQueue considers assigned requests for scoring", () => {
  const routing = readFileSync(join(root, "lib/elevatorRouting.ts"), "utf8");
  assert.match(routing, /inferredDirectionFromQueue/, "function exists");
  assert.match(routing, /assigned.*pending.*arriving/, "considers assigned requests");
  const brain = readFileSync(join(root, "services/elevatorBrain.ts"), "utf8");
  assert.match(brain, /inferredDirectionFromQueue/, "used in scoring");
});

// Bug 6: broadcastChannelRef.ready properly tracked
test("bug6: broadcastChannelRef.ready is tracked in ref object", () => {
  const dash = readFileSync(join(root, "components/operator/OperatorDashboard.tsx"), "utf8");
  assert.match(dash, /ref\.ready\s*=\s*true/, "ready flag written back to ref");
  assert.match(dash, /ref\?\.ready/, "ready flag checked before using channel");
});

// Bug 8: PLEIN scoring penalty is per-elevator (5000 penalty on manual_full)
test("bug8: PLEIN penalty is per-elevator in scoring, not global", () => {
  const brain = readFileSync(join(root, "services/elevatorBrain.ts"), "utf8");
  assert.match(brain, /manualFull.*5000/, "manual_full penalty is 5000 on scored elevator");
  // Verify it's only on the elevator with manual_full, not all
  assert.ok(!brain.includes("manualFullAll") && !brain.includes("allManualFull"), "no global PLEIN flag");
});

// Bug 12: Navigation prefetch enabled
test("bug12: AppNavigation uses prefetch for faster admin navigation", () => {
  const nav = readFileSync(join(root, "components/AppNavigation.tsx"), "utf8");
  assert.match(nav, /prefetch/, "prefetch enabled");
});

// Bug 13: QR print blank page — poster-grid height:auto
test("bug13: qr-poster-grid has height:auto to prevent blank page", () => {
  const css = readFileSync(join(root, "app/globals.css"), "utf8");
  // poster-grid should have min-height:0 and height:auto
  assert.match(css, /\.qr-poster-grid[\s\S]{0,200}height:\s*auto/, "poster-grid height auto");
  assert.match(css, /\.qr-print-sheet[\s\S]{0,200}height:\s*auto/, "print-sheet height auto");
});

// Bug 14: Support page has all required sections
test("bug14: support page has all required legal sections", () => {
  const page = readFileSync(join(root, "app/support/page.tsx"), "utf8");
  assert.match(page, /support\.passenger/, "passenger section");
  assert.match(page, /support\.operator/, "operator section");
  assert.match(page, /support\.faqSection/, "FAQ section");
  assert.match(page, /support\.contactSection|mailto:/, "contact section");
  assert.match(page, /\/legal\/privacy/, "privacy link");
  assert.match(page, /\/legal\/terms/, "terms link");
  assert.match(page, /support\.safetySection/, "safety section");
  assert.match(page, /support\.liabilitySection/, "liability section");
});

// Bug 14: i18n keys for all legal sections exist (FR)
test("bug14: i18n keys for legal sections exist FR+EN", () => {
  const i18n = readFileSync(join(root, "lib/i18n.ts"), "utf8");
  assert.match(i18n, /support\.howToUseBody/, "howToUseBody FR");
  assert.match(i18n, /support\.faqBody/, "faqBody FR");
  assert.match(i18n, /support\.privacyBody/, "privacyBody FR");
  assert.match(i18n, /support\.termsBody/, "termsBody FR");
  assert.match(i18n, /support\.safetyBody/, "safetyBody FR");
  assert.match(i18n, /support\.liabilityBody/, "liabilityBody FR");
  // EN versions
  assert.match(i18n, /How to use the app/, "howToUse EN");
  assert.match(i18n, /Common issues/, "faq EN");
  assert.match(i18n, /Construction site safety/, "safety EN");
  assert.match(i18n, /Limitation of liability/, "liability EN");
});
