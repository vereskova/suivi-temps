-- Port of "часы работы.numbers" — the real, current logic confirmed with
-- the user (August 2026 as reference month): per-employee monthly bonus/
-- penalty/km/quality-bank line, feeding Paie instead of duplicating data
-- entry there. Jours is computed from real pointage_entries, not retyped.
create table payroll_extras (
  id                        uuid primary key default gen_random_uuid(),
  run_id                    uuid not null references payroll_runs(id) on delete cascade,
  employee_id               uuid not null references employees(id) on delete cascade,
  -- Ставка journalière propre à ce salarié (remplace le taux unique global).
  taux_journalier           numeric(7,2) not null default 0,
  -- BONUS d'équipe — calculé ailleurs (plusieurs facteurs), saisi ici tel quel.
  bonus_equipe              numeric(9,2) not null default 0,
  -- Штраф : montant signé (+ ajustement, - pénalité, comme dans la feuille
  -- d'origine) + raison, plutôt qu'un seul nombre sans contexte.
  penalite_montant          numeric(9,2) not null default 0,
  penalite_raison           text,
  vacance_jours             numeric(5,2) not null default 0,
  km                        numeric(7,2) not null default 0,
  peage                     numeric(7,2) not null default 0,
  controle_1                numeric(9,2) not null default 0,
  controle_2                numeric(9,2) not null default 0,
  controle_3                numeric(9,2) not null default 0,
  -- Null = reprendre automatiquement le БАНК qualité de fin du mois
  -- précédent (même employé) ; renseigné seulement pour corriger/amorcer.
  banque_ajustement_manuel  numeric(9,2),
  -- Snapshot du БАНК qualité de FIN de ce mois, écrit à chaque sauvegarde —
  -- lu tel quel comme point de départ du mois suivant, plutôt que de
  -- remonter toute la chaîne des mois précédents à chaque fois.
  banque_qualite_fin        numeric(9,2) not null default 0,
  updated_at                timestamptz not null default now(),
  unique (run_id, employee_id)
);

create trigger payroll_extras_set_updated_at before update on payroll_extras
  for each row execute function set_updated_at();

alter table payroll_extras enable row level security;

create policy payroll_extras_admin_only on payroll_extras for all using (
  current_role_name() = 'rh_admin'
) with check (
  current_role_name() = 'rh_admin'
);

create policy payroll_extras_comptable_select on payroll_extras for select using (
  current_role_name() = 'comptable'
);
create policy payroll_extras_comptable_insert on payroll_extras for insert with check (
  current_role_name() = 'comptable'
);
create policy payroll_extras_comptable_update on payroll_extras for update using (
  current_role_name() = 'comptable'
) with check (
  current_role_name() = 'comptable'
);

grant select, insert, update, delete on payroll_extras to authenticated, service_role;
