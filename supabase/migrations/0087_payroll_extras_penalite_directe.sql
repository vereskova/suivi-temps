-- Штраф контроль (déjà existant, penalite_montant) est la pénalité du
-- contrôleur qualité chantier — distincte des pénalités "прочее" (excès de
-- vitesse, casse de matériel…), qui n'ont rien à voir avec le contrôle
-- qualité et se déduisent toujours directement de la paie, pour n'importe
-- quel employé (confirmé avec l'utilisatrice, 29/09/2026).
alter table payroll_extras add column if not exists penalite_directe numeric(9,2) not null default 0;
alter table payroll_extras add column if not exists penalite_directe_raison text;
