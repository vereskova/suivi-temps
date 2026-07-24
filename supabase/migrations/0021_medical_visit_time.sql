-- The next visit date alone isn't enough — RH also needs the scheduled
-- appointment time (Prevaly's own export only gives a date, so this is
-- entered by hand and must never be touched by the CSV import).
alter table medical_visits add column if not exists next_visit_time time;
