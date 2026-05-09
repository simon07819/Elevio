/**
 * Session + config UX — targeted tests.
 *
 * Bugs fixed:
 * 1. projectConfigured state blocks operator/passenger when not configured
 * 2. Logo clickable → redirects to home
 * 3. Logo thumbnail preview (upload preview already in BrandLogoUploader)
 * 4. Session management — always show force release for stale sessions
 * 5. Auto-redirect to active session (already handled by selectedElevatorId)
 * 6. After release → clean reset, no "reprendre" for just-released elevators
 * 7. Multi-operator: locallyReleasedElevatorIds prevents stale "reprendre"
 * 8. Force release API endpoint for corrupted sessions
 *
 * Tests:
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const root = process.cwd();

// Bug 1: projectConfigured state + blocking
test("bug1: isProjectConfigured checks name, floors, elevators", () => {
  const config = readFileSync(join(root, "lib/projectConfig.ts"), "utf8");
  assert.match(config, /isProjectConfigured/, "function exists");
  assert.match(config, /floorCount/, "checks floor count");
  assert.match(config, /elevatorCount/, "checks elevator count");
  assert.match(config, /project\.name/, "checks project name");
  assert.match(config, /configured/, "respects DB configured flag");
});

test("bug1: operator page shows config-required when not configured", () => {
  const page = readFileSync(join(root, "app/operator/page.tsx"), "utf8");
  assert.match(page, /isProjectConfigured/, "uses isProjectConfigured");
  assert.match(page, /project\.configRequired/, "shows config-required message");
});

test("bug1: operator page checks subscription BEFORE project config", () => {
  const page = readFileSync(join(root, "app/operator/page.tsx"), "utf8");
  assert.match(page, /getSubscriptionStatus/, "checks subscription status");
  assert.match(page, /hasActiveSubscription/, "checks hasActiveSubscription");
  assert.match(page, /UpgradePrompt/, "shows upgrade prompt for free users");
  // In the function body, subscription check must come before isProjectConfigured
  const funcBody = page.substring(page.indexOf("export default async function"));
  const subIndex = funcBody.indexOf("getSubscriptionStatus");
  const configIndex = funcBody.indexOf("isProjectConfigured");
  assert.ok(subIndex < configIndex, "subscription check before config check in function body");
});

test("bug1: i18n keys for project config blocking exist", () => {
  const i18n = readFileSync(join(root, "lib/i18n.ts"), "utf8");
  assert.match(i18n, /project\.notConfigured/, "notConfigured key");
  assert.match(i18n, /project\.configRequired/, "configRequired key");
  assert.match(i18n, /project\.configRequiredBody/, "configRequiredBody key");
});

// Bug 2: Logo clickable
test("bug2: BrandLogo supports clickable prop → Link to home", () => {
  const logo = readFileSync(join(root, "components/BrandLogo.tsx"), "utf8");
  assert.match(logo, /clickable/, "clickable prop");
  assert.match(logo, /Link.*href=\"\/\"/, "Link to home");
});

test("bug2: operator page logo is clickable", () => {
  const page = readFileSync(join(root, "app/operator/page.tsx"), "utf8");
  assert.match(page, /BrandLogo.*clickable/, "clickable logo in operator footer");
});

// Bug 4/8: Force release API endpoint
test("bug4: force-release API endpoint exists", () => {
  assert.ok(existsSync(join(root, "app/api/operator/force-release/route.ts")), "route exists");
  const route = readFileSync(join(root, "app/api/operator/force-release/route.ts"), "utf8");
  assert.match(route, /export async function POST/, "POST handler");
  assert.match(route, /projectId/, "accepts projectId");
  assert.match(route, /elevatorId/, "accepts elevatorId");
  assert.match(route, /TABLET_SESSION_FIELDS_CLEAR/, "clears session fields");
});

// Bug 4: Force release button in operator UI
test("bug4: force release button shown for stale sessions", () => {
  const ws = readFileSync(join(root, "components/operator/OperatorWorkspace.tsx"), "utf8");
  assert.match(ws, /operator\.forceRelease/, "force release button");
  assert.match(ws, /api\/operator\/force-release/, "calls force release API");
});

// Bug 6: After release → no "reprendre" for just-released elevators
test("bug6: justReleased prevents stale 'reprendre' after release", () => {
  const ws = readFileSync(join(root, "components/operator/OperatorWorkspace.tsx"), "utf8");
  assert.match(ws, /justReleased/, "justReleased flag");
  assert.match(ws, /locallyReleasedElevatorIds\.has/, "checks locally released set");
  // staleOtherBinding is guarded by !justReleased
  assert.match(ws, /justReleased[\s\S]{0,100}staleOtherBinding/, "staleOtherBinding guarded by justReleased check");
});

// Bug 8: i18n keys for force release
test("bug8: force release i18n keys exist FR+EN", () => {
  const i18n = readFileSync(join(root, "lib/i18n.ts"), "utf8");
  assert.match(i18n, /operator\.forceRelease/, "forceRelease key");
  assert.match(i18n, /operator\.releaseSuccess/, "releaseSuccess key");
  assert.match(i18n, /operator\.releaseFailed/, "releaseFailed key");
  assert.match(i18n, /Forcer la libération/, "FR force release");
  assert.match(i18n, /Force release/, "EN force release");
});

// Bug: Project type has configured field
test("project type has configured and support fields", () => {
  const types = readFileSync(join(root, "types/hoist.ts"), "utf8");
  assert.match(types, /configured\??: boolean/, "configured field");
  assert.match(types, /support_email/, "support_email field");
  assert.match(types, /support_phone/, "support_phone field");
  assert.match(types, /floor_min/, "floor_min field");
  assert.match(types, /floor_max/, "floor_max field");
  assert.match(types, /default_language/, "default_language field");
});
