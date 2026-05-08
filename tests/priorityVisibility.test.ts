/**
 * Priority visibility tests — operator terminal
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const root = process.cwd();

const MOVEMENT_BOARD = readFileSync(join(root, "components/operator/MovementBoard.tsx"), "utf8");
const PRIORITY_BANNER = readFileSync(join(root, "components/operator/PriorityAlertBanner.tsx"), "utf8");
const OPERATOR_DASHBOARD = readFileSync(join(root, "components/operator/OperatorDashboard.tsx"), "utf8");
const PRIORITY_BADGE = readFileSync(join(root, "components/PriorityBadge.tsx"), "utf8");
const GLOBALS_CSS = readFileSync(join(root, "app/globals.css"), "utf8");

// ═══════════════════════════════════════════════════════════════════
// 1. MovementBoard priority indicators
// ═══════════════════════════════════════════════════════════════════

test("movement-board: priority rows have distinct red/orange styling", () => {
  assert.match(MOVEMENT_BOARD, /isPriority/, "checks priority flag");
  assert.match(MOVEMENT_BOARD, /from-red-50.*via-orange-50.*to-red-50/, "red/orange gradient background");
  assert.match(MOVEMENT_BOARD, /border-red-400/, "red border for priority rows");
});

test("movement-board: priority rows show PRIORITÉ badge", () => {
  assert.match(MOVEMENT_BOARD, /PRIORITÉ/, "priority badge text");
  assert.match(MOVEMENT_BOARD, /AlertTriangle/, "warning icon in badge");
  assert.match(MOVEMENT_BOARD, /anim-pulse-priority-badge/, "pulsing animation on badge");
});

test("movement-board: priority reason displayed in large text", () => {
  assert.match(MOVEMENT_BOARD, /priority_reason/, "shows priority_reason");
  assert.match(MOVEMENT_BOARD, /text-base.*font-black.*text-red-900/, "large bold red text for reason");
  assert.match(MOVEMENT_BOARD, /bg-red-100/, "red background box for reason");
});

test("movement-board: passenger note displayed with emphasis for priority", () => {
  assert.match(MOVEMENT_BOARD, /request\.note/, "shows note field");
  assert.match(MOVEMENT_BOARD, /bg-orange-100.*text-orange-900/, "orange emphasis for priority note");
});

test("movement-board: priority rows have pulsing animation class", () => {
  assert.match(MOVEMENT_BOARD, /anim-pulse-priority/, "pulsing animation class on priority row");
});

// ═══════════════════════════════════════════════════════════════════
// 2. PriorityAlertBanner component
// ═══════════════════════════════════════════════════════════════════

test("priority-banner: component exists and renders priority info", () => {
  assert.match(PRIORITY_BANNER, /PriorityAlertBanner/, "component export");
  assert.match(PRIORITY_BANNER, /Demande prioritaire/, "French priority title");
  assert.match(PRIORITY_BANNER, /priority_reason/, "shows reason");
  assert.match(PRIORITY_BANNER, /AlertTriangle/, "warning icon");
});

test("priority-banner: shows floor info with large text", () => {
  assert.match(PRIORITY_BANNER, /from_floor.*to_floor/, "shows floor info");
  assert.match(PRIORITY_BANNER, /text-xl.*font-black.*text-white/, "large white text");
  assert.match(PRIORITY_BANNER, /text-2xl|text-lg/, "large heading size");
});

test("priority-banner: has pulsing animation", () => {
  assert.match(PRIORITY_BANNER, /anim-pulse-priority-banner/, "banner pulsing class");
  assert.match(PRIORITY_BANNER, /anim-pulse-priority-icon/, "icon pulsing class");
});

test("priority-banner: returns null when no priority requests", () => {
  assert.match(PRIORITY_BANNER, /length === 0.*return null/, "null for empty array");
});

test("priority-banner: handles missing reason gracefully", () => {
  assert.match(PRIORITY_BANNER, /Action requise immédiatement/, "fallback text for no reason");
  assert.match(PRIORITY_BANNER, /priority_reason/, "checks for reason");
});

// ═══════════════════════════════════════════════════════════════════
// 3. OperatorDashboard integration
// ═══════════════════════════════════════════════════════════════════

test("dashboard: imports PriorityAlertBanner", () => {
  assert.match(OPERATOR_DASHBOARD, /PriorityAlertBanner/, "banner imported");
});

test("dashboard: renders banner before MovementBoard", () => {
  assert.match(OPERATOR_DASHBOARD, /PriorityAlertBanner.*priorityRequests/, "banner rendered with priority filter");
  // Banner appears before MovementBoard in the JSX
  const bannerIdx = OPERATOR_DASHBOARD.indexOf("PriorityAlertBanner");
  const boardIdx = OPERATOR_DASHBOARD.indexOf("<MovementBoard");
  assert.ok(bannerIdx < boardIdx, "banner rendered before MovementBoard");
});

test("dashboard: has haptic feedback for priority arrivals", () => {
  assert.match(OPERATOR_DASHBOARD, /tryHapticForPriority/, "haptic function exists");
  assert.match(OPERATOR_DASHBOARD, /priority.*===.*true.*pending/, "triggers on priority + pending");
  assert.match(OPERATOR_DASHBOARD, /vibrate/, "web vibration fallback");
});

// ═══════════════════════════════════════════════════════════════════
// 4. PriorityBadge component
// ═══════════════════════════════════════════════════════════════════

test("priority-badge: supports size variants", () => {
  assert.match(PRIORITY_BADGE, /size.*sm.*lg/, "size prop");
  assert.match(PRIORITY_BADGE, /isLarge/, "size conditional logic");
  assert.match(PRIORITY_BADGE, /text-base/, "large size variant");
});

test("priority-badge: has pulsing animation for active priority", () => {
  assert.match(PRIORITY_BADGE, /anim-pulse-priority-badge/, "pulsing animation class");
  assert.match(PRIORITY_BADGE, /bg-red-500/, "red background for active priority");
});

// ═══════════════════════════════════════════════════════════════════
// 5. CSS animations
// ═══════════════════════════════════════════════════════════════════

test("css: priority animations defined with keyframes", () => {
  assert.match(GLOBALS_CSS, /elevio-pulse-priority[^-]/, "priority row animation keyframe");
  assert.match(GLOBALS_CSS, /elevio-pulse-priority-badge/, "priority badge animation keyframe");
  assert.match(GLOBALS_CSS, /elevio-pulse-priority-banner/, "banner animation keyframe");
  assert.match(GLOBALS_CSS, /elevio-pulse-priority-icon/, "icon animation keyframe");
});

test("css: priority animations respect prefers-reduced-motion", () => {
  // All priority animation classes are listed in the reduced-motion rule alongside existing ones
  const reducedMotionBlock = GLOBALS_CSS.match(/prefers-reduced-motion[\s\S]*?\}/)?.[0] ?? "";
  assert.match(reducedMotionBlock, /anim-pulse-priority/, "priority row in reduced-motion rule");
  assert.match(reducedMotionBlock, /anim-pulse-priority-badge/, "badge in reduced-motion rule");
  assert.match(reducedMotionBlock, /anim-pulse-priority-banner/, "banner in reduced-motion rule");
  assert.match(reducedMotionBlock, /anim-pulse-priority-icon/, "icon in reduced-motion rule");
});
