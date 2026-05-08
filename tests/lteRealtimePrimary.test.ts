import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// LTE optimization regression suite.
//
// The operator iPad runs on LTE on construction sites. The previous
// implementation polled the DB every 400ms (requests) and 250ms (elevators)
// "as a belt-and-suspenders" alongside Supabase Realtime. That burned tens of
// MB/hour of LTE per tablet. This suite locks the new behavior in:
//
//   - Realtime is the PRIMARY live source.
//   - Fallback polling is GATED on realtime being disconnected.
//   - Fallback poll cadence >= 15s (we use 30s).
//   - On focus / online / page-show / app-resume, ONE explicit refetch fires.
//   - Channels are cleaned up on unmount via the existing helpers.

const root = process.cwd();
const DASHBOARD = readFileSync(join(root, "components/operator/OperatorDashboard.tsx"), "utf8");
const WORKSPACE = readFileSync(join(root, "components/operator/OperatorWorkspace.tsx"), "utf8");
const REALTIME_LIB = readFileSync(join(root, "lib/realtime.ts"), "utf8");

test("lte: subscribeToTable exposes onStatus for connection-state gating", () => {
  assert.match(REALTIME_LIB, /onStatus\?: \(status: RealtimeChannelStatus\) => void/);
  assert.match(REALTIME_LIB, /export type RealtimeChannelStatus/);
  // The status callback fires for SUBSCRIBED / CHANNEL_ERROR / TIMED_OUT / CLOSED.
  assert.match(REALTIME_LIB, /status === "SUBSCRIBED"/);
  assert.match(REALTIME_LIB, /status === "CHANNEL_ERROR"/);
  assert.match(REALTIME_LIB, /status === "TIMED_OUT"/);
  assert.match(REALTIME_LIB, /status === "CLOSED"/);
  assert.match(REALTIME_LIB, /onStatus\?\.\(status\)/);
});

test("lte: OperatorDashboard does NOT poll requests every 1s or faster", () => {
  // No literal `setInterval(..., <ms <= 1500>)` left in the dashboard.
  // The fallback poll uses a `FALLBACK_POLL_MS` constant (asserted separately
  // below); literal-numeric intervals must all be >= 15s.
  const intervals = [...DASHBOARD.matchAll(/setInterval\([^,]+,\s*(\d[\d_]*)\s*\)/g)].map((m) =>
    Number(m[1].replace(/_/g, "")),
  );
  for (const ms of intervals) {
    assert.ok(ms >= 15_000, `setInterval at ${ms}ms is too aggressive for LTE — must be >= 15000ms (15s)`);
  }
  // The LTE fallback constant must exist and be >= 15s.
  const constMatch = DASHBOARD.match(/const FALLBACK_POLL_MS = (\d[\d_]*);/);
  assert.ok(constMatch, "dashboard must declare FALLBACK_POLL_MS for the LTE fallback poll");
  const fallbackMs = Number(constMatch![1].replace(/_/g, ""));
  assert.ok(fallbackMs >= 15_000, `FALLBACK_POLL_MS=${fallbackMs}ms is too aggressive for LTE`);
  // And it must be wired through window.setInterval.
  assert.match(DASHBOARD, /window\.setInterval\([\s\S]*?FALLBACK_POLL_MS\)/);
});

test("lte: OperatorDashboard fallback poll is gated by realtimeConnectedRef", () => {
  assert.match(DASHBOARD, /realtimeConnectedRef = useRef\(false\)/);
  // Fallback poll body skips fetch when realtime is connected.
  assert.match(
    DASHBOARD,
    /if \(realtimeConnectedRef\.current\) return;[\s\S]{0,200}void syncRequests\(\);/,
    "fallback poll must skip DB fetch when realtime is SUBSCRIBED",
  );
  // onStatus callback wired into subscribeToTable for the requests channel.
  assert.match(DASHBOARD, /onStatus: \(status\) =>/);
  assert.match(DASHBOARD, /realtimeConnectedRef\.current = true/);
  assert.match(DASHBOARD, /realtimeConnectedRef\.current = false/);
});

test("lte: OperatorDashboard does an explicit refetch on focus/online/resume (no continuous polling)", () => {
  assert.match(DASHBOARD, /syncRequestsRef = useRef<\(\(\) => Promise<void>\) \| null>\(null\)/);
  // Visibility, pageshow, appResume, online, and realtime-degraded branches
  // all fire ONE explicit refetch via syncRequestsRef.
  const refetchSites = [...DASHBOARD.matchAll(/void syncRequestsRef\.current\?\.\(\)/g)];
  assert.ok(refetchSites.length >= 4, `expected >= 4 explicit refetch sites, got ${refetchSites.length}`);
});

test("lte: OperatorDashboard cleans up the fallback interval and the ref on unmount", () => {
  assert.match(DASHBOARD, /window\.clearInterval\(id\)/);
  assert.match(
    DASHBOARD,
    /if \(syncRequestsRef\.current === syncRequests\) \{[\s\S]*?syncRequestsRef\.current = null;/,
    "must null the syncRequests ref on unmount when it's still ours",
  );
});

test("lte: OperatorWorkspace does NOT poll elevators every 1s or faster", () => {
  // Filter clock-tick interval (5_000ms) and heartbeat (30_000ms) — those are
  // local-only and DB-light respectively. The DB-poll interval is the one we
  // care about, and it must be >= 15s now.
  const intervals = [...WORKSPACE.matchAll(/setInterval\([^,]+,\s*(\d[\d_]*)\s*\)/g)].map((m) =>
    Number(m[1].replace(/_/g, "")),
  );
  for (const ms of intervals) {
    assert.ok(
      ms >= 5_000,
      `OperatorWorkspace setInterval at ${ms}ms is too aggressive — should be >= 5s (clock) or >= 15s (poll)`,
    );
  }
  // The elevators DB-poll specifically must be on the LTE-friendly cadence.
  assert.match(
    WORKSPACE,
    /const FALLBACK_POLL_MS = 30_000;[\s\S]*?window\.setInterval\([\s\S]*?FALLBACK_POLL_MS\)/,
    "elevators fallback poll must be a 30s interval",
  );
});

test("lte: OperatorWorkspace fallback poll is gated by realtimeConnectedRef", () => {
  assert.match(WORKSPACE, /realtimeConnectedRef = useRef\(false\)/);
  assert.match(
    WORKSPACE,
    /if \(realtimeConnectedRef\.current\) return;[\s\S]{0,200}void syncElevators\(\);/,
    "elevators fallback poll must skip DB fetch when realtime is SUBSCRIBED",
  );
  assert.match(WORKSPACE, /onStatus: \(status\) =>/);
});

test("lte: OperatorWorkspace cleans up channels and refs on unmount", () => {
  // bindRealtimeWithAuthSession returns a cleanup that detaches the channel.
  assert.match(WORKSPACE, /cleanupRealtime\(\)/);
  assert.match(
    WORKSPACE,
    /if \(syncElevatorsRef\.current === syncElevators\) \{[\s\S]*?syncElevatorsRef\.current = null;/,
    "must null the syncElevators ref on unmount",
  );
  assert.match(WORKSPACE, /window\.clearInterval\(poll\)/);
});

test("lte: OperatorWorkspace fires one explicit refetch on focus/online/resume", () => {
  // bump() does router.refresh() + syncElevatorsRef refetch.
  assert.match(
    WORKSPACE,
    /const bump = \(\) => \{[\s\S]*?router\.refresh\(\);[\s\S]*?void syncElevatorsRef\.current\?\.\(\);[\s\S]*?\};/,
    "bump() must refresh SSR and refetch elevators in one shot",
  );
});

test("lte: only ACTIVE statuses are fetched (no full request history on the wire)", () => {
  // The poll filter MUST narrow status to OPERATOR_VISIBLE_REQUEST_STATUSES,
  // so the LTE payload stays small even when the project has thousands of
  // historical/cancelled rows.
  assert.match(DASHBOARD, /\.in\("status", OPERATOR_VISIBLE_REQUEST_STATUSES\)/);
});
