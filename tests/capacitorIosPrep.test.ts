/**
 * Capacitor iOS prep — targeted tests.
 *
 * Bug: App not prepared for iOS Capacitor wrapper — no viewport-fit=cover,
 * no safe-area padding, no apple-touch-icon, no PNG icons for manifest.
 * Content hidden by notch and home indicator on iPhone.
 *
 * Fix:
 * - viewport-fit: "cover" in layout.tsx viewport config
 * - env(safe-area-inset-*) on html and body in globals.css
 * - apple-touch-icon metadata pointing to icon-192.png
 * - PNG icon placeholders (192x192, 512x512) in public/
 * - manifest.webmanifest updated with PNG icon entries
 * - touch-target class already exists (56px min size)
 *
 * Tests:
 * 1. viewport-fit cover is set
 * 2. safe-area-inset padding on html and body
 * 3. apple-touch-icon in metadata
 * 4. PNG icons exist in public/ and manifest
 * 5. touch-target class ensures 56px minimum
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const root = process.cwd();

// ---------------------------------------------------------------------------
// 1. viewport-fit cover is set
// ---------------------------------------------------------------------------
test("capacitor: viewport-fit cover configured", () => {
  const layout = readFileSync(join(root, "app/layout.tsx"), "utf8");
  assert.match(layout, /viewportFit:\s*"cover"/, "viewportFit cover set");
});

// ---------------------------------------------------------------------------
// 2. safe-area-inset padding on html and body
// ---------------------------------------------------------------------------
test("capacitor: safe-area-inset-top on body, bottom handled per-component", () => {
  const css = readFileSync(join(root, "app/globals.css"), "utf8");
  assert.match(css, /env\(safe-area-inset-top\)/, "top inset on body (global)");
  // Bottom safe area is handled per-component (bottom nav, request form, operator footer)
  // Verify at least one component handles bottom inset
  const bottomNav = readFileSync(join(root, "components/MobileBottomNav.tsx"), "utf8");
  assert.match(bottomNav, /env\(safe-area-inset-bottom\)/, "bottom inset on MobileBottomNav");
});

// ---------------------------------------------------------------------------
// 3. apple-touch-icon in metadata
// ---------------------------------------------------------------------------
test("capacitor: apple-touch-icon metadata configured", () => {
  const layout = readFileSync(join(root, "app/layout.tsx"), "utf8");
  assert.match(layout, /apple.*icon-192/, "apple icon points to icon-192.png");
});

// ---------------------------------------------------------------------------
// 4. PNG icons exist in public/ and manifest
// ---------------------------------------------------------------------------
test("capacitor: PNG icons in public/ and manifest", () => {
  assert.ok(existsSync(join(root, "public/icon-192.png")), "icon-192.png exists");
  assert.ok(existsSync(join(root, "public/icon-512.png")), "icon-512.png exists");
  const manifest = readFileSync(join(root, "public/manifest.webmanifest"), "utf8");
  assert.match(manifest, /icon-192\.png/, "192 icon in manifest");
  assert.match(manifest, /icon-512\.png/, "512 icon in manifest");
});

// ---------------------------------------------------------------------------
// 5. touch-target class ensures 56px minimum
// ---------------------------------------------------------------------------
test("capacitor: touch-target class provides 56px minimum", () => {
  const css = readFileSync(join(root, "app/globals.css"), "utf8");
  assert.match(css, /touch-target/, "touch-target class exists");
  assert.match(css, /min-height:\s*56px/, "min-height 56px");
  assert.match(css, /min-width:\s*56px/, "min-width 56px");
});
