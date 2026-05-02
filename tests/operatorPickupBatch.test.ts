import test from "node:test";
import assert from "node:assert/strict";
import { pickupAwaitingRequestsFromRecommendation } from "../lib/operatorPickupBatch";
import type { DispatchRequest, EnrichedRequest, HoistRequest } from "../types/hoist";

function enriched(request: HoistRequest): EnrichedRequest {
  return { ...request };
}

function dispatch(r: HoistRequest): DispatchRequest {
  return {
    ...r,
    from_sort_order: 0,
    to_sort_order: 1,
  };
}

test("pickupAwaitingRequestsFromRecommendation : 2 groupes au même palier", () => {
  const r1 = enriched({
    id: "a",
    project_id: "p",
    elevator_id: "e",
    from_floor_id: "rdc",
    to_floor_id: "5",
    direction: "up",
    passenger_count: 2,
    original_passenger_count: 2,
    remaining_passenger_count: 2,
    split_required: false,
    priority: false,
    priority_reason: null,
    note: null,
    status: "assigned",
    sequence_number: 1,
    wait_started_at: "2026-04-30T12:00:00.000Z",
    created_at: "2026-04-30T12:00:00.000Z",
    updated_at: "2026-04-30T12:00:00.000Z",
    completed_at: null,
  });
  const r2 = enriched({
    ...r1,
    id: "b",
    passenger_count: 3,
    original_passenger_count: 3,
    remaining_passenger_count: 3,
    sequence_number: 2,
  });
  const requestsToPickup: DispatchRequest[] = [dispatch(r1 as HoistRequest), dispatch(r2 as HoistRequest)];
  const pending = new Set<string>();

  const batch = pickupAwaitingRequestsFromRecommendation(requestsToPickup, [r1, r2], pending);
  assert.equal(batch.length, 2);
  assert.deepEqual(
    batch.map((r) => r.id),
    ["a", "b"],
  );
});

test("pickupAwaitingRequestsFromRecommendation : 3 groupes, ignore doublons et non ouverts", () => {
  const base = {
    project_id: "p",
    elevator_id: "e",
    from_floor_id: "rdc",
    to_floor_id: "5",
    direction: "up" as const,
    original_passenger_count: 1,
    remaining_passenger_count: 1,
    split_required: false,
    priority: false,
    priority_reason: null,
    note: null,
    wait_started_at: "2026-04-30T12:00:00.000Z",
    created_at: "2026-04-30T12:00:00.000Z",
    updated_at: "2026-04-30T12:00:00.000Z",
    completed_at: null,
  };
  const r1 = enriched({ ...base, id: "x", status: "assigned", passenger_count: 1, sequence_number: 1 } as HoistRequest);
  const r2 = enriched({ ...base, id: "y", status: "pending", passenger_count: 1, sequence_number: 2 } as HoistRequest);
  const r3 = enriched({ ...base, id: "z", status: "arriving", passenger_count: 1, sequence_number: 3 } as HoistRequest);
  const requestsToPickup: DispatchRequest[] = [
    dispatch(r1 as HoistRequest),
    dispatch(r2 as HoistRequest),
    dispatch(r3 as HoistRequest),
    dispatch(r1 as HoistRequest),
  ];

  const batch = pickupAwaitingRequestsFromRecommendation(requestsToPickup, [r1, r2, r3], new Set());
  assert.equal(batch.length, 3);
  assert.deepEqual(
    batch.map((r) => r.id),
    ["x", "y", "z"],
  );
});
