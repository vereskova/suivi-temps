-- Tracks unpaid leave days (congé sans solde) alongside the paid congés
-- payés line — needed whenever an employee takes more days than they've
-- accrued, per the accountant's rule: paid days go through the retenue/
-- indemnité calculation, the rest must be reported separately as sans solde.
alter table conges_payes_line_items add column if not exists jours_conge_sans_solde numeric(5,2);
