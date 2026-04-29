insert into projects (id, name, address, active)
values ('11111111-1111-1111-1111-111111111111', 'Tour Nord - Phase 2', '1280 rue de l''Acier, Montreal', true)
on conflict (id) do nothing;

insert into projects (id, name, address, active, archived_at)
values
  ('11111111-1111-1111-1111-111111111112', 'Tour Sud - Preparation', '420 avenue Beton, Montreal', false, null),
  ('11111111-1111-1111-1111-111111111113', 'Garage Est - Archive', '88 rue des Grues, Laval', false, now() - interval '15 days')
on conflict (id) do nothing;

insert into floors (id, project_id, label, sort_order, qr_token, access_code, active)
values
  ('20000000-0000-0000-0000-0000000000b2', '11111111-1111-1111-1111-111111111111', 'P2', -2, 'demo-b2', 'B2A7K9', true),
  ('20000000-0000-0000-0000-0000000000b1', '11111111-1111-1111-1111-111111111111', 'P1', -1, 'demo-b1', 'B1H8Q4', true),
  ('20000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-111111111111', 'RDC', 0, 'demo-rdc', 'RDC724', true),
  ('20000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', '1', 1, 'demo-1', 'E01K7P', true),
  ('20000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', '2', 2, 'demo-2', 'E02M8Q', true),
  ('20000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', '3', 3, 'demo-3', 'E03N9R', true),
  ('20000000-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111', '4', 4, 'demo-4', 'E04P2S', true),
  ('20000000-0000-0000-0000-000000000005', '11111111-1111-1111-1111-111111111111', '5', 5, 'demo-5', 'E05Q3T', true),
  ('20000000-0000-0000-0000-000000000006', '11111111-1111-1111-1111-111111111111', '6', 6, 'demo-6', 'E06R4U', true),
  ('20000000-0000-0000-0000-000000000007', '11111111-1111-1111-1111-111111111111', '7', 7, 'demo-7', 'E07S5V', true),
  ('20000000-0000-0000-0000-000000000008', '11111111-1111-1111-1111-111111111111', '8', 8, 'demo-8', 'E08T6W', true),
  ('20000000-0000-0000-0000-000000000009', '11111111-1111-1111-1111-111111111111', '9', 9, 'demo-9', 'E09U7X', true),
  ('20000000-0000-0000-0000-000000000010', '11111111-1111-1111-1111-111111111111', '10', 10, 'demo-10', 'E10V8Y', true),
  ('20000000-0000-0000-0000-000000000011', '11111111-1111-1111-1111-111111111111', '11', 11, 'demo-11', 'E11W9Z', true),
  ('20000000-0000-0000-0000-000000000012', '11111111-1111-1111-1111-111111111111', '12', 12, 'demo-12', 'E12X2A', true),
  ('20000000-0000-0000-0000-000000000013', '11111111-1111-1111-1111-111111111111', '13', 13, 'demo-13', 'E13Y3B', true),
  ('20000000-0000-0000-0000-000000000014', '11111111-1111-1111-1111-111111111111', '14', 14, 'demo-14', 'E14Z4C', true),
  ('20000000-0000-0000-0000-000000000015', '11111111-1111-1111-1111-111111111111', '15', 15, 'demo-15', 'E15A5D', true),
  ('20000000-0000-0000-0000-000000000016', '11111111-1111-1111-1111-111111111111', '16', 16, 'demo-16', 'E16B6E', true)
on conflict (project_id, sort_order) do nothing;

insert into elevators (id, project_id, name, current_floor_id, direction, capacity, current_load, active)
values (
  '33333333-3333-3333-3333-333333333333',
  '11111111-1111-1111-1111-111111111111',
  'Hoist Alpha',
  '20000000-0000-0000-0000-000000000002',
  'up',
  8,
  4,
  true
)
on conflict (id) do nothing;

insert into users (id, name, role, project_id)
values
  ('44444444-4444-4444-4444-444444444401', 'Admin chantier', 'admin', '11111111-1111-1111-1111-111111111111'),
  ('44444444-4444-4444-4444-444444444402', 'Operateur Alpha', 'operator', '11111111-1111-1111-1111-111111111111'),
  ('44444444-4444-4444-4444-444444444403', 'Equipe coffrage', 'passenger', '11111111-1111-1111-1111-111111111111')
on conflict (id) do nothing;

insert into requests (
  id,
  project_id,
  elevator_id,
  from_floor_id,
  to_floor_id,
  direction,
  passenger_count,
  original_passenger_count,
  remaining_passenger_count,
  split_required,
  priority,
  priority_reason,
  note,
  status,
  wait_started_at,
  created_at
)
values
  (
    '55555555-5555-5555-5555-555555555001',
    '11111111-1111-1111-1111-111111111111',
    null,
    '20000000-0000-0000-0000-000000000005',
    '20000000-0000-0000-0000-000000000012',
    'up',
    2,
    2,
    2,
    false,
    false,
    null,
    'Materiel leger',
    'pending',
    now() - interval '7 minutes',
    now() - interval '7 minutes'
  ),
  (
    '55555555-5555-5555-5555-555555555002',
    '11111111-1111-1111-1111-111111111111',
    null,
    '20000000-0000-0000-0000-000000000008',
    '20000000-0000-0000-0000-000000000000',
    'down',
    3,
    3,
    3,
    false,
    true,
    'Inspection securite urgente',
    null,
    'pending',
    now() - interval '4 minutes',
    now() - interval '4 minutes'
  ),
  (
    '55555555-5555-5555-5555-555555555003',
    '11111111-1111-1111-1111-111111111111',
    null,
    '20000000-0000-0000-0000-000000000002',
    '20000000-0000-0000-0000-000000000016',
    'up',
    7,
    7,
    7,
    false,
    false,
    null,
    'Equipe complete',
    'pending',
    now() - interval '12 minutes',
    now() - interval '12 minutes'
  ),
  (
    '55555555-5555-5555-5555-555555555004',
    '11111111-1111-1111-1111-111111111111',
    null,
    '20000000-0000-0000-0000-000000000000',
    '20000000-0000-0000-0000-000000000012',
    'up',
    11,
    11,
    11,
    true,
    false,
    null,
    'Groupe trop grand, plusieurs passages requis',
    'pending',
    now() - interval '19 minutes',
    now() - interval '19 minutes'
  )
on conflict (id) do nothing;

insert into request_events (request_id, event_type, message, created_by)
values
  ('55555555-5555-5555-5555-555555555001', 'created', 'Demande recue depuis QR etage 5.', null),
  ('55555555-5555-5555-5555-555555555002', 'created', 'Priorite securite signalee.', null),
  ('55555555-5555-5555-5555-555555555004', 'created', 'Groupe trop grand, split recommande.', null);

insert into operator_messages (project_id, elevator_id, message)
values
  ('11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333', 'Arrivee dans 2 minutes. Preparez le groupe.');
