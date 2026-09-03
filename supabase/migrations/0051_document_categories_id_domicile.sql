-- Two more recurring document types found during the Dossier salarié
-- content review that had nowhere to go: EU national ID cards (Romanian/
-- Moldovan buletin, French CNI — not a passport, not a titre de séjour
-- since EU citizens don't need one), and proof-of-address documents
-- (attestation d'hébergement, utility bills used as justificatif de
-- domicile).
insert into document_categories (code, label, sort_order, sensitive) values
  ('carte_identite', 'Carte d''identité', 23, true),
  ('justificatif_domicile', 'Justificatif de domicile', 24, false);
