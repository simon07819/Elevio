/**
 * Observability tests — PHASE 7.
 *
 * Verifies structured logs exist for all critical paths:
 * - createPassengerRequest
 * - assignRequestElevator
 * - advanceRequestStatus (pickup/dropoff)
 * - skipRequest
 * - clearElevatorActiveRequests
 * - activateOperator
 * - releaseOperator
 * - toggleFull
 * - cancelActiveProjectRequestsIfNoLiveOperators
 * - reassignOrphanedRequests
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const root = process.cwd();
const ACTIONS = readFileSync(join(root, "lib/actions.ts"), "utf8");
const STATE_RES = readFileSync(join(root, "lib/stateResolution.ts"), "utf8");

test("log: createPassengerRequest logs on entry and success", () => {
  assert.match(ACTIONS, /logAction\("createPassengerRequest"/, "logs on create request entry");
  assert.match(ACTIONS, /logAction\("createPassengerRequest_success"/, "logs on create request success");
});

test("log: assignRequestElevator logs assignment", () => {
  assert.match(ACTIONS, /logAction\("assignRequestElevator"/, "logs on assignment");
});

test("log: advanceRequestStatus logs pickup/dropoff", () => {
  assert.match(ACTIONS, /logAction\("advanceRequestStatus"/, "logs on advance status");
});

test("log: updateRequestStatus logs state transition", () => {
  assert.match(ACTIONS, /logAction\("updateRequestStatus"/, "logs on state transition");
});

test("log: skipRequest logs skip event", () => {
  assert.match(ACTIONS, /logAction\("skipRequestForCurrentPassage"/, "logs on skip");
});

test("log: clearElevatorActiveRequests logs queue clear", () => {
  assert.match(ACTIONS, /logAction\("clearElevatorActiveRequests"/, "logs on queue clear");
});

test("log: activateOperator logs activation", () => {
  assert.match(ACTIONS, /logAction\("activateOperator"/, "logs on operator activation");
});

test("log: releaseOperator logs release", () => {
  assert.match(ACTIONS, /logAction\("releaseOperator"/, "logs on operator release");
});

test("log: toggleFull logs capacity toggle", () => {
  assert.match(ACTIONS, /logAction\("toggleFull"/, "logs on full toggle");
});

test("log: cancelActiveProjectRequestsIfNoLiveOperators logs zero-operator cleanup", () => {
  assert.match(ACTIONS, /logAction\("cancelActiveNoLiveOps"/, "logs on zero-operator cleanup");
});

test("log: reassignOrphanedRequests logs redistribution", () => {
  assert.match(ACTIONS, /logAction\("reassignOrphanedRequests"/, "logs on orphan redistribution");
});

test("log: reassignOrphanedRequests_cancelled logs unassignable requests", () => {
  assert.match(ACTIONS, /logAction\("reassignOrphanedRequests_cancelled"/, "logs cancelled orphans");
});

test("log: logAction function exists in stateResolution", () => {
  assert.match(STATE_RES, /export function logAction/, "logAction is exported");
});
