import type { EnrichedRequest } from "@/types/hoist";
import { T } from "@/components/i18n/LanguageProvider";
import { RequestCard } from "@/components/operator/RequestCard";

export function MovementList({
  title,
  description,
  requests,
  capacity,
  remaining,
}: {
  title: string;
  description: string;
  requests: EnrichedRequest[];
  capacity: number;
  remaining: number;
}) {
  return (
    <section className="glass-panel rounded-[2rem] p-5">
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-white">{title}</h2>
          <p className="text-sm text-slate-400">{description}</p>
        </div>
        <span className="rounded-full bg-white/10 px-3 py-1 text-sm font-black">{requests.length}</span>
      </div>
      <div className="grid gap-3">
        {requests.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-white/15 p-6 text-center text-sm text-slate-400">
            <T k="common.noneGroup" />
          </div>
        ) : (
          requests.map((request) => (
            <RequestCard key={request.id} request={request} capacity={capacity} remaining={remaining} />
          ))
        )}
      </div>
    </section>
  );
}
