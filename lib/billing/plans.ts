/**
 * Elevio plan definitions and limits.
 *
 * Plans: Starter / Pro / Enterprise
 * Free is REMOVED from new sign-ups — existing "free" users are
 * grandfathered as "starter" via backward-compatible mapping.
 */

export type PlanId = "free" | "starter" | "pro" | "business" | "enterprise";

export type BillingPeriod = "monthly" | "annual";

/** Plans visible to users (Free excluded from new sign-ups) */
export const VISIBLE_PLAN_IDS: PlanId[] = ["starter", "pro", "enterprise"];

/** Legacy "free" maps to "starter" for all limit checks */
const FREE_EQUIVALENT: PlanId = "starter";

export interface PlanLimit {
  maxProjects: number | null;
  maxOperators: number | null;
  maxRequestsPerDay: number | null;
  analytics: "none" | "simple" | "advanced";
  analyticsDashboard: boolean;
  efficiencyScore: boolean;
  businessInsights: boolean;
  peakHours: boolean;
  floorUsage: boolean;
  operatorPerformance: boolean;
  multiOperator: boolean;
  prioritySupport: boolean;
  customSupport: boolean;
  customContract: boolean;
  activationCode: boolean;
}

export interface Plan {
  id: PlanId;
  label: string;
  description: string;
  priceMonthly: number | null;
  priceAnnual: number | null;
  limits: PlanLimit;
  popular?: boolean;
  iapAvailable: boolean;
  contactSales: boolean;
}

export const PLANS: Record<PlanId, Plan> = {
  free: {
    // LEGACY — not offered to new users. Treated as Starter for all checks.
    id: "free",
    label: "Starter",
    description: "Petite équipe — 1 chantier, 2 opérateurs",
    priceMonthly: 0,
    priceAnnual: 0,
    limits: {
      maxProjects: 1,
      maxOperators: 2,
      maxRequestsPerDay: null,
      analytics: "simple",
      analyticsDashboard: true,
      efficiencyScore: false,
      businessInsights: false,
      peakHours: true,
      floorUsage: true,
      operatorPerformance: false,
      multiOperator: false,
      prioritySupport: false,
      customSupport: false,
      customContract: false,
      activationCode: false,
    },
    iapAvailable: false,
    contactSales: false,
  },
  starter: {
    id: "starter",
    label: "Starter",
    description: "Reduce wait times — 1 chantier, analytics simples",
    priceMonthly: 199,
    priceAnnual: 1990,
    limits: {
      maxProjects: 1,
      maxOperators: 2,
      maxRequestsPerDay: null,
      analytics: "simple",
      analyticsDashboard: true,
      efficiencyScore: false,
      businessInsights: false,
      peakHours: true,
      floorUsage: true,
      operatorPerformance: false,
      multiOperator: false,
      prioritySupport: false,
      customSupport: false,
      customContract: false,
      activationCode: false,
    },
    iapAvailable: true,
    contactSales: false,
  },
  pro: {
    id: "pro",
    label: "Pro",
    description: "See where time is lost — smart dispatch, analytics avancés",
    priceMonthly: 499,
    priceAnnual: 4990,
    limits: {
      maxProjects: 3,
      maxOperators: 10,
      maxRequestsPerDay: null,
      analytics: "advanced",
      analyticsDashboard: true,
      efficiencyScore: true,
      businessInsights: true,
      peakHours: true,
      floorUsage: true,
      operatorPerformance: true,
      multiOperator: true,
      prioritySupport: false,
      customSupport: false,
      customContract: false,
      activationCode: false,
    },
    iapAvailable: true,
    contactSales: false,
    popular: true,
  },
  business: {
    id: "business",
    label: "Business",
    description: "Optimize operator performance — support prioritaire, contrat annuel",
    priceMonthly: null,
    priceAnnual: null,
    limits: {
      maxProjects: null,
      maxOperators: null,
      maxRequestsPerDay: null,
      analytics: "advanced",
      analyticsDashboard: true,
      efficiencyScore: true,
      businessInsights: true,
      peakHours: true,
      floorUsage: true,
      operatorPerformance: true,
      multiOperator: true,
      prioritySupport: true,
      customSupport: true,
      customContract: true,
      activationCode: false,
    },
    iapAvailable: false,
    contactSales: true,
  },
  enterprise: {
    id: "enterprise",
    label: "Enterprise",
    description: "Prove productivity gains — illimité, intégrations, SLA",
    priceMonthly: null,
    priceAnnual: null,
    limits: {
      maxProjects: null,
      maxOperators: null,
      maxRequestsPerDay: null,
      analytics: "advanced",
      analyticsDashboard: true,
      efficiencyScore: true,
      businessInsights: true,
      peakHours: true,
      floorUsage: true,
      operatorPerformance: true,
      multiOperator: true,
      prioritySupport: true,
      customSupport: true,
      customContract: true,
      activationCode: true,
    },
    iapAvailable: false,
    contactSales: true,
  },
};

/** Ordered list for display (excludes legacy "free") */
export const PLAN_ORDER: PlanId[] = ["starter", "pro", "enterprise"];

/** IAP-eligible plans (purchasable via App Store) */
export const IAP_PLANS: PlanId[] = ["starter", "pro"];

/** Plans requiring sales contact or activation code */
export const SALES_PLANS: PlanId[] = ["enterprise"];

/** Default plan for new sign-ups */
export const DEFAULT_PLAN: PlanId = "starter";

/** Resolve legacy "free" to its effective plan */
export function effectivePlanId(planId: PlanId): PlanId {
  return planId === "free" ? FREE_EQUIVALENT : planId;
}

export function getPlan(id: PlanId): Plan {
  return PLANS[effectivePlanId(id)];
}

export function getPlanLimit(id: PlanId): PlanLimit {
  return PLANS[effectivePlanId(id)].limits;
}

/** Plans to display in pricing UIs */
export function getVisiblePlans(): Plan[] {
  return VISIBLE_PLAN_IDS.map((id) => PLANS[id]);
}
