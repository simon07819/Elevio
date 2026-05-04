import { requireSuperAdmin } from "@/lib/auth/superadmin";
import { getSuperadminUsers } from "@/lib/superadmin";
import { SuperadminUserList } from "@/components/superadmin/SuperadminUserList";

export default async function SuperadminUsersPage() {
  await requireSuperAdmin();
  const users = await getSuperadminUsers();

  return (
    <div>
      <h1 className="mb-6 text-3xl font-black text-white">Comptes utilisateurs</h1>
      <SuperadminUserList users={users} />
    </div>
  );
}
