-- Même besoin que penalite_raison (0074) mais pour le BONUS équipe — pouvoir
-- noter pourquoi ce montant, pas seulement le montant lui-même.
alter table payroll_extras add column if not exists bonus_raison text;
