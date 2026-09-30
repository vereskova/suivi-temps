-- Annotation par jour dans la grille de "Primes & Bonus" — indépendante du
-- statut de présence (pointage_entries) : un commentaire libre sur
-- N'IMPORTE QUEL jour (pourquoi une absence, ce qui s'est passé...), et en
-- plus un montant optionnel sur les jours de week-end, qui alimente
-- automatiquement BONUS équipe pour les salariés d'équipe (confirmé avec
-- l'utilisatrice, 30/09/2026 : "суммы за выходные... в бонус экип для
-- команд", "комментарии на каждом дне").
create table payroll_day_notes (
  id           uuid primary key default gen_random_uuid(),
  employee_id  uuid not null references employees(id) on delete cascade,
  work_date    date not null,
  comment      text,
  amount       numeric(9,2),
  updated_at   timestamptz not null default now(),
  unique (employee_id, work_date)
);

create trigger payroll_day_notes_set_updated_at before update on payroll_day_notes
  for each row execute function set_updated_at();

alter table payroll_day_notes enable row level security;

create policy payroll_day_notes_admin_only on payroll_day_notes for all using (
  current_role_name() = 'rh_admin'
) with check (
  current_role_name() = 'rh_admin'
);

-- comptable : mêmes droits que sur payroll_extras/pointage_entries (accès
-- complet à Primes & Bonus, voir 0074/0089).
create policy payroll_day_notes_comptable on payroll_day_notes for all using (
  current_role_name() = 'comptable'
) with check (
  current_role_name() = 'comptable'
);

-- rh_readonly : lecture seule, comme le reste de Primes & Bonus (voir 0089).
create policy payroll_day_notes_rh_readonly_select on payroll_day_notes for select using (
  current_role_name() = 'rh_readonly'
);

grant select, insert, update, delete on payroll_day_notes to authenticated, service_role;
