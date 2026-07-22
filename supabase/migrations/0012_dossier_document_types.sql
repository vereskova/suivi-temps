-- Replace the generic 8-category placeholder with the real document types RH
-- actually needs, matching the physical folders: each type can optionally
-- track an expiry date (titre de séjour, passeport, carte BTP), be restricted
-- to foreign employees only (titre de séjour / VISA), or be tied to a specific
-- hiring period (contrat / DPAE / rupture — an employee can be hired and let
-- go more than once, each cycle already gets its own row in
-- registre_unique_personnel, so documents for that cycle link to it instead
-- of duplicating dates).

alter table document_categories add column if not exists requires_expiry boolean not null default false;
alter table document_categories add column if not exists foreigners_only boolean not null default false;
alter table document_categories add column if not exists per_period boolean not null default false;

-- No real documents have been uploaded yet against the old 8 categories, so it's
-- safe to replace the set outright rather than migrate rows.
delete from document_categories;

insert into document_categories (code, label, sort_order, sensitive, requires_expiry, foreigners_only, per_period) values
  ('contrat',           'Contrat de travail',           1,  false, false, false, true),
  ('rib',               'RIB',                          2,  true,  false, false, false),
  ('assurance_maladie', 'Assurance Maladie',            3,  true,  false, false, false),
  ('medical_prevaly',   'Prevaly (médecine du travail)',4,  true,  false, false, false),
  ('titre_visa',        'Titre de séjour / VISA',       5,  true,  true,  true,  false),
  ('passeport',         'Passeport',                    6,  true,  true,  false, false),
  ('rupture',           'Rupture / Sortie',             7,  false, false, false, true),
  ('carte_btp',         'Carte BTP',                    8,  false, true,  false, false),
  ('carte_vitale',      'Carte Vitale',                 9,  true,  false, false, false),
  ('dpae',              'DPAE',                         10, false, false, false, true),
  ('photo',             'Photo',                        11, false, false, false, false),
  ('entretien',         'Entretien',                    12, false, false, false, false),
  ('formation',         'Formation',                    13, false, false, false, false),
  ('archive',           'Archive',                      14, false, false, false, false),
  ('bulletin_paie',     'Bulletin de paie',             15, false, false, false, false);

-- Per-document expiry (titre de séjour, passeport, carte BTP) — null for types
-- that don't apply. Overdue = valid_until < current_date.
alter table employee_documents add column if not exists valid_until date;

-- Links a contrat/dpae/rupture document to the specific hiring cycle it belongs
-- to, so an employee rehired multiple times gets a distinct document slot per
-- cycle instead of one shared "contrat" bucket.
alter table employee_documents add column if not exists registre_entry_id uuid references registre_unique_personnel(id) on delete set null;
