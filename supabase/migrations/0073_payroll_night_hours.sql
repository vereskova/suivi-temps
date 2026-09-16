-- Heures de nuit (21h-6h) saisies pour la ligne de paie du mois — la prime
-- de nuit (+15% du SMH conventionnel du groupe, voir lib/payroll/compute.ts)
-- est calculée à partir de ce nombre, jamais stockée directement.
alter table payroll_line_items add column if not exists heures_nuit numeric(6,2) not null default 0;
