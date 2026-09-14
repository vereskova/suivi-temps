-- Some employees (e.g. a category/role médecine du travail simply doesn't
-- apply to) shouldn't keep showing up as "Jamais visité" / "À renouveler"
-- and shouldn't generate Notifications reminders either. A simple flag,
-- same 1:1-per-employee pattern as can_substitute — not a medical_visits
-- row, since there's deliberately no visit to track for these people.
alter table employees add column if not exists medical_visit_exempt boolean not null default false;
alter table employees add column if not exists medical_visit_exempt_reason text;
