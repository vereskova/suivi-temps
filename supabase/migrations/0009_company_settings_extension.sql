-- Corrects legal_form to match the real signed contracts ("VLADIS, Société par actions
-- simplifiée" — SAS, not SASU) and adds fields needed by the improved contrat bureau
-- template: the representative's sex (for "Monsieur"/"Madame" agreement) and the company's
-- mutuelle/prévoyance provider (same for all employees, referenced in every contract).
alter table company_settings add column if not exists representative_sex text not null default 'M';
alter table company_settings add column if not exists mutuelle_provider text not null default 'Harmonie Mutuelle';

update company_settings set legal_form = 'SAS' where legal_form = 'SASU';
