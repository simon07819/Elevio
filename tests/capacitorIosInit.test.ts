/**
 * Capacitor iOS init — targeted tests.
 *
 * Verifies Capacitor is properly installed and configured for iOS.
 *
 * Tests:
 * 1. capacitor.config.ts exists with correct appId, appName, webDir
 * 2. iOS platform added (ios/App directory exists)
 * 3. Server URL config supports live-server mode
 * 4. cap-prepare.sh script exists for webDir setup
 * 5. Next.js build unchanged (no static export regression)
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const root = process.cwd();

// ---------------------------------------------------------------------------
// 1. capacitor.config.ts exists with correct appId, appName, webDir
// ---------------------------------------------------------------------------
test("capacitor: config has appId, appName, webDir", () => {
  const config = readFileSync(join(root, "capacitor.config.ts"), "utf8");
  assert.match(config, /com\.elevio\.app/, "appId is com.elevio.app");
  assert.match(config, /Elevio/, "appName is Elevio");
  assert.match(config, /webDir.*['"]out['"]/, "webDir is out");
});

// ---------------------------------------------------------------------------
// 2. iOS platform added (ios/App directory exists)
// ---------------------------------------------------------------------------
test("capacitor: iOS platform added with Xcode project", () => {
  assert.ok(existsSync(join(root, "ios/App/App.xcodeproj")), "Xcode project exists");
  assert.ok(existsSync(join(root, "ios/App/App")), "App directory exists");
});

// ---------------------------------------------------------------------------
// 3. Server URL via env var + WelcomeScreen inline fallback
// ---------------------------------------------------------------------------
test("capacitor: server.url from CAPACITOR_SERVER_URL env + ScanHome mounted fallback (no redirect)", () => {
  const config = readFileSync(join(root, "capacitor.config.ts"), "utf8");
  assert.match(config, /CAPACITOR_SERVER_URL/, "server.url reads from CAPACITOR_SERVER_URL env var");
  assert.match(config, /server/, "server config section exists");
  // ScanHome renders passenger QR directly with a mounted fallback — no /welcome redirect
  const scanHome = readFileSync(join(root, "components/ScanHome.tsx"), "utf8");
  assert.match(scanHome, /mounted/, "ScanHome has mounted state for hydration safety");
  assert.doesNotMatch(scanHome, /router\.replace\("\/welcome"\)/, "no router.replace to /welcome (would loop)");
});

// ---------------------------------------------------------------------------
// 4. cap-prepare.sh script exists for webDir setup
// ---------------------------------------------------------------------------
test("capacitor: cap-prepare.sh script exists", () => {
  assert.ok(existsSync(join(root, "scripts/cap-prepare.sh")), "cap-prepare.sh exists");
  const script = readFileSync(join(root, "scripts/cap-prepare.sh"), "utf8");
  assert.match(script, /mkdir.*out/, "creates out directory");
  assert.match(script, /index\.html/, "creates fallback index.html");
});

// ---------------------------------------------------------------------------
// 5. Next.js build unchanged (no static export regression)
// ---------------------------------------------------------------------------
test("capacitor: next.config.ts has no output:export", () => {
  const config = readFileSync(join(root, "next.config.ts"), "utf8");
  assert.ok(!config.includes('output: "export"'), "no static export (SSR preserved)");
  assert.ok(!config.includes("output:'export'"), "no static export variant");
});
