-- Jours repas saisis à la main dans Paie (surtout pour le bureau, où le
-- calcul automatique à partir du Net souhaité ne convient pas). Null =
-- calcul automatique comme avant. Demandé le 08/10/2026.
alter table payroll_line_items add column if not exists jours_repas_manuel integer;
