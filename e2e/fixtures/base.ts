import { test as base, expect, type Page, type Route } from "@playwright/test";
import {
  mockProject,
  mockFloors,
  mockElevators,
  mockElevatorAlpha,
  mockElevatorBeta,
  mockAdminProfile,
  mockOperator1Profile,
  mockOperator2Profile,
  mockRequest1,
  mockRequest2,
  MOCK_PROJECT_ID,
  MOCK_FLOOR_RDC_ID,
  MOCK_ELEVATOR_ALPHA_ID,
  MOCK_ELEVATOR_BETA_ID,
  MOCK_SESSION1_ID,
  MOCK_SESSION2_ID,
  MOCK_REQUEST1_ID,
  MOCK_REQUEST2_ID,
} from "./mockData";

/**
 * Supabase mock route handler.
 * Intercepts all fetch/XHR to the Supabase endpoint and returns mock data.
 * This lets E2E tests run without a live database.
 */
function installSupabaseMock(page: Page, role: "admin" | "operator1" | "operator2" | "anonymous") {
  const profile = role === "admin"
    ? mockAdminProfile
    : role === "operator1"
      ? mockOperator1Profile
      : role === "operator2"
        ? mockOperator2Profile
        : null;

  const isLoggedIn = role !== "anonymous";

  // Elevator state that can be mutated during the test
  let elevatorState = structuredClone([mockElevatorAlpha, mockElevatorBeta]);
  let requestState = [structuredClone(mockRequest1), structuredClone(mockRequest2)];

  // Expose helpers to test code via page.evaluate
  // (Cannot extend BrowserContext type, so we use page.evaluate for state mutations)
  async function setElevatorState(id: string, patch: Record<string, unknown>) {
    const idx = elevatorState.findIndex((e: { id: string }) => e.id === id);
    if (idx >= 0) Object.assign(elevatorState[idx], patch);
  }
  async function setRequestState(id: string, patch: Record<string, unknown>) {
    const idx = requestState.findIndex((r: { id: string }) => r.id === id);
    if (idx >= 0) Object.assign(requestState[idx], patch);
  }

  // Store helpers on the page object for test access
  (page as any).__e2eSetElevator = setElevatorState;
  (page as any).__e2eSetRequest = setRequestState;
  (page as any).__e2eGetElevators = () => structuredClone(elevatorState);
  (page as any).__e2eGetRequests = () => structuredClone(requestState);

  async function handleSupabaseRoute(route: Route) {
    const url = new URL(route.request().url());
    const path = url.pathname;

    // Auth endpoints
    if (path.endsWith("/auth/user") || path.endsWith("/auth/getUser")) {
      if (!isLoggedIn) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ data: { user: null }, error: { message: "Not authenticated" } }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            user: {
              id: profile!.id,
              email: profile!.email,
              app_metadata: { role: profile!.role },
              user_metadata: { first_name: profile!.first_name, last_name: profile!.last_name },
            },
          },
        }),
      });
      return;
    }

    // Sign in
    if (path.endsWith("/auth/token") && route.request().method() === "POST") {
      if (!isLoggedIn) {
        await route.fulfill({
          status: 400,
          contentType: "application/json",
          body: JSON.stringify({ error: { message: "Invalid credentials" } }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          access_token: "mock-token-" + role,
          token_type: "bearer",
          user: { id: profile!.id, email: profile!.email },
        }),
      });
      return;
    }

    // Sign up
    if (path.endsWith("/auth/signup") && route.request().method() === "POST") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: { user: { id: "new-user-id", email: "new@test.com" } },
          session: { access_token: "mock-token-new" },
        }),
      });
      return;
    }

    // Sign out
    if (path.endsWith("/auth/logout") && route.request().method() === "POST") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({}),
      });
      return;
    }

    // REST: projects
    if (path.includes("/rest/v1/projects")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([mockProject]),
      });
      return;
    }

    // REST: floors
    if (path.includes("/rest/v1/floors")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockFloors),
      });
      return;
    }

    // REST: elevators
    if (path.includes("/rest/v1/elevators")) {
      const method = route.request().method();
      if (method === "GET") {
        const selectParam = url.searchParams.get("select");
        const projectIdFilter = url.searchParams.get("project_id");
        const idFilter = url.searchParams.get("id");

        let result = elevatorState;
        if (idFilter) {
          const ids = idFilter.replace(/[()]/g, "").split(",");
          result = result.filter((e: { id: string }) => ids.includes(e.id));
        }
        if (projectIdFilter && projectIdFilter === `eq.${MOCK_PROJECT_ID}`) {
          // already filtered
        }
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(result),
        });
        return;
      }
      if (method === "PATCH") {
        const body = route.request().postDataJSON();
        const idMatch = url.searchParams.get("id")?.replace("eq.", "");
        if (idMatch) {
          const idx = elevatorState.findIndex((e: { id: string }) => e.id === idMatch);
          if (idx >= 0) Object.assign(elevatorState[idx], body);
        }
        const updatedElev = elevatorState.find((e: { id: string }) => e.id === idMatch) ?? elevatorState[0];
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify([updatedElev]),
        });
        return;
      }
      if (method === "POST") {
        const body = route.request().postDataJSON();
        const newElev = { ...mockElevatorAlpha, ...body, id: body.id ?? "elev-new-" + Date.now() };
        elevatorState.push(newElev);
        await route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify([newElev]),
        });
        return;
      }
    }

    // REST: requests
    if (path.includes("/rest/v1/requests")) {
      const method = route.request().method();
      if (method === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(requestState),
        });
        return;
      }
      if (method === "POST") {
        const body = route.request().postDataJSON();
        const newReq = { ...mockRequest1, ...body, id: body.id ?? "req-new-" + Date.now() };
        requestState.push(newReq);
        await route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify([newReq]),
        });
        return;
      }
      if (method === "PATCH") {
        const body = route.request().postDataJSON();
        const idMatch = url.searchParams.get("id")?.replace("eq.", "");
        if (idMatch) {
          const idx = requestState.findIndex((r: { id: string }) => r.id === idMatch);
          if (idx >= 0) Object.assign(requestState[idx], body);
        }
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify([requestState[0]]),
        });
        return;
      }
    }

    // REST: profiles
    if (path.includes("/rest/v1/profiles")) {
      if (isLoggedIn) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify([profile]),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify([]),
        });
      }
      return;
    }

    // REST: active_passengers
    if (path.includes("/rest/v1/active_passengers")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      });
      return;
    }

    // Floor code API
    if (path.includes("/api/floor-code")) {
      const code = url.searchParams.get("code") ?? "";
      const floor = mockFloors.find((f) => f.qr_token === code);
      if (floor) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            ok: true,
            path: `/request?projectId=${MOCK_PROJECT_ID}&floorToken=${code}`,
          }),
        });
      } else {
        await route.fulfill({
          status: 404,
          contentType: "application/json",
          body: JSON.stringify({ ok: false, message: "Code not found" }),
        });
      }
      return;
    }

    // Force release API
    if (path.includes("/api/operator/force-release")) {
      const body = route.request().postDataJSON();
      const elevId = body?.elevatorId;
      const idx = elevatorState.findIndex((e: { id: string }) => e.id === elevId);
      if (idx >= 0) {
        elevatorState[idx].operator_session_id = null;
        elevatorState[idx].operator_session_heartbeat_at = null;
        elevatorState[idx].operator_user_id = null;
        elevatorState[idx].operator_tablet_label = null;
        elevatorState[idx].operator_display_name = null;
        elevatorState[idx].current_load = 0;
        elevatorState[idx].direction = "idle";
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, message: "Session force-liberee." }),
      });
      return;
    }

    // Supabase realtime WebSocket — just fulfill with a success empty response
    if (route.request().url().includes("/realtime/v1")) {
      await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
      return;
    }

    // Fallback: let non-Supabase requests pass through
    if (!url.hostname.includes("supabase")) {
      await route.fallback();
      return;
    }

    // Default: empty array for unknown REST paths
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([]),
    });
  }

  // Intercept all Supabase API calls
  page.route(/supabase|localhost:54321/, handleSupabaseRoute);

  // Also intercept the /api/ routes that Next.js handles server-side
  page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    // Floor code and force-release handled above in Supabase mock
    await route.fallback();
  });
}

export type E2EFixtures = {
  adminPage: Page;
  passengerPage: Page;
  operator1Page: Page;
  operator2Page: Page;
};

export const test = base.extend<E2EFixtures>({
  adminPage: async ({ browser }, use) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    installSupabaseMock(page, "admin");
    await use(page);
    await context.close();
  },
  passengerPage: async ({ browser }, use) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    installSupabaseMock(page, "anonymous");
    await use(page);
    await context.close();
  },
  operator1Page: async ({ browser }, use) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    installSupabaseMock(page, "operator1");
    await use(page);
    await context.close();
  },
  operator2Page: async ({ browser }, use) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    installSupabaseMock(page, "operator2");
    await use(page);
    await context.close();
  },
});

export { expect };
