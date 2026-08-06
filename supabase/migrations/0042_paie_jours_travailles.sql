-- Pay is now prorated from days actually worked against the employee's own
-- reference net salary, instead of always assuming a full month worked —
-- see lib/payroll/compute.ts. Existing/unfilled rows (jours_travailles=0 or
-- salaire_base_net null) keep computing exactly as before, so nothing
-- already saved changes retroactively until these are filled in for a line.

-- Rarely-changed reference figure per employee, not per payroll run — hence
-- a column on employees, not payroll_line_items. Same access as the rest of
-- employees (rh_admin/rh/comptable already handle other payroll figures).
alter table employees add column if not exists salaire_base_net numeric(9,2);

-- "Jours repas" becomes a computed output of the waterfall (see
-- computePayrollLine) rather than a free-typed input — this is the new
-- input that replaces it in that role.
alter table payroll_line_items add column if not exists jours_travailles integer not null default 0;

-- Standard working days in a full month, used to turn salaire_base_net (a
-- monthly figure) into a daily rate. Matches the existing
-- heures_normales_mois convention (151.67h ÷ 7h/jour ≈ 21.67 jours).
alter table payroll_parameters add column if not exists jours_ouvres_mois_standard numeric(5,2) not null default 21.67;
