import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { T } from "@/components/i18n/LanguageProvider";
import { requireSuperadmin } from "@/lib/auth";
import { getSuperadminData } from "@/lib/superadmin";

export default async function SuperadminPage() {
  const { profile } = await requireSuperadmin();

  if (!profile) {
    return (
      <AppShell eyebrow={<T k="nav.superadmin" />} title={<T k="superadmin.deniedTitle" />} subtitle={<T k="superadmin.deniedSubtitle" />}>
        <div className="glass-panel rounded-[2rem] p-5 text-white">
          <ShieldAlert className="text-red-200" />
          <p className="mt-3 font-bold"><T k="superadmin.deniedBody" /></p>
          <Link href="/admin/projects" className="mt-4 inline-flex rounded-2xl bg-yellow-300 px-5 py-3 font-black text-slate-950">
            <T k="superadmin.backAdmin" />
          </Link>
        </div>
      </AppShell>
    );
  }

  const data = await getSuperadminData();

  return (
    <AppShell eyebrow={<T k="nav.superadmin" />} title={<T k="superadmin.title" />} subtitle={<T k="superadmin.subtitle" />}>
      <div className="grid gap-5">
        <section className="grid gap-4 md:grid-cols-3">
          <div className="glass-panel rounded-[2rem] p-5">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-400"><T k="superadmin.accounts" /></p>
            <p className="mt-2 text-4xl font-black text-white">{data.profiles.length}</p>
          </div>
          <div className="glass-panel rounded-[2rem] p-5">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-400"><T k="superadmin.projects" /></p>
            <p className="mt-2 text-4xl font-black text-white">{data.projects.length}</p>
          </div>
          <div className="glass-panel rounded-[2rem] p-5">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-400"><T k="superadmin.superadmins" /></p>
            <p className="mt-2 text-4xl font-black text-white">
              {data.profiles.filter((item) => item.account_role === "superadmin").length}
            </p>
          </div>
        </section>

        <section className="glass-panel rounded-[2rem] p-5">
          <h2 className="text-2xl font-black text-white"><T k="superadmin.adminAccounts" /></h2>
          <div className="mt-4 grid gap-3">
            {data.profiles.map((item) => (
              <article key={item.id} className="rounded-2xl bg-white/8 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xl font-black text-white">
                      {item.first_name} {item.last_name}
                    </p>
                    <p className="text-sm font-bold text-slate-300">{item.email}</p>
                    <p className="text-sm text-slate-400">
                      {item.company} - {item.phone}
                    </p>
                  </div>
                  <span className={item.account_role === "superadmin" ? "rounded-full bg-yellow-300 px-3 py-1 text-xs font-black text-slate-950" : "rounded-full bg-white/10 px-3 py-1 text-xs font-black text-slate-100"}>
                    {item.account_role}
                  </span>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="glass-panel rounded-[2rem] p-5">
          <h2 className="text-2xl font-black text-white"><T k="superadmin.projects" /></h2>
          <div className="mt-4 grid gap-3">
            {data.projects.map((project) => (
              <article key={project.id} className="rounded-2xl bg-white/8 p-4">
                <p className="text-xl font-black text-white">{project.name}</p>
                <p className="text-sm font-bold text-slate-300">{project.address || <T k="admin.noAddress" />}</p>
                <p className="mt-2 text-xs text-slate-500">
                  <T k="superadmin.ownerLabel" /> {project.owner_id ?? <T k="superadmin.unassigned" />}
                </p>
              </article>
            ))}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
