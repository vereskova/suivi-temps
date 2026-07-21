-- Phase 2: Dossier salarié — document storage per employee across the 8
-- categories the paper folders already use. Files live in the Storage
-- bucket `dossier-salarie` (created separately via the Storage API), this
-- table is just the metadata index.

create table document_categories (
  code        text primary key,
  label       text not null,
  sort_order  integer not null,
  sensitive   boolean not null default false
);

insert into document_categories (code, label, sort_order, sensitive) values
  ('documents_personnels', 'Documents personnels', 1, true),
  ('contrat',              'Contrat',              2, false),
  ('medical_sante',        'Médical / Santé',      3, true),
  ('entretien',            'Entretien',            4, false),
  ('formation',            'Formation',            5, false),
  ('archive',              'Archive',              6, false),
  ('bulletin_paie',        'Bulletin de paie',     7, false),
  ('rupture',              'Rupture / Sortie',     8, false);

create table employee_documents (
  id             uuid primary key default gen_random_uuid(),
  employee_id    uuid not null references employees(id) on delete cascade,
  category_code  text not null references document_categories(code),
  file_name      text not null,
  storage_path   text not null unique,
  file_size      bigint,
  mime_type      text,
  uploaded_by    uuid references employees(id),
  created_at     timestamptz not null default now()
);

alter table document_categories enable row level security;
alter table employee_documents enable row level security;

create policy document_categories_read_all on document_categories for select using (
  auth.role() = 'authenticated'
);

create policy employee_documents_admin_only on employee_documents for all using (
  current_role_name() = 'rh_admin'
) with check (
  current_role_name() = 'rh_admin'
);

grant select on document_categories to authenticated, service_role;
grant select, insert, update, delete on employee_documents to authenticated, service_role;

-- ── Storage RLS — bucket `dossier-salarie` is private; only rh_admin may read/write ──
create policy dossier_salarie_admin_only on storage.objects for all using (
  bucket_id = 'dossier-salarie' and current_role_name() = 'rh_admin'
) with check (
  bucket_id = 'dossier-salarie' and current_role_name() = 'rh_admin'
);
