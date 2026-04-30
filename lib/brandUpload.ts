"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const BUCKET = "brand-logos";
const MAX_BYTES = 2 * 1024 * 1024;
const ALLOWED = new Set(["image/png", "image/jpeg", "image/webp", "image/svg+xml"]);

function extensionForMime(mime: string): string | null {
  const map: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/webp": "webp",
    "image/svg+xml": "svg",
  };
  return map[mime] ?? null;
}

/** Path inside bucket from public object URL, or null if not our bucket. */
function brandLogoPathFromPublicUrl(publicUrl: string): string | null {
  try {
    const u = new URL(publicUrl);
    const marker = "/storage/v1/object/public/brand-logos/";
    const idx = u.pathname.indexOf(marker);
    if (idx === -1) return null;
    return decodeURIComponent(u.pathname.slice(idx + marker.length));
  } catch {
    return null;
  }
}

async function deleteStoredPath(supabase: NonNullable<Awaited<ReturnType<typeof createClient>>>, path: string) {
  await supabase.storage.from(BUCKET).remove([path]);
}

async function deleteStoredUrl(
  supabase: NonNullable<Awaited<ReturnType<typeof createClient>>>,
  userId: string,
  publicUrl: string | null | undefined,
) {
  if (!publicUrl) return;
  const path = brandLogoPathFromPublicUrl(publicUrl);
  if (!path || path.split("/")[0] !== userId) return;
  await deleteStoredPath(supabase, path);
}

function revalidateBrandPaths(projectId?: string) {
  revalidatePath("/admin");
  revalidatePath("/admin/projects");
  revalidatePath("/admin/profile");
  revalidatePath("/admin/qrcodes");
  if (projectId) {
    revalidatePath(`/admin/projects/${projectId}`);
  }
}

export type BrandLogoKind = "company" | "project" | "site";

export async function uploadBrandLogo(formData: FormData): Promise<{ ok: boolean; message: string }> {
  const supabase = await createClient();

  if (!supabase) {
    return { ok: false, message: "Supabase n'est pas configure." };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, message: "Connexion requise pour televerser un logo." };
  }

  const kind = String(formData.get("kind") ?? "") as BrandLogoKind;
  const projectId = formData.get("projectId") ? String(formData.get("projectId")).trim() : null;
  const file = formData.get("file");

  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, message: "Choisissez un fichier image." };
  }

  if (file.size > MAX_BYTES) {
    return { ok: false, message: "Le fichier depasse 2 Mo." };
  }

  const mime = file.type || "";
  if (!ALLOWED.has(mime)) {
    return { ok: false, message: "Formats acceptes: PNG, JPEG, WebP ou SVG." };
  }

  const ext = extensionForMime(mime);
  if (!ext) {
    return { ok: false, message: "Format image non reconnu." };
  }

  let storagePath: string;
  if (kind === "company") {
    storagePath = `${user.id}/company.${ext}`;
  } else if (kind === "project") {
    storagePath = `${user.id}/project.${ext}`;
  } else if (kind === "site") {
    if (!projectId) {
      return { ok: false, message: "Projet manquant pour le logo chantier." };
    }
    const { data: row, error } = await supabase
      .from("projects")
      .select("owner_id")
      .eq("id", projectId)
      .single();

    if (error || !row || row.owner_id !== user.id) {
      return { ok: false, message: "Projet introuvable ou acces refuse." };
    }
    storagePath = `${user.id}/sites/${projectId}.${ext}`;
  } else {
    return { ok: false, message: "Type de logo invalide." };
  }

  if (kind === "company" || kind === "project") {
    const { data: profile } = await supabase
      .from("profiles")
      .select("company_logo_url, project_logo_url")
      .eq("id", user.id)
      .single();

    const previousUrl = kind === "company" ? profile?.company_logo_url : profile?.project_logo_url;
    await deleteStoredUrl(supabase, user.id, previousUrl);
  } else if (kind === "site" && projectId) {
    const { data: project } = await supabase.from("projects").select("logo_url").eq("id", projectId).single();

    await deleteStoredUrl(supabase, user.id, project?.logo_url);
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, bytes, { contentType: mime, upsert: true });

  if (uploadError) {
    const msg = uploadError.message ?? "";
    if (/bucket not found/i.test(msg)) {
      return {
        ok: false,
        message:
          "Le bucket Storage « brand-logos » est absent. Dans Supabase > SQL Editor, exécutez le script supabase/storage-brand-logos.sql du dépôt.",
      };
    }
    return { ok: false, message: msg || "Erreur upload." };
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);

  if (kind === "company") {
    const { error } = await supabase.from("profiles").update({ company_logo_url: publicUrl }).eq("id", user.id);
    if (error) return { ok: false, message: error.message };
  } else if (kind === "project") {
    const { error } = await supabase.from("profiles").update({ project_logo_url: publicUrl }).eq("id", user.id);
    if (error) return { ok: false, message: error.message };
  } else if (kind === "site" && projectId) {
    const { error } = await supabase.from("projects").update({ logo_url: publicUrl }).eq("id", projectId).eq("owner_id", user.id);
    if (error) return { ok: false, message: error.message };
  }

  revalidateBrandPaths(kind === "site" ? projectId ?? undefined : undefined);
  return { ok: true, message: "Logo enregistre." };
}

export async function removeBrandLogo(kind: BrandLogoKind, projectId?: string): Promise<{ ok: boolean; message: string }> {
  const supabase = await createClient();

  if (!supabase) {
    return { ok: false, message: "Supabase n'est pas configure." };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, message: "Connexion requise." };
  }

  if (kind === "company") {
    const { data: profile } = await supabase.from("profiles").select("company_logo_url").eq("id", user.id).single();
    await deleteStoredUrl(supabase, user.id, profile?.company_logo_url);
    const { error } = await supabase.from("profiles").update({ company_logo_url: null }).eq("id", user.id);
    if (error) return { ok: false, message: error.message };
  } else if (kind === "project") {
    const { data: profile } = await supabase.from("profiles").select("project_logo_url").eq("id", user.id).single();
    await deleteStoredUrl(supabase, user.id, profile?.project_logo_url);
    const { error } = await supabase.from("profiles").update({ project_logo_url: null }).eq("id", user.id);
    if (error) return { ok: false, message: error.message };
  } else if (kind === "site") {
    if (!projectId) return { ok: false, message: "Projet manquant." };
    const { data: project } = await supabase
      .from("projects")
      .select("logo_url, owner_id")
      .eq("id", projectId)
      .single();

    if (!project || project.owner_id !== user.id) {
      return { ok: false, message: "Projet introuvable ou acces refuse." };
    }

    await deleteStoredUrl(supabase, user.id, project.logo_url);
    const { error } = await supabase.from("projects").update({ logo_url: null }).eq("id", projectId).eq("owner_id", user.id);
    if (error) return { ok: false, message: error.message };
  }

  revalidateBrandPaths(kind === "site" ? projectId : undefined);
  return { ok: true, message: "Logo supprime." };
}
