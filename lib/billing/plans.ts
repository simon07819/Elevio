/**
 * Elevio plan definitions and limits.
 *
 * Hybrid model:
 * - Free / Starter / Pro → IAP (Apple, later Google)
 * - Business / Enterprise → Contact sales or activation code
 */

export type PlanId = "free" | "starter" | "pro" | "business" | "enterprise";

export type BillingPeriod = "monthly" | "annual";

export interface PlanLimit {
  maxProjects: number | null; // null = unlimited
  maxOperators: number | null;
  analytics: "none" | "simple" | "advanced";
  multiOperator: boolean;
  prioritySupport: boolean;
  customContract: boolean;
  activationCode: boolean; // activated via code, not IAP
}

export interface Plan {
  id: PlanId;
  label: string;
  description: string;
  priceMonthly: number | null; // null = contact sales or free
  priceAnnual: number | null;
  limits: PlanLimit;
  popular?: boolean;
  iapAvailable: boolean; // true = can be purchased via App Store
  contactSales: boolean; // true = requires sales contact
}

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: "free",
    label: "Free",
    description: "Essai gratuit — 1 chantier, 1 opérateur",
    priceMonthly: 0,
    priceAnnual: 0,
    limits: {
      maxProjects: 1,
      maxOperators: 1,
      analytics: "none",
      multiOperator: false,
      prioritySupport: false,
      customContract: false,
      activationCode: false,
    },
    iapAvailable: false,
    contactSales: false,
  },
  starter: {
    id: "starter",
    label: "Starter",
    description: "Petite équipe — 1 chantier, 2 opérateurs, analytics simples",
    priceMonthly: 29,
    priceAnnual: 290,
    limits: {
      maxProjects: 1,
      maxOperators: 2,
      analytics: "simple",
      multiOperator: false,
      prioritySupport: false,
      customContract: false,
      activationCode: false,
    },
    iapAvailable: true,
    contactSales: false,
  },
  pro: {
    id: "pro",
    label: "Pro",
    description: "Équipe multi-chantiers — 3 chantiers, 10 opérateurs, analytics avancés",
    priceMonthly: 79,
    priceAnnual: 790,
    limits: {
      maxProjects: 3,
      maxOperators: 10,
      analytics: "advanced",
      multiOperator: true,
      prioritySupport: false,
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
    description: "Chantiers et opérateurs personnalisés — support prioritaire",
    priceMonthly: null,
    priceAnnual: null,
    limits: {
      maxProjects: null,
      maxOperators: null,
      analytics: "advanced",
      multiOperator: true,
      prioritySupport: true,
      customContract: true,
      activationCode: false,
    },
    iapAvailable: false,
    contactSales: true,
  },
  enterprise: {
    id: "enterprise",
    label: "Enterprise",
    description: "Illimité — fonctionnalités avancées, contrat annuel",
    priceMonthly: null,
    priceAnnual: null,
    limits: {
      maxProjects: null,
      maxOperators: null,
      analytics: "advanced",
      multiOperator: true,
      prioritySupport: true,
      customContract: true,
      activationCode: true,
    },
    iapAvailable: false,
    contactSales: true,
  },
};

/** Ordered list for display */
export const PLAN_ORDER: PlanId[] = ["free", "starter", "pro", "business", "enterprise"];

/** IAP-eligible plans (purchasable via App Store) */
export const IAP_PLANS: PlanId[] = ["starter", "pro"];

/** Plans requiring sales contact or activation code */
export const SALES_PLANS: PlanId[] = ["business", "enterprise"];

export function getPlan(id: PlanId): Plan {
  return PLANS[id];
}

export function getPlanLimit(id: PlanId): PlanLimit {
  return PLANS[id].limits;
}
