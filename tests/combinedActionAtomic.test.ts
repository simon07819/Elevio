/**
 * Atomic combined operator action — non-regression tests.
 *
 * Bug fixed:
 *   The "Déposer + Ramasser" button used to fire two parallel
 *   `advanceRequestStatus` calls. Each call ran `syncElevatorWithRequestStatus`
 *   (which writes elevator.direction / current_floor_id) AND its own
 *   `revalidatePath("/operator")`. Result: race condition between the two
 *   syncs (idle vs. request.direction), 2× SSR snapshots inflight, occasional
 *   10–15s lag where an old request reappeared and the next move went wrong.
 *
 * Fix:
 *   New atomic server action `applyCombinedOperatorAction` applies BOTH
 *   transitions in the requested order, computes the final elevator state
 *   ONCE, and revalidates ONCE. Two button variants share the same action:
 *     - "Déposer + Ramasser" → actionOrder = "dropoff_then_pickup"
 *     - "Ramasser + Déposer" → actionOrder = "pickup_then_dropoff"
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const root = process.cwd();
const ACTIONS = readFileSync(join(root, "lib/actions.ts"), "utf8");
const RECOMMENDED = readFileSync(join(root, "components/operator/RecommendedNextStop.tsx"), "utf8");
const I18N = readFileSync(join(root, "lib/i18n.ts"), "utf8");

// ───────────────────────────────────────────────────────────────────────────
// SERVER: applyCombinedOperatorAction
// ───────────────────────────────────────────────────────────────────────────

test("combined-atomic: server action applyCombinedOperatorAction is exported", () => {
  assert.match(ACTIONS, /export async function applyCombinedOperatorAction/, "server action exists");
});

test("combined-atomic: action accepts the correct shape", () => {
  const sig = ACTIONS.match(/applyCombinedOperatorAction\(input: \{[\s\S]*?\}\)/)?.[0] ?? "";
  assert.match(sig, /elevatorId/, "elevatorId in input");
  assert.match(sig, /projectId/, "projectId in input");
  assert.match(sig, /dropoffRequestIds/, "dropoffRequestIds in input");
  assert.match(sig, /pickupRequestId/, "pickupRequestId in input");
  assert.match(sig, /actionOrder/, "actionOrder in input");
  assert.match(sig, /dropoff_then_pickup/, "dropoff-first order supported");
  assert.match(sig, /pickup_then_dropoff/, "pickup-first order supported");
});

function extractCombinedActionBody(): string {
  // Capture from the export line up to the next top-level `export ` declaration
  // or the next top-level JSDoc comment (start of the next exported entity).
  const start = ACTIONS.indexOf("export async function applyCombinedOperatorAction");
  assert.ok(start >= 0, "applyCombinedOperatorAction must exist");
  const after = ACTIONS.slice(start + 1);
  const nextExport = after.search(/\nexport (?:async )?function /);
  const nextDoc = after.search(/\n\/\*\* /);
  const candidates = [nextExport, nextDoc].filter((n) => n > 0);
  const end = candidates.length > 0 ? Math.min(...candidates) : after.length;
  return ACTIONS.slice(start, start + 1 + end);
}

test("combined-atomic: action enforces auth", () => {
  const fn = extractCombinedActionBody();
  assert.match(fn, /supabase\.auth\.getUser/, "auth check before mutating");
  assert.match(fn, /Connexion operateur requise/, "rejects unauthenticated calls");
});

test("combined-atomic: action validates UUIDs", () => {
  const fn = extractCombinedActionBody();
  assert.match(fn, /isUuid\(elevatorId\)/, "validates elevatorId");
  assert.match(fn, /isUuid\(projectId\)/, "validates projectId");
  assert.match(fn, /isUuid\(id\)/, "validates each dropoff id");
  assert.match(fn, /isUuid\(pickupRequestId\)/, "validates pickup id when provided");
});

test("combined-atomic: applies transitions sequentially in the requested order", () => {
  const fn = extractCombinedActionBody();
  assert.match(fn, /completeDropoff/, "completeDropoff helper");
  assert.match(fn, /boardPickup/, "boardPickup helper");
  assert.match(fn, /actionOrder === "pickup_then_dropoff"/, "branches on pickup-first order");
  assert.match(fn, /if \(!res\.ok\) \{[\s\S]*?return res;[\s\S]*?\}/, "returns on first error");
});

test("combined-atomic: rejects double-pickup on a different elevator", () => {
  const fn = extractCombinedActionBody();
  assert.match(fn, /elevator_id !== elevatorId/, "checks pickup is on the same elevator");
});

test("combined-atomic: idempotent on already-completed and already-boarded", () => {
  const fn = extractCombinedActionBody();
  assert.match(fn, /status === "completed" \|\| status === "cancelled"/, "completed/cancelled is no-op");
  assert.match(fn, /status === "boarded"/, "boarded is no-op");
});

test("combined-atomic: enforces legal transitions", () => {
  const fn = extractCombinedActionBody();
  assert.match(fn, /isLegalTransition\(status, "completed"\)/, "checks completed transition");
  assert.match(fn, /isLegalTransition\(status, "boarded"\)/, "checks boarded transition");
});

test("combined-atomic: computes final elevator state ONCE (no race)", () => {
  const fn = extractCombinedActionBody();
  assert.match(fn, /sumBoardedPassengersForElevator/, "computes load from final DB state");
  assert.match(fn, /\.from\("elevators"\)\s*\n?\s*\.update\(elevatorPatch\)/, "single elevator UPDATE");
  // No CALL to syncElevatorWithRequestStatus (mention in comment is OK).
  assert.doesNotMatch(fn, /\bsyncElevatorWithRequestStatus\(/, "no per-request sync call inside combined action");
});

test("combined-atomic: revalidates ONCE in background, never blocks the response", () => {
  const fn = extractCombinedActionBody();
  assert.match(fn, /void \(async \(\) => \{[\s\S]*?revalidatePath\("\/operator"\)[\s\S]*?\}\)\(\);/, "revalidates in background");
  assert.match(fn, /return \{ ok: true, message: "Action combinee appliquee\." \}/, "returns ok before background tasks");
});

// ───────────────────────────────────────────────────────────────────────────
// CLIENT: RecommendedNextStop wires up the atomic action
// ───────────────────────────────────────────────────────────────────────────

test("combined-atomic: client imports applyCombinedOperatorAction", () => {
  assert.match(RECOMMENDED, /import \{[^}]*applyCombinedOperatorAction[^}]*\} from "@\/lib\/actions"/, "client imports the atomic action");
});

test("combined-atomic: both button handlers route through the same atomic helper", () => {
  assert.match(RECOMMENDED, /function runCombined/, "runCombined helper exists");
  assert.match(RECOMMENDED, /function dropoffAndPickup\(\) \{\s*runCombined\("dropoff_then_pickup"\)/, "dropoff-first delegates");
  assert.match(RECOMMENDED, /function pickupAndDropoff\(\) \{[\s\S]*?runCombined\("pickup_then_dropoff"/, "pickup-first delegates");
});

test("combined-atomic: optimistic UI updates BOTH sides before the server call", () => {
  const fn = RECOMMENDED.match(/function runCombined[\s\S]*?^  \}/m)?.[0] ?? "";
  assert.match(fn, /pickupRunningRef\.current = true/, "anti-spam lock taken before optimistic UI");
  assert.match(fn, /onPickupSuccess/, "pickup optimistic callback");
  assert.match(fn, /onDropoffSuccess/, "dropoff optimistic callback");
  // Optimistic order matches actionOrder semantics
  assert.match(fn, /actionOrder === "pickup_then_dropoff"/, "branches optimistic order");
});

test("combined-atomic: rolls back BOTH sides on server error or exception", () => {
  const fn = RECOMMENDED.match(/function runCombined[\s\S]*?^  \}/m)?.[0] ?? "";
  assert.match(fn, /onPickupFailure/, "pickup rollback on failure");
  assert.match(fn, /onDropoffFailure/, "dropoff rollback on failure");
  assert.match(fn, /\.catch\(/, "exception path rolls back too");
});

test("combined-atomic: reverse-order button shown when pickup is primary at a shared floor", () => {
  assert.match(RECOMMENDED, /dropoffIdsAtPickupFloor/, "computes dropoffs at pickup floor");
  assert.match(RECOMMENDED, /showPickupThenDropoff/, "renders the reverse-order combined state");
  assert.match(RECOMMENDED, /onClick=\{pickupAndDropoff\}/, "reverse button bound to handler");
});

// ───────────────────────────────────────────────────────────────────────────
// I18N
// ───────────────────────────────────────────────────────────────────────────

test("combined-atomic: i18n keys exist in fr/en/es", () => {
  assert.match(I18N, /"operator\.pickupAndDropoff": "Ramasser \+ Déposer"/, "FR reverse label");
  assert.match(I18N, /"operator\.pickupAndDropoff": "Pickup \+ Drop off"/, "EN reverse label");
  assert.match(I18N, /"operator\.pickupAndDropoff": "Recoger \+ Dejar"/, "ES reverse label");
});
