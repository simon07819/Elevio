import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId");
  const page = Math.max(1, Number(searchParams.get("page") || "1"));
  const pageSize = Math.min(100, Math.max(1, Number(searchParams.get("pageSize") || "50")));
  const status = searchParams.get("status"); // comma-separated
  const fromFloor = searchParams.get("fromFloor");
  const toFloor = searchParams.get("toFloor");
  const dateFrom = searchParams.get("dateFrom");
  const dateTo = searchParams.get("dateTo");

  if (!projectId) {
    return NextResponse.json({ error: "projectId required" }, { status: 400 });
  }

  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: "db unavailable" }, { status: 503 });
  }

  let query = supabase
    .from("requests")
    .select(
      "id,project_id,elevator_id,from_floor_id,to_floor_id,direction,passenger_count,status,sequence_number,wait_started_at,created_at,updated_at,completed_at",
      { count: "exact" },
    )
    .eq("project_id", projectId);

  if (status) {
    const statuses = status.split(",").filter(Boolean);
    if (statuses.length > 0) query = query.in("status", statuses);
  }
  if (fromFloor) query = query.eq("from_floor_id", fromFloor);
  if (toFloor) query = query.eq("to_floor_id", toFloor);
  if (dateFrom) query = query.gte("created_at", dateFrom);
  if (dateTo) query = query.lt("created_at", dateTo);

  const offset = (page - 1) * pageSize;
  const { data, count, error } = await query
    .order("created_at", { ascending: false })
    .range(offset, offset + pageSize - 1);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    rows: data,
    total: count,
    page,
    pageSize,
    totalPages: Math.ceil((count ?? 0) / pageSize),
  });
}
