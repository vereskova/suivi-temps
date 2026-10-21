-- Переводы между бригадами : historique « à partir de telle date, ce salarié est dans telle équipe ».
-- Sert au Банк качества (штрафы и доли считаются по дням в каждой бригаде) et à la grille Primes & Bonus,
-- où le pointage d'un jour est enregistré dans l'équipe de CE jour (pas dans l'équipe actuelle).
-- Demandé le 21/10/2026. À la première saisie d'un transfert, la grille ajoute aussi une ligne de départ
-- (from_date 2000-01-01) avec l'équipe d'avant.
create table employee_team_moves (
  id           uuid primary key default gen_random_uuid(),
  employee_id  uuid not null references employees(id) on delete cascade,
  team_id      uuid not null references teams(id),
  from_date    date not null,
  created_by   text,
  created_at   timestamptz not null default now(),
  unique (employee_id, from_date)
);

create index employee_team_moves_employee_idx on employee_team_moves (employee_id, from_date);

alter table employee_team_moves enable row level security;

create policy employee_team_moves_admin_only on employee_team_moves for all using (
  current_role_name() = 'rh_admin'
) with check (
  current_role_name() = 'rh_admin'
);
create policy employee_team_moves_comptable on employee_team_moves for all using (
  current_role_name() = 'comptable'
) with check (
  current_role_name() = 'comptable'
);
-- lecture seule pour rh et rh_readonly (comme le reste de Primes & Bonus, voir 0089 / 0110).
create policy employee_team_moves_rh_select on employee_team_moves for select using (
  current_role_name() in ('rh', 'rh_readonly')
);

grant select, insert, update, delete on employee_team_moves to authenticated, service_role;
