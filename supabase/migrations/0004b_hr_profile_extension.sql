-- Phase 2 (partial): extend the employee profile with data ported from the
-- "! LISTE SALARIES.numbers" master file — identity/contract fields on
-- `employees`, and separate tables for genuinely sensitive data (RIB,
-- Sécurité sociale, residence permit) and specialized registers (medical
-- visits, training/certification matrix, PPE sizing).
--
-- Security note: employee_confidential, medical_visits, employee_trainings
-- and employee_equipment_sizes are rh_admin-only — deliberately NOT visible
-- to chefs even for their own team, unlike the base `employees` row. RLS in
-- Postgres is row-level, not column-level, so sensitive fields (RIB, SSN,
-- permit number) must live in a separate table rather than as extra columns
-- on `employees`, which chefs already have partial SELECT access to.

-- Run 0004a_bureau_role_values.sql BEFORE this file.

-- ── Non-sensitive profile fields, visible under the same rules as the rest of `employees` ──
alter table employees add column if not exists sex text;
alter table employees add column if not exists qualification text;
alter table employees add column if not exists contract_type text;
alter table employees add column if not exists job_title text;
alter table employees add column if not exists device_label text;

-- ── Sensitive 1:1 extension — RIB, Sécurité sociale, residence permit, etc. ──
create table employee_confidential (
  employee_id              uuid primary key references employees(id) on delete cascade,
  nationality              text,
  rib                      text,
  securite_sociale         text,
  status_ameli             text,
  carte_vitale             text,
  mutuelle                 text,
  residence_permit_type    text,
  residence_permit_number  text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create trigger employee_confidential_set_updated_at before update on employee_confidential
  for each row execute function set_updated_at();

alter table employee_confidential enable row level security;
create policy employee_confidential_admin_only on employee_confidential for all using (
  current_role_name() = 'rh_admin'
) with check (
  current_role_name() = 'rh_admin'
);

-- ── Medical visits (visite médicale du travail scheduling) ──
create table medical_visits (
  id               uuid primary key default gen_random_uuid(),
  employee_id      uuid not null references employees(id) on delete cascade,
  last_visit_date  date,
  next_visit_date  date,
  visit_subtype    text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create trigger medical_visits_set_updated_at before update on medical_visits
  for each row execute function set_updated_at();

alter table medical_visits enable row level security;
create policy medical_visits_admin_only on medical_visits for all using (
  current_role_name() = 'rh_admin'
) with check (
  current_role_name() = 'rh_admin'
);

-- ── Training / certification matrix ──
create table training_types (
  id         uuid primary key default gen_random_uuid(),
  code       text not null unique,
  label      text not null,
  mandatory  boolean not null default true
);

insert into training_types (code, label, mandatory) values
  ('SST', 'Sauveteur Secouriste du Travail', true),
  ('AIPR', 'AIPR / Opérateur (Aérien)', true),
  ('R408', 'R408 (Échafaudage fixe)', true),
  ('R431', 'R431 (Travail en Hauteur)', true),
  ('R446', 'R446 (Filets de sécurité grandes nappes)', true),
  ('R482', 'Autorisation Conduite R.482', true),
  ('R486A', 'Autorisation Conduite R.486A', true),
  ('BR_PV_BT', 'BR PV-BT', false);

create table employee_trainings (
  id                uuid primary key default gen_random_uuid(),
  employee_id       uuid not null references employees(id) on delete cascade,
  training_type_id  uuid not null references training_types(id),
  status            text not null default 'ko',
  updated_at        timestamptz not null default now(),
  unique (employee_id, training_type_id)
);

create trigger employee_trainings_set_updated_at before update on employee_trainings
  for each row execute function set_updated_at();

alter table training_types enable row level security;
create policy training_types_select on training_types for select using (
  auth.role() = 'authenticated'
);
create policy training_types_admin_write on training_types for all using (
  current_role_name() = 'rh_admin'
) with check (
  current_role_name() = 'rh_admin'
);

alter table employee_trainings enable row level security;
create policy employee_trainings_admin_only on employee_trainings for all using (
  current_role_name() = 'rh_admin'
) with check (
  current_role_name() = 'rh_admin'
);

-- ── PPE / uniform sizing ──
create table employee_equipment_sizes (
  employee_id  uuid primary key references employees(id) on delete cascade,
  chaussures   text,
  pantalon     text,
  tshirt       text,
  notes        text,
  updated_at   timestamptz not null default now()
);

create trigger employee_equipment_sizes_set_updated_at before update on employee_equipment_sizes
  for each row execute function set_updated_at();

alter table employee_equipment_sizes enable row level security;
create policy employee_equipment_sizes_admin_only on employee_equipment_sizes for all using (
  current_role_name() = 'rh_admin'
) with check (
  current_role_name() = 'rh_admin'
);

-- ── Grants (mirrors 0002_grants.sql — "Automatically expose new tables" stays off) ──
grant select, insert, update, delete on
  employee_confidential,
  medical_visits,
  training_types,
  employee_trainings,
  employee_equipment_sizes
to authenticated, service_role;
