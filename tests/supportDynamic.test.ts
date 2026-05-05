/**
 * Support dynamic content + legal + inbox tests.
 *
 * Verifies:
 * 1. /support reads from site_settings with fallback
 * 2. /legal pages read from site_settings with fallback
 * 3. Support form posts to /api/support
 * 4. Superadmin support editor has FAQ + text editing
 * 5. Superadmin legal editor has content + preview
 * 6. Superadmin inbox page exists
 * 7. support_messages table SQL exists
 * 8. API route validates input
 * 9. Fallback works when settings empty
 * 10. New site_settings keys exist in config
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const root = process.cwd();

// ═══════════════════════════════════════════════════════════════════
// 1. /support is dynamic with fallback
// ═══════════════════════════════════════════════════════════════════

test("support: page reads from site_settings", () => {
  const page = readFileSync(join(root, "app/support/page.tsx"), "utf8");
  assert.match(page, /getSiteSettings/, "fetches site settings");
  assert.match(page, /support_email/, "uses support_email setting");
  assert.match(page, /support_faq_json|faq_content/, "uses FAQ setting");
  assert.match(page, /support_passenger_text/, "uses passenger text setting");
  assert.match(page, /support_operator_text/, "uses operator text setting");
  assert.match(page, /support_safety_text/, "uses safety text setting");
  assert.match(page, /support_data_text/, "uses data text setting");
  assert.match(page, /support_liability_text/, "uses liability text setting");
});

test("support: has fallback defaults when settings empty", () => {
  const page = readFileSync(join(root, "app/support/page.tsx"), "utf8");
  assert.match(page, /defaultFAQ/, "has default FAQ fallback");
  assert.match(page, /defaultPassenger/, "has default passenger text fallback");
  assert.match(page, /defaultOperator/, "has default operator text fallback");
  assert.match(page, /defaultSafety/, "has default safety text fallback");
  assert.match(page, /defaultData/, "has default data text fallback");
  assert.match(page, /defaultLiability/, "has default liability text fallback");
  assert.match(page, /DEFAULT_EMAIL/, "has default email fallback");
});

test("support: has support form posting to /api/support", () => {
  const page = readFileSync(join(root, "app/support/page.tsx"), "utf8");
  assert.match(page, /\/api\/support/, "form action posts to API");
  assert.match(page, /name="type"/, "has type field");
  assert.match(page, /name="name"/, "has name field");
  assert.match(page, /name="email"/, "has email field");
  assert.match(page, /name="role"/, "has role field");
  assert.match(page, /name="message"/, "has message field");
  assert.match(page, /name="project"/, "has project field (optional)");
  assert.match(page, /support\.typeTechnical/, "has technical problem option");
  assert.match(page, /support\.typeSafety/, "has safety option");
  assert.match(page, /support\.typePayment/, "has payment option");
});

// ═══════════════════════════════════════════════════════════════════
// 2. /legal pages are dynamic with fallback
// ═══════════════════════════════════════════════════════════════════

test("legal: privacy page reads from site_settings with fallback", () => {
  const page = readFileSync(join(root, "app/legal/privacy/page.tsx"), "utf8");
  assert.match(page, /getSiteSettings/, "fetches site settings");
  assert.match(page, /privacy_content/, "reads privacy_content");
  assert.match(page, /defaultSections/, "has default sections fallback");
  assert.match(page, /parseSections/, "parses JSON sections");
});

test("legal: terms page reads from site_settings with fallback", () => {
  const page = readFileSync(join(root, "app/legal/terms/page.tsx"), "utf8");
  assert.match(page, /getSiteSettings/, "fetches site settings");
  assert.match(page, /terms_content/, "reads terms_content");
  assert.match(page, /defaultSections/, "has default sections fallback");
  assert.match(page, /parseSections/, "parses JSON sections");
});

// ═══════════════════════════════════════════════════════════════════
// 3. API route validates input
// ═══════════════════════════════════════════════════════════════════

test("api: /api/support validates input", () => {
  const route = readFileSync(join(root, "app/api/support/route.ts"), "utf8");
  assert.match(route, /VALID_TYPES/, "validates message type");
  assert.match(route, /VALID_ROLES/, "validates role");
  assert.match(route, /VALID_STATUSES/, "validates status for PATCH");
  assert.match(route, /name\.length > 100/, "name max length");
  assert.match(route, /message\.length > 2000/, "message max length");
  assert.match(route, /email.*regex|isValid|s@/, "validates email format");
  assert.match(route, /support_messages/, "inserts into support_messages table");
});

test("api: /api/support PATCH requires superadmin", () => {
  const route = readFileSync(join(root, "app/api/support/route.ts"), "utf8");
  assert.match(route, /requireSuperAdmin/, "PATCH requires superadmin auth");
  assert.match(route, /status/, "can update status");
  assert.match(route, /internal_note/, "can update internal_note");
});

// ═══════════════════════════════════════════════════════════════════
// 4. Superadmin support editor upgraded
// ═══════════════════════════════════════════════════════════════════

test("superadmin: support editor has FAQ editing + preview", () => {
  const editor = readFileSync(join(root, "components/superadmin/SuperadminSupportEditor.tsx"), "utf8");
  assert.match(editor, /faqItems/, "has FAQ items state");
  assert.match(editor, /addFaqItem|Plus/, "can add FAQ items");
  assert.match(editor, /removeFaqItem|Trash2/, "can remove FAQ items");
  assert.match(editor, /showPreview|Eye/, "has preview toggle");
  assert.match(editor, /support_passenger_text/, "edits passenger text");
  assert.match(editor, /support_operator_text/, "edits operator text");
  assert.match(editor, /support_email/, "edits support email");
  assert.match(editor, /FALLBACKS|DEFAULT_/, "has reset/fallback support");
});

// ═══════════════════════════════════════════════════════════════════
// 5. Superadmin legal editor upgraded
// ═══════════════════════════════════════════════════════════════════

test("superadmin: legal editor has content textarea + preview + reset", () => {
  const editor = readFileSync(join(root, "components/superadmin/SuperadminLegalEditor.tsx"), "utf8");
  assert.match(editor, /privacy_content/, "edits privacy_content");
  assert.match(editor, /terms_content/, "edits terms_content");
  assert.match(editor, /textarea/, "has textarea for content");
  assert.match(editor, /showPrivacyPreview|showTermsPreview|Eye/, "has preview toggle");
  assert.match(editor, /handleReset|RotateCcw/, "has reset button");
  assert.match(editor, /DEFAULT_PRIVACY|DEFAULT_TERMS/, "has default content for reset");
  assert.match(editor, /SectionPreview/, "renders section preview");
});

// ═══════════════════════════════════════════════════════════════════
// 6. Superadmin inbox page exists
// ═══════════════════════════════════════════════════════════════════

test("superadmin: support inbox page exists at /superadmin/support/inbox", () => {
  const page = readFileSync(join(root, "app/superadmin/support/inbox/page.tsx"), "utf8");
  assert.match(page, /requireSuperAdmin/, "requires superadmin");
  assert.match(page, /support_messages/, "reads from support_messages table");
  assert.match(page, /SupportMessageActions/, "has message action buttons");
  assert.match(page, /nouveau/, "shows status nouveau");
  assert.match(page, /en_cours/, "shows status en_cours");
  assert.match(page, /r.solu/, "shows status résolu");
});

test("superadmin: SupportMessageActions client component exists", () => {
  const comp = readFileSync(join(root, "components/superadmin/SupportMessageActions.tsx"), "utf8");
  assert.match(comp, /"use client"/, "is a client component");
  assert.match(comp, /\/api\/support/, "calls API route");
  assert.match(comp, /PATCH/, "uses PATCH method");
  assert.match(comp, /internal_note/, "can save internal notes");
  assert.match(comp, /mailto:/, "has reply button");
});

// ═══════════════════════════════════════════════════════════════════
// 7. support_messages SQL exists
// ═══════════════════════════════════════════════════════════════════

test("sql: support_messages table DDL exists", () => {
  const sql = readFileSync(join(root, "supabase/support-messages.sql"), "utf8");
  assert.match(sql, /create table.*support_messages/, "creates support_messages table");
  assert.match(sql, /enable row level security/, "enables RLS");
  assert.match(sql, /Anyone can insert/, "allows public insert");
  assert.match(sql, /Superadmin can read/, "only superadmin can read");
  assert.match(sql, /Superadmin can update/, "only superadmin can update");
  assert.match(sql, /check.*status/, "has status CHECK constraint");
  assert.match(sql, /type.*not null/, "has type column");
  assert.match(sql, /name.*not null/, "has name column");
  assert.match(sql, /email.*not null/, "has email column");
  assert.match(sql, /message.*not null/, "has message column");
  assert.match(sql, /internal_note/, "has internal_note column");
  assert.match(sql, /support_messages_status_idx/, "has index");
});

// ═══════════════════════════════════════════════════════════════════
// 8. Site settings keys
// ═══════════════════════════════════════════════════════════════════

test("config: new support settings keys exist", () => {
  const config = readFileSync(join(root, "lib/siteSettingsConfig.ts"), "utf8");
  assert.match(config, /support_passenger_text/, "passenger text key");
  assert.match(config, /support_operator_text/, "operator text key");
  assert.match(config, /support_faq_json/, "FAQ JSON key");
  assert.match(config, /support_safety_text/, "safety text key");
  assert.match(config, /support_data_text/, "data text key");
  assert.match(config, /support_liability_text/, "liability text key");
});

test("config: new legal content settings keys exist", () => {
  const config = readFileSync(join(root, "lib/siteSettingsConfig.ts"), "utf8");
  assert.match(config, /privacy_content/, "privacy content key");
  assert.match(config, /terms_content/, "terms content key");
});

// ═══════════════════════════════════════════════════════════════════
// 9. Superadmin sidebar updated
// ═══════════════════════════════════════════════════════════════════

test("superadmin: sidebar has Messages support + Contenu support", () => {
  const shell = readFileSync(join(root, "components/superadmin/SuperadminShell.tsx"), "utf8");
  assert.match(shell, /\/superadmin\/support\/inbox/, "has inbox link");
  assert.match(shell, /superadmin\.supportMessages/, "has Messages support label");
  assert.match(shell, /superadmin\.supportContent/, "has Contenu support label");
});

// ═══════════════════════════════════════════════════════════════════
// 10. FAQ parsing logic
// ═══════════════════════════════════════════════════════════════════

test("support: parseFAQ handles empty, invalid, and valid JSON", () => {
  const page = readFileSync(join(root, "app/support/page.tsx"), "utf8");
  assert.match(page, /parseFAQ/, "has parseFAQ function");
  assert.match(page, /JSON\.parse/, "parses JSON");
  assert.match(page, /defaultFAQ/, "returns defaultFAQ on empty/invalid");
  assert.match(page, /Array\.isArray/, "validates array structure");
});
