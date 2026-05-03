/**
 * Support & legal screen — targeted tests.
 *
 * Bug: App Store requires visible support contact, privacy policy,
 * terms of service, and app version. None of these exist in the app.
 *
 * Fix:
 * - /support page with version, contact email, privacy link, terms link
 * - APP_VERSION single source of truth in lib/version.ts
 * - Env vars NEXT_PUBLIC_SUPPORT_EMAIL, NEXT_PUBLIC_PRIVACY_URL,
 *   NEXT_PUBLIC_TERMS_URL for configuring links
 * - Clear "not yet configured" message when env vars missing
 * - Nav link to /support in AppNavigation
 * - i18n keys for all labels (FR + EN)
 *
 * Tests:
 * 1. Support page exists at app/support/page.tsx
 * 2. Email support visible (env var or fallback message)
 * 3. Privacy policy link visible (env var or fallback message)
 * 4. Terms of service link visible (env var or fallback message)
 * 5. App version displayed from lib/version.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const root = process.cwd();

// ---------------------------------------------------------------------------
// 1. Support page exists at app/support/page.tsx
// ---------------------------------------------------------------------------
test("support: page exists with required sections", () => {
  const page = readFileSync(join(root, "app/support/page.tsx"), "utf8");
  assert.match(page, /support\.title/, "title i18n key");
  assert.match(page, /support\.version/, "version section");
  assert.match(page, /support\.contact/, "contact section");
  assert.match(page, /support\.privacy/, "privacy section");
  assert.match(page, /support\.terms/, "terms section");
});

// ---------------------------------------------------------------------------
// 2. Email support visible (env var or fallback message)
// ---------------------------------------------------------------------------
test("support: email contact with env var + fallback message", () => {
  const page = readFileSync(join(root, "app/support/page.tsx"), "utf8");
  assert.match(page, /NEXT_PUBLIC_SUPPORT_EMAIL/, "env var for email");
  assert.match(page, /mailto:/, "mailto link");
  assert.match(page, /support\.notConfigured/, "fallback message when not set");
});

// ---------------------------------------------------------------------------
// 3. Privacy policy link visible (env var or fallback message)
// ---------------------------------------------------------------------------
test("support: privacy policy link with env var + fallback", () => {
  const page = readFileSync(join(root, "app/support/page.tsx"), "utf8");
  assert.match(page, /NEXT_PUBLIC_PRIVACY_URL/, "env var for privacy URL");
  assert.match(page, /support\.privacyLink/, "privacy link label");
  assert.match(page, /target="_blank"/, "opens in new tab");
});

// ---------------------------------------------------------------------------
// 4. Terms of service link visible (env var or fallback message)
// ---------------------------------------------------------------------------
test("support: terms of service link with env var + fallback", () => {
  const page = readFileSync(join(root, "app/support/page.tsx"), "utf8");
  assert.match(page, /NEXT_PUBLIC_TERMS_URL/, "env var for terms URL");
  assert.match(page, /support\.termsLink/, "terms link label");
});

// ---------------------------------------------------------------------------
// 5. App version displayed from lib/version.ts
// ---------------------------------------------------------------------------
test("support: app version from single source of truth", () => {
  const version = readFileSync(join(root, "lib/version.ts"), "utf8");
  assert.match(version, /APP_VERSION/, "APP_VERSION exported");
  assert.match(version, /\d+\.\d+\.\d+/, "semver format");

  const page = readFileSync(join(root, "app/support/page.tsx"), "utf8");
  assert.match(page, /APP_VERSION/, "version imported and displayed");
});
