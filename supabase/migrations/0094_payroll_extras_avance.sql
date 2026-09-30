-- Аванс — colonne purement informative, saisie à la main comme Congés
-- payés/Vacance, jamais incluse dans À payer. Existait déjà dans "часы
-- работы.numbers" (colonne "Аванс" du mois de septembre) mais n'avait
-- jamais été portée dans cette table. Confirmé avec l'utilisatrice,
-- 30/09/2026.
alter table payroll_extras add column if not exists avance numeric(9,2);
