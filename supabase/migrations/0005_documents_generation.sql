-- Phase 4: document generation (contrats, NDA, attestations, lettres RH).
--
-- New employee fields needed to fill contract templates. `address`,
-- `birth_place`, `classification`, `weekly_hours` are no more sensitive than
-- what's already on `employees` (date_of_birth, phone) so they live there.
-- `monthly_gross_salary` goes in `employee_confidential` instead — same
-- row-vs-column RLS reasoning as RIB/Sécurité sociale: chefs have partial
-- SELECT on `employees` for their own team, and salary shouldn't leak through
-- that same row-level policy.

alter table employees add column if not exists address text;
alter table employees add column if not exists birth_place text;
alter table employees add column if not exists classification text;
alter table employees add column if not exists weekly_hours numeric(4,2);

alter table employee_confidential add column if not exists monthly_gross_salary numeric(9,2);

-- ── Company profile (singleton) — feeds the letterhead / signatory block on every generated document ──
create table company_settings (
  id                    uuid primary key default gen_random_uuid(),
  name                  text not null default 'VLADIS',
  legal_form            text not null default 'SASU',
  siret                 text not null default '890 841 844 00032',
  naf_code              text not null default '43.99B',
  address               text not null default '590 Chemin d''Engoudes, 31450 Baziège',
  signing_city          text not null default 'Baziège',
  representative_name   text not null default 'VORONINSKII Vladimir',
  representative_title  text not null default 'Président',
  convention_collective text not null default 'Convention Collective Nationale de la Métallurgie (3248)',
  updated_at            timestamptz not null default now()
);

insert into company_settings (id) values (gen_random_uuid());

create trigger company_settings_set_updated_at before update on company_settings
  for each row execute function set_updated_at();

alter table company_settings enable row level security;
create policy company_settings_admin_only on company_settings for all using (
  current_role_name() = 'rh_admin'
) with check (
  current_role_name() = 'rh_admin'
);

-- ── Audit log of generated documents ──
create table generated_documents (
  id             uuid primary key default gen_random_uuid(),
  employee_id    uuid not null references employees(id) on delete cascade,
  document_type  text not null,
  format         text not null,
  params         jsonb not null default '{}'::jsonb,
  generated_by   uuid references employees(id),
  created_at     timestamptz not null default now()
);

alter table generated_documents enable row level security;
create policy generated_documents_admin_only on generated_documents for all using (
  current_role_name() = 'rh_admin'
) with check (
  current_role_name() = 'rh_admin'
);

grant select, insert, update, delete on company_settings, generated_documents to authenticated, service_role;
