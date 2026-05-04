import { requireSuperAdmin } from "@/lib/auth/superadmin";
import { SuperadminLogViewer } from "@/components/superadmin/SuperadminLogViewer";

export default async function SuperadminLogsPage() {
  await requireSuperAdmin();

  return (
    <div>
      <h1 className="mb-6 text-3xl font-black text-white">Logs</h1>
      <SuperadminLogViewer />
    </div>
  );
}
