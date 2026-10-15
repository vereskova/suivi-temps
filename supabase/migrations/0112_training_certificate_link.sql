-- Formations : lien explicite entre une case OK de la matrice et le certificat du Dossier salarié.
-- Demandé le 15/10/2026. Sans ce lien, la case verte cherchait le certificat par le nom du fichier.
alter table employee_trainings
  add column if not exists document_id uuid references employee_documents(id) on delete set null;
