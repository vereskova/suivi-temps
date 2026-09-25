-- Lets RH mark a document category as "not applicable" for a given
-- employee (e.g. Formation for someone who never needed one, Permis de
-- conduire for someone who doesn't drive) instead of it sitting forever as
-- a red "Aucun document" gap. Per-period categories (contrat/dpae/rupture)
-- are marked per registre_unique_personnel row; other categories leave
-- registre_entry_id null. No unique constraint — the app checks before
-- insert/delete, same style as the rest of this file's tables. Access
-- mirrors employee_documents itself (0011/0017): rh_admin and rh only.
create table employee_document_not_applicable (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  category_code text not null references document_categories(code) on delete cascade,
  registre_entry_id uuid references registre_unique_personnel(id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by_email text
);

-- Set server-side, same pattern as employee_documents.uploaded_by_email
-- (0024) — not trusted from the client.
create or replace function set_document_not_applicable_created_by() returns trigger
language plpgsql security definer as $$
begin
  new.created_by_email := (select email from auth.users where id = auth.uid());
  return new;
end;
$$;

create trigger employee_document_not_applicable_set_created_by before insert on employee_document_not_applicable
  for each row execute function set_document_not_applicable_created_by();

create index employee_document_not_applicable_employee_idx
  on employee_document_not_applicable (employee_id);

alter table employee_document_not_applicable enable row level security;

create policy employee_document_not_applicable_admin_only on employee_document_not_applicable for all using (
  current_role_name() = 'rh_admin'
) with check (
  current_role_name() = 'rh_admin'
);
create policy employee_document_not_applicable_rh_all on employee_document_not_applicable for all using (
  current_role_name() = 'rh'
) with check (
  current_role_name() = 'rh'
);

grant select, insert, update, delete on employee_document_not_applicable to authenticated, service_role;
