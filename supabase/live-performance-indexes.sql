create index if not exists elevators_project_session_idx
  on elevators(project_id, operator_session_id);

create index if not exists requests_elevator_status_created_idx
  on requests(elevator_id, status, created_at desc);

notify pgrst, 'reload schema';
