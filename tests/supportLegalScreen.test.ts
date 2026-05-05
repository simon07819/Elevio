/**
 * Support & legal screen tests.
 *
 * Verifies:
 * - /support has all required sections (passenger, operator, FAQ, safety, data, liability, contact, legal links)
 * - /legal/privacy exists with structured content
 * - /legal/terms exists with structured content
 * - App version displayed
 * - Support email visible
 * - Legal links point to /legal/privacy and /legal/terms
 * - Logo clickable + back button on all legal pages
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const root = process.cwd();
const SUPPORT_PAGE = readFileSync(join(root, "app/support/page.tsx"), "utf8");
const PRIVACY_PAGE = readFileSync(join(root, "app/legal/privacy/page.tsx"), "utf8");
const TERMS_PAGE = readFileSync(join(root, "app/legal/terms/page.tsx"), "utf8");
const VERSION = readFileSync(join(root, "lib/version.ts"), "utf8");

// ═══════════════════════════════════════════════════════════════════
// 1. Support page has all required sections
// ═══════════════════════════════════════════════════════════════════

test("support: page has passenger section", () => {
  assert.match(SUPPORT_PAGE, /support\.passenger/, "passenger section");
});

test("support: page has operator section", () => {
  assert.match(SUPPORT_PAGE, /support\.operator/, "operator section");
});

test("support: page has FAQ section", () => {
  assert.match(SUPPORT_PAGE, /support\.faqSection/, "FAQ section");
  assert.match(SUPPORT_PAGE, /Je ne vois pas ma demande/, "specific FAQ item");
});

test("support: page has safety section", () => {
  assert.match(SUPPORT_PAGE, /support\.safetySection/, "safety section");
});

test("support: page has data collection section", () => {
  assert.match(SUPPORT_PAGE, /support\.dataSection/, "data section");
  assert.match(SUPPORT_PAGE, /support\.noDataSale/, "no data sale statement");
});

test("support: page has liability section", () => {
  assert.match(SUPPORT_PAGE, /support\.liabilitySection/, "liability section");
});

test("support: page has contact section", () => {
  assert.match(SUPPORT_PAGE, /support\.contactSection|support@elevio\.app/, "contact section");
  assert.match(SUPPORT_PAGE, /mailto:/, "mailto link");
});

test("support: page has legal links", () => {
  assert.match(SUPPORT_PAGE, /\/legal\/privacy/, "privacy link");
  assert.match(SUPPORT_PAGE, /\/legal\/terms/, "terms link");
});

// ═══════════════════════════════════════════════════════════════════
// 2. Support page version + logo + back
// ═══════════════════════════════════════════════════════════════════

test("support: app version displayed from version.ts", () => {
  assert.match(VERSION, /APP_VERSION/, "APP_VERSION exported");
  assert.match(VERSION, /\d+\.\d+\.\d+/, "semver format");
  assert.match(SUPPORT_PAGE, /APP_VERSION/, "version imported and displayed");
});

test("support: logo clickable and back button present", () => {
  assert.match(SUPPORT_PAGE, /BrandLogo/, "has logo");
  assert.match(SUPPORT_PAGE, /href="\/"/, "logo links to /");
  assert.match(SUPPORT_PAGE, /BackButton/, "has back button");
});

// ═══════════════════════════════════════════════════════════════════
// 3. Privacy page
// ═══════════════════════════════════════════════════════════════════

test("legal: /legal/privacy page exists with content", () => {
  assert.match(PRIVACY_PAGE, /support\.privacyTitle/, "privacy title");
  assert.match(PRIVACY_PAGE, /Données collectées|collectées/i, "data section");
  assert.match(PRIVACY_PAGE, /Aucune vente/, "no data sale statement");
  assert.match(PRIVACY_PAGE, /Conservation|conservation/i, "retention section");
  assert.match(PRIVACY_PAGE, /Sécurité|sécurité/i, "security section");
  assert.match(PRIVACY_PAGE, /support@elevio\.app/, "contact email");
});

test("legal: privacy page has logo + back button", () => {
  assert.match(PRIVACY_PAGE, /BrandLogo/, "has logo");
  assert.match(PRIVACY_PAGE, /href="\/"/, "logo links to /");
  assert.match(PRIVACY_PAGE, /BackButton/, "has back button");
  assert.match(PRIVACY_PAGE, /fallback.*support/, "back fallback to /support");
});

// ═══════════════════════════════════════════════════════════════════
// 4. Terms page
// ═══════════════════════════════════════════════════════════════════

test("legal: /legal/terms page exists with content", () => {
  assert.match(TERMS_PAGE, /support\.termsTitle/, "terms title");
  assert.match(TERMS_PAGE, /outil de coordination/, "coordination tool description");
  assert.match(TERMS_PAGE, /Limitation|limitation/i, "limitation section");
  assert.match(TERMS_PAGE, /Aucune garantie/, "no warranty statement");
  assert.match(TERMS_PAGE, /support@elevio\.app/, "contact email");
});

test("legal: terms page has logo + back button", () => {
  assert.match(TERMS_PAGE, /BrandLogo/, "has logo");
  assert.match(TERMS_PAGE, /href="\/"/, "logo links to /");
  assert.match(TERMS_PAGE, /BackButton/, "has back button");
  assert.match(TERMS_PAGE, /fallback.*support/, "back fallback to /support");
});

// ═══════════════════════════════════════════════════════════════════
// 5. Support visibility rules
// ═══════════════════════════════════════════════════════════════════

test("support: NOT in MobileBottomNav (passenger-safe)", () => {
  const MOBILE_NAV = readFileSync(join(root, "components/MobileBottomNav.tsx"), "utf8");
  assert.doesNotMatch(MOBILE_NAV, /\/support/, "support NOT in mobile bottom nav");
});

test("support: visible in AppNavigation when showSupport=true", () => {
  const NAV = readFileSync(join(root, "components/AppNavigation.tsx"), "utf8");
  assert.match(NAV, /showSupport/, "has showSupport prop");
  assert.match(NAV, /\/support/, "support link conditional on showSupport");
});

test("support: AppShell passes showSupport for admin context", () => {
  const SHELL = readFileSync(join(root, "components/AppShell.tsx"), "utf8");
  assert.match(SHELL, /showSupport/, "AppShell passes showSupport");
});
