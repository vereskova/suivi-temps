-- New restricted role for the external accountant: can log in and see only
-- the Paie (payroll) admin view — no employee documents, medical records,
-- or registre du personnel. Must be its own migration: Postgres won't let a
-- new enum value be used by policies in the same transaction it was added in.
alter type app_role add value if not exists 'comptable';
