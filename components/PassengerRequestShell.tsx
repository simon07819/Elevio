"use client";

"use client";

import { useCallback, useState } from "react";
import { BrandLogo } from "@/components/BrandLogo";
import { RequestForm } from "@/components/RequestForm";
import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";
import type { Elevator, Floor, Project } from "@/types/hoist";

export function PassengerRequestShell({
  project,
  floors,
  currentFloor,
  elevators,
}: {
  project: Project;
  floors: Floor[];
  currentFloor: Floor;
  elevators: Elevator[];
}) {
  const [hasActiveRequest, setHasActiveRequest] = useState(false);
  const handleActivePassengerSessionChange = useCallback((active: boolean) => {
    setHasActiveRequest(active);
  }, []);

  return (
    <>
      {!hasActiveRequest ? (
        <header className="mb-5 flex shrink-0 items-center justify-between gap-3">
          <BrandLogo size="sm" tone="light" priority />
          <div className="flex shrink-0 items-center gap-2">
            <LanguageSwitcher light />
          </div>
        </header>
      ) : null}

      <RequestForm
        project={project}
        floors={floors}
        currentFloor={currentFloor}
        elevators={elevators}
        onActivePassengerSessionChange={handleActivePassengerSessionChange}
      />
    </>
  );
}
