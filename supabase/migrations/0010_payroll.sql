-- Phase 3: payroll (Paie) — ports the net→brut reverse calculation from
-- VLADIS_с_итогом.xlsx (waterfall: repas → HS+25% → HS+50% → prime exceptionnelle).
-- The app only produces this input table for the accountant — it does not
-- generate an actual bulletin de paie.

create table payroll_parameters (
  id                    uuid primary key default gen_random_uuid(),
  taux_horaire_base     numeric(6,2) not null default 12.31,
  heures_normales_mois  numeric(6,2) not null default 151.67,
  majoration_hs25       numeric(4,3) not null default 0.25,
  majoration_hs50       numeric(4,3) not null default 0.50,
  taux_retenues         numeric(5,4) not null default 0.2197,
  exoneration_hs_fixe   numeric(6,2) not null default 72.40,
  tarif_repas_jour      numeric(6,2) not null default 30,
  max_jours_repas       integer not null default 22,
  max_hs25_heures       numeric(5,2) not null default 32,
  max_hs50_heures       numeric(5,2) not null default 8,
  updated_at            timestamptz not null default now()
);

insert into payroll_parameters (id) values (gen_random_uuid());

create trigger payroll_parameters_set_updated_at before update on payroll_parameters
  for each row execute function set_updated_at();

create table payroll_runs (
  id          uuid primary key default gen_random_uuid(),
  month       date not null unique,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger payroll_runs_set_updated_at before update on payroll_runs
  for each row execute function set_updated_at();

create table payroll_line_items (
  id                    uuid primary key default gen_random_uuid(),
  run_id                uuid not null references payroll_runs(id) on delete cascade,
  employee_id           uuid not null references employees(id) on delete cascade,
  net_souhaite          numeric(9,2) not null default 0,
  maj_jours_feries      numeric(9,2) not null default 0,
  jours_repas           integer not null default 0,
  hs25_heures           numeric(6,2) not null default 0,
  hs50_heures           numeric(6,2) not null default 0,
  prime_exceptionnelle  numeric(9,2) not null default 0,
  updated_at            timestamptz not null default now(),
  unique (run_id, employee_id)
);

create trigger payroll_line_items_set_updated_at before update on payroll_line_items
  for each row execute function set_updated_at();

alter table payroll_parameters enable row level security;
alter table payroll_runs enable row level security;
alter table payroll_line_items enable row level security;

create policy payroll_parameters_admin_only on payroll_parameters for all using (
  current_role_name() = 'rh_admin'
) with check (
  current_role_name() = 'rh_admin'
);

create policy payroll_runs_admin_only on payroll_runs for all using (
  current_role_name() = 'rh_admin'
) with check (
  current_role_name() = 'rh_admin'
);

create policy payroll_line_items_admin_only on payroll_line_items for all using (
  current_role_name() = 'rh_admin'
) with check (
  current_role_name() = 'rh_admin'
);

grant select, insert, update, delete on payroll_parameters, payroll_runs, payroll_line_items to authenticated, service_role;
