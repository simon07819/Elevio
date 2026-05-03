/**
 * Support/Legal page — targeted tests.
 *
 * Requirement: Add support/legal screen with:
 * - Privacy policy link
 * - Support/contact link
 * - App version
 * - No broken links
 *
 * Implementation:
 * - /support page with privacy + contact links + version display
 * - i18n keys: support.title, support.privacy, support.privacyUrl,
 *   support.contact, support.contactUrl, support.version (FR + EN)
 * - lib/version.ts: single source of truth for app version
 * - AppNavigation includes /support link
 *
 * Tests:
 * 1. i18n keys exist for all support strings (FR + EN)
 * 2. Support page renders privacy and contact links with valid URLs
 * 3. Version module exports version string
 * 4. Navigation includes /support link
 * 5. URLs use https:// (no broken/relative links)
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const root = process.cwd();

// ---------------------------------------------------------------------------
// 1. i18n keys exist for all support strings (FR + EN)
// ---------------------------------------------------------------------------
test("support: i18n keys for title, privacy, contact, version", () => {
  const i18n = readFileSync(join(root, "lib/i18n.ts"), "utf8");
  assert.match(i18n, /"support\.title"/, "title key");
  assert.match(i18n, /"support\.privacy"/, "privacy key");
  assert.match(i18n, /"support\.privacyUrl"/, "privacyUrl key");
  assert.match(i18n, /"support\.contact"/, "contact key");
  assert.match(i18n, /"support\.contactUrl"/, "contactUrl key");
  assert.match(i18n, /"support\.version"/, "version key");
  // Both FR and EN versions
  const frCount = (i18n.match(/Politique de confidentialité/g) || []).length;
  const enCount = (i18n.match(/Privacy policy/g) || []).length;
  assert.ok(frCount >= 1, "FR privacy text");
  assert.ok(enCount >= 1, "EN privacy text");
});

// ---------------------------------------------------------------------------
// 2. Support page renders privacy and contact links with valid URLs
// ---------------------------------------------------------------------------
test("support: page links to privacy and contact with i18n URLs", () => {
  const page = readFileSync(join(root, "app/support/page.tsx"), "utf8");
  assert.match(page, /support\.privacyUrl/, "privacy URL from i18n");
  assert.match(page, /support\.contactUrl/, "contact URL from i18n");
  assert.match(page, /target="_blank"/, "links open in new tab");
  assert.match(page, /rel="noopener noreferrer"/, "secure rel attribute");
  assert.match(page, /support\.privacy/, "privacy label");
  assert.match(page, /support\.contact/, "contact label");
});

// ---------------------------------------------------------------------------
// 3. Version module exports version string
// ---------------------------------------------------------------------------
test("support: version module exports string", () => {
  const version = readFileSync(join(root, "lib/version.ts"), "utf8");
  assert.match(version, /export const version/, "version exported");
  assert.match(version, /npm_package_version|0\.1\.0/, "version has value");
});

// ---------------------------------------------------------------------------
// 4. Navigation includes /support link
// ---------------------------------------------------------------------------
test("support: AppNavigation includes /support route", () => {
  const nav = readFileSync(join(root, "components/AppNavigation.tsx"), "utf8");
  assert.match(nav, /\/support/, "/support route in nav");
  assert.match(nav, /nav\.support/, "uses nav.support translation key");
});

// ---------------------------------------------------------------------------
// 5. URLs use https:// (no broken/relative links)
// ---------------------------------------------------------------------------
test("support: all URLs are absolute https", () => {
  const i18n = readFileSync(join(root, "lib/i18n.ts"), "utf8");
  const urlKeys = i18n.match(/"support\.\w+Url":\s*"([^"]+)"/g);
  assert.ok(urlKeys && urlKeys.length >= 2, "at least 2 URL keys found");
  for (const entry of urlKeys) {
    const url = entry.match(/"([^"]+)"$/)?.[1];
    assert.ok(url?.startsWith("https://"), `${url} uses https://`);
  }
});
