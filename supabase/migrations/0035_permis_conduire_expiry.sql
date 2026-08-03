-- Permis de conduire was added without expiry tracking, but that's wrong
-- for a BTP company: heavy-vehicle categories (PL, SPL) require periodic
-- medical fitness renewal, and foreign licences often have their own
-- validity window. Bring it in line with titre_visa/passeport/habilitation/
-- autorisation_travail — both an issue date (for the filename) and an
-- expiry date (feeds the Échéances overview like the others).
update document_categories
set requires_expiry = true, requires_issue_date = true
where code = 'permis_conduire';
