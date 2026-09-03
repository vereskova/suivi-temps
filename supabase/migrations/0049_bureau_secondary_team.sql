-- Some bureau staff (e.g. Boris/Production) are persistently associated
-- with one chantier team even though their role stays bureau — distinct
-- from employees.team_id (chantier-only, drives payroll/pointage grouping)
-- and from can_substitute (day-by-day, logged per pointage_entries row).
-- This is purely a display tag: no payroll/pointage code reads it, so it
-- can't accidentally pull a bureau employee into chantier headcount.
alter table employees add column if not exists secondary_team_id uuid references teams(id);
