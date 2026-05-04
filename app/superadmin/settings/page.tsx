import { requireSuperAdmin } from "@/lib/auth/superadmin";
import { SuperadminSettingsPanel } from "@/components/superadmin/SuperadminSettingsPanel";

export default async function SuperadminSettingsPage() {
  const { user } = await requireSuperAdmin();

  return (
    <div>
      <h1 className="mb-6 text-3xl font-black text-white">Paramètres</h1>
      <SuperadminSettingsPanel currentEmail={user.email ?? ""} />
    </div>
  );
}
