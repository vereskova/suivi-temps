-- "Maj. jours fériés" is no longer a computed euro bonus fed into the
-- net→brut Paie formula — it's now just a count of public holidays worked,
-- tracked directly on payroll_line_items.maj_jours_feries (kept, just
-- reinterpreted). The company-wide majoration percentage parameter that used
-- to drive the old per-row € suggestion is no longer used anywhere.
alter table payroll_parameters drop column if exists majoration_jour_ferie;
