-- Remove two categories nobody uses (guarded: only deletes a category if no
-- employee already has a document filed under it, so this can't silently
-- orphan real uploaded files via the employee_documents FK).
delete from document_categories
  where code in ('bulletin_paie', 'entretien')
  and not exists (select 1 from employee_documents ed where ed.category_code = document_categories.code);

-- Four categories RH actually needs: birth certificate and driving licence
-- (general, any employee), work authorization and VLS-TS validation receipt
-- (foreign employees only, alongside titre_visa/passeport). Autorisation de
-- travail carries its own validity period like titre_visa/passeport, so it
-- gets both an issue date and an expiry date; validation VLS-TS is a one-time
-- OFII stamp with no expiry of its own (the visa's own expiry is already
-- tracked under titre_visa) so it only asks for the date, like carte_btp.
insert into document_categories
  (code, label, sort_order, sensitive, requires_expiry, requires_issue_date, foreigners_only, per_period)
values
  ('acte_naissance',       'Acte de naissance',        17, true,  false, false, false, false),
  ('permis_conduire',      'Permis de conduire',       18, false, false, false, false, false),
  ('autorisation_travail', 'Autorisation de travail',  19, true,  true,  true,  true,  false),
  ('validation_vls_ts',    'Validation VLS-TS',        20, true,  false, true,  true,  false)
on conflict (code) do nothing;
