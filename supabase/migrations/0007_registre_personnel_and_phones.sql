-- Faithful copy of the "Registre unique du personnel" sheet from the source LISTE SALARIES
-- file — one row per hiring event (a returning employee gets multiple rows), independent of
-- the current `employees` snapshot. `employee_id` links back where a match was resolved, but
-- stays nullable since the register is an append-only legal log, not derived data.
create table registre_unique_personnel (
  id             uuid primary key default gen_random_uuid(),
  numero         integer,
  nom_prenom     text not null,
  date_entree    date,
  nationalite    text,
  date_naissance date,
  sexe           text,
  emploi         text,
  qualification  text,
  type_titre     text,
  numero_titre   text,
  type_contrat   text,
  temps_partiel  text,
  date_sortie    date,
  employee_id    uuid references employees(id),
  created_at     timestamptz not null default now()
);

alter table registre_unique_personnel enable row level security;
create policy registre_unique_personnel_admin_only on registre_unique_personnel for all using (
  current_role_name() = 'rh_admin'
) with check (
  current_role_name() = 'rh_admin'
);

-- Company/team phone assignments (the "telefon" sheet) — role-keyed in the source, so
-- employee_id/team_id stay nullable where the mapping wasn't unambiguous.
create table employee_phones (
  id                uuid primary key default gen_random_uuid(),
  role_label        text not null,
  has_work_phone    boolean not null default false,
  has_new_sim       boolean not null default false,
  phone_number      text,
  employee_id       uuid references employees(id),
  team_id           uuid references teams(id),
  created_at        timestamptz not null default now()
);

alter table employee_phones enable row level security;
create policy employee_phones_admin_only on employee_phones for all using (
  current_role_name() = 'rh_admin'
) with check (
  current_role_name() = 'rh_admin'
);

-- ── Grants (mirrors 0002_grants.sql — "Automatically expose new tables" stays off) ──
grant select, insert, update, delete on
  registre_unique_personnel,
  employee_phones
to authenticated, service_role;
