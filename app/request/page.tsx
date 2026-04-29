import Link from "next/link";
import { BrandLogo } from "@/components/BrandLogo";
import { RequestForm } from "@/components/RequestForm";
import { T } from "@/components/i18n/LanguageProvider";
import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";
import { getPublicRequestContext } from "@/lib/publicProject";

export default async function RequestPage({
  searchParams,
}: {
  searchParams: Promise<{ projectId?: string; floorToken?: string }>;
}) {
  const params = await searchParams;
  const { project, floors, currentFloor } = await getPublicRequestContext({
    projectId: params.projectId,
    floorToken: params.floorToken,
  });

  return (
    <main className="relative z-10 min-h-dvh bg-[#f4f5f7] text-slate-950">
      <section className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-3 py-3 pb-8">
        <div className="mb-3 shrink-0 rounded-[1.5rem] bg-slate-950 p-4 text-white shadow-xl">
          <BrandLogo size="sm" priority />
          <div className="mt-2 flex items-end justify-between gap-3">
            <div>
              <h1 className="text-2xl font-black leading-tight"><T k="request.title" /></h1>
              <p className="mt-1 text-sm font-semibold text-slate-300"><T k="request.detected" /></p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-2">
              <LanguageSwitcher />
              <Link href="/" className="rounded-full bg-white/10 px-3 py-2 text-xs font-black text-yellow-200">
                <T k="scan.start" />
              </Link>
            </div>
          </div>
        </div>

        <RequestForm project={project} floors={floors} currentFloor={currentFloor} />
      </section>
    </main>
  );
}
