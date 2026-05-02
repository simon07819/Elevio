/**
 * Simulation Monte Carlo du dispatch (services/elevatorBrain.ts).
 *
 * Usage :
 *   npm run simulate:hoist [--seed=12345] [--no-approach-lock]
 *
 * Verrou de palier (`approachFloorSort`, activé par défaut) : la cabine s’engage vers un
 * `nextFloorSortOrder` jusqu’au ramassage/dépose à ce palier, pour éviter l’oscillation en
 * temps discret quand le cerveau recalcule une cible à chaque tick. Coût possible : trajet
 * moins « réactif » qu’un recalcul continu. `--no-approach-lock` désactive ce verrou (expérimental,
 * peut replanter la simulation dans le vide).
 */

import { demoFloors } from "../lib/demoData";
import {
  computeBestElevatorForRequest,
  computeNextOperatorAction,
  enrichDispatchRequests,
} from "../services/elevatorBrain";
import type { ActivePassenger, Elevator, Floor, HoistRequest } from "../types/hoist";

const PROJECT_ID = "project-sim";
const NUM_USERS = 100;
const CAPACITY = 8;
const MAX_TICKS = 120_000;
const STALL_TICKS = 12_000;
/** Probabilité qu’une demande encore « pending » non assignée soit annulée à chaque tick. */
const CANCEL_PROB_PER_TICK = 0.0001;
const NOW_ISO = "2026-05-01T12:00:00.000Z";
/** Horodatage de référence pour `wait_started_at` / `nowMs` déterministes (ms depuis epoch). */
const SIM_EPOCH_MS = Date.parse(NOW_ISO);
/** Avance l’horloge du cerveau à chaque tick pour un âge d’attente cohérent avec la simulation. */
const MS_PER_SIM_TICK = 30_000;

function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function parseSeed(argv: string[]): number {
  const raw = argv.find((a) => a.startsWith("--seed="));
  if (raw) {
    return Number(raw.split("=")[1]) || 42;
  }
  return 42;
}

function parseApproachLock(argv: string[]): boolean {
  return !argv.includes("--no-approach-lock");
}

function floorsForSim(): Floor[] {
  return demoFloors.map((f) => ({ ...f, project_id: PROJECT_ID }));
}

function sortOrder(floors: Floor[], floorId: string): number {
  return Number(floors.find((f) => f.id === floorId)?.sort_order ?? 0);
}

function moveOneFloorToward(floors: Floor[], currentFloorId: string, targetSort: number): string {
  const sorted = [...floors].sort((a, b) => Number(a.sort_order) - Number(b.sort_order));
  const cur = sortOrder(floors, currentFloorId);
  const idx = sorted.findIndex((f) => f.id === currentFloorId);
  if (idx < 0) {
    return currentFloorId;
  }
  if (cur < targetSort) {
    return sorted[Math.min(idx + 1, sorted.length - 1)]!.id;
  }
  if (cur > targetSort) {
    return sorted[Math.max(idx - 1, 0)]!.id;
  }
  return currentFloorId;
}

function createElevators(count: number): Elevator[] {
  const list: Elevator[] = [];
  for (let i = 0; i < count; i++) {
    list.push({
      id: `elev-sim-${i + 1}`,
      project_id: PROJECT_ID,
      name: `Cabine ${i + 1}`,
      current_floor_id: "floor-0",
      direction: "idle",
      capacity: CAPACITY,
      current_load: 0,
      active: true,
      operator_session_id: `sess-${i}`,
      operator_session_started_at: NOW_ISO,
      operator_session_heartbeat_at: NOW_ISO,
      operator_user_id: null,
      manual_full: false,
    });
  }
  return list;
}

function randomRequest(id: string, seq: number, floors: Floor[], rnd: () => number): HoistRequest {
  const usable = floors.filter((f) => f.active);
  const fromIdx = Math.floor(rnd() * usable.length);
  let toIdx = Math.floor(rnd() * (usable.length - 1));
  if (toIdx >= fromIdx) toIdx++;
  const from = usable[fromIdx]!;
  const to = usable[toIdx]!;
  const fromSort = Number(from.sort_order);
  const toSort = Number(to.sort_order);
  const passenger_count = 1 + Math.floor(rnd() * Math.min(4, CAPACITY));
  const createdIso = new Date(SIM_EPOCH_MS + seq * 60_000).toISOString();

  return {
    id,
    project_id: PROJECT_ID,
    elevator_id: null,
    from_floor_id: from.id,
    to_floor_id: to.id,
    direction: toSort > fromSort ? "up" : "down",
    passenger_count,
    original_passenger_count: passenger_count,
    remaining_passenger_count: passenger_count,
    split_required: false,
    priority: rnd() < 0.06,
    priority_reason: null,
    note: null,
    status: "pending",
    sequence_number: seq,
    wait_started_at: createdIso,
    created_at: createdIso,
    updated_at: createdIso,
    completed_at: null,
  };
}

function sumBoardedLoad(requests: HoistRequest[], elevatorId: string): number {
  return requests
    .filter((r) => r.elevator_id === elevatorId && r.status === "boarded")
    .reduce((s, r) => s + r.passenger_count, 0);
}

type ScenarioResult = {
  operatorCount: number;
  ticksUsed: number;
  completed: number;
  cancelled: number;
  remaining: number;
  meanWaitTicks: number;
  meanWaitMinutes: number;
  capacityRespected: boolean;
  capacityViolations: number;
  inconsistencies: string[];
};

function activeStatuses(r: HoistRequest): boolean {
  return ["pending", "assigned", "arriving", "boarded"].includes(r.status);
}

function cloneRequests(template: HoistRequest[]): HoistRequest[] {
  return template.map((r) => ({ ...r }));
}

type RunScenarioOptions = {
  /** Par défaut true : fige le palier cible tant que le service n’est pas fait (évite l’oscillation discrète). */
  approachLock: boolean;
};

function runScenario(
  operatorCount: number,
  floors: Floor[],
  requests: HoistRequest[],
  rnd: () => number,
  opts: RunScenarioOptions,
): ScenarioResult {
  const { approachLock } = opts;
  const elevators = createElevators(operatorCount);
  const createdTick = new Map<string, number>();
  const completedAtTick = new Map<string, number>();
  for (const r of requests) {
    createdTick.set(r.id, 0);
  }

  const inconsistencies: string[] = [];
  /** Palier (sort_order) vers lequel la cabine se déplace jusqu’à arrivée — évite les oscillations si le cerveau recalcule un palier cible différent à chaque tick. */
  const approachFloorSort = approachLock ? new Map<string, number>() : null;
  let capacityViolations = 0;
  let lastProgressTick = 0;
  let ticksUsed = MAX_TICKS;

  outer: for (let tick = 0; tick < MAX_TICKS; tick++) {
    const terminal = requests.filter((r) => r.status === "completed" || r.status === "cancelled").length;
    if (terminal === NUM_USERS) {
      ticksUsed = tick + 1;
      break;
    }

    if (!requests.some(activeStatuses)) {
      ticksUsed = tick + 1;
      break;
    }

    if (tick - lastProgressTick > STALL_TICKS) {
      inconsistencies.push(`Arrêt après ${tick} ticks : aucune progression depuis ${STALL_TICKS} ticks.`);
      ticksUsed = tick + 1;
      break outer;
    }

    for (const r of requests) {
      if (r.status !== "pending" || r.elevator_id) continue;
      if (rnd() < CANCEL_PROB_PER_TICK) {
        r.status = "cancelled";
        r.completed_at = NOW_ISO;
        lastProgressTick = tick;
      }
    }

    const pendingUnassigned = requests
      .filter((r) => r.status === "pending" && !r.elevator_id)
      .sort((a, b) => a.sequence_number - b.sequence_number);
    const nowMs = SIM_EPOCH_MS + tick * MS_PER_SIM_TICK;
    for (const req of pendingUnassigned) {
      const assign = computeBestElevatorForRequest({
        newRequest: {
          id: req.id,
          from_floor_id: req.from_floor_id,
          to_floor_id: req.to_floor_id,
          direction: req.direction,
          passenger_count: req.passenger_count,
          priority: req.priority,
          wait_started_at: req.wait_started_at,
        },
        elevators,
        activeRequests: requests.filter((x) => x.elevator_id && activeStatuses(x)),
        projectFloors: floors,
        nowMs,
      });
      if (assign.elevatorId) {
        req.elevator_id = assign.elevatorId;
        req.status = "assigned";
        lastProgressTick = tick;
      }
    }

    const nEl = elevators.length;
    const rotateStart = tick % nEl;
    for (let k = 0; k < nEl; k++) {
      const el = elevators[(rotateStart + k) % nEl]!;
      const mine = requests.filter((r) => r.elevator_id === el.id && activeStatuses(r));
      if (mine.length === 0 && sumBoardedLoad(requests, el.id) === 0) {
        continue;
      }

      const dispatchList = enrichDispatchRequests(mine, floors);
      const onboardPassengers: ActivePassenger[] = mine
        .filter((r) => r.status === "boarded")
        .map((r) => ({
          requestId: r.id,
          from_floor_id: r.from_floor_id,
          to_floor_id: r.to_floor_id,
          from_sort_order: sortOrder(floors, r.from_floor_id),
          to_sort_order: sortOrder(floors, r.to_floor_id),
          passenger_count: r.passenger_count,
          boarded_at: r.updated_at,
        }));

      const elevatorState: Elevator = {
        ...el,
        current_load: sumBoardedLoad(requests, el.id),
      };

      const action = computeNextOperatorAction({
        elevator: elevatorState,
        assignedRequests: dispatchList,
        onboardPassengers,
        projectFloors: floors,
        prioritiesEnabled: true,
        capacityEnabled: true,
        nowMs,
      });

      const floorId = el.current_floor_id ?? "floor-0";
      const curSort = sortOrder(floors, floorId);
      let destSort = action.nextFloorSortOrder;
      if (approachFloorSort) {
        const lock = approachFloorSort.get(el.id);
        if (lock !== undefined && curSort !== lock) {
          destSort = lock;
        } else if (lock !== undefined && curSort === lock) {
          destSort = curSort;
        } else if (destSort !== null && curSort !== destSort) {
          approachFloorSort.set(el.id, destSort);
        }
      }

      if (destSort !== null && curSort !== destSort) {
        el.current_floor_id = moveOneFloorToward(floors, floorId, destSort);
        const afterSort = sortOrder(floors, el.current_floor_id);
        el.direction = afterSort < destSort ? "up" : afterSort > destSort ? "down" : "idle";
        lastProgressTick = tick;
        continue;
      }

      if (action.action === "pickup" && action.requestsToPickup.length > 0) {
        for (const p of action.requestsToPickup) {
          const row = requests.find((r) => r.id === p.id);
          if (!row || row.status === "boarded") continue;
          if (row.status !== "pending" && row.status !== "assigned" && row.status !== "arriving") continue;
          row.status = "boarded";
          row.updated_at = NOW_ISO;
        }
        const newLoad = sumBoardedLoad(requests, el.id);
        if (newLoad > CAPACITY) {
          capacityViolations++;
          inconsistencies.push(`t=${tick} ${el.id}: charge ${newLoad} > ${CAPACITY}`);
        }
        el.current_load = newLoad;
        el.direction = action.suggestedDirection;
        approachFloorSort?.delete(el.id);
        lastProgressTick = tick;
        continue;
      }

      if (action.action === "dropoff" && action.requestsToDropoff.length > 0) {
        for (const d of action.requestsToDropoff) {
          const row = requests.find((r) => r.id === d.requestId);
          if (!row || row.status !== "boarded") continue;
          row.status = "completed";
          row.completed_at = NOW_ISO;
          row.updated_at = NOW_ISO;
          completedAtTick.set(row.id, tick);
        }
        el.current_load = sumBoardedLoad(requests, el.id);
        el.direction = action.suggestedDirection;
        approachFloorSort?.delete(el.id);
        lastProgressTick = tick;
        continue;
      }

      if (action.action === "wait") {
        el.direction = action.suggestedDirection;
      }
    }
  }

  const completed = requests.filter((r) => r.status === "completed").length;
  const cancelled = requests.filter((r) => r.status === "cancelled").length;
  const remaining = requests.filter(activeStatuses).length;

  let sumWait = 0;
  for (const r of requests) {
    if (r.status !== "completed") continue;
    const done = completedAtTick.get(r.id);
    const start = createdTick.get(r.id) ?? 0;
    sumWait += (done ?? ticksUsed) - start;
  }
  const meanWaitTicks = completed > 0 ? sumWait / completed : 0;
  const TICK_MINUTES = 0.25;
  const meanWaitMinutes = meanWaitTicks * TICK_MINUTES;

  for (const el of elevators) {
    const load = sumBoardedLoad(requests, el.id);
    if (load > CAPACITY) {
      capacityViolations++;
      inconsistencies.push(`État final : ${el.id} charge ${load} > capacité.`);
    }
  }

  const capacityRespected = capacityViolations === 0;

  return {
    operatorCount,
    ticksUsed,
    completed,
    cancelled,
    remaining,
    meanWaitTicks,
    meanWaitMinutes,
    capacityRespected,
    capacityViolations,
    inconsistencies,
  };
}

function printRow(label: string, v: string | number) {
  console.log(`  ${label.padEnd(28)} ${v}`);
}

function main() {
  const argv = process.argv.slice(2);
  const seed = parseSeed(argv);
  const approachLock = parseApproachLock(argv);
  const genRnd = mulberry32(seed);
  const floors = floorsForSim();

  const template: HoistRequest[] = [];
  for (let i = 0; i < NUM_USERS; i++) {
    template.push(randomRequest(`req-${i}`, i + 1, floors, genRnd));
  }

  console.log("");
  console.log("╔════════════════════════════════════════════════════════════════╗");
  console.log("║  Simulation HOIST — 100 utilisateurs, étages demoData        ║");
  console.log(`║  Graine: ${String(seed).padEnd(47)} ║`);
  console.log(`║  Capacité cabine: ${CAPACITY} places`.padEnd(63) + "║");
  console.log(`║  Verrou palier (approach): ${(approachLock ? "oui" : "non").padEnd(37)} ║`);
  console.log("║  Cabines: ordre rotatif par tick                                 ║");
  console.log("║  Même jeu de 100 demandes pour chaque scénario (clone).       ║");
  console.log("╚════════════════════════════════════════════════════════════════╝");
  console.log("");

  for (const n of [1, 2, 3]) {
    const scenarioRnd = mulberry32(seed + n * 10007);
    const res = runScenario(n, floors, cloneRequests(template), scenarioRnd, { approachLock });
    console.log(`── Opérateurs (cabines) : ${n} ──`);
    printRow("Temps moyen (ticks)", res.meanWaitTicks.toFixed(1));
    printRow("Temps moyen (minutes ≈)", res.meanWaitMinutes.toFixed(1));
    printRow("Demandes complétées", res.completed);
    printRow("Demandes annulées", res.cancelled);
    printRow("Demandes restantes (actives)", res.remaining);
    printRow("Ticks simulés", res.ticksUsed);
    printRow("Capacité respectée", res.capacityRespected ? "oui" : "non");
    printRow("Violations capacité", res.capacityViolations);
    printRow("Incohérences / alertes", res.inconsistencies.length);
    if (res.inconsistencies.length > 0) {
      for (const line of res.inconsistencies.slice(0, 8)) {
        console.log(`    · ${line}`);
      }
      if (res.inconsistencies.length > 8) {
        console.log(`    · … (+${res.inconsistencies.length - 8})`);
      }
    }
    console.log("");
  }

  console.log("Note : 1 tick ≈ un pas de temps discret (déplacement d’un palier ou une action");
  console.log("ramasser/déposer). Temps moyen en minutes utilise un facteur indicatif (0,25 min/tick).");
  console.log("");
}

main();
