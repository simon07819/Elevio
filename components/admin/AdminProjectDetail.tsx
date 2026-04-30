import Link from "next/link";
import type { ReactNode } from "react";
import { CheckCircle2, QrCode } from "lucide-react";
import { ProjectElevatorSettings } from "@/components/admin/ProjectElevatorSettings";
import { ProjectFloorEditor } from "@/components/admin/ProjectFloorEditor";
import { ProjectInfoPanel } from "@/components/admin/ProjectInfoPanel";
import { T } from "@/components/i18n/LanguageProvider";
import type { AdminProjectData } from "@/lib/adminProject";
import type { TranslationKey } from "@/lib/i18n";

export function AdminProjectDetail({ data }: { data: AdminProjectData }) {
  const activeFloors = data.floors.filter((floor) => floor.active).length;
  const setupSteps = [
    { label: "setup.info", done: Boolean(data.project.name) },
    { label: "setup.floors", done: activeFloors > 0 },
    { label: "setup.elevator", done: data.elevators.length > 0 },
    { label: "setup.signs", done: activeFloors > 0 },
  ] satisfies Array<{ label: TranslationKey; done: boolean }>;

  return (
    <div className="grid gap-5">
      <section className="glass-panel rounded-[2rem] p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.25em] text-yellow-200"><T k="setup.title" /></p>
            <h2 className="text-3xl font-black text-white">{data.project.name}</h2>
            <p className="mt-1 text-sm font-bold text-slate-400">
              <T k="setup.body" />
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {setupSteps.map((step) => (
              <div key={step.label} className="rounded-2xl bg-white/8 px-3 py-3 text-center">
                <CheckCircle2 className={step.done ? "mx-auto text-emerald-300" : "mx-auto text-slate-600"} size={18} />
                <p className="mt-1 text-xs font-black text-slate-200"><T k={step.label} /></p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <StepTitle number="1" title={<T k="setup.info" />} body={<T k="setup.infoBody" />} />
      <ProjectInfoPanel project={data.project} />

      <StepTitle number="2" title={<T k="setup.floors" />} body={<T k="setup.floorsBody" />} />
      <ProjectFloorEditor projectId={data.project.id} floors={data.floors} />

      <StepTitle number="3" title={<T k="setup.elevator" />} body={<T k="setup.elevatorBody" />} />
      <ProjectElevatorSettings projectId={data.project.id} elevators={data.elevators} />

      <StepTitle number="4" title={<T k="setup.signs" />} body={<T k="setup.signsBody" />} />
      <section>
        <div className="glass-panel rounded-[2rem] p-5">
          <div className="flex items-center gap-3">
            <span className="grid size-12 place-items-center rounded-2xl bg-yellow-300/15 text-yellow-200">
              <QrCode />
            </span>
            <div>
              <p className="text-xs font-black uppercase tracking-[0.25em] text-yellow-200"><T k="setup.signsQrEyebrow" /></p>
              <h2 className="text-2xl font-black text-white"><T k="setup.projectSigns" /></h2>
            </div>
          </div>
          <p className="mt-3 text-sm font-bold text-slate-400">
            <T k="setup.signsDescription" />
          </p>
          <Link
            href={`/admin/qrcodes?projectId=${data.project.id}`}
            className="touch-target mt-4 inline-flex rounded-2xl bg-yellow-300 px-5 py-3 font-black !text-slate-950 visited:!text-slate-950"
          >
            <T k="setup.openQrBundle" />
          </Link>
        </div>
      </section>
    </div>
  );
}

function StepTitle({ number, title, body }: { number: string; title: ReactNode; body: ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span className="grid size-10 place-items-center rounded-2xl bg-yellow-300 text-lg font-black text-slate-950">
        {number}
      </span>
      <div>
        <h2 className="text-2xl font-black text-white">{title}</h2>
        <p className="text-sm font-bold text-slate-400">{body}</p>
      </div>
    </div>
  );
}
