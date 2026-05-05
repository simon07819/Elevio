/**
 * UX Polish tests — verify all 10 UX improvements are in place.
 *
 * 1. Feedback immédiat: disabled + spinner on action buttons
 * 2. Animations: fade/slide/shake/success-pop/pulse-dot/spinner CSS classes
 * 3. État opérateur clair: onboard badge, pending badge, empty state
 * 4. Écran vide: "Aucune demande" message + icon
 * 5. UX passager: pulse-dot, "En attente de l'opérateur" message, success-pop
 * 6. Loading global: spinner on activate/release, isPending guard
 * 7. Micro-feedback: shake on error, success check on completed
 * 8. Performance perçue: optimistic UI already in place
 * 9. Clean UI: animation classes, reduced-motion support
 * 10. Tests (this file)
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "..", "..");
const CSS = readFileSync(resolve(ROOT, "app", "globals.css"), "utf-8");
const DASHBOARD = readFileSync(resolve(ROOT, "components", "operator", "OperatorDashboard.tsx"), "utf-8");
const RECOMMENDED = readFileSync(resolve(ROOT, "components", "operator", "RecommendedNextStop.tsx"), "utf-8");
const WORKSPACE = readFileSync(resolve(ROOT, "components", "operator", "OperatorWorkspace.tsx"), "utf-8");
const REQUEST_FORM = readFileSync(resolve(ROOT, "components", "RequestForm.tsx"), "utf-8");
const MOVEMENT_BOARD = readFileSync(resolve(ROOT, "components", "operator", "MovementBoard.tsx"), "utf-8");
const REQUEST_CARD = readFileSync(resolve(ROOT, "components", "operator", "RequestCard.tsx"), "utf-8");
const I18N = readFileSync(resolve(ROOT, "lib", "i18n.ts"), "utf-8");

// ── 1. Feedback immédiat: disabled + spinner ─────────────────────────────

test("UX1: Ramasser button has disabled={isActionPending} and spinner", () => {
  assert.match(RECOMMENDED, /disabled=\{isActionPending\}/, "disabled guard on action buttons");
  assert.match(RECOMMENDED, /Loader2/, "Loader2 spinner icon imported");
  assert.match(RECOMMENDED, /anim-spinner/, "spinner CSS class used");
});

test("UX1: Déposer button has disabled and spinner when pending", () => {
  const dropoffMatch = RECOMMENDED.match(/showDropoff[\s\S]*?button[\s\S]*?disabled=\{isActionPending\}/);
  assert.ok(dropoffMatch, "Déposer button has disabled guard");
});

test("UX1: Release button has disabled + spinner", () => {
  assert.match(WORKSPACE, /releasingElevatorId.*Loader2/, "Release button shows spinner when releasing");
  assert.match(WORKSPACE, /disabled=\{releasingElevatorId/, "Release button has disabled guard");
});

test("UX1: Activate button has disabled + spinner", () => {
  assert.match(WORKSPACE, /isActivatingThisElevator[\s?]*<Loader2/, "Activate button shows spinner when activating");
  assert.match(WORKSPACE, /disabled=\{locked \|\| isActivatingThisElevator\}/, "Activate button has disabled guard");
});

// ── 2. Animations CSS classes exist ──────────────────────────────────────

test("UX2: anim-fade-out keyframe and class defined", () => {
  assert.match(CSS, /@keyframes elevio-fade-out/, "fade-out keyframe");
  assert.match(CSS, /\.anim-fade-out/, "fade-out class");
});

test("UX2: anim-fade-in keyframe and class defined", () => {
  assert.match(CSS, /@keyframes elevio-fade-in/, "fade-in keyframe");
  assert.match(CSS, /\.anim-fade-in/, "fade-in class");
});

test("UX2: anim-slide-in keyframe and class defined", () => {
  assert.match(CSS, /@keyframes elevio-slide-in-right/, "slide-in keyframe");
  assert.match(CSS, /\.anim-slide-in/, "slide-in class");
});

test("UX2: anim-shake keyframe and class defined", () => {
  assert.match(CSS, /@keyframes elevio-shake/, "shake keyframe");
  assert.match(CSS, /\.anim-shake/, "shake class");
});

test("UX2: anim-success-pop keyframe and class defined", () => {
  assert.match(CSS, /@keyframes elevio-success-pop/, "success-pop keyframe");
  assert.match(CSS, /\.anim-success-pop/, "success-pop class");
});

test("UX2: anim-pulse-dot keyframe and class defined", () => {
  assert.match(CSS, /@keyframes elevio-pulse-dot/, "pulse-dot keyframe");
  assert.match(CSS, /\.anim-pulse-dot/, "pulse-dot class");
});

test("UX2: anim-spinner keyframe and class defined", () => {
  assert.match(CSS, /@keyframes elevio-spinner/, "spinner keyframe");
  assert.match(CSS, /\.anim-spinner/, "spinner class");
});

test("UX2: prefers-reduced-motion disables animations", () => {
  assert.match(CSS, /prefers-reduced-motion/, "reduced motion media query");
  assert.match(CSS, /animation: none/, "animations disabled for reduced motion");
});

// ── 3. État opérateur clair ───────────────────────────────────────────────

test("UX3: Onboard badge shown when passengers onboard", () => {
  assert.match(DASHBOARD, /operator\.onboardCount/, "onboard count i18n key");
  assert.match(DASHBOARD, /liveActivePassengers\.length > 0/, "onboard badge conditional");
  assert.match(DASHBOARD, /Users size=\{12\}/, "Users icon in badge");
});

test("UX3: Pending badge shown when pending requests exist", () => {
  assert.match(DASHBOARD, /operator\.pendingCount/, "pending count i18n key");
});

test("UX3: Direction clearly displayed with color coding", () => {
  assert.match(DASHBOARD, /displayDirection === "up"[\s\S]*?text-emerald-200/, "up = emerald");
  assert.match(DASHBOARD, /displayDirection === "down"[\s\S]*?text-red-300/, "down = red");
});

// ── 4. Écran vide ────────────────────────────────────────────────────────

test("UX4: Empty state message when no requests", () => {
  assert.match(DASHBOARD, /operator\.emptyQueue/, "empty queue i18n key");
  assert.match(DASHBOARD, /operator\.emptyQueueHint/, "empty queue hint i18n key");
  assert.match(DASHBOARD, /Inbox size=\{40\}/, "Inbox icon in empty state");
  assert.match(DASHBOARD, /activeQueue\.length === 0/, "empty state conditional");
});

test("UX4: MovementBoard empty row has Inbox icon", () => {
  assert.match(MOVEMENT_BOARD, /Inbox/, "Inbox icon in MovementBoard");
  assert.match(MOVEMENT_BOARD, /flex-col items-center/, "centered empty state");
});

// ── 5. UX passager ───────────────────────────────────────────────────────

test("UX5: Pulse dot animation on pending status icon", () => {
  assert.match(REQUEST_FORM, /anim-pulse-dot/, "pulse-dot class on pending icon");
  assert.match(REQUEST_FORM, /bg-yellow-400/, "yellow pulse dot");
});

test("UX5: 'En attente de l'opérateur' message for pending status", () => {
  assert.match(I18N, /request\.waitingForOperator/, "waitingForOperator i18n key");
});

test("UX5: Success pop animation on boarded status icon", () => {
  assert.match(REQUEST_FORM, /anim-success-pop/, "success-pop on boarded icon");
});

test("UX5: Request form has fade-in animation", () => {
  assert.match(REQUEST_FORM, /anim-fade-in/, "fade-in on submitted request section");
});

// ── 6. Loading global ────────────────────────────────────────────────────

test("UX6: Activate button shows 'En cours' with spinner when activating", () => {
  assert.match(WORKSPACE, /operator\.actionInProgress/, "action in progress i18n key");
  assert.match(WORKSPACE, /isActivatingThisElevator[\s?]*<Loader2/, "spinner on activate");
});

test("UX6: Release button shows 'En cours' with spinner when releasing", () => {
  assert.match(WORKSPACE, /releasingElevatorId.*Loader2/, "spinner on release");
});

test("UX6: RequestCard advance button has spinner when pending", () => {
  assert.match(REQUEST_CARD, /Loader2/, "Loader2 imported");
  assert.match(REQUEST_CARD, /anim-spinner/, "spinner class used");
  assert.match(REQUEST_CARD, /disabled=\{advancing\}/, "disabled when advancing (optimistic UI guard)");
});

// ── 7. Micro-feedback ────────────────────────────────────────────────────

test("UX7: Error messages shake on appearance", () => {
  assert.match(RECOMMENDED, /anim-shake/, "shake on RecommendedNextStop error");
  assert.match(DASHBOARD, /anim-shake/, "shake on Dashboard error");
  assert.match(REQUEST_FORM, /anim-shake/, "shake on RequestForm error");
});

test("UX7: Completed request card has CheckCircle2 success pop", () => {
  assert.match(REQUEST_CARD, /CheckCircle2/, "CheckCircle2 icon in RequestCard");
  assert.match(REQUEST_CARD, /anim-success-pop/, "success pop animation");
});

test("UX7: Terminal request cards fade out", () => {
  assert.match(REQUEST_CARD, /anim-fade-out/, "fade-out on terminal status cards");
});

// ── 8. Performance perçue (optimistic UI) ─────────────────────────────────

test("UX8: RecommendedNextStop computes isActionPending from dropoff only", () => {
  // Pickup is instant (optimistic) — no pending state. Only dropoff has pending state.
  assert.match(RECOMMENDED, /isActionPending = pendingDropoffIds\.size > 0/, "isActionPending from dropoff pending only");
});

test("UX8: OperatorWorkspace optimistic activation before server response", () => {
  assert.match(WORKSPACE, /setActivatingElevatorId\(elevator\.id\)/, "optimistic activation state");
  assert.match(WORKSPACE, /void \(async/, "async activation fired without await");
});

// ── 9. Clean UI ──────────────────────────────────────────────────────────

test("UX9: MovementBoard cards use anim-slide-in for smooth appearance", () => {
  assert.match(MOVEMENT_BOARD, /anim-slide-in/, "slide-in on movement cards");
});

test("UX9: Dashboard uses anim-fade-in for empty state appearance", () => {
  assert.match(DASHBOARD, /anim-fade-in/, "fade-in animation used");
});

test("UX9: Action buttons use disabled:cursor-wait", () => {
  assert.match(RECOMMENDED, /disabled:cursor-wait/, "cursor wait on disabled action buttons");
  assert.match(WORKSPACE, /disabled:cursor-wait/, "cursor wait on disabled activate/release");
});

// ── 10. i18n keys for all UX strings ─────────────────────────────────────

test("UX10: operator.actionInProgress exists in both FR and EN", () => {
  assert.match(I18N, /operator\.actionInProgress.*En cours/, "FR key");
  assert.match(I18N, /operator\.actionInProgress.*In progress/, "EN key");
});

test("UX10: operator.emptyQueue and emptyQueueHint exist", () => {
  assert.match(I18N, /operator\.emptyQueue.*Aucune demande/, "FR empty queue");
  assert.match(I18N, /operator\.emptyQueueHint/, "FR empty queue hint");
});

test("UX10: operator.onboardCount and pendingCount exist", () => {
  assert.match(I18N, /operator\.onboardCount/, "onboard count key");
  assert.match(I18N, /operator\.pendingCount/, "pending count key");
});
