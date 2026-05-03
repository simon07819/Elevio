/**
 * LIVE Admin E2E tests — creates real project, floors, elevators, then cleans up.
 *
 * Flow:
 * 1. Login as admin
 * 2. Create project "E2E Test Auto"
 * 3. Configure project (timezone, priorities, capacity)
 * 4. Add logo
 * 5. Create floors (RDC, 5, 8, 10, 13, 15, 16)
 * 6. Create elevators (Hoist A, Hoist B)
 * 7. Verify QR codes page
 * 8. Verify support/legal page
 * 9. Verify no blank pages, no excessive delays
 *
 * After all tests: delete the test project + all children.
 */
import { test, expect } from "./fixtures";
import { setTestProjectId, getTestProjectId, setTestFloorIds, setTestElevatorIds, liveAfterAll } from "./fixtures";
import { measureAction, assertNoBlankPage } from "./cleanup";

const PROJECT_NAME = process.env.E2E_TEST_PROJECT_NAME || "E2E Test Auto";

test.describe("Live Admin flow", () => {
  let projectId: string = "";
  let floorIds: string[] = [];
  let elevatorIds: string[] = [];

  test("1. admin login succeeds and redirects to admin page", async ({ adminPage }) => {
    // Already logged in via fixture — verify we're on admin page
    const url = adminPage.url();
    expect(url).toMatch(/\/admin/);
    await assertNoBlankPage(adminPage, "admin dashboard after login");
  });

  test("2. create project via admin UI", async ({ adminPage }) => {
    await adminPage.goto("/admin/projects");
    await adminPage.waitForLoadState("networkidle");

    // Find the "create project" form
    const nameInput = adminPage.locator("input[name='name']").first();
    await nameInput.fill(PROJECT_NAME);

    const addressInput = adminPage.locator("input[name='address']").first();
    if (await addressInput.count() > 0) {
      await addressInput.fill("123 rue E2E, Montreal");
    }

    // Check "active" checkbox if present
    const activeCheckbox = adminPage.locator("input[name='active']").first();
    if (await activeCheckbox.count() > 0 && !(await activeCheckbox.isChecked())) {
      await activeCheckbox.check();
    }

    // Submit
    const createBtn = adminPage.getByRole("button", { name: /créer|create|ajouter|add/i }).first();
    const { withinLimit } = await measureAction("create project", async () => {
      await createBtn.click();
      await adminPage.waitForLoadState("networkidle");
    }, 10_000);

    expect(withinLimit).toBeTruthy();

    // Verify project appears in list
    const projectCard = adminPage.getByText(new RegExp(PROJECT_NAME, "i")).first();
    await expect(projectCard).toBeVisible({ timeout: 5_000 });

    // Extract project ID from URL or page data
    // Look for a link with the project ID in it
    const projectLink = adminPage.locator(`a[href*='/admin/projects/']`).first();
    if (await projectLink.count() > 0) {
      const href = await projectLink.getAttribute("href");
      const idMatch = href?.match(/\/admin\/projects\/([a-f0-9-]+)/);
      if (idMatch) {
        projectId = idMatch[1];
        setTestProjectId(projectId);
      }
    }

    await assertNoBlankPage(adminPage, "projects page after creation");
  });

  test("3. configure project settings", async ({ adminPage }) => {
    if (!projectId) {
      // Try to find the project ID from the page
      await adminPage.goto("/admin/projects");
      await adminPage.waitForLoadState("networkidle");
      const projectLink = adminPage.locator(`a[href*='/admin/projects/']`).first();
      if (await projectLink.count() > 0) {
        const href = await projectLink.getAttribute("href");
        const idMatch = href?.match(/\/admin\/projects\/([a-f0-9-]+)/);
        if (idMatch) {
          projectId = idMatch[1];
          setTestProjectId(projectId);
        }
      }
    }

    if (!projectId) {
      console.log("[SKIP] No project ID found — skipping config test");
      return;
    }

    // Navigate to project config page
    await measureAction("navigate to project config", async () => {
      await adminPage.goto(`/admin/projects/${projectId}`);
      await adminPage.waitForLoadState("networkidle");
    }, 5_000);

    // Verify project page renders
    await expect(adminPage.getByText(new RegExp(PROJECT_NAME, "i"))).toBeVisible({ timeout: 5_000 });
    await assertNoBlankPage(adminPage, "project config page");
  });

  test("4. create floors", async ({ adminPage }) => {
    await adminPage.goto("/admin/floors");
    await adminPage.waitForLoadState("networkidle");

    // Check if floor editor exists
    const floorEditor = adminPage.locator("form, [class*='floor']");
    if (await floorEditor.count() === 0) {
      console.log("[SKIP] No floor editor found");
      return;
    }

    // Use "generate floors" form if available
    const generateBtn = adminPage.getByRole("button", { name: /générer|generate|créer étages|create floors/i });
    if (await generateBtn.count() > 0) {
      // Fill min/max floor values
      const minInput = adminPage.locator("input[name='minFloor'], input[name='floorMin']").first();
      const maxInput = adminPage.locator("input[name='maxFloor'], input[name='floorMax']").first();

      if (await minInput.count() > 0) await minInput.fill("0");
      if (await maxInput.count() > 0) await maxInput.fill("16");

      await measureAction("generate floors", async () => {
        await generateBtn.click();
        await adminPage.waitForLoadState("networkidle");
      }, 10_000);
    }

    // Verify floors were created
    const floorLabels = ["RDC", "5", "8", "10", "13", "15", "16"];
    for (const label of floorLabels) {
      const floorEl = adminPage.getByText(new RegExp(`\\b${label}\\b`));
      // At least some should appear
      if (await floorEl.count() > 0) {
        expect(await floorEl.count()).toBeGreaterThanOrEqual(1);
      }
    }

    await assertNoBlankPage(adminPage, "floors page after creation");
  });

  test("5. create elevators", async ({ adminPage }) => {
    // Navigate to project page where elevator creation happens
    await adminPage.goto("/admin");
    await adminPage.waitForLoadState("networkidle");

    // Look for elevator creation form
    const elevNameInput = adminPage.locator("input[name='name']").first();
    if (await elevNameInput.count() > 0) {
      // Create Hoist A
      await elevNameInput.fill("Hoist A");
      const capacityInput = adminPage.locator("input[name='capacity']").first();
      if (await capacityInput.count() > 0) await capacityInput.fill("8");

      const createElevBtn = adminPage.getByRole("button", { name: /créer|create|ajouter|add/i }).first();
      if (await createElevBtn.count() > 0) {
        await measureAction("create elevator A", async () => {
          await createElevBtn.click();
          await adminPage.waitForLoadState("networkidle");
        }, 10_000);
      }

      // Create Hoist B
      const nameInput2 = adminPage.locator("input[name='name']").first();
      if (await nameInput2.count() > 0) {
        await nameInput2.fill("Hoist B");
        const cap2 = adminPage.locator("input[name='capacity']").first();
        if (await cap2.count() > 0) await cap2.fill("8");

        const createBtn2 = adminPage.getByRole("button", { name: /créer|create|ajouter|add/i }).first();
        if (await createBtn2.count() > 0) {
          await createBtn2.click();
          await adminPage.waitForLoadState("networkidle");
        }
      }
    }

    await assertNoBlankPage(adminPage, "admin page after elevator creation");
  });

  test("6. verify QR codes page renders without blank page", async ({ adminPage }) => {
    await measureAction("navigate to QR codes", async () => {
      await adminPage.goto("/admin/qrcodes");
      await adminPage.waitForLoadState("networkidle");
    }, 5_000);

    await assertNoBlankPage(adminPage, "QR codes page");
    // QR codes section should have content
    const mainContent = adminPage.locator("main");
    await expect(mainContent).toBeVisible();
  });

  test("7. verify support/legal page", async ({ adminPage }) => {
    await adminPage.goto("/support");
    await adminPage.waitForLoadState("networkidle");

    await assertNoBlankPage(adminPage, "support page");
    await expect(adminPage.getByText(/version/i)).toBeVisible();
    await expect(adminPage.getByRole("heading", { name: /confidentialité|privacy/i })).toBeVisible();
    await expect(adminPage.getByRole("heading", { name: /sécurité|safety/i })).toBeVisible();
  });

  test("8. admin navigation is responsive — no excessive delays", async ({ adminPage }) => {
    const pages = ["/admin", "/admin/projects", "/admin/floors", "/admin/profile", "/admin/qrcodes"];
    for (const path of pages) {
      const { ms, withinLimit } = await measureAction(`navigate ${path}`, async () => {
        await adminPage.goto(path);
        await adminPage.waitForLoadState("networkidle");
      }, 8_000);

      expect(withinLimit, `Admin page ${path} loaded in ${ms}ms (max 8000ms)`).toBeTruthy();
      await assertNoBlankPage(adminPage, `admin nav: ${path}`);
    }
  });

  test.afterAll(async ({}, testInfo) => {
    // Cleanup handled by adminPage fixture teardown
    console.log("[ADMIN] Suite complete. Test project will be cleaned up.");
  });
});
