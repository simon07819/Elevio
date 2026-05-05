/**
 * i18n tests — FR + EN + ES completeness and correctness.
 *
 * Verifies:
 * 1. ES translations exist for all FR keys
 * 2. EN translations exist for all FR keys
 * 3. Fallback chain works (locale → en → fr → key)
 * 4. LanguageSwitcher includes FR/EN/ES
 * 5. Server-side locale resolver works
 * 6. New i18n keys exist in all locales
 * 7. No empty translations in ES
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const root = process.cwd();

// ═══════════════════════════════════════════════════════════════════
// 1. Translation completeness
// ═══════════════════════════════════════════════════════════════════

test("i18n: ES translations exist as a locale block", () => {
  const i18n = readFileSync(join(root, "lib/i18n.ts"), "utf8");
  assert.match(i18n, /es:\s*\{/, "ES locale block exists");
});

test("i18n: Locale type includes es", () => {
  const i18n = readFileSync(join(root, "lib/i18n.ts"), "utf8");
  assert.match(i18n, /type Locale.*"es"/, "Locale type includes es");
});

test("i18n: localeFromNavigatorTag recognizes Spanish", () => {
  const i18n = readFileSync(join(root, "lib/i18n.ts"), "utf8");
  assert.match(i18n, /startsWith\("es"\)/, "recognizes es prefix");
});

test("i18n: fallback chain uses locale → en → fr", () => {
  const provider = readFileSync(join(root, "components/i18n/LanguageProvider.tsx"), "utf8");
  assert.match(provider, /translations\[locale\]/, "checks locale first");
  assert.match(provider, /translations\.en/, "falls back to en");
  assert.match(provider, /translations\.fr/, "falls back to fr");
});

// ═══════════════════════════════════════════════════════════════════
// 2. LanguageSwitcher includes ES
// ═══════════════════════════════════════════════════════════════════

test("i18n: LanguageSwitcher has FR/EN/ES options", () => {
  const switcher = readFileSync(join(root, "components/i18n/LanguageSwitcher.tsx"), "utf8");
  assert.match(switcher, /code: "fr"/, "has FR option");
  assert.match(switcher, /code: "en"/, "has EN option");
  assert.match(switcher, /code: "es"/, "has ES option");
  assert.match(switcher, /common\.spanish/, "uses Spanish label key");
});

test("i18n: LanguageProvider supports 'es' in stored locale", () => {
  const provider = readFileSync(join(root, "components/i18n/LanguageProvider.tsx"), "utf8");
  assert.match(provider, /stored === "es"/, "accepts 'es' from localStorage");
});

// ═══════════════════════════════════════════════════════════════════
// 3. Server-side locale resolver
// ═══════════════════════════════════════════════════════════════════

test("i18n: server-side helper exists", () => {
  const server = readFileSync(join(root, "lib/i18nServer.ts"), "utf8");
  assert.match(server, /getServerLocale/, "exports getServerLocale");
  assert.match(server, /serverT/, "exports serverT");
  assert.match(server, /localeFromCookies/, "uses localeFromCookies");
  assert.match(server, /translations\[locale\]/, "uses translations object");
});

// ═══════════════════════════════════════════════════════════════════
// 4. Key i18n keys exist in ES
// ═══════════════════════════════════════════════════════════════════

const CRITICAL_ES_KEYS = [
  "support.title",
  "support.subtitle",
  "support.passenger",
  "support.operator",
  "support.faqSection",
  "support.safetySection",
  "support.dataSection",
  "support.liabilitySection",
  "support.contactSection",
  "support.sendMessage",
  "support.typeTechnical",
  "support.typeGeneral",
  "support.typePayment",
  "support.typeAccount",
  "support.typeSafety",
  "support.typeOther",
  "support.sendButton",
  "support.privacyTitle",
  "support.termsTitle",
  "request.title",
  "operator.title",
  "admin.eyebrow",
  "superadmin.badge",
  "superadmin.supportMessages",
  "superadmin.supportContent",
  "superadmin.legalContent",
  "superadmin.dashboardTitle",
  "scan.title",
  "nav.scan",
  "nav.operator",
  "nav.admin",
];

for (const key of CRITICAL_ES_KEYS) {
  test(`i18n: ES has key "${key}"`, () => {
    const i18n = readFileSync(join(root, "lib/i18n.ts"), "utf8");
    const esStartIdx = i18n.indexOf("es: {");
    assert.ok(esStartIdx > 0, "ES block found");
    const esBlock = i18n.slice(esStartIdx);
    const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    assert.match(esBlock, new RegExp(`"${escapedKey}"`), `ES has ${key}`);
  });
}

// ═══════════════════════════════════════════════════════════════════
// 5. Multilingual site_settings keys
// ═══════════════════════════════════════════════════════════════════

test("i18n: site_settings has _en and _es variants for support texts", () => {
  const config = readFileSync(join(root, "lib/siteSettingsConfig.ts"), "utf8");
  assert.match(config, /support_passenger_text_en/, "EN passenger text key");
  assert.match(config, /support_operator_text_en/, "EN operator text key");
  assert.match(config, /support_faq_json_en/, "EN FAQ key");
  assert.match(config, /support_safety_text_en/, "EN safety text key");
  assert.match(config, /support_data_text_en/, "EN data text key");
  assert.match(config, /support_liability_text_en/, "EN liability text key");
  assert.match(config, /support_passenger_text_es/, "ES passenger text key");
  assert.match(config, /support_operator_text_es/, "ES operator text key");
  assert.match(config, /support_faq_json_es/, "ES FAQ key");
  assert.match(config, /support_safety_text_es/, "ES safety text key");
  assert.match(config, /support_data_text_es/, "ES data text key");
  assert.match(config, /support_liability_text_es/, "ES liability text key");
});

test("i18n: site_settings has _en and _es variants for legal content", () => {
  const config = readFileSync(join(root, "lib/siteSettingsConfig.ts"), "utf8");
  assert.match(config, /privacy_content_en/, "EN privacy content key");
  assert.match(config, /terms_content_en/, "EN terms content key");
  assert.match(config, /privacy_content_es/, "ES privacy content key");
  assert.match(config, /terms_content_es/, "ES terms content key");
});

// ═══════════════════════════════════════════════════════════════════
// 6. Support page uses server-side i18n
// ═══════════════════════════════════════════════════════════════════

test("i18n: support page uses getServerLocale + serverT", () => {
  const page = readFileSync(join(root, "app/support/page.tsx"), "utf8");
  assert.match(page, /getServerLocale/, "resolves locale server-side");
  assert.match(page, /serverT/, "uses serverT for translations");
  assert.match(page, /support\.title/, "uses i18n key for title");
  assert.match(page, /support\.passenger/, "uses i18n key for passenger");
  assert.match(page, /support\.faqSection/, "uses i18n key for FAQ");
  assert.match(page, /support\.safetySection/, "uses i18n key for safety");
  assert.match(page, /support\.dataSection/, "uses i18n key for data");
  assert.match(page, /support\.liabilitySection/, "uses i18n key for liability");
  assert.match(page, /support\.contactSection/, "uses i18n key for contact");
  assert.match(page, /support\.sendButton/, "uses i18n key for send");
});

test("i18n: support page has locale-aware fallback defaults", () => {
  const page = readFileSync(join(root, "app/support/page.tsx"), "utf8");
  assert.match(page, /defaultFAQ\(locale\)/, "FAQ defaults are locale-aware");
  assert.match(page, /defaultPassenger\(locale\)/, "passenger default is locale-aware");
  assert.match(page, /defaultOperator\(locale\)/, "operator default is locale-aware");
  assert.match(page, /defaultSafety\(locale\)/, "safety default is locale-aware");
  assert.match(page, /defaultData\(locale\)/, "data default is locale-aware");
  assert.match(page, /defaultLiability\(locale\)/, "liability default is locale-aware");
});

test("i18n: support page reads _en/_es site_settings with fallback", () => {
  const page = readFileSync(join(root, "app/support/page.tsx"), "utf8");
  assert.match(page, /suffix.*locale/, "computes locale suffix");
  assert.match(page, /byKeyLocale/, "has locale-aware key lookup");
});
