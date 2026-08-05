-- Tracks two affiliation pipelines RH currently follows by hand on the CPAM
-- and Harmonie Mutuelle portals: getting an employee their social security
-- number (starts as a temporary NIA, becomes a permanent NIR), and setting
-- up their complementary insurance (Harmonie). Lives on employee_confidential
-- alongside the existing securite_sociale/status_ameli/mutuelle fields —
-- same 1:1-per-employee, rh_admin/rh-only data, no new table needed.
alter table employee_confidential add column if not exists assurance_maladie_statut text
  check (assurance_maladie_statut in (
    'brouillon', 'en_cours_traitement', 'en_attente_pieces', 'en_attente_traduction', 'nia_attribue', 'nir_attribue'
  ));

alter table employee_confidential add column if not exists harmonie_statut text
  check (harmonie_statut in ('en_cours', 'en_attente', 'abandonnee', 'cloturee'));

-- Free text, not a fixed list — Harmonie's own sub-status vocabulary isn't
-- fully known, unlike the CPAM pipeline above.
alter table employee_confidential add column if not exists harmonie_sous_statut text;
