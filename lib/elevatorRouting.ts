import type { ActivePassenger, Direction, HoistRequest } from "@/types/hoist";

/** Requêtes ouverte cabine : haltes palier + destination pour borne de trajet. */
export type ShaftStopRequest = {
  from_sort_order: number;
  to_sort_order: number;
};

export function isBetween(target: number, start: number, end: number): boolean {
  return target >= Math.min(start, end) && target <= Math.max(start, end);
}

/** Étages de dépose encore à desservir pour les passagers à bord. */
export function pendingBoardedDestinations(currentSortOrder: number, activePassengers: ActivePassenger[]): number[] {
  const set = new Set<number>();
  const cur = Number(currentSortOrder);
  for (const p of activePassengers) {
    const t = Number(p.to_sort_order);
    if (t !== cur) {
      set.add(t);
    }
  }
  return [...set];
}

/**
 * Direction de service pour SCAN : état ascenseur si renseigné, sinon inférence depuis les déposes à bord.
 */
export function effectiveServiceDirection(
  currentSortOrder: number,
  elevatorDirection: Direction,
  activePassengers: ActivePassenger[],
): Direction {
  if (elevatorDirection !== "idle") {
    return elevatorDirection;
  }
  const pending = pendingBoardedDestinations(currentSortOrder, activePassengers);
  if (pending.length === 0) {
    return "idle";
  }
  const cur = Number(currentSortOrder);
  const above = pending.filter((t) => t > cur);
  const below = pending.filter((t) => t < cur);
  if (above.length > 0 && below.length === 0) {
    return "up";
  }
  if (below.length > 0 && above.length === 0) {
    return "down";
  }
  const nearest = pending.reduce((best, t) =>
    Math.abs(t - cur) < Math.abs(best - cur) ? t : best,
  );
  return nearest > cur ? "up" : nearest < cur ? "down" : "idle";
}

/** Prochain arrêt cabine (SCAN discret) dans le sens effectif, puis retournement. */
export function nextBoardedDropoffSortOrder(
  currentSortOrder: number,
  serviceDir: Direction,
  activePassengers: ActivePassenger[],
): number | null {
  const pending = pendingBoardedDestinations(currentSortOrder, activePassengers);
  if (pending.length === 0) {
    return null;
  }
  const cur = Number(currentSortOrder);

  if (serviceDir === "idle") {
    return pending.reduce((best, t) => (Math.abs(t - cur) < Math.abs(best - cur) ? t : best));
  }

  if (serviceDir === "up") {
    const ahead = pending.filter((t) => t > cur);
    if (ahead.length > 0) {
      return Math.min(...ahead);
    }
    const behind = pending.filter((t) => t < cur);
    return behind.length > 0 ? Math.max(...behind) : null;
  }

  const ahead = pending.filter((t) => t < cur);
  if (ahead.length > 0) {
    return Math.max(...ahead);
  }
  const behind = pending.filter((t) => t > cur);
  return behind.length > 0 ? Math.min(...behind) : null;
}

export function directionToward(fromSort: number, toSort: number): Direction {
  if (toSort > fromSort) {
    return "up";
  }
  if (toSort < fromSort) {
    return "down";
  }
  return "idle";
}

/**
 * Cabine au repos sans obligation de dépose : inférer un sens de desserte vers les haltes d’appel
 * pour que `targetForDirection` / scoring SCAN ne restent pas coincés sur « idle » (borne = étage courant).
 * Si la géométrie pointe vers une phase où aucune attente n’a le même sens de voyage, on prend la phase
 * opposée lorsqu’au moins une requête la matche — évite un pool directionnel vide (idle_blocked).
 */
export function inferPickupPhaseDirection(
  currentSortOrder: number,
  elevatorDirection: Direction,
  openRequests: { from_sort_order: number; direction: Direction }[],
): Direction {
  if (elevatorDirection !== "idle") {
    return elevatorDirection;
  }
  if (openRequests.length === 0) {
    return "idle";
  }
  const cur = Number(currentSortOrder);
  let nearestSo = Number(openRequests[0].from_sort_order);
  let nearestDist = Math.abs(nearestSo - cur);
  for (let i = 1; i < openRequests.length; i++) {
    const s = Number(openRequests[i].from_sort_order);
    const d = Math.abs(s - cur);
    if (d < nearestDist || (d === nearestDist && s < nearestSo)) {
      nearestSo = s;
      nearestDist = d;
    }
  }
  let geo: Direction;
  if (nearestSo > cur) {
    geo = "up";
  } else if (nearestSo < cur) {
    geo = "down";
  } else {
    return "idle";
  }

  const alignedCount = openRequests.filter((r) => r.direction === geo).length;
  if (alignedCount > 0) {
    return geo;
  }

  const opposite: Direction = geo === "up" ? "down" : "up";
  if (openRequests.some((r) => r.direction === opposite)) {
    return opposite;
  }

  return "idle";
}

export function pickupFromSortOnSegmentToDropoff(
  fromSort: number,
  currentSortOrder: number,
  nextDropSort: number,
): boolean {
  const travelDir = directionToward(currentSortOrder, nextDropSort);
  const cur = Number(currentSortOrder);
  const drop = Number(nextDropSort);
  const from = Number(fromSort);
  if (travelDir === "up") {
    return from > cur && from < drop;
  }
  if (travelDir === "down") {
    return from < cur && from > drop;
  }
  return false;
}

/** Haltes d’appel éligibles pour le SCAN (tie-break file). */
export type PickupScanCandidate = {
  from_sort_order: number;
  sequence_number: number;
};

function comparePickupCandidates(a: PickupScanCandidate, b: PickupScanCandidate, cur: number): PickupScanCandidate {
  const sa = Number(a.from_sort_order);
  const sb = Number(b.from_sort_order);
  const da = Math.abs(sa - cur);
  const db = Math.abs(sb - cur);
  if (da !== db) {
    return da < db ? a : b;
  }
  if (sa !== sb) {
    return sa < sb ? a : b;
  }
  return a.sequence_number <= b.sequence_number ? a : b;
}

/**
 * Prochain palier d’appel parmi des candidats capacité-OK :
 * d’abord les attentes au palier courant, sinon le palier le plus PROCHE dans `phaseDirection`
 * (le plus bas au-dessus en montée, le plus haut en dessous en descente). Le cerveau ne sort
 * qu’UN prochain arrêt à la fois — l’opérateur conduit jusque-là, ramasse, puis recalcule —
 * donc viser le palier le plus éloigné ferait sauter les arrêts intermédiaires.
 * Si `phaseDirection` est `idle`, palier le plus proche en distance absolue (tie-break séquence).
 */
export function nearestEligiblePickupFloorSCAN(
  currentSortOrder: number,
  phaseDirection: Direction,
  candidates: PickupScanCandidate[],
): number | null {
  if (candidates.length === 0) {
    return null;
  }

  const cur = Number(currentSortOrder);

  const atCurrent = candidates.filter((c) => Number(c.from_sort_order) === cur);
  if (atCurrent.length > 0) {
    return cur;
  }

  if (phaseDirection === "up") {
    const eligible = candidates.filter((c) => Number(c.from_sort_order) > cur);
    if (eligible.length === 0) {
      return null;
    }
    // Plus proche au-dessus = le plus bas des candidats au-dessus.
    const targetSort = Math.min(...eligible.map((c) => Number(c.from_sort_order)));
    return targetSort;
  }

  if (phaseDirection === "down") {
    const eligible = candidates.filter((c) => Number(c.from_sort_order) < cur);
    if (eligible.length === 0) {
      return null;
    }
    // Plus proche en dessous = le plus haut des candidats en dessous.
    const targetSort = Math.max(...eligible.map((c) => Number(c.from_sort_order)));
    return targetSort;
  }

  const winner = candidates.reduce((best, c) => comparePickupCandidates(c, best, cur));
  return Number(winner.from_sort_order);
}

/** Appels paliers sur le segment vers la prochaine dépose (exclut sens passager). */
export function openPickupsTowardNextDropoff<T extends { from_sort_order: number }>(
  openRequests: T[],
  currentSortOrder: number,
  nextDropSort: number,
): T[] {
  const cur = Number(currentSortOrder);
  return openRequests.filter(
    (r) =>
      Number(r.from_sort_order) === cur || pickupFromSortOnSegmentToDropoff(r.from_sort_order, currentSortOrder, nextDropSort),
  );
}

/** Borne de trajet dans le sens donné (aligné dispatchEngine / hall collectif). */
export function targetForDirection(
  current: number,
  direction: Direction,
  waitingRequests: ShaftStopRequest[],
  activePassengers: ActivePassenger[],
): number {
  const requestStops = waitingRequests.flatMap((request) => [request.from_sort_order, request.to_sort_order]);
  const passengerStops = activePassengers.map((passenger) => passenger.to_sort_order);
  const allStops = [...requestStops, ...passengerStops];

  if (direction === "up") {
    const eligible = allStops.filter((floor) => floor >= current);
    return eligible.length > 0 ? Math.max(current, ...eligible) : current;
  }

  if (direction === "down") {
    const eligible = allStops.filter((floor) => floor <= current);
    return eligible.length > 0 ? Math.min(current, ...eligible) : current;
  }

  return current;
}

/** Borne depuis tous les arrêts shaft (file complète), avec direction effective — pour assignation multi-cabines. */
export function routeLimitForElevator(currentSort: number, effectiveDir: Direction, shaftStopSortOrders: number[]): number {
  if (shaftStopSortOrders.length === 0 || effectiveDir === "idle") {
    return currentSort;
  }
  if (effectiveDir === "up") {
    const eligible = shaftStopSortOrders.filter((s) => s >= currentSort);
    return eligible.length > 0 ? Math.max(currentSort, ...eligible) : currentSort;
  }
  const eligible = shaftStopSortOrders.filter((s) => s <= currentSort);
  return eligible.length > 0 ? Math.min(currentSort, ...eligible) : currentSort;
}

export function hoistQueueToActivePassengersBoarded(queue: HoistRequest[], floorSort: (floorId: string) => number): ActivePassenger[] {
  return queue
    .filter((r) => r.status === "boarded")
    .map((request) => ({
      requestId: request.id,
      from_floor_id: request.from_floor_id,
      to_floor_id: request.to_floor_id,
      from_sort_order: floorSort(request.from_floor_id),
      to_sort_order: floorSort(request.to_floor_id),
      passenger_count: request.passenger_count,
      boarded_at: request.updated_at,
    }));
}

export function hoistQueueToShaftRequests(queue: HoistRequest[], floorSort: (floorId: string) => number): ShaftStopRequest[] {
  return queue.map((request) => ({
    from_sort_order: floorSort(request.from_floor_id),
    to_sort_order: floorSort(request.to_floor_id),
  }));
}

/**
 * Heuristique : étages parcourus (SCAN déposes) puis trajet jusqu’au palier d’appel.
 * Conservateur — ne compte pas les prises en route intermédiaires sur la file existante.
 */
export function estimateFloorsToReachPickup(
  currentSortOrder: number,
  elevatorDirection: Direction,
  boardedPassengers: ActivePassenger[],
  pickupSortOrder: number,
  maxSteps = 48,
): number {
  let cur = Number(currentSortOrder);
  let cost = 0;
  let boarded = boardedPassengers.map((p) => ({ ...p, to_sort_order: Number(p.to_sort_order) }));

  for (let step = 0; step < maxSteps; step++) {
    const dir = effectiveServiceDirection(cur, elevatorDirection, boarded);
    const pending = pendingBoardedDestinations(cur, boarded);
    if (pending.length === 0) {
      cost += Math.abs(Number(pickupSortOrder) - cur);
      return cost;
    }

    const nextDrop = nextBoardedDropoffSortOrder(cur, dir, boarded);
    if (nextDrop === null) {
      cost += Math.abs(Number(pickupSortOrder) - cur);
      return cost;
    }

    cost += Math.abs(nextDrop - cur);
    cur = nextDrop;
    boarded = boarded.filter((p) => Number(p.to_sort_order) !== cur);
  }

  cost += Math.abs(Number(pickupSortOrder) - cur);
  return cost;
}
