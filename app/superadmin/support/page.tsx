import { requireSuperAdmin } from "@/lib/auth/superadmin";
import { getSiteSettings } from "@/lib/siteSettings";
import { EDITABLE_SETTINGS } from "@/lib/siteSettingsConfig";
import { SuperadminSupportEditor } from "@/components/superadmin/SuperadminSupportEditor";

const SUPPORT_KEYS = [
  "support_email",
  "support_phone",
  "support_hours",
  "faq_content",
  "help_app_text",
  "legal_privacy_url",
  "legal_terms_url",
  "contact_enterprise_message",
];

export default async function SuperadminSupportPage() {
  await requireSuperAdmin();
  const allSettings = await getSiteSettings();
  const settings = allSettings.filter((s) => SUPPORT_KEYS.includes(s.key));

  return (
    <div>
      <h1 className="mb-2 text-3xl font-black text-white">Support</h1>
      <p className="mb-6 text-sm font-bold text-slate-400">
        Modifiez le contenu de la page /support. Les changements sont appliqués immédiatement.
      </p>
      <SuperadminSupportEditor settings={settings} />
    </div>
  );
}
