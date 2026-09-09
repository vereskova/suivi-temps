-- Tracks correspondence with the medecine-du-travail service (Prevaly): when
-- something was requested (a first visit, a renewal, adding a new hire...),
-- through which channel, and whether/when it was answered — independent of
-- medical_visits, since a request can exist before any visit is scheduled.
create table medical_visit_requests (
  id              uuid primary key default gen_random_uuid(),
  employee_id     uuid not null references employees(id) on delete cascade,
  subject         text not null,
  requested_via   text not null default 'prevaly',
  requested_at    date not null,
  status          text not null default 'en_attente',
  response_at     date,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint medical_visit_requests_via_check
    check (requested_via in ('prevaly', 'email', 'telephone')),
  constraint medical_visit_requests_status_check
    check (status in ('en_attente', 'repondu', 'planifie', 'termine'))
);

create trigger medical_visit_requests_set_updated_at before update on medical_visit_requests
  for each row execute function set_updated_at();

alter table medical_visit_requests enable row level security;
create policy medical_visit_requests_admin_only on medical_visit_requests for all using (
  current_role_name() = 'rh_admin'
) with check (
  current_role_name() = 'rh_admin'
);
