import { requireSuperAdmin } from "@/lib/auth/superadmin";
import { createClient } from "@/lib/supabase/server";
import { AccessCodeManager } from "@/components/superadmin/AccessCodeManager";
import type { AccessCodeRow } from "@/lib/superadminAccessCodes";

export const dynamic = "force-dynamic";

export default async function AccessCodesPage() {
  await requireSuperAdmin();

  const supabase = await createClient();
  let codes: AccessCodeRow[] = [];

  if (supabase) {
    const { data } = await supabase
      .from("access_codes")
      .select("*")
      .order("created_at", { ascending: false });
    codes = (data ?? []) as AccessCodeRow[];
  }

  return (
    <div>
      <h1 className="text-2xl font-black text-white mb-1">Codes d&apos;accès</h1>
      <p className="text-sm text-slate-400 mb-6">
        Créez et gérez les codes d&apos;accès pour attribuer des forfaits aux utilisateurs.
      </p>
      <AccessCodeManager codes={codes} />
    </div>
  );
}
