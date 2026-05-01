import type {
  ActivePassenger,
  Elevator,
  EnrichedRequest,
  Floor,
  HoistRequest,
  HoistUser,
  Project,
} from "@/types/hoist";

const now = Date.now();
const minutesAgo = (minutes: number) => new Date(now - minutes * 60_000).toISOString();

export const demoProject: Project = {
  id: "project-demo-hoist",
  name: "Tour Nord - Phase 2",
  address: "1280 rue de l'Acier, Montreal",
  active: true,
  created_at: minutesAgo(1440),
  updated_at: minutesAgo(60),
  archived_at: null,
  logo_url: null,
  service_timezone: "America/Toronto",
  priorities_enabled: true,
  capacity_enabled: true,
};

export const demoProjects: Project[] = [
  demoProject,
  {
    id: "project-demo-south",
    name: "Tour Sud - Preparation",
    address: "420 avenue Beton, Montreal",
    active: false,
    created_at: minutesAgo(2880),
    updated_at: minutesAgo(240),
    archived_at: null,
    logo_url: null,
    service_timezone: "America/Toronto",
    priorities_enabled: true,
    capacity_enabled: true,
  },
  {
    id: "project-demo-archive",
    name: "Garage Est - Archive",
    address: "88 rue des Grues, Laval",
    active: false,
    created_at: minutesAgo(12000),
    updated_at: minutesAgo(3600),
    archived_at: minutesAgo(3600),
    logo_url: null,
    service_timezone: "America/Toronto",
    priorities_enabled: true,
    capacity_enabled: true,
  },
];

const baseFloors: Floor[] = [
  {
    id: "floor-b2",
    project_id: demoProject.id,
    label: "P2",
    sort_order: -2,
    qr_token: "demo-b2",
    access_code: "B2A7K9",
    active: true,
  },
  {
    id: "floor-b1",
    project_id: demoProject.id,
    label: "P1",
    sort_order: -1,
    qr_token: "demo-b1",
    access_code: "B1H8Q4",
    active: true,
  },
  {
    id: "floor-0",
    project_id: demoProject.id,
    label: "RDC",
    sort_order: 0,
    qr_token: "demo-rdc",
    access_code: "RDC724",
    active: true,
  },
];

const towerFloors: Floor[] = Array.from({ length: 16 }, (_, index) => {
  const floorNumber = index + 1;

  return {
    id: `floor-${floorNumber}`,
    project_id: demoProject.id,
    label: String(floorNumber),
    sort_order: floorNumber,
    qr_token: `demo-${floorNumber}`,
    access_code: `E${String(floorNumber).padStart(2, "0")}${["K7P", "M8Q", "N9R", "P2S", "Q3T", "R4U", "S5V", "T6W", "U7X", "V8Y", "W9Z", "X2A", "Y3B", "Z4C", "A5D", "B6E"][index]}`,
    active: true,
  };
});

export const demoFloors: Floor[] = [...baseFloors, ...towerFloors];

export const demoElevator: Elevator = {
  id: "elevator-alpha",
  project_id: demoProject.id,
  name: "Hoist Alpha",
  current_floor_id: "floor-2",
  direction: "up",
  capacity: 8,
  current_load: 4,
  active: true,
  operator_session_id: null,
  operator_session_started_at: null,
  operator_session_heartbeat_at: null,
  operator_user_id: null,
  operator_tablet_label: null,
  operator_display_name: "Marie Demo",
  service_start_time: "07:00:00",
  service_end_time: "15:00:00",
};

export const demoUsers: HoistUser[] = [
  { id: "user-admin", name: "Admin chantier", role: "admin", project_id: demoProject.id },
  { id: "user-operator", name: "Operateur Alpha", role: "operator", project_id: demoProject.id },
  { id: "user-passenger", name: "Equipe coffrage", role: "passenger", project_id: demoProject.id },
];

export const demoRequests: HoistRequest[] = [
  {
    id: "req-1001",
    project_id: demoProject.id,
    elevator_id: null,
    from_floor_id: "floor-5",
    to_floor_id: "floor-12",
    direction: "up",
    passenger_count: 2,
    original_passenger_count: 2,
    remaining_passenger_count: 2,
    split_required: false,
    priority: false,
    priority_reason: null,
    note: "Materiel leger",
    status: "pending",
    sequence_number: 1001,
    wait_started_at: minutesAgo(7),
    created_at: minutesAgo(7),
    updated_at: minutesAgo(7),
    completed_at: null,
  },
  {
    id: "req-1002",
    project_id: demoProject.id,
    elevator_id: null,
    from_floor_id: "floor-8",
    to_floor_id: "floor-0",
    direction: "down",
    passenger_count: 3,
    original_passenger_count: 3,
    remaining_passenger_count: 3,
    split_required: false,
    priority: true,
    priority_reason: "Inspection securite urgente",
    note: null,
    status: "pending",
    sequence_number: 1002,
    wait_started_at: minutesAgo(4),
    created_at: minutesAgo(4),
    updated_at: minutesAgo(4),
    completed_at: null,
  },
  {
    id: "req-1003",
    project_id: demoProject.id,
    elevator_id: null,
    from_floor_id: "floor-2",
    to_floor_id: "floor-16",
    direction: "up",
    passenger_count: 7,
    original_passenger_count: 7,
    remaining_passenger_count: 7,
    split_required: false,
    priority: false,
    priority_reason: null,
    note: "Equipe complete",
    status: "pending",
    sequence_number: 1003,
    wait_started_at: minutesAgo(12),
    created_at: minutesAgo(12),
    updated_at: minutesAgo(12),
    completed_at: null,
  },
  {
    id: "req-1004",
    project_id: demoProject.id,
    elevator_id: null,
    from_floor_id: "floor-0",
    to_floor_id: "floor-12",
    direction: "up",
    passenger_count: 11,
    original_passenger_count: 11,
    remaining_passenger_count: 11,
    split_required: true,
    priority: false,
    priority_reason: null,
    note: "Groupe trop grand, prendre en plusieurs passages",
    status: "pending",
    sequence_number: 1004,
    wait_started_at: minutesAgo(19),
    created_at: minutesAgo(19),
    updated_at: minutesAgo(19),
    completed_at: null,
  },
];

export const demoActivePassengers: ActivePassenger[] = [
  {
    requestId: "req-boarded-1",
    from_floor_id: "floor-0",
    to_floor_id: "floor-8",
    from_sort_order: 0,
    to_sort_order: 8,
    passenger_count: 4,
    boarded_at: minutesAgo(2),
  },
];

export function enrichRequests(requests = demoRequests, floors = demoFloors): EnrichedRequest[] {
  return requests.map((request) => ({
    ...request,
    from_floor: floors.find((floor) => floor.id === request.from_floor_id),
    to_floor: floors.find((floor) => floor.id === request.to_floor_id),
  }));
}
