-- Tracks whether next_visit_date/next_visit_time were typed in by hand or
-- picked up automatically from a Prevaly "Convocation" e-mail, so the UI can
-- show a tooltip ("saisi à la main" vs "détecté dans un e-mail du ...") and
-- let RH open the matching correspondence for that employee. Convocation
-- e-mails are the one Prevaly message type with a fixed, reliably parseable
-- layout — the rest of the correspondence stays free text and is never
-- auto-applied.
alter table medical_visits add column if not exists next_visit_source text not null default 'manual';
alter table medical_visits add column if not exists next_visit_source_at timestamptz;
alter table medical_visits add column if not exists next_visit_source_subject text;

alter table medical_visits drop constraint if exists medical_visits_next_visit_source_check;
alter table medical_visits add constraint medical_visits_next_visit_source_check
  check (next_visit_source in ('manual', 'email'));
