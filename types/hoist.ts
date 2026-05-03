export type Direction = "up" | "down" | "idle";

export type UserRole = "passenger" | "operator" | "admin";

export type RequestStatus =
  | "pending"
  | "assigned"
  | "arriving"
  | "boarded"
  | "completed"
  | "cancelled";

/** Snapshot RPC `resume_passenger_request` (QR + id de demande). */
export type PassengerResumeSnapshot = {
  requestId: string;
  status: RequestStatus;
  waitStartedAt: string;
  fromFloorId: string;
  toFloorId: string;
  passengerCount: number;
};

/** Statuts affiches dans la file « mouvements » operateur jusqu’a la depose (inclut a bord). */
export const OPERATOR_MOVEMENT_QUEUE_STATUSES = ["pending", "assigned", "arriving", "boarded"] as const;

export function isOperatorMovementQueueStatus(status: RequestStatus): boolean {
  return OPERATOR_MOVEMENT_QUEUE_STATUSES.includes(status as (typeof OPERATOR_MOVEMENT_QUEUE_STATUSES)[number]);
}

/** Encore au palier : pas encore marque a bord — pour fallback pickup / boutons ramasser. */
export const OPERATOR_AWAITING_PICKUP_STATUSES = ["pending", "assigned", "arriving"] as const;

export function isOperatorAwaitingPickup(status: RequestStatus): boolean {
  return OPERATOR_AWAITING_PICKUP_STATUSES.includes(status as (typeof OPERATOR_AWAITING_PICKUP_STATUSES)[number]);
}

export type RequestEventType =
  | "created"
  | "assigned"
  | "arriving"
  | "boarded"
  | "partial_boarded"
  | "deferred"
  | "completed"
  | "cancelled"
  | "message";

export type Project = {
  id: string;
  owner_id?: string | null;
  name: string;
  address: string;
  active: boolean;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  /** IANA timezone for passenger dispatch hours (e.g. America/Toronto). */
  service_timezone?: string | null;
  /** Photo/logo on QR posters for this site; legacy fallback: profile `project_logo_url` when null. */
  logo_url?: string | null;
  /** When false, passenger/operator hide priority UI and dispatch ignores priority scoring. */
  priorities_enabled?: boolean;
  /** When false, dispatch ignores cabin capacity and does not split groups by capacity. */
  capacity_enabled?: boolean;
};

export type Floor = {
  id: string;
  project_id: string;
  label: string;
  sort_order: number;
  qr_token: string;
  access_code: string;
  active: boolean;
};

export type Elevator = {
  id: string;
  project_id: string;
  name: string;
  current_floor_id: string | null;
  direction: Direction;
  capacity: number;
  current_load: number;
  active: boolean;
  operator_session_id: string | null;
  operator_session_started_at: string | null;
  operator_session_heartbeat_at: string | null;
  operator_user_id: string | null;
  /** Etiquette auto-navigateur ou ancienne saisie ; affichee pour distinguer la tablette. */
  operator_tablet_label?: string | null;
  /** Prenom + nom du profil admin a l'activation tablette ; visible passagers QR. */
  operator_display_name?: string | null;
  /** Local wall-clock service window (project.service_timezone). Postgres `time`. */
  service_start_time?: string | null;
  service_end_time?: string | null;
  /** Operator-set capacity pause for material/tools: no new pickups until cleared. */
  manual_full?: boolean;
};

export type HoistUser = {
  id: string;
  name: string;
  role: UserRole;
  project_id: string | null;
};

export type HoistRequest = {
  id: string;
  project_id: string;
  elevator_id: string | null;
  from_floor_id: string;
  to_floor_id: string;
  direction: Exclude<Direction, "idle">;
  passenger_count: number;
  original_passenger_count: number;
  remaining_passenger_count: number;
  split_required: boolean;
  priority: boolean;
  priority_reason: string | null;
  note: string | null;
  status: RequestStatus;
  sequence_number: number;
  wait_started_at: string;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

export type RequestEvent = {
  id: string;
  request_id: string;
  event_type: RequestEventType;
  message: string | null;
  created_at: string;
  created_by: string | null;
};

export type OperatorMessage = {
  id: string;
  project_id: string;
  elevator_id: string | null;
  message: string;
  created_at: string;
};

export type ActivePassenger = {
  requestId: string;
  from_floor_id: string;
  to_floor_id: string;
  from_sort_order: number;
  to_sort_order: number;
  passenger_count: number;
  boarded_at?: string;
};

export type CapacityWarning = {
  requestId: string;
  type: "insufficient_remaining" | "group_exceeds_total" | "split_required";
  /** @deprecated Prefer `type` + i18n in UI */
  message: string;
};

export type DispatchRecommendationReason =
  | { kind: "idle_empty" }
  | { kind: "idle_blocked" }
  | { kind: "idle_manual_full" }
  | { kind: "dropoff_before_pickups"; passengers: number }
  | {
      kind: "pickup";
      atCurrentFloor: boolean;
      pickupLabel: string;
      passengerCount: number;
      destinationLabel: string;
      priority: boolean;
      /** Étages d'autres ramassages planifiés dans le même cycle, dans l'ordre du trajet. */
      upcomingPickupLabels?: string[];
      /** Séquence complète des déposes planifiées après ce ramassage (y compris intermédiaires
       *  issues des ramassages en chemin), dans l'ordre du trajet. */
      plannedDropoffLabels?: string[];
    }
  | { kind: "pickup_fallback"; passengerCount: number };

export type DispatchRequest = HoistRequest & {
  from_sort_order: number;
  to_sort_order: number;
};

export type DispatchInput = {
  currentFloor: Floor;
  direction: Direction;
  requests: DispatchRequest[];
  capacity: number;
  currentLoad: number;
  activePassengers: ActivePassenger[];
  /** Étages du projet pour libellés (RDC, etc.) dans les messages de dispatch. */
  floors?: Floor[];
  /** Default true. When false, priority flags do not affect recommendation scoring or messaging. */
  prioritiesEnabled?: boolean;
  /** Default true. When false, pickup/dropoff logic ignores capacity limits and warnings. */
  capacityEnabled?: boolean;
  /** Operator-set full pause: continue dropoffs, block pickups. */
  manualFull?: boolean;
};

export type DispatchRecommendation = {
  nextFloor: Floor | null;
  nextFloorSortOrder: number | null;
  /** Demande choisie par le score pour le ramassage ; null si dépose seule ou aucune action pickup. */
  primaryPickupRequestId: string | null;
  /** French fallback / logs ; UI should prefer `reasonDetail` + formatter when present. */
  reason: string;
  reasonDetail?: DispatchRecommendationReason;
  requestsToPickup: DispatchRequest[];
  requestsToDropoff: ActivePassenger[];
  suggestedDirection: Direction;
  capacityWarnings: CapacityWarning[];
};

export type EnrichedRequest = HoistRequest & {
  from_floor?: Floor;
  to_floor?: Floor;
};
