-- Two new roles for accounts that need to see the employee roster the same
-- restricted way 'comptable' does (read-only, RIB instead of the rest of
-- employee_confidential — no salary/sécu sociale/nationalité) without also
-- getting Paie:
--   rh_readonly   — Employés only.
--   commercial_rh — Commercial (same as 'commercial') + Employés.
-- Split into its own migration because Postgres won't let a new enum value
-- be used by policies in the same transaction it was added in (see 0016).
alter type app_role add value if not exists 'rh_readonly';
alter type app_role add value if not exists 'commercial_rh';
