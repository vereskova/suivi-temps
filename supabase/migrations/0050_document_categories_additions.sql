-- Two document types kept turning up during the Dossier salarié bulk
-- import with nowhere to go: payslips (bulletins de paie), and the
-- complementary health insurance (mutuelle, currently Harmonie Mutuelle) —
-- distinct from the mandatory assurance_maladie (CPAM/Ameli).
insert into document_categories (code, label, sort_order, sensitive) values
  ('bulletin_paie', 'Bulletin de paie', 21, false),
  ('mutuelle', 'Mutuelle santé', 22, true);
