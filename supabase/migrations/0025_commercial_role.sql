-- New restricted role for the commercial department: can log in and see only
-- the new client-checklist / devis-prep section — no employee data, Paie,
-- or RH documents. Must be its own migration: Postgres won't let a new enum
-- value be used by policies in the same transaction it was added in.
alter type app_role add value if not exists 'commercial';
