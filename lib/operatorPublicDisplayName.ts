export type OperatorProfileNameFields = {
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
};

/** Prenom + nom du profil inscription ; sinon partie locale du courriel (aligné avec activation cabine). */
export function operatorPublicDisplayName(profile: OperatorProfileNameFields): string | null {
  const combined = [profile.first_name, profile.last_name]
    .map((s) => (typeof s === "string" ? s.trim() : ""))
    .filter(Boolean)
    .join(" ")
    .trim();
  const fallback =
    profile.email && profile.email.includes("@") ? profile.email.split("@")[0]!.trim() : "";
  const raw = combined || fallback;
  if (!raw) return null;
  return raw.length > 120 ? raw.slice(0, 120) : raw;
}
