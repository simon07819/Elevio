import { ScanHome } from "@/components/ScanHome";

export const metadata = {
  title: "Elevio — Scanner QR passager",
  description: "Scannez le QR code de votre étage pour demander l'ascenseur de chantier.",
};

/**
 * Root page — renders the QR/scan page directly.
 * This IS the home page. No marketing landing page is ever served from `/`.
 * Capacitor native redirect is handled client-side inside ScanHome.
 */
export default function HomePage() {
  return <ScanHome />;
}
