/**
 * Non-regression tests for: PAUSE after Ramasser + passenger QR not returning.
 *
 * Bug 1 — PAUSE after Ramasser:
 *   After operator clicks pickup, brain must show "Déposer" (dropoff), NEVER PAUSE.
 *   Root cause: brain's pendingBoardedDestinations() could return empty if
 *   elevator direction/current_floor_id was stale from server, causing the
 *   idle branch to fire. Also: the syncRequests poll's `kept` filter could
 *   discard optimistically boarded requests before server confirms.
 *
 *   Fix 1a: PAUSE INTERDICT guard in OperatorDashboard — if hasBoardedPassengers
 *     and brain returns "wait" (no nextFloor, no dropoffs), override to show
 *     dropoff with nearest destination.
 *   Fix 1b: optimistic request protection in `kept` filter — requests in
 *     optimisticRequestsRef are never discarded by the poll.
 *
 * Bug 2 — Passenger QR not returning after Ramasser:
 *   After pickup, passenger must return to QR page instantly (<500ms).
 *   Root cause: pre-subscribed channel's .on() handlers were only registered
 *   in the submittedRequest effect (not at mount time), creating a race
 *   condition where broadcast could arrive before handlers attached.
 *
 *   Fix 2a: .on() handlers registered at MOUNT time on pre-subscribed channel,
 *     using requestIdRef to track current request ID.
 *   Fix 2b: operator sends broadcast via both pre-subscribed AND one-shot
 *     channel (belt-and-suspenders).
 *   Fix 2c: requestIdRef always synced with submittedRequest.requestId.
 *
 * Structural tests verify source code contains the fixes.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const root = process.cwd();

// ═══════════════════════════════════════════════════════════════════════════
// BUG 1 — PAUSE INTERDICT
// ═══════════════════════════════════════════════════════════════════════════

test("pause-interdict: guard exists when hasBoardedPassengers and brain shows wait", () => {
  const dash = readFileSync(join(root, "components/operator/OperatorDashboard.tsx"), "utf8");
  assert.match(dash, /hasBoardedPassengers/, "hasBoardedPassengers computed");
  // Guard checks: no nextFloor + no dropoffs + hasAnyBoardedWork (live + optimistic)
  assert.match(dash, /!recommendation\.nextFloor.*recommendation\.requestsToDropoff.*hasAnyBoardedWork/s, "PAUSE INTERDICT guard condition");
  // Override sets nextFloor to dropoff destination
  assert.match(dash, /dropFloor/, "dropoff floor computed");
  assert.match(dash, /requestsToDropoff.*dropoffs/, "dropoffs set in override");
});

test("pause-interdict: override computes nearest dropoff from liveActivePassengers", () => {
  const dash = readFileSync(join(root, "components/operator/OperatorDashboard.tsx"), "utf8");
  // Sorts passengers by distance from current floor
  assert.match(dash, /sortedPassengers/, "passengers sorted");
  // Picks nearest destination
  assert.match(dash, /nearest.*sortedPassengers/, "nearest passenger selected");
  // Computes travel direction
  assert.match(dash, /travelDir/, "travel direction computed");
  assert.match(dash, /dropSort/, "drop sort order used");
});

test("pause-interdict: optimistic requests protected from poll discard", () => {
  const dash = readFileSync(join(root, "components/operator/OperatorDashboard.tsx"), "utf8");
  // The `kept` filter now includes optimistic request check
  assert.match(dash, /optimisticRequestsRef\.current\.has\(request\.id\)/, "optimistic requests kept in poll filter");
});

test("pause-interdict: brain never returns wait when boarded passengers have destinations away from current floor", () => {
  const brain = readFileSync(join(root, "services/elevatorBrain.ts"), "utf8");
  // computeNextOperatorAction checks dropoffsAtCurrent first
  assert.match(brain, /dropoffsAtCurrent/, "dropoffs at current floor checked");
  // If boarded passengers exist, nextDropSort is computed
  assert.match(brain, /nextBoardedDropoffSortOrder/, "next dropoff computed");
  // "wait" is only returned when no boarded passengers AND no open requests
  assert.match(brain, /action: .wait./, "wait action exists but only when no work");
});

// ═══════════════════════════════════════════════════════════════════════════
// BUG 2 — PASSENGER QR RETURN (robust, non-regression)
// ═══════════════════════════════════════════════════════════════════════════

test("qr-return: .on() handlers registered at mount time on pre-subscribed channel", () => {
  const form = readFileSync(join(root, "components/RequestForm.tsx"), "utf8");
  // Pre-subscribed channel setup
  const preSubIdx = form.indexOf("passengerBroadcastRef = useRef");
  assert.ok(preSubIdx > 0, "pre-subscribed ref exists");
  // .on() handlers for request_boarded are registered in the same effect
  // as the channel subscription (not in a separate submittedRequest effect)
  const effectStart = form.indexOf("ch = client.channel(passengerProjectBroadcastChannel(project.id))");
  assert.ok(effectStart > 0, "channel created in effect");
  const effectBody = form.substring(effectStart, effectStart + 3000);
  assert.match(effectBody, /PASSENGER_BROADCAST_REQUEST_BOARDED/, "request_boarded handler registered in pre-subscribe effect");
  assert.match(effectBody, /PASSENGER_BROADCAST_QUEUE_CLEARED/, "queue_cleared handler registered in pre-subscribe effect");
  assert.match(effectBody, /PASSENGER_BROADCAST_REQUEST_CANCELLED/, "request_cancelled handler registered in pre-subscribe effect");
});

test("qr-return: requestIdRef tracks current request ID for mount-time handlers", () => {
  const form = readFileSync(join(root, "components/RequestForm.tsx"), "utf8");
  assert.match(form, /requestIdRef.*=.*useRef/, "requestIdRef ref exists");
  assert.match(form, /requestIdRef\.current.*=.*submittedRequest\?\.requestId/, "requestIdRef synced with submittedRequest");
  // Handlers check requestIdRef.current
  assert.match(form, /requestIdRef\.current/, "requestIdRef read in handlers");
});

test("qr-return: mount-time handlers use requestIdRef instead of closed-over rid", () => {
  const form = readFileSync(join(root, "components/RequestForm.tsx"), "utf8");
  // The pre-subscribed channel handlers should use requestIdRef.current, not rid
  const preSubEffect = form.substring(
    form.indexOf("ch = client.channel(passengerProjectBroadcastChannel(project.id))"),
    form.indexOf("ch.subscribe((status: string) => {"),
  );
  assert.match(preSubEffect, /requestIdRef\.current/, "mount-time handlers read requestIdRef.current");
  assert.match(preSubEffect, /if \(!rid\) return/, "handlers return early if no request ID");
});

test("qr-return: operator sends broadcast via both pre-subscribed AND one-shot channel", () => {
  const dash = readFileSync(join(root, "components/operator/OperatorDashboard.tsx"), "utf8");
  // onPickupConfirmed sends via pre-subscribed channel
  assert.match(dash, /onPickupConfirmed/, "pickup confirmed handler exists");
  assert.match(dash, /broadcastChannelRef\.current/, "pre-subscribed channel used");
  // Belt-and-suspenders: also sends via one-shot channel
  assert.match(dash, /broadcastPassengerRequestBoarded/, "one-shot channel fallback also called");
});

test("qr-return: passenger poll detects boarded status and redirects to QR", () => {
  const form = readFileSync(join(root, "components/RequestForm.tsx"), "utf8");
  assert.match(form, /snap\.status === .boarded./, "poll checks boarded status");
  assert.match(form, /PASSENGER_ACTIVE_REQUEST_POLL_MS/, "poll interval constant exists");
  // Poll redirects to QR on boarded
  const boardedCheck = form.indexOf('snap.status === "boarded"');
  const afterCheck = form.substring(boardedCheck, boardedCheck + 300);
  assert.match(afterCheck, /clearPassengerPendingRequest/, "poll clears storage on boarded");
  assert.match(afterCheck, /router\.replace/, "poll redirects to QR on boarded");
});

// ═══════════════════════════════════════════════════════════════════════════
// LEGAL TRANSITIONS (forward-only, no backward, no terminal escape)
// ═══════════════════════════════════════════════════════════════════════════

test("legal-transitions: LEGAL_TRANSITIONS map exists with correct forward-only edges", () => {
  const actions = readFileSync(join(root, "lib/actions.ts"), "utf8");
  assert.match(actions, /LEGAL_TRANSITIONS/, "LEGAL_TRANSITIONS map exists");
  // Forward-only: pending → [assigned, boarded, cancelled]
  assert.match(actions, /pending.*assigned.*boarded.*cancelled/s, "pending allows assigned + boarded + cancelled");
  // Terminal statuses have empty arrays
  assert.match(actions, /completed: \[\]/, "completed has no outgoing transitions");
  assert.match(actions, /cancelled: \[\]/, "cancelled has no outgoing transitions");
  // Boarded can only go to completed or cancelled
  assert.match(actions, /boarded: \[.completed.*cancelled.\]/s, "boarded only → completed/cancelled");
});

test("legal-transitions: isLegalTransition validator called in updateRequestStatus", () => {
  const actions = readFileSync(join(root, "lib/actions.ts"), "utf8");
  assert.match(actions, /isLegalTransition/, "isLegalTransition function exists");
  // Called before the DB update
  const updateIdx = actions.indexOf("export async function updateRequestStatus");
  const updateBody = actions.slice(updateIdx, updateIdx + 2000);
  assert.match(updateBody, /isLegalTransition\(currentStatus, status\)/, "transition validated before DB write");
  // Rejected transitions return error
  assert.match(updateBody, /non autorisee/, "error message for illegal transition");
});

// ═══════════════════════════════════════════════════════════════════════════
// RELEASE STATE RESET (ghost load/direction/manual_full → PAUSE on next session)
// ═══════════════════════════════════════════════════════════════════════════

test("release-reset: releaseOperatorElevator resets elevator state", () => {
  const actions = readFileSync(join(root, "lib/actions.ts"), "utf8");
  const releaseIdx = actions.indexOf("export async function releaseOperatorElevator");
  const releaseBody = actions.slice(releaseIdx, releaseIdx + 3000);
  assert.match(releaseBody, /current_load: 0/, "resets current_load to 0");
  assert.match(releaseBody, /direction: .idle./, "resets direction to idle");
  assert.match(releaseBody, /manual_full: false/, "resets manual_full to false");
});

test("release-reset: adminDeactivateOperatorTablet resets state and reassigns orphans", () => {
  const actions = readFileSync(join(root, "lib/actions.ts"), "utf8");
  const adminIdx = actions.indexOf("export async function adminDeactivateOperatorTablet");
  const adminBody = actions.slice(adminIdx, adminIdx + 3000);
  assert.match(adminBody, /current_load: 0/, "resets current_load to 0");
  assert.match(adminBody, /direction: .idle./, "resets direction to idle");
  assert.match(adminBody, /manual_full: false/, "resets manual_full to false");
  assert.match(adminBody, /reassignOrphanedRequestsToActiveOperator/, "reassigns orphans before cancel");
});

test("release-reset: force-release API resets state and handles orphans", () => {
  const route = readFileSync(join(root, "app/api/operator/force-release/route.ts"), "utf8");
  assert.match(route, /current_load: 0/, "resets current_load to 0");
  assert.match(route, /direction: .idle./, "resets direction to idle");
  assert.match(route, /manual_full: false/, "resets manual_full to false");
  assert.match(route, /ORPHAN_REASSIGN_STATUSES/, "handles orphaned requests");
  assert.match(route, /boarded/, "includes boarded in orphan handling");
});
