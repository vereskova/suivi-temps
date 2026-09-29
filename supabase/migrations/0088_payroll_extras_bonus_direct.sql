-- Symétrique de penalite_directe (0087) : un bonus ponctuel indépendant du
-- BONUS équipe/БАНК 3000, pour n'importe quel employé — notamment Bureau et
-- Contrôle & Formation, qui n'ont pas de BONUS équipe (confirmé avec
-- l'utilisatrice, 29/09/2026).
alter table payroll_extras add column if not exists bonus_direct numeric(9,2) not null default 0;
alter table payroll_extras add column if not exists bonus_direct_raison text;
