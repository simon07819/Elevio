import { NextResponse, type NextRequest } from "next/server";
import { demoFloors, demoProject } from "@/lib/demoData";
import { createClient } from "@/lib/supabase/server";

function normalizeAccessCode(value: string) {
  return value.replace(/[^a-z0-9]/gi, "").toUpperCase();
}

function requestPath(projectId: string, floorToken: string) {
  return `/request?projectId=${encodeURIComponent(projectId)}&floorToken=${encodeURIComponent(floorToken)}`;
}

export async function GET(request: NextRequest) {
  const code = normalizeAccessCode(request.nextUrl.searchParams.get("code") ?? "");

  if (!code) {
    return NextResponse.json({ ok: false, message: "Code manquant." }, { status: 400 });
  }

  const supabase = await createClient();

  if (!supabase) {
    const floor = demoFloors.find((item) => item.access_code === code && item.active);

    if (!floor) {
      return NextResponse.json({ ok: false, message: "Code introuvable." }, { status: 404 });
    }

    return NextResponse.json({ ok: true, path: requestPath(demoProject.id, floor.qr_token) });
  }

  const { data: floor } = await supabase
    .from("floors")
    .select("project_id,qr_token,access_code,active")
    .eq("access_code", code)
    .eq("active", true)
    .single();

  if (!floor) {
    return NextResponse.json({ ok: false, message: "Code introuvable." }, { status: 404 });
  }

  const { data: project } = await supabase
    .from("projects")
    .select("id")
    .eq("id", floor.project_id)
    .eq("active", true)
    .is("archived_at", null)
    .single();

  if (!project) {
    return NextResponse.json({ ok: false, message: "Projet inactif." }, { status: 404 });
  }

  return NextResponse.json({ ok: true, path: requestPath(floor.project_id, floor.qr_token) });
}
