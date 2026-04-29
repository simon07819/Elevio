export type Direction = "up" | "down" | "idle";

export type UserRole = "passenger" | "operator" | "admin";

export type RequestStatus =
  | "pending"
  | "assigned"
  | "arriving"
  | "boarded"
  | "completed"
  | "cancelled";

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
  /** Per-site logo on QR posters; falls back to profile `project_logo_url` when null. */
  logo_url?: string | null;
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
  /** Nom affiche pour distinguer la tablette ; saisi a l'activation, efface a la liberation. */
  operator_tablet_label?: string | null;
  /** Local wall-clock service window (project.service_timezone). Postgres `time`. */
  service_start_time?: string | null;
  service_end_time?: string | null;
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
  message: string;
};

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
};

export type DispatchRecommendation = {
  nextFloor: Floor | null;
  nextFloorSortOrder: number | null;
  reason: string;
  requestsToPickup: DispatchRequest[];
  requestsToDropoff: ActivePassenger[];
  suggestedDirection: Direction;
  capacityWarnings: CapacityWarning[];
};

export type EnrichedRequest = HoistRequest & {
  from_floor?: Floor;
  to_floor?: Floor;
};
