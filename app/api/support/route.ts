import { NextRequest, NextResponse } from "next/server";

const VALID_TYPES = [
  "Problème technique",
  "Question générale",
  "Paiement / abonnement",
  "Compte / accès",
  "Sécurité chantier",
  "Autre",
];
const VALID_ROLES = ["passenger", "operator", "admin", "autre"];
const VALID_STATUSES = ["nouveau", "en_cours", "résolu"];

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const type = String(form.get("type") ?? "");
    const name = String(form.get("name") ?? "").trim();
    const email = String(form.get("email") ?? "").trim();
    const role = String(form.get("role") ?? "passenger");
    const project = String(form.get("project") ?? "").trim() || null;
    const message = String(form.get("message") ?? "").trim();

    if (!name || name.length > 100) {
      return NextResponse.json({ error: "Nom requis (max 100 car.)" }, { status: 400 });
    }
    if (!email || email.length > 200 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Courriel valide requis" }, { status: 400 });
    }
    if (!message || message.length > 2000) {
      return NextResponse.json({ error: "Message requis (max 2000 car.)" }, { status: 400 });
    }
    if (!VALID_TYPES.includes(type)) {
      return NextResponse.json({ error: "Type invalide" }, { status: 400 });
    }
    if (!VALID_ROLES.includes(role)) {
      return NextResponse.json({ error: "Rôle invalide" }, { status: 400 });
    }

    const { createClient } = await import("@/lib/supabase/server");
    const supabase = await createClient();
    if (!supabase) {
      return NextResponse.json({ error: "Service indisponible" }, { status: 503 });
    }

    const { error } = await supabase.from("support_messages").insert({
      type,
      name,
      email,
      role,
      project,
      message,
      status: "nouveau",
    });

    if (error) {
      console.error("support_messages insert error:", error.message);
      return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
    }

    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err) {
    console.error("support API error:", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { requireSuperAdmin } = await import("@/lib/auth/superadmin");
    await requireSuperAdmin();

    const body = await req.json();
    const { id, status, internal_note } = body;

    if (!id) return NextResponse.json({ error: "ID requis" }, { status: 400 });
    if (status && !VALID_STATUSES.includes(status)) {
      return NextResponse.json({ error: "Statut invalide" }, { status: 400 });
    }

    const { createClient } = await import("@/lib/supabase/server");
    const supabase = await createClient();
    if (!supabase) {
      return NextResponse.json({ error: "Service indisponible" }, { status: 503 });
    }

    const update: Record<string, string> = { updated_at: new Date().toISOString() };
    if (status) update.status = status;
    if (internal_note !== undefined) update.internal_note = internal_note;

    const { error } = await supabase.from("support_messages").update(update).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
}
