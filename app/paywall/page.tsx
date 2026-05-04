import { PaywallClient } from "@/components/billing/PaywallClient";

export const metadata = { title: "Elevio — Plans & tarifs" };

export default function PaywallPage() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      <PaywallClient />
    </main>
  );
}
