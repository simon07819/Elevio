import type { DispatchRequest, EnrichedRequest } from "@/types/hoist";

/** Ramassages encore au palier : aligné sur les statuts ouverts côté opérateur. */
export function pickupAwaitingRequestsFromRecommendation(
  requestsToPickup: DispatchRequest[],
  actionRequests: EnrichedRequest[],
  pendingPickupIds: ReadonlySet<string>,
): EnrichedRequest[] {
  const awaiting = new Set(["pending", "assigned", "arriving"]);
  const result: EnrichedRequest[] = [];
  const seen = new Set<string>();

  for (const dispatchReq of requestsToPickup) {
    if (seen.has(dispatchReq.id)) {
      continue;
    }
    seen.add(dispatchReq.id);
    const live = actionRequests.find((request) => request.id === dispatchReq.id);
    if (!live || pendingPickupIds.has(live.id)) {
      continue;
    }
    if (!awaiting.has(live.status)) {
      continue;
    }
    result.push(live);
  }

  return result;
}
