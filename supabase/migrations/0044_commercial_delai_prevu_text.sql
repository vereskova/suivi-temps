-- Replaces the "Délai prévu" date-range picker (planned_start_date /
-- planned_end_date) with a plain free-typed duration — the native date
-- inputs were unreliable to type into, and commercial doesn't need calendar
-- dates here, just an estimated duration in days/hours filled in manually
-- per task for now.
alter table commercial_case_items add column if not exists delai_prevu text;
