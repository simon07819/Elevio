"use server";

import { createClient } from "@/lib/supabase/server";

export type BillingPlanRow = {
  id: string;
  label: string;
  description: string;
  price_monthly: number | null;
  price_annual: number | null;
  max_projects: number | null;
  max_operators: number | null;
  analytics: string;
  efficiency_score: boolean;
  business_insights: boolean;
  operator_performance: boolean;
  multi_operator: boolean;
  priority_support: boolean;
  iap_available: boolean;
  contact_sales: boolean;
  popular: boolean;
  active: boolean;
  sort_order: number;
  updated_at: string | null;
};

/** Fetch all billing plans from DB */
export async function getBillingPlans(): Promise<BillingPlanRow[]> {
  const supabase = await createClient();
  if (!supabase) return [];

  const { data } = await supabase
    .from("billing_plans")
    .select("*")
    .order("sort_order", { ascending: true });

  return (data ?? []) as BillingPlanRow[];
}

/** Update a billing plan by id */
export async function updateBillingPlan(id: string, updates: Partial<Omit<BillingPlanRow, "id" | "updated_at">>): Promise<{ ok: boolean; message: string }> {
  const supabase = await createClient();
  if (!supabase) return { ok: false, message: "Service indisponible." };

  const { error } = await supabase
    .from("billing_plans")
    .update(updates)
    .eq("id", id);

  if (error) return { ok: false, message: error.message };
  return { ok: true, message: `Plan ${id} mis à jour.` };
}
