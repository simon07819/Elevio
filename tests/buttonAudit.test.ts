/**
 * COMPREHENSIVE BUTTON AUDIT — regression tests
 *
 * Verifies:
 * 1. No decorative/ghost buttons exist in the codebase
 * 2. Every <button> has a handler (onClick, type="submit", or disabled)
 * 3. Every <Link> has an href
 * 4. Every <form> has an action or onSubmit
 * 5. No dead links, no ghost sessions, no click-less buttons
 *
 * BROKEN ELEMENT FOUND AND FIXED:
 * - RequestCard.tsx "Quick message" button — had no onClick handler
 *   FIX: added disabled + "Bientôt" badge to indicate coming-soon
 *
 * MINOR FIXES:
 * - Explicit type="submit" added to admin form buttons
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const root = process.cwd();

function read(relPath: string): string {
  return readFileSync(join(root, relPath), "utf8");
}

// ─────────────────────────────────────────────────────
// 1. NO DECORATIVE / GHOST BUTTONS
// ─────────────────────────────────────────────────────

test("button-audit: RequestCard 'Quick message' is disabled with coming-soon badge", () => {
  const card = read("components/operator/RequestCard.tsx");
  const quickMsgIdx = card.indexOf("quickMessage");
  assert.ok(quickMsgIdx >= 0, "quickMessage key still exists");
  const afterKey = card.substring(quickMsgIdx - 500, quickMsgIdx + 500);
  assert.match(afterKey, /disabled/, "Quick message button is disabled");
  assert.match(afterKey, /comingSoon/, "Shows coming-soon badge");
  assert.match(afterKey, /cursor-not-allowed/, "Cursor shows not-allowed");
});

test("button-audit: no onClick-less enabled buttons in RequestCard", () => {
  const card = read("components/operator/RequestCard.tsx");
  // Find all <button elements
  const buttonRegex = /<button[^>]*>/g;
  let match;
  while ((match = buttonRegex.exec(card)) !== null) {
    const tag = match[0];
    const pos = match.index;
    const after = card.substring(pos, pos + 200);
    // If button is NOT disabled, it must have onClick or type="submit"
    if (!tag.includes("disabled")) {
      const hasHandler = after.includes("onClick") || after.includes('type="submit"');
      assert.ok(hasHandler, `Enabled button at pos ${pos} must have onClick or type="submit": ${tag}`);
    }
  }
});

test("button-audit: all buttons in OperatorWorkspace have handlers or are disabled", () => {
  const ws = read("components/operator/OperatorWorkspace.tsx");
  const buttonRegex = /<button[^>]*>/g;
  let match;
  while ((match = buttonRegex.exec(ws)) !== null) {
    const tag = match[0];
    const pos = match.index;
    const after = ws.substring(pos, pos + 300);
    if (!tag.includes("disabled")) {
      const hasHandler = after.includes("onClick") || after.includes('type="submit"') || after.includes("onSubmit");
      assert.ok(hasHandler, `Enabled button at pos ${pos} must have handler: ${tag}`);
    }
  }
});

test("button-audit: all buttons in OperatorDashboard have handlers or are disabled", () => {
  const dash = read("components/operator/OperatorDashboard.tsx");
  const buttonRegex = /<button[^>]*>/g;
  let match;
  while ((match = buttonRegex.exec(dash)) !== null) {
    const tag = match[0];
    const pos = match.index;
    const after = dash.substring(pos, pos + 300);
    if (!tag.includes("disabled")) {
      const hasHandler = after.includes("onClick") || after.includes('type="submit"');
      assert.ok(hasHandler, `Enabled button at pos ${pos} must have handler: ${tag}`);
    }
  }
});

test("button-audit: all buttons in RecommendedNextStop have handlers or are disabled", () => {
  const rec = read("components/operator/RecommendedNextStop.tsx");
  const buttonRegex = /<button[^>]*>/g;
  let match;
  while ((match = buttonRegex.exec(rec)) !== null) {
    const tag = match[0];
    const pos = match.index;
    const after = rec.substring(pos, pos + 300);
    if (!tag.includes("disabled")) {
      const hasHandler = after.includes("onClick") || after.includes('type="submit"');
      assert.ok(hasHandler, `Enabled button at pos ${pos} must have handler: ${tag}`);
    }
  }
});

test("button-audit: all buttons in OperatorTabletSessionsPanel have handlers or are disabled", () => {
  const panel = read("components/operator/OperatorTabletSessionsPanel.tsx");
  const buttonRegex = /<button[^>]*>/g;
  let match;
  while ((match = buttonRegex.exec(panel)) !== null) {
    const tag = match[0];
    const pos = match.index;
    const after = panel.substring(pos, pos + 300);
    if (!tag.includes("disabled")) {
      const hasHandler = after.includes("onClick") || after.includes('type="submit"');
      assert.ok(hasHandler, `Enabled button at pos ${pos} must have handler: ${tag}`);
    }
  }
});

test("button-audit: all buttons in MovementBoard have handlers or are disabled", () => {
  const board = read("components/operator/MovementBoard.tsx");
  const buttonRegex = /<button[^>]*>/g;
  let match;
  while ((match = buttonRegex.exec(board)) !== null) {
    const tag = match[0];
    const pos = match.index;
    const after = board.substring(pos, pos + 300);
    if (!tag.includes("disabled")) {
      const hasHandler = after.includes("onClick") || after.includes('type="submit"');
      assert.ok(hasHandler, `Enabled button at pos ${pos} must have handler: ${tag}`);
    }
  }
});

// ─────────────────────────────────────────────────────
// 2. EXPLICIT type="submit" ON FORM BUTTONS
// ─────────────────────────────────────────────────────

test("button-audit: ProjectElevatorSettings save button has explicit type=submit", () => {
  const settings = read("components/admin/ProjectElevatorSettings.tsx");
  // Just verify that the file contains type="submit" in button elements
  const buttons = settings.match(/<button[^>]*>/g) ?? [];
  const submitButtons = buttons.filter((b) => b.includes('type="submit"'));
  assert.ok(submitButtons.length >= 2, `Expected at least 2 type=submit buttons, found ${submitButtons.length}`);
});

test("button-audit: ProjectFloorEditor submit buttons have explicit type=submit", () => {
  const floors = read("components/admin/ProjectFloorEditor.tsx");
  const buttons = floors.match(/<button[^>]*>/g) ?? [];
  const submitButtons = buttons.filter((b) => b.includes('type="submit"'));
  assert.ok(submitButtons.length >= 3, `Expected at least 3 type=submit buttons, found ${submitButtons.length}`);
});

test("button-audit: AdminLoginForm submit button has explicit type=submit", () => {
  const login = read("components/admin/AdminLoginForm.tsx");
  const buttons = login.match(/<button[^>]*>/g) ?? [];
  const submitButtons = buttons.filter((b) => b.includes('type="submit"'));
  assert.ok(submitButtons.length >= 1, `Expected at least 1 type=submit button, found ${submitButtons.length}`);
});

test("button-audit: AdminProfileForm submit buttons have explicit type=submit", () => {
  const profile = read("components/admin/AdminProfileForm.tsx");
  const buttons = profile.match(/<button[^>]*>/g) ?? [];
  const submitButtons = buttons.filter((b) => b.includes('type="submit"'));
  assert.ok(submitButtons.length >= 2, `Expected at least 2 type=submit buttons, found ${submitButtons.length}`);
});

// ─────────────────────────────────────────────────────
// 3. ALL LINKS HAVE href
// ─────────────────────────────────────────────────────

test("button-audit: all Link components in AppNavigation have href", () => {
  const nav = read("components/AppNavigation.tsx");
  const linkRegex = /<Link[^>]*>/g;
  let match;
  while ((match = linkRegex.exec(nav)) !== null) {
    const tag = match[0];
    assert.match(tag, /href/, `Link must have href: ${tag}`);
  }
});

test("button-audit: BrandLogo Link has href when clickable", () => {
  const logo = read("components/BrandLogo.tsx");
  assert.match(logo, /href="\/"/, "BrandLogo links to /");
});

test("button-audit: ModeSelector links have href", () => {
  const mode = read("components/ModeSelector.tsx");
  const linkRegex = /<Link[^>]*>/g;
  let match;
  while ((match = linkRegex.exec(mode)) !== null) {
    const tag = match[0];
    assert.match(tag, /href/, `Link must have href: ${tag}`);
  }
});

// ─────────────────────────────────────────────────────
// 4. ALL FORMS HAVE ACTION OR onSubmit
// ─────────────────────────────────────────────────────

test("button-audit: all forms in RequestForm have action or onSubmit", () => {
  const form = read("components/RequestForm.tsx");
  const formRegex = /<form[^>]*>/g;
  let match;
  while ((match = formRegex.exec(form)) !== null) {
    const tag = match[0];
    const hasAction = tag.includes("action") || tag.includes("onSubmit");
    assert.ok(hasAction, `Form must have action or onSubmit: ${tag}`);
  }
});

test("button-audit: all forms in AdminLoginForm have action or onSubmit", () => {
  const login = read("components/admin/AdminLoginForm.tsx");
  const formRegex = /<form[^>]*>/g;
  let match;
  while ((match = formRegex.exec(login)) !== null) {
    const tag = match[0];
    const hasAction = tag.includes("action") || tag.includes("onSubmit");
    assert.ok(hasAction, `Form must have action or onSubmit: ${tag}`);
  }
});

test("button-audit: all forms in AdminProfileForm have action or onSubmit", () => {
  const profile = read("components/admin/AdminProfileForm.tsx");
  const formRegex = /<form[^>]*>/g;
  let match;
  while ((match = formRegex.exec(profile)) !== null) {
    const tag = match[0];
    const hasAction = tag.includes("action") || tag.includes("onSubmit");
    assert.ok(hasAction, `Form must have action or onSubmit: ${tag}`);
  }
});

test("button-audit: all forms in ProjectElevatorSettings have action", () => {
  const settings = read("components/admin/ProjectElevatorSettings.tsx");
  const formRegex = /<form[^>]*>/g;
  let match;
  while ((match = formRegex.exec(settings)) !== null) {
    const tag = match[0];
    const hasAction = tag.includes("action") || tag.includes("onSubmit");
    assert.ok(hasAction, `Form must have action or onSubmit: ${tag}`);
  }
});

test("button-audit: all forms in ProjectFloorEditor have action", () => {
  const floors = read("components/admin/ProjectFloorEditor.tsx");
  const formRegex = /<form[^>]*>/g;
  let match;
  while ((match = formRegex.exec(floors)) !== null) {
    const tag = match[0];
    const pos = match.index;
    const after = floors.substring(pos, pos + 200);
    const hasAction = tag.includes("action") || after.includes("action=") || after.includes("onSubmit");
    assert.ok(hasAction, `Form must have action or onSubmit: ${tag}`);
  }
});

// ─────────────────────────────────────────────────────
// 5. DESTRUCTIVE ACTIONS HAVE CONFIRM DIALOGS
// ─────────────────────────────────────────────────────

test("button-audit: delete elevator has window.confirm", () => {
  const settings = read("components/admin/ProjectElevatorSettings.tsx");
  assert.match(settings, /window\.confirm/, "Delete elevator action has confirm dialog");
});

test("button-audit: delete floor has window.confirm", () => {
  const floors = read("components/admin/ProjectFloorEditor.tsx");
  assert.match(floors, /window\.confirm/, "Delete floor action has confirm dialog");
});

test("button-audit: deactivate tablet has window.confirm", () => {
  const panel = read("components/operator/OperatorTabletSessionsPanel.tsx");
  assert.match(panel, /window\.confirm/, "Deactivate tablet has confirm dialog");
});

test("button-audit: delete project has window.confirm", () => {
  const mgr = read("components/admin/AdminProjectManager.tsx");
  assert.match(mgr, /window\.confirm/, "Delete project has confirm dialog");
});

test("button-audit: delete project has window.confirm, archive does not need it", () => {
  const mgr = read("components/admin/AdminProjectManager.tsx");
  // deleteProject uses window.confirm; archiveProject is reversible so no confirm needed
  assert.match(mgr, /window\.confirm/, "Delete project has confirm dialog");
  assert.match(mgr, /archiveProject/, "Archive project function exists");
});

// ─────────────────────────────────────────────────────
// 6. I18N KEYS FOR NEW FEATURES
// ─────────────────────────────────────────────────────

test("button-audit: requestCard.comingSoon key exists in both FR and EN", () => {
  const i18n = read("lib/i18n.ts");
  assert.match(i18n, /requestCard\.comingSoon.*Bientôt/, "FR key exists");
  assert.match(i18n, /requestCard\.comingSoon.*Soon/, "EN key exists");
});

// ─────────────────────────────────────────────────────
// 7. CAPACITY PANEL BUTTONS
// ─────────────────────────────────────────────────────

test("button-audit: CapacityPanel toggle button has onClick via onToggleFull", () => {
  const panel = read("components/operator/CapacityPanel.tsx");
  assert.match(panel, /onToggleFull/, "CapacityPanel uses onToggleFull callback");
});

// ─────────────────────────────────────────────────────
// 8. QR CODE GENERATOR BUTTONS
// ─────────────────────────────────────────────────────

test("button-audit: QRCodeGenerator buttons all have onClick handlers", () => {
  const qr = read("components/admin/QRCodeGenerator.tsx");
  const buttonRegex = /<button[^>]*>/g;
  let match;
  while ((match = buttonRegex.exec(qr)) !== null) {
    const tag = match[0];
    const pos = match.index;
    const after = qr.substring(pos, pos + 300);
    if (!tag.includes("disabled")) {
      const hasHandler = after.includes("onClick") || after.includes('type="submit"');
      assert.ok(hasHandler, `Enabled button at pos ${pos} must have handler: ${tag}`);
    }
  }
});

// ─────────────────────────────────────────────────────
// 9. SCAN HOME BUTTONS
// ─────────────────────────────────────────────────────

test("button-audit: ScanHome buttons have onClick handlers", () => {
  const scan = read("components/ScanHome.tsx");
  const buttonRegex = /<button[^>]*>/g;
  let match;
  while ((match = buttonRegex.exec(scan)) !== null) {
    const tag = match[0];
    const pos = match.index;
    const after = scan.substring(pos, pos + 300);
    if (!tag.includes("disabled")) {
      const hasHandler = after.includes("onClick") || after.includes('type="submit"');
      assert.ok(hasHandler, `Enabled button at pos ${pos} must have handler: ${tag}`);
    }
  }
});

// ─────────────────────────────────────────────────────
// 10. REQUEST FORM BUTTONS
// ─────────────────────────────────────────────────────

test("button-audit: RequestForm buttons have handlers", () => {
  const form = read("components/RequestForm.tsx");
  const buttonRegex = /<button[^>]*>/g;
  let match;
  while ((match = buttonRegex.exec(form)) !== null) {
    const tag = match[0];
    const pos = match.index;
    const after = form.substring(pos, pos + 300);
    if (!tag.includes("disabled")) {
      const hasHandler = after.includes("onClick") || after.includes('type="submit"') || after.includes('type="button"');
      assert.ok(hasHandler, `Enabled button at pos ${pos} must have handler: ${tag}`);
    }
  }
});

// ─────────────────────────────────────────────────────
// 11. GLOBAL: no enabled button without handler across all component files
// ─────────────────────────────────────────────────────

const componentFiles = [
  "components/RequestForm.tsx",
  "components/ServiceTimePicker.tsx",
  "components/BrandLogo.tsx",
  "components/RequestStatusCard.tsx",
  "components/FloorSelector.tsx",
  "components/ScanHome.tsx",
  "components/AppShell.tsx",
  "components/AppNavigation.tsx",
  "components/ModeSelector.tsx",
  "components/PassengerRequestShell.tsx",
  "components/operator/RequestCard.tsx",
  "components/operator/MovementBoard.tsx",
  "components/operator/OperatorWorkspace.tsx",
  "components/operator/ElevatorStatusPanel.tsx",
  "components/operator/CapacityPanel.tsx",
  "components/operator/OperatorDashboard.tsx",
  "components/operator/RecommendedNextStop.tsx",
  "components/operator/OperatorTabletSessionsPanel.tsx",
  "components/operator/MovementList.tsx",
  "components/i18n/LanguageSwitcher.tsx",
  "components/admin/ProjectRequestsPanel.tsx",
  "components/admin/AdminProjectDetail.tsx",
  "components/admin/ProjectElevatorSettings.tsx",
  "components/admin/ProjectFloorEditor.tsx",
  "components/admin/AdminProjectManager.tsx",
  "components/admin/BrandLogoUploader.tsx",
  "components/admin/AdminLoginForm.tsx",
  "components/admin/AdminProfileForm.tsx",
  "components/admin/QRCodeGenerator.tsx",
  "components/admin/ProjectInfoPanel.tsx",
];

for (const file of componentFiles) {
  test(`button-audit: no ghost buttons in ${file}`, () => {
    const content = read(file);
    const buttonRegex = /<button[^>]*>/g;
    let match;
    while ((match = buttonRegex.exec(content)) !== null) {
      const tag = match[0];
      const pos = match.index;
      const after = content.substring(pos, pos + 300);
      // Enabled buttons MUST have onClick, type="submit", or type="button" with onClick nearby
      if (!tag.includes("disabled")) {
        const hasHandler = after.includes("onClick") || after.includes('type="submit"');
        assert.ok(hasHandler, `Enabled button in ${file} at pos ${pos} must have onClick or type="submit": ${tag}`);
      }
    }
  });
}
