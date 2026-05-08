/**
 * Analytics system tests — verifies metrics are read-only, non-blocking, correct.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const root = process.cwd();
const ANALYTICS_SQL = readFileSync(join(root, "supabase/analytics-rpcs.sql"), "utf8");
const ANALYTICS_LIB = readFileSync(join(root, "lib/analytics.ts"), "utf8");
const STATS_DASHBOARD = readFileSync(join(root, "components/admin/StatsDashboard.tsx"), "utf8");
const ADMIN_STATS_PAGE = readFileSync(join(root, "app/admin/stats/page.tsx"), "utf8");
const SUPERADMIN_DASHBOARD = readFileSync(join(root, "app/superadmin/page.tsx"), "utf8");
const ACTIONS = readFileSync(join(root, "lib/actions.ts"), "utf8");
const DISPATCH_BRAIN = readFileSync(join(root, "services/elevatorBrain.ts"), "utf8");
const REQUEST_CARD = readFileSync(join(root, "components/operator/RequestCard.tsx"), "utf8");

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 1: Data audit — required fields exist
// ═══════════════════════════════════════════════════════════════════════════

test("analytics: requests table has required timestamps", () => {
  const SCHEMA = readFileSync(join(root, "supabase/schema.sql"), "utf8");
  assert.match(SCHEMA, /wait_started_at/, "has wait_started_at");
  assert.match(SCHEMA, /completed_at/, "has completed_at");
  assert.match(SCHEMA, /created_at/, "has created_at");
  assert.match(SCHEMA, /skipped_at/, "has skipped_at");
});

test("analytics: request_events has boarded event for pickup time", () => {
  const SCHEMA = readFileSync(join(root, "supabase/schema.sql"), "utf8");
  assert.match(SCHEMA, /'boarded'/, "boarded event type exists");
  assert.match(SCHEMA, /request_events/, "request_events table exists");
  assert.match(SCHEMA, /event_type/, "has event_type column");
});

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 2: Metrics defined in RPC
// ═══════════════════════════════════════════════════════════════════════════

test("analytics: get_project_analytics RPC computes all metrics", () => {
  assert.match(ANALYTICS_SQL, /get_project_analytics/, "RPC exists");
  assert.match(ANALYTICS_SQL, /avg_wait_seconds/, "computes waiting time");
  assert.match(ANALYTICS_SQL, /avg_travel_seconds/, "computes travel time");
  assert.match(ANALYTICS_SQL, /avg_total_seconds/, "computes total time");
  assert.match(ANALYTICS_SQL, /busiest_hours/, "computes busiest hours");
  assert.match(ANALYTICS_SQL, /top_floors/, "computes most used floors");
  assert.match(ANALYTICS_SQL, /skipped_count/, "computes skipped count");
  assert.match(ANALYTICS_SQL, /full_events/, "computes full events");
});

test("analytics: get_platform_analytics RPC computes platform metrics", () => {
  assert.match(ANALYTICS_SQL, /get_platform_analytics/, "RPC exists");
  assert.match(ANALYTICS_SQL, /total_users/, "computes total users");
  assert.match(ANALYTICS_SQL, /total_projects/, "computes total projects");
  assert.match(ANALYTICS_SQL, /active_projects/, "computes active projects");
  assert.match(ANALYTICS_SQL, /total_requests/, "computes total requests");
  assert.match(ANALYTICS_SQL, /errors_24h/, "computes errors");
  assert.match(ANALYTICS_SQL, /requests_per_day/, "computes trends");
});

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 3: Safe implementation — read-only, non-blocking
// ═══════════════════════════════════════════════════════════════════════════

test("analytics: RPCs are read-only (STABLE, no writes)", () => {
  assert.match(ANALYTICS_SQL, /stable/, "marked STABLE (read-only)");
  assert.doesNotMatch(ANALYTICS_SQL, /insert into|update .* set|delete from/, "no write operations");
});

test("analytics: RPCs are security definer with proper grants", () => {
  assert.match(ANALYTICS_SQL, /security definer/, "uses security definer");
  assert.match(ANALYTICS_SQL, /grant execute.*authenticated/, "granted to authenticated");
});

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 4: Admin dashboard uses real data (not demo)
// ═══════════════════════════════════════════════════════════════════════════

test("analytics: StatsDashboard uses ProjectAnalytics (no demoData)", () => {
  assert.doesNotMatch(STATS_DASHBOARD, /demoData|demoFloors|demoRequests/, "no demo data imports");
  assert.match(STATS_DASHBOARD, /ProjectAnalytics/, "uses ProjectAnalytics type");
  assert.match(STATS_DASHBOARD, /avg_wait/, "shows average wait");
  assert.match(STATS_DASHBOARD, /avg_travel/, "shows average travel");
  assert.match(STATS_DASHBOARD, /skipped/, "shows skipped count");
  assert.match(STATS_DASHBOARD, /fullEvents/, "shows full events");
  assert.match(STATS_DASHBOARD, /busiest_hours/, "shows busiest hours");
  assert.match(STATS_DASHBOARD, /top_floors/, "shows top floors");
});

test("analytics: admin stats page fetches real analytics", () => {
  assert.doesNotMatch(ADMIN_STATS_PAGE, /demoData/, "no demo data");
  assert.match(ADMIN_STATS_PAGE, /getProjectAnalytics/, "fetches real analytics");
  assert.match(ADMIN_STATS_PAGE, /analytics=/, "passes analytics to dashboard");
});

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 5: Superadmin dashboard shows platform analytics
// ═══════════════════════════════════════════════════════════════════════════

test("analytics: superadmin dashboard uses platform analytics", () => {
  const SUPERADMIN_DASH = readFileSync(join(root, "components/superadmin/SuperadminAnalyticsDashboard.tsx"), "utf8");
  assert.match(SUPERADMIN_DASH, /total_users/, "references total users");
  assert.match(SUPERADMIN_DASH, /avg_wait_seconds/, "references avg wait");
  assert.match(SUPERADMIN_DASH, /requests_per_day/, "shows trend chart");
  assert.match(SUPERADMIN_DASH, /confirmedRevenue|Revenus encaissés/, "shows confirmed revenue");
  assert.match(SUPERADMIN_DASH, /theoreticalMRR|Valeur théorique/, "shows theoretical MRR");
});

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 6: Analytics do NOT affect dispatch or operator speed
// ═══════════════════════════════════════════════════════════════════════════

test("analytics: dispatch brain untouched by analytics", () => {
  assert.doesNotMatch(DISPATCH_BRAIN, /analytics|get_project_analytics|get_platform_analytics/, "dispatch has no analytics imports");
  assert.match(DISPATCH_BRAIN, /computeBestElevatorForRequest/, "dispatch still works");
});

test("analytics: operator actions remain instant (optimistic UI)", () => {
  assert.match(REQUEST_CARD, /setCurrentStatus\(status\)/, "optimistic UI preserved");
  assert.match(REQUEST_CARD, /void advanceRequestStatus/, "fire-and-forget preserved");
});

test("analytics: lib/actions.ts has no analytics dependencies", () => {
  assert.doesNotMatch(ACTIONS, /get_project_analytics|get_platform_analytics|getProjectAnalytics|getPlatformAnalytics/, "actions.ts does not import analytics");
});

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 7: Premium analytics dashboard (/admin/analytics)
// ═══════════════════════════════════════════════════════════════════════════

test("analytics: /admin/analytics page exists and fetches project data", () => {
  const ANALYTICS_PAGE = readFileSync(join(root, "app/admin/analytics/page.tsx"), "utf8");
  assert.match(ANALYTICS_PAGE, /requireAdmin/, "requires admin auth");
  assert.match(ANALYTICS_PAGE, /getProjectAnalytics/, "fetches project analytics");
  assert.match(ANALYTICS_PAGE, /AdminAnalyticsDashboard/, "renders premium dashboard");
});

test("analytics: AdminAnalyticsDashboard is a client component with premium UI", () => {
  const DASHBOARD = readFileSync(join(root, "components/admin/AdminAnalyticsDashboard.tsx"), "utf8");
  assert.match(DASHBOARD, /"use client"/, "is a client component");
  assert.match(DASHBOARD, /efficiencyScore/, "computes efficiency score");
  assert.match(DASHBOARD, /insightCards/, "generates business insights");
  assert.match(DASHBOARD, /MiniBarChart/, "has peak hours chart");
  assert.match(DASHBOARD, /HorizontalBarChart/, "has floor usage chart");
  assert.match(DASHBOARD, /SkeletonCard/, "has skeleton loading state");
  assert.match(DASHBOARD, /rounded-3xl/, "uses premium rounded cards");
});

test("analytics: AdminAnalyticsDashboard handles empty data gracefully", () => {
  const DASHBOARD = readFileSync(join(root, "components/admin/AdminAnalyticsDashboard.tsx"), "utf8");
  assert.match(DASHBOARD, /No active project/, "shows empty state when no project");
  assert.match(DASHBOARD, /No data yet/, "shows empty state for charts");
  assert.match(DASHBOARD, /SkeletonCard/, "has skeleton for loading");
});

test("analytics: AdminAnalyticsDashboard shows efficiency score with breakdown", () => {
  const DASHBOARD = readFileSync(join(root, "components/admin/AdminAnalyticsDashboard.tsx"), "utf8");
  assert.match(DASHBOARD, /completionRate/, "uses completion rate in score");
  assert.match(DASHBOARD, /skipRate/, "uses skip rate in score");
  assert.match(DASHBOARD, /cancelRate/, "uses cancel rate in score");
  assert.match(DASHBOARD, /Excellent/, "has Excellent label");
  assert.match(DASHBOARD, /Good/, "has Good label");
  assert.match(DASHBOARD, /Needs attention/, "has Needs attention label");
  assert.match(DASHBOARD, /svg/, "has SVG ring chart for score");
});

test("analytics: AdminAnalyticsDashboard generates business insights", () => {
  const DASHBOARD = readFileSync(join(root, "components/admin/AdminAnalyticsDashboard.tsx"), "utf8");
  assert.match(DASHBOARD, /min saved/, "shows time saved insight");
  assert.match(DASHBOARD, /Peak congestion/, "shows peak congestion insight");
  assert.match(DASHBOARD, /busiest destination/, "shows floor insight");
  assert.match(DASHBOARD, /another operator/, "shows operator suggestion");
  assert.match(DASHBOARD, /capacity upgrade/, "shows capacity insight");
  assert.match(DASHBOARD, /Operations running smoothly/, "default positive insight");
});

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 8: Premium superadmin analytics
// ═══════════════════════════════════════════════════════════════════════════

test("analytics: SuperadminAnalyticsDashboard is a client component", () => {
  const DASHBOARD = readFileSync(join(root, "components/superadmin/SuperadminAnalyticsDashboard.tsx"), "utf8");
  assert.match(DASHBOARD, /"use client"/, "is a client component");
  assert.match(DASHBOARD, /MetricCard/, "has metric cards");
  assert.match(DASHBOARD, /TrendChart/, "has usage trend chart");
  assert.match(DASHBOARD, /PlanDonut/, "has plan distribution donut");
  assert.match(DASHBOARD, /ErrorList/, "has error trends section");
  assert.match(DASHBOARD, /rounded-3xl/, "uses premium rounded cards");
});

test("analytics: SuperadminAnalyticsDashboard shows all required metrics", () => {
  const DASHBOARD = readFileSync(join(root, "components/superadmin/SuperadminAnalyticsDashboard.tsx"), "utf8");
  assert.match(DASHBOARD, /Total Users/, "shows total users");
  assert.match(DASHBOARD, /Active Projects/, "shows active projects");
  assert.match(DASHBOARD, /Revenus encaissés/, "shows confirmed revenue");
  assert.match(DASHBOARD, /Valeur théorique/, "shows theoretical MRR");
  assert.match(DASHBOARD, /Errors \(24h\)/, "shows 24h errors");
  assert.match(DASHBOARD, /Plan Distribution/, "shows plan distribution");
  assert.match(DASHBOARD, /Error Trends/, "shows error trends");
  assert.match(DASHBOARD, /Performance/, "shows performance section");
});

test("analytics: superadmin page uses SuperadminAnalyticsDashboard", () => {
  const SUPERADMIN_PAGE = readFileSync(join(root, "app/superadmin/page.tsx"), "utf8");
  assert.match(SUPERADMIN_PAGE, /requireSuperAdmin/, "requires superadmin auth");
  assert.match(SUPERADMIN_PAGE, /getPlatformAnalytics/, "fetches platform analytics");
  assert.match(SUPERADMIN_PAGE, /SuperadminAnalyticsDashboard/, "renders premium dashboard");
});

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 9: Analytics read-only + admin only sees own project
// ═══════════════════════════════════════════════════════════════════════════

test("analytics: admin analytics page is scoped to own project (not all projects)", () => {
  const ANALYTICS_PAGE = readFileSync(join(root, "app/admin/analytics/page.tsx"), "utf8");
  assert.match(ANALYTICS_PAGE, /getProjects\(\)/, "fetches user's own projects");
  assert.doesNotMatch(ANALYTICS_PAGE, /getPlatformAnalytics/, "admin cannot see platform-wide data");
});

test("analytics: client components do NOT import server-only supabase", () => {
  const ADMIN_DASH = readFileSync(join(root, "components/admin/AdminAnalyticsDashboard.tsx"), "utf8");
  const SUPERADMIN_DASH = readFileSync(join(root, "components/superadmin/SuperadminAnalyticsDashboard.tsx"), "utf8");
  assert.doesNotMatch(ADMIN_DASH, /@\/lib\/supabase\/server/, "admin dashboard has no server supabase import");
  assert.doesNotMatch(SUPERADMIN_DASH, /@\/lib\/supabase\/server/, "superadmin dashboard has no server supabase import");
});

test("analytics: i18n keys exist for analytics page", () => {
  const I18N = readFileSync(join(root, "lib/i18n.ts"), "utf8");
  assert.match(I18N, /"analytics\.title"/, "has analytics.title key");
  assert.match(I18N, /"analytics\.subtitle"/, "has analytics.subtitle key");
});

// ═══════════════════════════════════════════════════════════════════════════
// Revenue calculation — confirmed vs theoretical
// ═══════════════════════════════════════════════════════════════════════════

test("revenue: DashboardData has confirmedRevenue and theoreticalMRR (not estimatedMonthlyRevenue)", () => {
  const SUPERADMIN_LIB = readFileSync(join(root, "lib/superadmin.ts"), "utf8");
  assert.match(SUPERADMIN_LIB, /confirmedRevenue/, "has confirmedRevenue field");
  assert.match(SUPERADMIN_LIB, /theoreticalMRR/, "has theoreticalMRR field");
  assert.doesNotMatch(SUPERADMIN_LIB, /estimatedMonthlyRevenue/, "old estimatedMonthlyRevenue removed");
});

test("revenue: confirmed revenue only counts stripe/revenuecat active subscriptions", () => {
  const SUPERADMIN_LIB = readFileSync(join(root, "lib/superadmin.ts"), "utf8");
  assert.match(SUPERADMIN_LIB, /paidSubscriptions/, "fetches paid subscriptions");
  assert.match(SUPERADMIN_LIB, /"stripe".*"revenuecat"/, "filters by stripe + revenuecat providers");
  assert.match(SUPERADMIN_LIB, /"active".*"trialing"/, "only active/trialing status");
  assert.match(SUPERADMIN_LIB, /confirmedRevenue/, "calculates confirmedRevenue from paid subs");
});

test("revenue: theoretical MRR counts all active plans (includes manual/code/admin)", () => {
  const SUPERADMIN_LIB = readFileSync(join(root, "lib/superadmin.ts"), "utf8");
  assert.match(SUPERADMIN_LIB, /theoreticalMRR/, "calculates theoreticalMRR");
  assert.match(SUPERADMIN_LIB, /planCounts/, "uses planCounts for theoretical");
});

test("revenue: dashboard shows both metrics with clear labels", () => {
  const DASH = readFileSync(join(root, "components/superadmin/SuperadminAnalyticsDashboard.tsx"), "utf8");
  assert.match(DASH, /Revenus encaissés/, "primary: confirmed revenue label");
  assert.match(DASH, /confirmedRevenue/, "primary: confirmed revenue value");
  assert.match(DASH, /Valeur théorique/, "secondary: theoretical MRR label");
  assert.match(DASH, /theoreticalMRR/, "secondary: theoretical MRR value");
});

test("revenue: manual/code/admin sources are excluded from confirmed revenue", () => {
  const SUPERADMIN_LIB = readFileSync(join(root, "lib/superadmin.ts"), "utf8");
  // The query explicitly filters subscriptions by provider IN ('stripe', 'revenuecat')
  // This excludes: manual, manual_code, admin, activation_code, default
  const match = SUPERADMIN_LIB.match(/\.in\("provider",\s*\[[^\]]*\]\)/);
  assert.ok(match, "uses .in() filter on provider");
  assert.match(match![0], /"stripe"/, "includes stripe");
  assert.match(match![0], /"revenuecat"/, "includes revenuecat");
  assert.doesNotMatch(match![0], /"manual"/, "excludes manual");
  assert.doesNotMatch(match![0], /"manual_code"/, "excludes manual_code");
  assert.doesNotMatch(match![0], /"admin"/, "excludes admin");
  assert.doesNotMatch(match![0], /"activation_code"/, "excludes activation_code");
});
