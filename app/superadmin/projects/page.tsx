import { requireSuperAdmin } from "@/lib/auth/superadmin";
import { getSuperadminProjects } from "@/lib/superadmin";
import { Badge } from "@/components/superadmin/Badge";

export default async function SuperadminProjectsPage() {
  await requireSuperAdmin();
  const projects = await getSuperadminProjects();

  return (
    <div>
      <h1 className="mb-6 text-3xl font-black text-white">Chantiers</h1>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 text-left text-xs font-black uppercase tracking-wider text-slate-400">
              <th className="pb-3 pr-4">Nom</th>
              <th className="pb-3 pr-4">Adresse</th>
              <th className="pb-3 pr-4">Propriétaire</th>
              <th className="pb-3 pr-4">Statut</th>
              <th className="pb-3">Créé</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {projects.map((p) => (
              <tr key={p.id}>
                <td className="py-3 pr-4 font-bold text-white">{p.name}</td>
                <td className="py-3 pr-4 text-slate-400">{p.address ?? "—"}</td>
                <td className="py-3 pr-4 text-xs text-slate-500 font-mono">{(p as {owner_id?: string}).owner_id?.slice(0,8) ?? "—"}</td>
                <td className="py-3 pr-4">
                  {p.active ? <Badge variant="green">Actif</Badge> : <Badge variant="red">Inactif</Badge>}
                </td>
                <td className="py-3 text-xs text-slate-500">
                  {new Date(p.created_at).toLocaleDateString("fr-CA")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {projects.length === 0 && (
        <p className="mt-8 text-center text-slate-500">Aucun chantier.</p>
      )}
    </div>
  );
}
