-- Ouvre la vue "Primes & Bonus" (PayrollExtrasView) à comptable (accès complet,
-- déjà prévu côté RLS depuis payroll_extras/0074 et le Банк качества/0084 —
-- il ne manquait que pointage_entries en INSERT pour l'attribution des jours
-- via la grille de présence directement dans cette vue) et à rh_readonly
-- (lecture seule uniquement — le rôle n'a jamais eu de droit d'écriture nulle
-- part, l'UI y est donc purement consultative aussi). Confirmé avec
-- l'utilisatrice, 29/09/2026.

-- comptable avait déjà select+update sur pointage_entries (0015) mais pas
-- insert — nécessaire pour "Remplir les jours vides" / le clic sur une case
-- de présence qui n'a pas encore de ligne.
create policy pointage_comptable_insert on pointage_entries for insert with check (
  current_role_name() = 'comptable'
);

-- rh_readonly : lecture seule sur tout ce que la vue affiche.
create policy payroll_runs_rh_readonly_select on payroll_runs for select using (
  current_role_name() = 'rh_readonly'
);
create policy payroll_extras_rh_readonly_select on payroll_extras for select using (
  current_role_name() = 'rh_readonly'
);
create policy pointage_rh_readonly_select on pointage_entries for select using (
  current_role_name() = 'rh_readonly'
);
create policy company_quality_bank_rh_readonly_select on company_quality_bank for select using (
  current_role_name() = 'rh_readonly'
);
