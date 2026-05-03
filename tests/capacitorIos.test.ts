/**
 * Capacitor iOS preparation — targeted tests.
 *
 * Prepares the app for iOS Capacitor wrapping:
 * - viewport-fit=cover for iPhone safe-area
 * - Apple touch icon metadata
 * - PWA manifest with PNG icons (192 + 512)
 * - Capacitor config exists
 * - CSS safe-area env() on body
 * - No business logic changed
 *
 * Tests:
 * 1. viewport-fit=cover in layout viewport config
 * 2. Apple touch icon metadata in layout
 * 3. Manifest has PNG icon entries (192 + 512)
 * 4. Capacitor config exists with correct appId
 * 5. CSS safe-area env() padding on body
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const root = process.cwd();

// ---------------------------------------------------------------------------
// 1. viewport-fit=cover in layout viewport config
// ---------------------------------------------------------------------------
test("capacitor: viewport-fit cover for iPhone safe-area", () => {
  const layout = readFileSync(join(root, "app/layout.tsx"), "utf8");
  assert.match(layout, /viewportFit.*cover/, "viewport-fit=cover set");
});

// ---------------------------------------------------------------------------
// 2. Apple touch icon metadata in layout
// ---------------------------------------------------------------------------
test("capacitor: apple touch icon metadata", () => {
  const layout = readFileSync(join(root, "app/layout.tsx"), "utf8");
  assert.match(layout, /icon-192\.png/, "apple touch icon references icon-192.png");
  assert.match(layout, /apple.*icon|icons.*apple/i, "icons.apple or apple icon in metadata");
});

// ---------------------------------------------------------------------------
// 3. Manifest has PNG icon entries (192 + 512)
// ---------------------------------------------------------------------------
test("capacitor: PWA manifest includes PNG icons", () => {
  const manifest = JSON.parse(readFileSync(join(root, "public/manifest.webmanifest"), "utf8"));
  const sizes = manifest.icons.map((i: { sizes: string }) => i.sizes);
  assert.ok(sizes.includes("192x192"), "192x192 PNG icon");
  assert.ok(sizes.includes("512x512"), "512x512 PNG icon");
  const pngIcons = manifest.icons.filter((i: { type: string }) => i.type === "image/png");
  assert.ok(pngIcons.length >= 2, "at least 2 PNG icons");
});

// ---------------------------------------------------------------------------
// 4. Capacitor config exists with correct appId
// ---------------------------------------------------------------------------
test("capacitor: config exists with appId and webDir", () => {
  const config = readFileSync(join(root, "capacitor.config.ts"), "utf8");
  assert.match(config, /appId.*elevio/, "appId set");
  assert.match(config, /webDir/, "webDir configured");
  assert.match(config, /SplashScreen/, "SplashScreen plugin configured");
  assert.match(config, /StatusBar/, "StatusBar plugin configured");
  assert.match(config, /05070a/, "background color matches app theme");
  assert.ok(!config.includes("@capacitor/cli"), "no @capacitor/cli import (build-safe)");
});

// ---------------------------------------------------------------------------
// 5. CSS safe-area env() padding on body
// ---------------------------------------------------------------------------
test("capacitor: CSS safe-area env() on html and body", () => {
  const css = readFileSync(join(root, "app/globals.css"), "utf8");
  assert.match(css, /safe-area-inset-top/, "safe-area-inset-top used");
  assert.match(css, /safe-area-inset-bottom/, "safe-area-inset-bottom used");
  assert.match(css, /safe-area-inset-left/, "safe-area-inset-left used");
  assert.match(css, /safe-area-inset-right/, "safe-area-inset-right used");
});
