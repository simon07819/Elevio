/**
 * Server optimization tests — indexes, app_errors cleanup, cron completeness.
 *
 * Rule: VERIFY BEFORE MODIFYING. These tests confirm what EXISTS and what was ADDED.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const root = process.cwd();
const CLEANUP_SQL = readFileSync(join(root, "supabase/request-history-and-cleanup.sql"), "utf8");
const SCHEMA = readFileSync(join(root, "supabase/schema.sql"), "utf8");
const CRON_ROUTE = readFileSync(join(root, "app/api/cron/cleanup-requests/route.ts"), "utf8");
const VERCEL = readFileSync(join(root, "vercel.json"), "utf8");
const ALL_SQL = SCHEMA + CLEANUP_SQL;

// ═══════════════════════════════════════════════════════════════════════════
// 1. Cron jobs exist and are correctly scheduled
// ═══════════════════════════════════════════════════════════════════════════

test("cron: Vercel crons defined for cleanup + stats", () => {
  assert.match(VERCEL, /\/api\/cron\/cleanup-requests/, "cleanup cron exists");
  assert.match(VERCEL, /\/api\/cron\/compute-stats/, "stats cron exists");
  assert.match(VERCEL, /0 4 \* \* \*/, "cleanup at 4 AM daily");
  assert.match(VERCEL, /0 3 \* \* \*/, "stats at 3 AM daily");
});

test("cron: cleanup endpoint calls RPC with auth", () => {
  assert.match(CRON_ROUTE, /CRON_SECRET/, "auth check present");
  assert.match(CRON_ROUTE, /cleanup_terminal_requests/, "calls cleanup RPC");
  assert.match(CRON_ROUTE, /p_completed_age_hours/, "passes completed age param");
  assert.match(CRON_ROUTE, /p_cancelled_age_hours/, "passes cancelled age param");
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. Cleanup RPC is complete (requests, events, sessions, messages, errors)
// ═══════════════════════════════════════════════════════════════════════════

test("cleanup: RPC deletes terminal requests + events", () => {
  assert.match(CLEANUP_SQL, /delete from request_events/, "deletes request_events");
  assert.match(CLEANUP_SQL, /delete from requests/, "deletes requests");
  assert.match(CLEANUP_SQL, /status in \('completed', 'cancelled'\)/, "targets terminal statuses");
  assert.match(CLEANUP_SQL, /p_completed_age_hours/, "configurable completed age");
  assert.match(CLEANUP_SQL, /p_cancelled_age_hours/, "configurable cancelled age");
});

test("cleanup: RPC releases stale operator sessions", () => {
  assert.match(CLEANUP_SQL, /operator_session_id = null/, "clears session fields");
  assert.match(CLEANUP_SQL, /operator_session_heartbeat_at < heartbeat_cutoff/, "based on heartbeat age");
});

test("cleanup: RPC deletes old operator messages", () => {
  assert.match(CLEANUP_SQL, /delete from operator_messages/, "deletes old messages");
  assert.match(CLEANUP_SQL, /7 days/, "7-day retention for messages");
});

test("cleanup: RPC now also cleans app_errors", () => {
  assert.match(CLEANUP_SQL, /delete from app_errors/, "deletes old app_errors");
  assert.match(CLEANUP_SQL, /resolved = true.*30 days/, "resolved errors: 30-day retention");
  assert.match(CLEANUP_SQL, /resolved = false.*90 days/, "unresolved errors: 90-day retention");
  assert.match(CLEANUP_SQL, /deleted_errors/, "returns deleted_errors count");
});

test("cleanup: NEVER deletes active requests", () => {
  // The delete only targets 'completed' and 'cancelled' statuses
  const deleteSection = CLEANUP_SQL.match(/delete from requests[\s\S]*?;/g);
  assert.ok(deleteSection, "has delete from requests statements");
  for (const stmt of deleteSection) {
    assert.ok(
      stmt.includes("'completed'") || stmt.includes("'cancelled'"),
      "only deletes terminal statuses",
    );
    assert.doesNotMatch(stmt, /'pending'|'assigned'|'arriving'|'boarded'/, "never deletes active statuses");
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. DB indexes for hot queries
// ═══════════════════════════════════════════════════════════════════════════

test("indexes: requests has all required indexes", () => {
  const requiredIndexes = [
    /requests.*project_id.*status/i,
    /requests.*elevator_id.*status/i,
    /requests.*terminal.*updated_at|requests_terminal_updated_idx/i,
    /requests.*active.*project|requests_active_project_idx/i,
    /requests.*active.*elevator|requests_active_elevator_idx/i,
    /requests.*pending.*dispatch|requests_pending_dispatch_idx/i,
  ];
  for (const idx of requiredIndexes) {
    assert.match(ALL_SQL, idx, `index exists: ${idx.source}`);
  }
});

test("indexes: app_errors has created_at index for dashboard queries", () => {
  assert.match(ALL_SQL, /app_errors.*created_at|app_errors_created_at_idx/, "app_errors has created_at index");
});

test("indexes: subscriptions has user_id index for billing queries", () => {
  assert.match(ALL_SQL, /subscriptions.*user_id|subscriptions_user_id_idx/, "subscriptions has user_id index");
});

test("indexes: user_entitlements has user_id index for plan guards", () => {
  assert.match(ALL_SQL, /user_entitlements.*user_id|user_entitlements_user_id_idx/, "user_entitlements has user_id index");
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. No unnecessary changes — passenger + operator flows intact
// ═══════════════════════════════════════════════════════════════════════════

test("integrity: dispatch engine untouched", () => {
  const BRAIN = readFileSync(join(root, "services/elevatorBrain.ts"), "utf8");
  assert.match(BRAIN, /computeBestElevatorForRequest/, "dispatch brain still works");
});

test("integrity: passenger request flow intact", () => {
  const REQUEST_FORM = readFileSync(join(root, "components/RequestForm.tsx"), "utf8");
  assert.match(REQUEST_FORM, /createPassengerRequest/, "passenger can still create requests");
});

test("integrity: operator optimistic UI intact", () => {
  const REQUEST_CARD = readFileSync(join(root, "components/operator/RequestCard.tsx"), "utf8");
  assert.match(REQUEST_CARD, /setCurrentStatus\(status\)/, "optimistic UI still works");
});
