import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { MetricsClient } from "./MetricsClient";

export const dynamic = "force-dynamic";

export default async function MetricsPage() {
  const supabase = await createClient();
  if (!supabase) {
    redirect("/admin/login");
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/admin/login");
  }

  // Fetch today's requests for metrics
  const today = new Date().toISOString().slice(0, 10);
  const { data: todayRequests } = await supabase
    .from("requests")
    .select("id, status, created_at, updated_at, completed_at, elevator_id, project_id")
    .gte("created_at", `${today}T00:00:00`)
    .order("created_at", { ascending: false })
    .limit(200);

  // Fetch recent events for error tracking
  const { data: recentEvents } = await supabase
    .from("request_events")
    .select("id, event_type, created_at, request_id, elevator_id, note")
    .order("created_at", { ascending: false })
    .limit(20);

  const requests = (todayRequests ?? []) as Array<{
    id: string;
    status: string;
    created_at: string;
    updated_at: string;
    completed_at: string | null;
    elevator_id: string | null;
    project_id: string;
  }>;

  // Compute metrics
  const totalToday = requests.length;
  const completedToday = requests.filter(r => r.status === "completed").length;
  const cancelledToday = requests.filter(r => r.status === "cancelled").length;
  const activeToday = requests.filter(r => !["completed", "cancelled"].includes(r.status)).length;

  // Average pickup time (created_at → status="boarded" updated_at)
  const boarded = requests.filter(r => r.status === "boarded" || r.status === "completed");
  const pickupDurations: number[] = [];
  for (const r of boarded) {
    if (r.created_at && r.updated_at) {
      const ms = new Date(r.updated_at).getTime() - new Date(r.created_at).getTime();
      if (ms > 0 && ms < 3600000) pickupDurations.push(ms); // <1h sanity
    }
  }
  const avgPickupMs = pickupDurations.length > 0
    ? pickupDurations.reduce((a, b) => a + b, 0) / pickupDurations.length
    : 0;

  // Average dropoff time (boarded → completed)
  const completedWithTimes = requests.filter(r => r.status === "completed" && r.completed_at && r.updated_at);
  const dropoffDurations: number[] = [];
  for (const r of completedWithTimes) {
    // Use completed_at - (updated_at as proxy for boarded_at)
    // This is approximate since we don't have the exact boarded_at in the request row
    if (r.completed_at && r.created_at) {
      const ms = new Date(r.completed_at).getTime() - new Date(r.created_at).getTime();
      if (ms > 0 && ms < 7200000) dropoffDurations.push(ms); // <2h sanity
    }
  }
  const avgDropoffMs = dropoffDurations.length > 0
    ? dropoffDurations.reduce((a, b) => a + b, 0) / dropoffDurations.length
    : 0;

  const events = (recentEvents ?? []) as Array<{
    id: string;
    event_type: string;
    created_at: string;
    request_id: string | null;
    elevator_id: string | null;
    note: string | null;
  }>;

  // Error events
  const errorEvents = events.filter(e =>
    e.event_type?.includes("error") || e.event_type?.includes("failed") || e.note?.includes("impossible")
  );

  return (
    <MetricsClient
      metrics={{
        totalToday,
        completedToday,
        cancelledToday,
        activeToday,
        avgPickupMs,
        avgDropoffMs,
        errorCount: errorEvents.length,
      }}
      recentEvents={events.map(e => ({
        id: e.id,
        eventType: e.event_type ?? "",
        createdAt: e.created_at,
        requestId: e.request_id,
        elevatorId: e.elevator_id,
        note: e.note,
      }))}
    />
  );
}
