-- Primes & Bonus (PayrollExtrasView) en lecture seule pour le rôle rh.
-- Demandé le 14/10/2026. Mêmes tables et même périmètre que rh_readonly (voir 0089 / 0090) :
-- uniquement SELECT, aucune écriture (l'UI passe readOnly pour ce rôle).
create policy payroll_runs_rh_select on payroll_runs for select using (
  current_role_name() = 'rh'
);
create policy payroll_extras_rh_select on payroll_extras for select using (
  current_role_name() = 'rh'
);
create policy pointage_rh_select on pointage_entries for select using (
  current_role_name() = 'rh'
);
create policy company_quality_bank_rh_select on company_quality_bank for select using (
  current_role_name() = 'rh'
);
create policy payroll_day_notes_rh_select on payroll_day_notes for select using (
  current_role_name() = 'rh'
);
