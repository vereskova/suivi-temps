-- VLADIS suivi-temps — Phase 0/1 schema: teams, employees, absence_types, pointage_entries
-- Run this once in the Supabase SQL Editor (or `supabase db push` if using the CLI).

create extension if not exists "pgcrypto";

-- ── Enums ────────────────────────────────────────────────────────────────
create type employee_category as enum ('chantier','bureau');
create type bureau_role as enum ('boss','coach','rh','comptable','assistant','planning','logement','control','production');
create type employee_status as enum ('active','on_leave','terminated');
create type app_role as enum ('chef','rh_admin','boss');

-- ── Core tables ──────────────────────────────────────────────────────────
create table teams (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  chef_employee_id  uuid,
  active            boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create table employees (
  id             uuid primary key default gen_random_uuid(),
  first_name     text not null, 
  last_name      text not null,
  category       employee_category not null,
  bureau_role    bureau_role,
  team_id        uuid references teams(id),
  phone          text,
  date_of_birth  date,
  email          text,
  auth_user_id   uuid references auth.users(id),
  hire_date      date,
  end_date       date,
  status         employee_status not null default 'active',
  archived_at    timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint bureau_role_only_for_bureau
    check (category = 'bureau' or bureau_role is null),
  constraint team_only_for_chantier
    check (category = 'chantier' or team_id is null)
);

alter table teams
  add constraint teams_chef_employee_fk
  foreign key (chef_employee_id) references employees(id);

create table user_roles (
  auth_user_id  uuid primary key references auth.users(id),
  role          app_role not null,
  employee_id   uuid references employees(id),
  created_at    timestamptz not null default now()
);

create table absence_types (
  id     uuid primary key default gen_random_uuid(),
  code   text not null unique,
  label  text not null
);

insert into absence_types (code, label) values
  ('cp', 'Congé payé'),
  ('maladie', 'Arrêt maladie'),
  ('rtt', 'RTT'),
  ('sans_solde', 'Absence sans solde'),
  ('ferie', 'Jour férié'),
  ('autre', 'Autre');

create table pointage_entries (
  id                uuid primary key default gen_random_uuid(),
  work_date         date not null,
  team_id           uuid not null references teams(id),
  employee_id       uuid not null references employees(id),
  submitted_by      uuid references employees(id),
  start_time        time,
  end_time          time,
  pause_minutes     int,
  overtime_minutes  int,
  is_absent         boolean not null default false,
  absence_type_id   uuid references absence_types(id),
  total_minutes     int,
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (work_date, employee_id)
);

create index pointage_entries_team_date_idx on pointage_entries (team_id, work_date);
create index pointage_entries_employee_date_idx on pointage_entries (employee_id, work_date);

-- ── Helper functions (used by RLS policies) ─────────────────────────────
create or replace function current_employee_id() returns uuid
language sql stable as $$
  select employee_id from user_roles where auth_user_id = auth.uid()
$$;

create or replace function current_role_name() returns text
language sql stable as $$
  select role::text from user_roles where auth_user_id = auth.uid()
$$;

create or replace function current_chef_team_id() returns uuid
language sql stable as $$
  select id from teams where chef_employee_id = current_employee_id()
$$;

-- ── updated_at triggers ──────────────────────────────────────────────────
create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger teams_set_updated_at before update on teams
  for each row execute function set_updated_at();
create trigger employees_set_updated_at before update on employees
  for each row execute function set_updated_at();
create trigger pointage_entries_set_updated_at before update on pointage_entries
  for each row execute function set_updated_at();

-- ── total_minutes computed server-side (replaces the sheet's Total/Color formulas) ──
create or replace function compute_pointage_total() returns trigger
language plpgsql as $$
declare
  worked_minutes int;
begin
  if new.is_absent then
    new.total_minutes := 0;
  elsif new.start_time is null or new.end_time is null then
    new.total_minutes := null;
  else
    worked_minutes := (extract(epoch from (new.end_time - new.start_time)) / 60)::int;
    if worked_minutes < 0 then
      worked_minutes := worked_minutes + 24 * 60; -- overnight shift safety net
    end if;
    worked_minutes := worked_minutes - coalesce(new.pause_minutes, 0);
    new.total_minutes := worked_minutes + coalesce(new.overtime_minutes, 0);
  end if;
  return new;
end;
$$;

create trigger pointage_entries_compute_total before insert or update on pointage_entries
  for each row execute function compute_pointage_total();

-- ── Row Level Security ───────────────────────────────────────────────────
alter table teams enable row level security;
alter table employees enable row level security;
alter table user_roles enable row level security;
alter table absence_types enable row level security;
alter table pointage_entries enable row level security;

-- teams: rh_admin sees/edits all; a chef sees only their own team
create policy teams_select on teams for select using (
  current_role_name() = 'rh_admin' or id = current_chef_team_id()
);
create policy teams_admin_write on teams for all using (
  current_role_name() = 'rh_admin'
) with check (
  current_role_name() = 'rh_admin'
);

-- employees: rh_admin sees/edits all; a chef sees their own team's roster + self
create policy employees_select on employees for select using (
  current_role_name() = 'rh_admin'
  or team_id = current_chef_team_id()
  or id = current_employee_id()
);
create policy employees_admin_write on employees for all using (
  current_role_name() = 'rh_admin'
) with check (
  current_role_name() = 'rh_admin'
);

-- user_roles: everyone can read their own row; only rh_admin manages roles
create policy user_roles_select_self on user_roles for select using (
  auth_user_id = auth.uid() or current_role_name() = 'rh_admin'
);
create policy user_roles_admin_write on user_roles for all using (
  current_role_name() = 'rh_admin'
) with check (
  current_role_name() = 'rh_admin'
);

-- absence_types: readable by any authenticated user, editable only by rh_admin
create policy absence_types_select on absence_types for select using (
  auth.role() = 'authenticated'
);
create policy absence_types_admin_write on absence_types for all using (
  current_role_name() = 'rh_admin'
) with check (
  current_role_name() = 'rh_admin'
);

-- pointage_entries: rh_admin full access; chef limited to their own team_id
create policy pointage_select on pointage_entries for select using (
  current_role_name() = 'rh_admin' or team_id = current_chef_team_id()
);
create policy pointage_insert on pointage_entries for insert with check (
  current_role_name() = 'rh_admin' or team_id = current_chef_team_id()
);
create policy pointage_update on pointage_entries for update using (
  current_role_name() = 'rh_admin' or team_id = current_chef_team_id()
) with check (
  current_role_name() = 'rh_admin' or team_id = current_chef_team_id()
);
create policy pointage_delete on pointage_entries for delete using (
  current_role_name() = 'rh_admin'
);
