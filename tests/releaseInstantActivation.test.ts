/**
 * BUG fix — delay after "Tablette libérée avec succès" before "Actif" works.
 *
 * Root cause: handleActivate guard checked `releasingElevatorId`, blocking
 * all activations while ANY release was in progress (server call 200ms–2s).
 * After the optimistic release update, the user saw the elevator selection
 * page but clicking "Actif" did nothing because the handler returned early.
 *
 * Fixes:
 * 1. handleActivate guard no longer checks releasingElevatorId
 * 2. hasActivatedAfterReleaseRef tracks if user activated after release
 * 3. Release failure rollback checks ref — won't clobber a new activation
 * 4. Release success now shows "operator.releaseSuccess" message
 * 5. Catch block uses i18n key instead of hardcoded string
 *
 * Tests:
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const root = process.cwd();

test("release-instant: handleActivate does NOT guard on releasingElevatorId", () => {
  const ws = readFileSync(join(root, "components/operator/OperatorWorkspace.tsx"), "utf8");
  const activateIdx = ws.indexOf("function handleActivate");
  const activateFn = ws.substring(activateIdx, activateIdx + 700);
  // The guard line should be `if (activatingElevatorId) return;` — no releasingElevatorId
  const guardMatch = activateFn.match(/if\s*\(\s*activatingElevatorId\s*\)\s*return/);
  assert.ok(guardMatch, "guard checks only activatingElevatorId");
  assert.doesNotMatch(guardMatch[0], /releasingElevatorId/, "guard does NOT check releasingElevatorId");
});

test("release-instant: hasActivatedAfterReleaseRef exists and is set in handleActivate", () => {
  const ws = readFileSync(join(root, "components/operator/OperatorWorkspace.tsx"), "utf8");
  assert.match(ws, /hasActivatedAfterReleaseRef/, "ref exists");
  assert.match(ws, /hasActivatedAfterReleaseRef\.current = true/, "set to true in handleActivate");
});

test("release-instant: release resets hasActivatedAfterReleaseRef to false", () => {
  const ws = readFileSync(join(root, "components/operator/OperatorWorkspace.tsx"), "utf8");
  const releaseIdx = ws.indexOf("function release()");
  const releaseFn = ws.substring(releaseIdx, releaseIdx + 400);
  assert.match(releaseFn, /hasActivatedAfterReleaseRef\.current = false/, "reset to false at start of release");
});

test("release-instant: release success shows releaseSuccess message", () => {
  const ws = readFileSync(join(root, "components/operator/OperatorWorkspace.tsx"), "utf8");
  const releaseIdx = ws.indexOf("function release()");
  const releaseFn = ws.substring(releaseIdx);
  // Find the success branch (after result.ok)
  const successBranch = releaseFn.substring(releaseFn.indexOf("} else {"), releaseFn.indexOf("} catch"));
  assert.match(successBranch, /operator\.releaseSuccess/, "shows releaseSuccess i18n key on success");
});

test("release-instant: release failure rollback checks hasActivatedAfterReleaseRef", () => {
  const ws = readFileSync(join(root, "components/operator/OperatorWorkspace.tsx"), "utf8");
  const releaseIdx = ws.indexOf("function release()");
  const releaseFn = ws.substring(releaseIdx);
  // Both failure paths should check the ref
  const failureChecks = releaseFn.match(/hasActivatedAfterReleaseRef\.current/g) ?? [];
  assert.ok(failureChecks.length >= 2, "ref checked in both failure paths (result.ok=false + catch)");
});

test("release-instant: catch block uses i18n key releaseFailed instead of hardcoded string", () => {
  const ws = readFileSync(join(root, "components/operator/OperatorWorkspace.tsx"), "utf8");
  const releaseIdx = ws.indexOf("function release()");
  const releaseFn = ws.substring(releaseIdx);
  const catchBlock = releaseFn.substring(releaseFn.indexOf("} catch"));
  assert.match(catchBlock, /operator\.releaseFailed/, "uses i18n key for failure message");
  assert.doesNotMatch(catchBlock, /Impossible de liberer/, "no hardcoded French string in catch");
});

test("release-instant: release function still guards on activatingElevatorId", () => {
  const ws = readFileSync(join(root, "components/operator/OperatorWorkspace.tsx"), "utf8");
  const releaseIdx = ws.indexOf("function release()");
  const releaseFn = ws.substring(releaseIdx, releaseIdx + 200);
  assert.match(releaseFn, /activatingElevatorId \|\| releasingElevatorId/, "release still guards on both IDs");
});

test("release-instant: i18n keys for releaseSuccess and releaseFailed exist", () => {
  const i18n = readFileSync(join(root, "lib/i18n.ts"), "utf8");
  assert.match(i18n, /operator\.releaseSuccess/, "releaseSuccess key exists");
  assert.match(i18n, /operator\.releaseFailed/, "releaseFailed key exists");
});
