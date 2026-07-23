-- New "rh" role: HR staff who need the Effectif + RH sidebar sections
-- (Employés, Médical, Formations, Tailles, Documents, Registre du personnel,
-- Organigramme, Cours de français, Dossier salarié) but not day-to-day
-- Pointage entry or Paie — narrower than rh_admin, which keeps full access
-- to everything. Its own migration: Postgres won't let a new enum value be
-- used by policies in the same transaction it was added in.
alter type app_role add value if not exists 'rh';
