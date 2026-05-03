/**
 * Mock data for E2E tests — mirrors the real Supabase schema.
 * All IDs are deterministic so tests can assert specific values.
 */

export const MOCK_PROJECT_ID = "proj-e2e-001";
export const MOCK_FLOOR_RDC_ID = "floor-rdc-e2e";
export const MOCK_FLOOR_5_ID = "floor-5-e2e";
export const MOCK_FLOOR_10_ID = "floor-10-e2e";
export const MOCK_FLOOR_16_ID = "floor-16-e2e";
export const MOCK_ELEVATOR_ALPHA_ID = "elev-alpha-e2e";
export const MOCK_ELEVATOR_BETA_ID = "elev-beta-e2e";
export const MOCK_ADMIN_ID = "user-admin-e2e";
export const MOCK_OPERATOR1_ID = "user-op1-e2e";
export const MOCK_OPERATOR2_ID = "user-op2-e2e";
export const MOCK_SESSION1_ID = "sess-op1-e2e";
export const MOCK_SESSION2_ID = "sess-op2-e2e";
export const MOCK_REQUEST1_ID = "req-p1-e2e";
export const MOCK_REQUEST2_ID = "req-p2-e2e";

export const mockProject = {
  id: MOCK_PROJECT_ID,
  owner_id: MOCK_ADMIN_ID,
  name: "Tour Nord - E2E",
  address: "123 rue Test, Montreal",
  active: true,
  created_at: "2025-01-01T00:00:00Z",
  updated_at: "2025-01-01T00:00:00Z",
  archived_at: null,
  service_timezone: "America/Toronto",
  logo_url: null,
  priorities_enabled: true,
  capacity_enabled: true,
  configured: true,
  support_email: "support@elevio.test",
  support_phone: "+1-514-555-0100",
  floor_min: null,
  floor_max: null,
  default_language: "fr",
};

export const mockFloors = [
  { id: MOCK_FLOOR_RDC_ID, project_id: MOCK_PROJECT_ID, label: "RDC", sort_order: 0, active: true, qr_token: "QR-RDC" },
  { id: MOCK_FLOOR_5_ID, project_id: MOCK_PROJECT_ID, label: "5", sort_order: 5, active: true, qr_token: "QR-5" },
  { id: MOCK_FLOOR_10_ID, project_id: MOCK_PROJECT_ID, label: "10", sort_order: 10, active: true, qr_token: "QR-10" },
  { id: MOCK_FLOOR_16_ID, project_id: MOCK_PROJECT_ID, label: "16", sort_order: 16, active: true, qr_token: "QR-16" },
];

function makeElevator(id: string, name: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    project_id: MOCK_PROJECT_ID,
    name,
    current_floor_id: MOCK_FLOOR_RDC_ID,
    direction: "idle",
    capacity: 8,
    current_load: 0,
    active: true,
    operator_session_id: null,
    operator_session_started_at: null,
    operator_session_heartbeat_at: null,
    operator_user_id: null,
    operator_tablet_label: null,
    operator_display_name: null,
    service_start_time: "06:00:00",
    service_end_time: "18:00:00",
    manual_full: false,
    ...overrides,
  };
}

export const mockElevatorAlpha = makeElevator(MOCK_ELEVATOR_ALPHA_ID, "Hoist Alpha");
export const mockElevatorBeta = makeElevator(MOCK_ELEVATOR_BETA_ID, "Hoist Beta");
export const mockElevators = [mockElevatorAlpha, mockElevatorBeta];

export const mockAdminProfile = {
  id: MOCK_ADMIN_ID,
  email: "admin@elevio.test",
  first_name: "Admin",
  last_name: "E2E",
  company: "Elevio Test Corp",
  phone: "+1-514-555-0001",
  role: "admin",
};

export const mockOperator1Profile = {
  id: MOCK_OPERATOR1_ID,
  email: "operator1@elevio.test",
  first_name: "Jean",
  last_name: "Operateur",
  company: "Elevio Test Corp",
  phone: "+1-514-555-0002",
  role: "operator",
};

export const mockOperator2Profile = {
  id: MOCK_OPERATOR2_ID,
  email: "operator2@elevio.test",
  first_name: "Marie",
  last_name: "Operatrice",
  company: "Elevio Test Corp",
  phone: "+1-514-555-0003",
  role: "operator",
};

export const mockRequest1 = {
  id: MOCK_REQUEST1_ID,
  project_id: MOCK_PROJECT_ID,
  from_floor_id: MOCK_FLOOR_RDC_ID,
  to_floor_id: MOCK_FLOOR_10_ID,
  passenger_count: 2,
  priority: false,
  status: "pending",
  elevator_id: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  device_key: "device-p1",
  notes: null,
};

export const mockRequest2 = {
  id: MOCK_REQUEST2_ID,
  project_id: MOCK_PROJECT_ID,
  from_floor_id: MOCK_FLOOR_5_ID,
  to_floor_id: MOCK_FLOOR_16_ID,
  passenger_count: 1,
  priority: false,
  status: "pending",
  elevator_id: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  device_key: "device-p2",
  notes: null,
};
