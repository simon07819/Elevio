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
  const { project, floors, currentFloor, elevators } = await getPublicRequestContext({
    projectId: params.projectId,
    floorToken: params.floorToken,
  });

  return (
    <main className="relative z-10 min-h-dvh bg-[#f4f5f7] text-slate-950">
      <section className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 py-5 pb-8">
        <header className="mb-5 flex shrink-0 items-center justify-between gap-3">
          <BrandLogo size="sm" tone="light" priority />
          <div className="flex shrink-0 items-center gap-2">
            <LanguageSwitcher light />
            <Link
              href="/"
              className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-900 shadow-sm ring-1 ring-slate-900/[0.04] transition hover:bg-slate-50"
            >
              <T k="scan.start" />
            </Link>
          </div>
        </header>

        <RequestForm
          project={project}
          floors={floors}
          currentFloor={currentFloor}
          elevators={elevators}
        />
      </section>
    </main>
  );
}
