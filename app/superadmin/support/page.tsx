import { requireSuperAdmin } from "@/lib/auth/superadmin";
import { getSiteSettings } from "@/lib/siteSettings";
import { SuperadminSupportEditor } from "@/components/superadmin/SuperadminSupportEditor";
import { getServerLocale, serverT } from "@/lib/i18nServer";

const SUPPORT_KEYS = [
  "support_email",
  "support_phone",
  "support_hours",
  "support_passenger_text",
  "support_operator_text",
  "support_faq_json",
  "support_safety_text",
  "support_data_text",
  "support_liability_text",
];

export default async function SuperadminSupportPage() {
  await requireSuperAdmin();
  const locale = await getServerLocale();
  const t = (key: Parameters<typeof serverT>[1]) => serverT(locale, key);
  const allSettings = await getSiteSettings();
  const settings = allSettings.filter((s) => SUPPORT_KEYS.includes(s.key));

  return (
    <>
      <h1 className="mb-2 text-2xl font-black text-white">{t("superadmin.supportContentTitle")}</h1>
      <p className="mb-6 text-sm text-slate-400">{t("superadmin.supportContentSubtitle")}</p>
      <SuperadminSupportEditor settings={settings} />
    </>
  );
}
