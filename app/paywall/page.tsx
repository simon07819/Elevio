import { PaywallClient } from "@/components/billing/PaywallClient";
import { getCurrentUser } from "@/lib/auth";

export const metadata = { title: "Elevio — Plans & tarifs" };

export default async function PaywallPage() {
  const user = await getCurrentUser();

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      <PaywallClient userId={user?.id ?? ""} email={user?.email ?? ""} />
    </main>
  );
}
