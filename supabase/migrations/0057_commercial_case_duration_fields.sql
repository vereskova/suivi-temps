-- Lets a dossier carry the inputs the "Délais" norms calculator needs
-- (puissance, type de site, longueur de câble à tirer) so they're entered
-- once per dossier and drive both the suggested desired_end_date and the
-- auto-filled "Délai prévu" on matching checklist items (Main-d'œuvre,
-- Tirage AC), instead of living only in throwaway UI state.
alter table commercial_cases add column if not exists puissance_kwc numeric(8,2);
alter table commercial_cases add column if not exists type_site text
  check (type_site is null or type_site in ('agricole', 'advanced_energie', 'ombrier'));
alter table commercial_cases add column if not exists longueur_cable_m numeric(8,2);
