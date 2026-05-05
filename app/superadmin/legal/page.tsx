import { requireSuperAdmin } from "@/lib/auth/superadmin";
import { SuperadminLegalEditor } from "@/components/superadmin/SuperadminLegalEditor";
import { getServerLocale, serverT } from "@/lib/i18nServer";

export const dynamic = "force-dynamic";

export default async function SuperadminLegalPage() {
  await requireSuperAdmin();
  const locale = await getServerLocale();
  const t = (key: Parameters<typeof serverT>[1]) => serverT(locale, key);

  return (
    <>
      <h1 className="text-2xl font-black text-white mb-2">{t("superadmin.legalContentTitle")}</h1>
      <p className="text-sm text-slate-400 mb-6">{t("superadmin.legalContentSubtitle")}</p>
      <SuperadminLegalEditor />
    </>
  );
}
