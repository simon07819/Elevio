import { requireSuperAdmin } from "@/lib/auth/superadmin";
import { SuperadminContentEditor } from "@/components/superadmin/SuperadminContentEditor";

export default async function SuperadminContentPage() {
  await requireSuperAdmin();

  return (
    <div>
      <h1 className="mb-6 text-3xl font-black text-white">Contenu du site</h1>
      <SuperadminContentEditor />
    </div>
  );
}
