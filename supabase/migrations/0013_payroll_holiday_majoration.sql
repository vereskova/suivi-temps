-- Suggested "Maj. jours fériés" bonus in the Paie view was a flat euro amount
-- with no visible basis. The source workbook's own column note for that field
-- was "jours fériés réellement travaillés × taux × 100%" — so express it as a
-- configurable percentage of one day's base pay, matching majoration_hs25/50.
alter table payroll_parameters add column if not exists majoration_jour_ferie numeric(4,3) not null default 1.00;
