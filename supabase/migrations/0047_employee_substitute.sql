-- Some bureau employees occasionally fill in for someone on a chantier team
-- for a single day (e.g. Formation/Production staff driving out to help).
-- This is purely an informational "eligible to substitute" flag, shown as a
-- badge in Employés/Organigramme — the actual per-day assignment already
-- works via pointage_entries.team_id, which has never been tied to the
-- employee's own permanent team_id or category.
alter table employees add column if not exists can_substitute boolean not null default false;

-- pointage_roster (0022_public_pointage.sql) only exposed chantier employees
-- to the anonymous field form — substitute-eligible bureau employees need to
-- be listable there too, so a foreman can add one to a team's day from the
-- field. Same 4 non-sensitive columns as before, no new grants needed.
create or replace view pointage_roster as
  select id, first_name, last_name, team_id, status
  from employees
  where category = 'chantier' or can_substitute = true;
