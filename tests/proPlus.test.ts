/**
 * PRO++ tests — analytics, error tracking, performance monitoring, structured logs.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "..", "..");
const ANALYTICS = readFileSync(resolve(ROOT, "lib", "analyticsEvents.ts"), "utf-8");
const ERROR_TRACKING = readFileSync(resolve(ROOT, "lib", "errorTracking.ts"), "utf-8");
const PERFORMANCE = readFileSync(resolve(ROOT, "lib", "performanceMonitor.ts"), "utf-8");
const LOGGER = readFileSync(resolve(ROOT, "lib", "structuredLogger.ts"), "utf-8");
const DASHBOARD = readFileSync(resolve(ROOT, "components", "operator", "OperatorDashboard.tsx"), "utf-8");
const RECOMMENDED = readFileSync(resolve(ROOT, "components", "operator", "RecommendedNextStop.tsx"), "utf-8");
const WORKSPACE = readFileSync(resolve(ROOT, "components", "operator", "OperatorWorkspace.tsx"), "utf-8");
const REQUEST_FORM = readFileSync(resolve(ROOT, "components", "RequestForm.tsx"), "utf-8");
const REALTIME = readFileSync(resolve(ROOT, "lib", "realtime.ts"), "utf-8");
const METRICS_PAGE = readFileSync(resolve(ROOT, "app", "admin", "metrics", "page.tsx"), "utf-8");
const METRICS_CLIENT = readFileSync(resolve(ROOT, "app", "admin", "metrics", "MetricsClient.tsx"), "utf-8");
const I18N = readFileSync(resolve(ROOT, "lib", "i18n.ts"), "utf-8");
const NAV = readFileSync(resolve(ROOT, "components", "AppNavigation.tsx"), "utf-8");
const SUPERADMIN_DASHBOARD = readFileSync(resolve(ROOT, "app", "superadmin", "page.tsx"), "utf-8");
const CSS = readFileSync(resolve(ROOT, "app", "globals.css"), "utf-8");

// ── 1. Analytics (PostHog) ───────────────────────────────────────────────

test("PRO1: analytics module tracks 7 core events", () => {
  assert.match(ANALYTICS, /operator_activated/, "operator_activated");
  assert.match(ANALYTICS, /operator_released/, "operator_released");
  assert.match(ANALYTICS, /request_created/, "request_created");
  assert.match(ANALYTICS, /request_picked_up/, "request_picked_up");
  assert.match(ANALYTICS, /request_dropped_off/, "request_dropped_off");
  assert.match(ANALYTICS, /request_cancelled/, "request_cancelled");
  assert.match(ANALYTICS, /passenger_qr_scanned/, "passenger_qr_scanned");
});

test("PRO1: analytics includes projectId, elevatorId, requestId, timestamp", () => {
  assert.match(ANALYTICS, /projectId/, "projectId in event properties");
  assert.match(ANALYTICS, /elevatorId/, "elevatorId in event properties");
  assert.match(ANALYTICS, /requestId/, "requestId in event properties");
  assert.match(ANALYTICS, /timestamp/, "timestamp in event properties");
});

test("PRO1: analytics tracks pickup timing (created → picked_up)", () => {
  assert.match(ANALYTICS, /pickupTimers/, "pickup timer map");
  assert.match(ANALYTICS, /pickupDurationMs/, "pickup duration computed");
  assert.match(ANALYTICS, /pickupDurationSec/, "pickup duration in seconds");
});

test("PRO1: analytics tracks dropoff timing (picked_up → dropped_off)", () => {
  assert.match(ANALYTICS, /dropoffTimers/, "dropoff timer map");
  assert.match(ANALYTICS, /dropoffDurationMs/, "dropoff duration computed");
  assert.match(ANALYTICS, /dropoffDurationSec/, "dropoff duration in seconds");
});

test("PRO1: analytics logs slow pickup (>30s)", () => {
  assert.match(ANALYTICS, /Slow pickup/, "slow pickup warning");
  assert.match(ANALYTICS, /30_000/, "30s threshold for pickup");
});

test("PRO1: analytics logs slow dropoff (>60s)", () => {
  assert.match(ANALYTICS, /Slow dropoff/, "slow dropoff warning");
  assert.match(ANALYTICS, /60_000/, "60s threshold for dropoff");
});

test("PRO1: analytics degrades gracefully without PostHog key", () => {
  assert.match(ANALYTICS, /POSTHOG_KEY/, "checks for key");
  assert.match(ANALYTICS, /initialized/, "init guard");
});

// ── Analytics wired into components ────────────────────────────────────────

test("PRO1: trackOperatorActivated called on activate success", () => {
  assert.match(WORKSPACE, /trackOperatorActivated/, "trackOperatorActivated imported and called");
});

test("PRO1: trackOperatorReleased called on release success", () => {
  assert.match(WORKSPACE, /trackOperatorReleased/, "trackOperatorReleased imported and called");
});

test("PRO1: trackRequestCreated called on passenger request creation", () => {
  assert.match(REQUEST_FORM, /trackRequestCreated/, "trackRequestCreated called");
});

test("PRO1: trackRequestPickedUp called on pickup success", () => {
  assert.match(RECOMMENDED, /trackRequestPickedUp/, "trackRequestPickedUp called");
});

test("PRO1: trackRequestDroppedOff called on dropoff success", () => {
  assert.match(RECOMMENDED, /trackRequestDroppedOff/, "trackRequestDroppedOff called");
});

test("PRO1: trackRequestCancelled called on passenger cancel", () => {
  assert.match(REQUEST_FORM, /trackRequestCancelled/, "trackRequestCancelled called");
});

test("PRO1: trackPassengerQRScanned called on QR page mount", () => {
  assert.match(REQUEST_FORM, /trackPassengerQRScanned/, "trackPassengerQRScanned called");
});

test("PRO1: projectId passed to RecommendedNextStop for analytics", () => {
  assert.match(RECOMMENDED, /projectId\?/, "projectId prop in RecommendedNextStop");
  assert.match(DASHBOARD, /projectId=\{projectId\}/, "projectId passed from Dashboard");
});

// ── 2. Error Tracking (Sentry) ────────────────────────────────────────────

test("PRO2: error tracking module captures client errors", () => {
  assert.match(ERROR_TRACKING, /captureException/, "Sentry captureException");
  assert.match(ERROR_TRACKING, /captureError/, "captureError export");
});

test("PRO2: error tracking includes metadata (projectId, elevatorId, userType)", () => {
  assert.match(ERROR_TRACKING, /projectId/, "projectId in context");
  assert.match(ERROR_TRACKING, /elevatorId/, "elevatorId in context");
  assert.match(ERROR_TRACKING, /userType/, "userType in context");
});

test("PRO2: error tracking wraps server actions with trackedAction", () => {
  assert.match(ERROR_TRACKING, /trackedAction/, "trackedAction helper");
});

test("PRO2: error tracking degrades gracefully without Sentry DSN", () => {
  assert.match(ERROR_TRACKING, /SENTRY_DSN/, "checks for DSN");
  assert.match(ERROR_TRACKING, /initialized/, "init guard");
});

test("PRO2: captureError called on activate failure", () => {
  assert.match(WORKSPACE, /captureError.*activate/, "error captured on activate failure");
});

test("PRO2: captureError called on release failure", () => {
  assert.match(WORKSPACE, /captureError.*release/, "error captured on release failure");
});

test("PRO2: captureError called on pickup failure", () => {
  assert.match(RECOMMENDED, /captureError.*pickup/, "error captured on pickup failure");
});

test("PRO2: captureError called on dropoff failure", () => {
  assert.match(RECOMMENDED, /captureError.*dropoff/, "error captured on dropoff failure");
});

test("PRO2: realtime subscribe failure captured via captureRealtimeError", () => {
  assert.match(REALTIME, /captureRealtimeError/, "error capture in realtime");
  assert.match(REALTIME, /CHANNEL_ERROR/, "CHANNEL_ERROR check");
  assert.match(REALTIME, /TIMED_OUT/, "TIMED_OUT check");
});

// ── 3. Performance Monitoring ─────────────────────────────────────────────

test("PRO3: performance monitor measures pickup_to_db", () => {
  assert.match(PERFORMANCE, /pickup_to_db/, "pickup_to_db timer");
  assert.match(PERFORMANCE, /startPickupToDbTimer/, "startPickupToDbTimer export");
});

test("PRO3: performance monitor measures pickup_to_qr_return", () => {
  assert.match(PERFORMANCE, /pickup_to_qr_return/, "pickup_to_qr_return timer");
  assert.match(PERFORMANCE, /startPickupToQrTimer/, "startPickupToQrTimer export");
});

test("PRO3: performance monitor measures release_to_activate_available", () => {
  assert.match(PERFORMANCE, /release_to_activate_available/, "release_to_activate_available timer");
  assert.match(PERFORMANCE, /startReleaseToActivateTimer/, "startReleaseToActivateTimer export");
});

test("PRO3: performance monitor logs if > 2 seconds (SLOW_THRESHOLD_MS)", () => {
  assert.match(PERFORMANCE, /SLOW_THRESHOLD_MS = 2000/, "2s threshold");
  assert.match(PERFORMANCE, /SLOW/, "SLOW warning logged");
});

test("PRO3: pickup_to_db timer used in RecommendedNextStop", () => {
  assert.match(RECOMMENDED, /startPickupToDbTimer/, "pickup db timer started on Ramasser");
});

test("PRO3: release_to_activate timer used in OperatorWorkspace", () => {
  assert.match(WORKSPACE, /startReleaseToActivateTimer/, "release timer started on Libérer");
});

// ── 4. Structured Logs ────────────────────────────────────────────────────

test("PRO4: structured logger has 4 tags: Analytics, Error, Performance, Sync", () => {
  assert.match(LOGGER, /"Analytics"/, "Analytics tag");
  assert.match(LOGGER, /"Error"/, "Error tag");
  assert.match(LOGGER, /"Performance"/, "Performance tag");
  assert.match(LOGGER, /"Sync"/, "Sync tag");
});

test("PRO4: structured log entries include timestamp, requestId, elevatorId, action", () => {
  assert.match(LOGGER, /timestamp/, "timestamp field");
  assert.match(LOGGER, /requestId/, "requestId field");
  assert.match(LOGGER, /elevatorId/, "elevatorId field");
  assert.match(LOGGER, /action/, "action field");
});

test("PRO4: structuredLog used in analytics module", () => {
  assert.match(ANALYTICS, /structuredLog/, "structuredLog in analytics");
  assert.match(ANALYTICS, /\[Elevio/, "Elevio tag prefix");
});

test("PRO4: structuredLog used in error tracking module", () => {
  assert.match(ERROR_TRACKING, /structuredLog/, "structuredLog in error tracking");
});

test("PRO4: structuredLog used in performance monitor", () => {
  assert.match(PERFORMANCE, /structuredLog/, "structuredLog in performance");
});

test("PRO4: log history retrievable for admin metrics page", () => {
  assert.match(LOGGER, /getLogHistory/, "getLogHistory export");
  assert.match(LOGGER, /MAX_LOG_HISTORY/, "circular buffer limit");
});

test("PRO4: getPerformanceLogs and getErrorLogs filtered exports", () => {
  assert.match(LOGGER, /getPerformanceLogs/, "getPerformanceLogs export");
  assert.match(LOGGER, /getErrorLogs/, "getErrorLogs export");
});

// ── 5. Admin Metrics Dashboard ────────────────────────────────────────────

test("PRO5: /admin/metrics page exists and requires superadmin", () => {
  assert.match(METRICS_PAGE, /MetricsClient/, "renders MetricsClient");
  assert.match(METRICS_PAGE, /force-dynamic/, "dynamic rendering");
  assert.match(METRICS_PAGE, /requireSuperAdmin/, "requires superadmin guard");
});

test("PRO5: metrics page shows requests today, avg pickup, avg dropoff, errors", () => {
  assert.match(METRICS_CLIENT, /totalToday/, "total today");
  assert.match(METRICS_CLIENT, /avgPickupMs/, "avg pickup");
  assert.match(METRICS_CLIENT, /errorCount/, "error count");
});

test("PRO5: metrics page shows performance logs from structured logger", () => {
  assert.match(METRICS_CLIENT, /getPerformanceLogs/, "performance logs fetched");
  assert.match(METRICS_CLIENT, /getErrorLogs/, "error logs fetched");
  assert.match(METRICS_CLIENT, /getLogHistory/, "log history fetched");
});

test("PRO5: metrics page accessible from superadmin sidebar/dashboard", () => {
  assert.match(SUPERADMIN_DASHBOARD, /\/superadmin\/metrics|\/admin\/metrics/, "metrics linked from superadmin");
  const SHELL = readFileSync(resolve(ROOT, "components", "superadmin", "SuperadminShell.tsx"), "utf-8");
  assert.match(SHELL, /\/superadmin\/metrics/, "metrics in superadmin sidebar");
  assert.match(I18N, /nav\.metrics/, "metrics i18n key");
});

// ── 6. Fail Safe ──────────────────────────────────────────────────────────

test("PRO6: realtime subscribe failure logged and error captured", () => {
  assert.match(REALTIME, /CHANNEL_ERROR/, "CHANNEL_ERROR check");
  assert.match(REALTIME, /TIMED_OUT/, "TIMED_OUT check");
  assert.match(REALTIME, /captureRealtimeError/, "error capture function");
  assert.match(REALTIME, /realtime_subscribe_failed/, "specific error message");
  assert.match(REALTIME, /\[Elevio Error\]/, "structured log tag");
});

test("PRO6: poll fallback exists (250ms interval) in OperatorWorkspace", () => {
  assert.match(WORKSPACE, /syncElevators/, "poll function exists");
  assert.match(WORKSPACE, /250/, "250ms poll interval");
});

test("PRO6: passenger poll fallback exists (250ms) in RequestForm", () => {
  assert.match(REQUEST_FORM, /PASSENGER_ACTIVE_REQUEST_POLL_MS = 250/, "250ms passenger poll");
});

// ── 7. Env vars ───────────────────────────────────────────────────────────

test("PRO7: NEXT_PUBLIC_POSTHOG_KEY env var referenced", () => {
  assert.match(ANALYTICS, /NEXT_PUBLIC_POSTHOG_KEY/, "PostHog key env var");
  assert.match(ANALYTICS, /NEXT_PUBLIC_POSTHOG_HOST/, "PostHog host env var");
});

test("PRO7: NEXT_PUBLIC_SENTRY_DSN env var referenced", () => {
  assert.match(ERROR_TRACKING, /NEXT_PUBLIC_SENTRY_DSN/, "Sentry DSN env var");
});

test("PRO7: NEXT_PUBLIC_DEBUG_SYNC controls log visibility", () => {
  assert.match(ANALYTICS, /NEXT_PUBLIC_DEBUG_SYNC/, "debug sync in analytics");
  assert.match(ERROR_TRACKING, /NEXT_PUBLIC_DEBUG_SYNC/, "debug sync in error tracking");
  assert.match(PERFORMANCE, /NEXT_PUBLIC_DEBUG_SYNC/, "debug sync in performance");
  assert.match(LOGGER, /NEXT_PUBLIC_DEBUG_SYNC/, "debug sync in logger");
});
