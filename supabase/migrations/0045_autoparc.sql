-- Автопарк: fleet of vehicles + trailers, currently tracked only across
-- three spreadsheets and a folder of scanned documents. Vehicles and
-- trailers share one table (vehicle_type distinguishes them) since they
-- share every other concern here: documents, contrôle technique, insurance.
--
-- Insurance/leasing are flat "current value" columns, not a history table —
-- matches how they're already tracked (one row, overwritten on renewal);
-- old contracts stay recoverable as uploaded documents. Figures that aren't
-- cleanly known (insurance premium, leasing payment, warranty) are left
-- null here on purpose — see scripts/seed-autoparc.ts — rather than guessed.
create table vehicles (
  id                          uuid primary key default gen_random_uuid(),
  plate                       text not null unique,
  plate_old                   text,
  vin                         text,
  brand                       text,
  model                       text,
  vehicle_type                text not null default 'van'
                              check (vehicle_type in ('van', 'car', 'trailer', 'heavy_equipment', 'other')),
  assigned_label              text,
  team_id                     uuid references teams(id) on delete set null,
  status                      text not null default 'active'
                              check (status in ('active', 'sold', 'stolen', 'archived')),
  ownership_type              text check (ownership_type in ('leasing', 'credit', 'cash', 'rental')),
  mileage_km                  integer,
  mileage_updated_at          date,
  has_warranty                boolean,
  warranty_until              date,
  ct_due_date                 date,
  ct_appointment_at           timestamptz,
  insurer_name                text,
  insurance_contract_number   text,
  insurance_annual_premium    numeric(9,2),
  insurance_end_date          date,
  leasing_company             text,
  leasing_contract_number     text,
  leasing_monthly_payment     numeric(9,2),
  leasing_end_date            date,
  notes                       text,
  created_at                  timestamptz not null default now()
);

-- Standard 20-component maintenance checklist, per the Lux Motors service log.
create table vehicle_maintenance_components (
  code       text primary key,
  label      text not null,
  sort_order integer not null
);

insert into vehicle_maintenance_components (code, label, sort_order) values
  ('oil_engine',       'Замена масла ДВС с фильтром',     1),
  ('oil_gearbox',      'Замена масла КПП',                 2),
  ('filter_air',       'Фильтр воздушный',                 3),
  ('filter_cabin',     'Фильтр салона',                    4),
  ('filter_fuel',      'Фильтр топливный',                 5),
  ('brake_fluid',      'Тормозная жидкость',                6),
  ('antifreeze',       'Антифриз',                          7),
  ('power_steer_fluid','Жидкость гур',                      8),
  ('drive_belt',       'Ремень приводной с роликами',       9),
  ('timing_mechanism', 'Механизм ГРМ с помпой',            10),
  ('pads_front',       'Колодки перед',                    11),
  ('pads_rear',        'Колодки зад',                      12),
  ('discs_front',      'Диски перед с колодками',          13),
  ('discs_rear',       'Диски зад с колодками',            14),
  ('shocks_front',     'Амортизаторы перед',               15),
  ('shocks_rear',      'Амортизаторы зад',                 16),
  ('springs_front',    'Пружины перед',                    17),
  ('springs_rear',     'Пружины зад',                      18),
  ('wheel_bearing',    'Ступичный подшипник',              19),
  ('clutch',           'Сцепление',                         20);

create table vehicle_maintenance_visits (
  id          uuid primary key default gen_random_uuid(),
  vehicle_id  uuid not null references vehicles(id) on delete cascade,
  visit_date  date not null,
  mileage_km  integer,
  provider    text,
  notes       text,
  created_at  timestamptz not null default now()
);

create table vehicle_maintenance_visit_items (
  id             uuid primary key default gen_random_uuid(),
  visit_id       uuid not null references vehicle_maintenance_visits(id) on delete cascade,
  component_code text not null references vehicle_maintenance_components(code),
  done           boolean not null default false,
  unique (visit_id, component_code)
);

-- Document storage, mirroring employee_documents / dossier-salarie exactly.
create table vehicle_document_categories (
  code       text primary key,
  label      text not null,
  sort_order integer not null
);

insert into vehicle_document_categories (code, label, sort_order) values
  ('carte_grise',         'Carte grise / Тех паспорт',        1),
  ('coc',                 'COC',                               2),
  ('certificat_achat',    'Certificat d''achat',               3),
  ('immatriculation_fr',  'Immatriculation FR',                4),
  ('assurance',           'Assurance',                         5),
  ('leasing_financement', 'Leasing / Financement',             6),
  ('entretien_facture',   'Facture d''entretien',              7),
  ('sinistre',            'Sinistre',                          8),
  ('autre',               'Autre',                             9);

create table vehicle_documents (
  id               uuid primary key default gen_random_uuid(),
  vehicle_id       uuid not null references vehicles(id) on delete cascade,
  category_code    text not null references vehicle_document_categories(code),
  file_name        text not null,
  storage_path     text not null unique,
  file_size        bigint,
  mime_type        text,
  uploaded_by_email text,
  created_at       timestamptz not null default now()
);

-- Garages, tire shops, insurance broker, trailer dealer — currently scattered
-- across sheet notes ("Ремонт и обсл. автомобилей").
create table vehicle_service_providers (
  id        uuid primary key default gen_random_uuid(),
  name      text not null,
  category  text check (category in ('garage', 'pneus', 'assurance', 'remorques', 'autre')),
  address   text,
  phone     text,
  email     text,
  maps_url  text,
  notes     text
);

alter table vehicles enable row level security;
alter table vehicle_maintenance_components enable row level security;
alter table vehicle_maintenance_visits enable row level security;
alter table vehicle_maintenance_visit_items enable row level security;
alter table vehicle_document_categories enable row level security;
alter table vehicle_documents enable row level security;
alter table vehicle_service_providers enable row level security;

-- rh_admin-only for v1, same as Paie/Commercial/audit — can be opened to
-- 'rh' later in one line, same as was just done for HR-дашборды.
create policy vehicles_rh_admin_all on vehicles for all using (
  current_role_name() = 'rh_admin'
) with check (
  current_role_name() = 'rh_admin'
);
create policy vehicle_maintenance_components_read_all on vehicle_maintenance_components for select using (
  auth.role() = 'authenticated'
);
create policy vehicle_maintenance_visits_rh_admin_all on vehicle_maintenance_visits for all using (
  current_role_name() = 'rh_admin'
) with check (
  current_role_name() = 'rh_admin'
);
create policy vehicle_maintenance_visit_items_rh_admin_all on vehicle_maintenance_visit_items for all using (
  current_role_name() = 'rh_admin'
) with check (
  current_role_name() = 'rh_admin'
);
create policy vehicle_document_categories_read_all on vehicle_document_categories for select using (
  auth.role() = 'authenticated'
);
create policy vehicle_documents_rh_admin_all on vehicle_documents for all using (
  current_role_name() = 'rh_admin'
) with check (
  current_role_name() = 'rh_admin'
);
create policy vehicle_service_providers_rh_admin_all on vehicle_service_providers for all using (
  current_role_name() = 'rh_admin'
) with check (
  current_role_name() = 'rh_admin'
);

grant select, insert, update, delete on vehicles to authenticated, service_role;
grant select on vehicle_maintenance_components to authenticated, service_role;
grant select, insert, update, delete on vehicle_maintenance_visits to authenticated, service_role;
grant select, insert, update, delete on vehicle_maintenance_visit_items to authenticated, service_role;
grant select on vehicle_document_categories to authenticated, service_role;
grant select, insert, update, delete on vehicle_documents to authenticated, service_role;
grant select, insert, update, delete on vehicle_service_providers to authenticated, service_role;

-- Storage bucket `autopark-documents` is created separately via the Storage
-- API (same as `dossier-salarie` was) — private, only rh_admin may read/write.
create policy autopark_documents_rh_admin_storage on storage.objects for all using (
  bucket_id = 'autopark-documents' and current_role_name() = 'rh_admin'
) with check (
  bucket_id = 'autopark-documents' and current_role_name() = 'rh_admin'
);

-- Set server-side so it can't be spoofed by the client (same rationale as
-- employee_documents.uploaded_by_email).
create or replace function set_vehicle_document_uploader() returns trigger
language plpgsql security definer as $$
begin
  new.uploaded_by_email := (select email from auth.users where id = auth.uid());
  return new;
end;
$$;

create trigger vehicle_documents_set_uploader before insert on vehicle_documents
  for each row execute function set_vehicle_document_uploader();
