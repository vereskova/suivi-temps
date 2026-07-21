-- Tracking for the "Французский" (French language classes) sheet. The source sheet was a
-- blank attendance template (roster + a full year of session dates, no marks filled in yet) —
-- this recreates that structure so attendance can actually be recorded going forward.
create table french_class_students (
  employee_id  uuid primary key references employees(id) on delete cascade,
  created_at   timestamptz not null default now()
);

create table french_class_sessions (
  id            uuid primary key default gen_random_uuid(),
  session_date  date not null unique,
  created_at    timestamptz not null default now()
);

-- "Н" (absent), "ДЗ" (homework done), "К" (contrôle/quiz passed) from the source sheet's
-- per-session sub-columns — nullable booleans since most sessions haven't happened yet.
create table french_class_attendance (
  session_id     uuid not null references french_class_sessions(id) on delete cascade,
  employee_id    uuid not null references employees(id) on delete cascade,
  absent         boolean,
  homework_done  boolean,
  control_done   boolean,
  updated_at     timestamptz not null default now(),
  primary key (session_id, employee_id)
);

create trigger french_class_attendance_set_updated_at before update on french_class_attendance
  for each row execute function set_updated_at();

alter table french_class_students enable row level security;
create policy french_class_students_admin_only on french_class_students for all using (
  current_role_name() = 'rh_admin'
) with check (
  current_role_name() = 'rh_admin'
);

alter table french_class_sessions enable row level security;
create policy french_class_sessions_admin_only on french_class_sessions for all using (
  current_role_name() = 'rh_admin'
) with check (
  current_role_name() = 'rh_admin'
);

alter table french_class_attendance enable row level security;
create policy french_class_attendance_admin_only on french_class_attendance for all using (
  current_role_name() = 'rh_admin'
) with check (
  current_role_name() = 'rh_admin'
);

grant select, insert, update, delete on
  french_class_students,
  french_class_sessions,
  french_class_attendance
to authenticated, service_role;
