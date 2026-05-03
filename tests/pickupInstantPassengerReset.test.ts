/**
 * BUG fix — Ramasser doit reset le passager vers QR instantanément.
 *
 * Root cause: passenger broadcast channel was created on-demand (not pre-subscribed),
 * so when operator broadcasts request_boarded, the passenger channel was still subscribing
 * (500ms–5s delay). Pre-subscribing the channel on mount fixes this.
 *
 * Tests:
 * 1. Pre-subscribed passenger broadcast channel ref exists in RequestForm
 * 2. RequestForm uses pre-subscribed channel for broadcast listeners
 * 3. request_boarded broadcast handler clears pending storage and redirects to QR
 * 4. Operator onPickupConfirmed sends request_boarded broadcast via pre-subscribed channel
 * 5. Fallback broadcast (broadcastPassengerRequestBoarded) still exists
 * 6. clearsPassengerPendingStorage includes "boarded" status
 * 7. pollOnce checks "boarded" status and redirects to QR
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const root = process.cwd();

test("pickup-reset: passenger broadcast channel pre-subscribed on mount", () => {
  const form = readFileSync(join(root, "components/RequestForm.tsx"), "utf8");
  assert.match(form, /passengerBroadcastRef/, "pre-subscribed ref exists");
  assert.match(form, /passengerProjectBroadcastChannel\(project\.id\)/, "channel created with project ID");
  assert.match(form, /passengerBroadcastRef\.current = ref/, "ref stored on mount");
  assert.match(form, /SUBSCRIBED.*ref\.ready = true/, "ready flag tracked in ref");
});

test("pickup-reset: broadcast effect uses pre-subscribed channel when ready", () => {
  const form = readFileSync(join(root, "components/RequestForm.tsx"), "utf8");
  assert.match(form, /passengerBroadcastRef\.current/, "ref checked in broadcast effect");
  assert.match(form, /preSubbed\?\.channel && preSubbed\.ready|preSubbed\.ready/, "ready flag checked before using pre-subscribed channel");
  // Handlers are registered at mount time on the pre-subscribed channel
  // using requestIdRef — the submittedRequest effect is now a fallback only
  assert.match(form, /requestIdRef/, "requestIdRef tracks current request ID for mount-time handlers");
});

test("pickup-reset: request_boarded handler clears storage and redirects to QR", () => {
  const form = readFileSync(join(root, "components/RequestForm.tsx"), "utf8");
  // Just verify the entire file has the right sequence
  assert.match(form, /clearPassengerPendingRequest.*project\.id.*rid/s, "clears pending storage");
  assert.match(form, /PASSENGER_BROADCAST_REQUEST_BOARDED[\s\S]{0,1000}router\.replace/s, "redirects to QR after boarded broadcast");
});

test("pickup-reset: operator onPickupConfirmed broadcasts via pre-subscribed channel", () => {
  const dash = readFileSync(join(root, "components/operator/OperatorDashboard.tsx"), "utf8");
  assert.match(dash, /onPickupConfirmed/, "pickup confirmed handler exists");
  assert.match(dash, /broadcastChannelRef\.current/, "uses pre-subscribed channel");
  assert.match(dash, /ref\?\.ready/, "checks ready flag");
  assert.match(dash, /request_boarded/, "broadcasts request_boarded event");
  // Fallback still exists
  assert.match(dash, /broadcastPassengerRequestBoarded/, "fallback broadcast function used");
});

test("pickup-reset: clearsPassengerPendingStorage includes boarded status", () => {
  const form = readFileSync(join(root, "components/RequestForm.tsx"), "utf8");
  assert.match(form, /clearsPassengerPendingStorage.*boarded|boarded.*clearsPassengerPendingStorage/s, "boarded clears storage");
  assert.match(form, /status === .boarded./, "boarded status check exists");
});

test("pickup-reset: pollOnce checks boarded status and redirects to QR", () => {
  const form = readFileSync(join(root, "components/RequestForm.tsx"), "utf8");
  assert.match(form, /snap\.status === .boarded./, "poll checks boarded status");
  assert.match(form, /PASSENGER_ACTIVE_REQUEST_POLL_MS/, "poll interval constant exists");
  const pollIdx = form.indexOf("snap.status === \"boarded\"");
  const afterPoll = form.substring(pollIdx, pollIdx + 300);
  assert.match(afterPoll, /clearPassengerPendingRequest/, "poll clears storage on boarded");
  assert.match(afterPoll, /router\.replace/, "poll redirects to QR on boarded");
});
