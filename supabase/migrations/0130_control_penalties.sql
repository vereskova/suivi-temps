-- Журнал штрафов контролёра : une ligne par erreur relevée lors d'un contrôle de chantier
-- (date du contrôle, chantier, équipe, position du справочник, montant). Saisie depuis /controle ;
-- l'API écrit en même temps la part de chaque membre dans payroll_extras (Штраф контроль + raison).
create table if not exists control_penalties (
  id                uuid primary key default gen_random_uuid(),
  created_at        timestamptz not null default now(),
  -- toutes les lignes envoyées d'un seul coup pour un même contrôle partagent le même batch_id
  batch_id          uuid not null,
  inspection_date   date not null,
  site              text not null,
  team_id           uuid not null references teams(id),
  catalog_code      text,
  stage             text not null,
  description       text not null,
  severity          text,
  unit              text not null default 'fixed',
  qty               numeric(8,2) not null default 1,
  unit_amount       numeric(9,2) not null default 0,
  team_amount       numeric(9,2) not null default 0,
  divisor           numeric(4,1) not null default 3,
  share_each        numeric(9,2) not null default 0,
  note              text,
  photo_paths       text[] not null default '{}',
  created_by_email  text not null,
  created_by_user   uuid,
  status            text not null default 'active' check (status in ('active', 'cancelled')),
  cancelled_at      timestamptz,
  cancelled_by_email text,
  cancel_reason     text
);

create table if not exists control_penalty_targets (
  id          uuid primary key default gen_random_uuid(),
  penalty_id  uuid not null references control_penalties(id) on delete cascade,
  employee_id uuid not null references employees(id),
  share       numeric(9,2) not null,
  unique (penalty_id, employee_id)
);

create index if not exists control_penalties_date_idx on control_penalties (inspection_date desc);
create index if not exists control_penalties_team_idx on control_penalties (team_id, inspection_date desc);
create index if not exists control_penalty_targets_emp_idx on control_penalty_targets (employee_id);

alter table control_penalties enable row level security;
alter table control_penalty_targets enable row level security;

-- Lecture pour les rôles RH/paie ; écriture réservée à rh_admin (le contrôleur passe par l'API serveur).
create policy control_penalties_read on control_penalties for select using (
  current_role_name() in ('rh_admin', 'rh', 'comptable', 'rh_readonly')
);
create policy control_penalties_admin_write on control_penalties for all using (
  current_role_name() = 'rh_admin'
) with check (
  current_role_name() = 'rh_admin'
);
create policy control_penalty_targets_read on control_penalty_targets for select using (
  current_role_name() in ('rh_admin', 'rh', 'comptable', 'rh_readonly')
);
create policy control_penalty_targets_admin_write on control_penalty_targets for all using (
  current_role_name() = 'rh_admin'
) with check (
  current_role_name() = 'rh_admin'
);

grant select, insert, update, delete on control_penalties, control_penalty_targets to authenticated, service_role;

-- Photos des erreurs (privé ; accès par URL signée générée côté serveur)
insert into storage.buckets (id, name, public) values ('control-photos', 'control-photos', false)
on conflict (id) do nothing;
