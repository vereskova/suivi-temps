-- Simplification du 29/09/2026 (confirmé avec l'utilisatrice) : Congés payés
-- devient un simple compteur de jours saisi à la main depuis le bulletin de
-- paie (comme Vacance jours), au lieu d'un montant calculé. Km/Péage/
-- Contrôle 1/2/3 ne sont plus utilisés par l'app (fusionnés dans Штраф /
-- retirés) — colonnes laissées en base, pas de perte de données historiques.
alter table payroll_extras add column if not exists conges_jours numeric(5,2);
