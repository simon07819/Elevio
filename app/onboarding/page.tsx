import { OnboardingFlow } from "@/components/mobile/OnboardingFlow";

export const metadata = {
  title: "Elevio — Créer un compte",
  description: "Créez votre compte Elevio et commencez à dispatcher vos ascenseurs de chantier.",
};

export default function OnboardingPage() {
  return <OnboardingFlow />;
}
