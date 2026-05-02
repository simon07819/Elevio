import { PassengerRequestShell } from "@/components/PassengerRequestShell";
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
        <PassengerRequestShell
          project={project}
          floors={floors}
          currentFloor={currentFloor}
          elevators={elevators}
        />
      </section>
    </main>
  );
}
