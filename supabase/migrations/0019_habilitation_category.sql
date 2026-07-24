-- New document category for annual/renewal-on-hire qualification documents
-- (habilitation électrique, CACES, travail en hauteur, etc.) — requires_expiry
-- so the upload flow prompts for a validity date, feeding the new
-- "Échéances" overview alongside titre de séjour/passeport/carte BTP/visites
-- médicales.
insert into document_categories (code, label, sort_order, sensitive, requires_expiry, foreigners_only, per_period)
values ('habilitation', 'Habilitation', 16, false, true, false, false)
on conflict (code) do nothing;
