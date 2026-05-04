import { HomeContent } from "@/components/public/HomeContent";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Elevio — Dispatch temps réel pour ascenseurs de chantier",
  description:
    "Gérez vos élévateurs et ascenseurs de chantier en temps réel. Dispatch intelligent, QR passager, terminal opérateur.",
};

export default function HomePage() {
  return <HomeContent />;
}
