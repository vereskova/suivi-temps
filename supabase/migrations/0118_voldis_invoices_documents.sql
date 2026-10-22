-- VOLDIS : fiche société (mentions des factures), factures / quittances, documents (contrats, assurances…),
-- et champs manquants pour remplacer Rentila (révision de loyer, résiliation, relances).
-- Demandé le 21/10/2026. Réservé à rh_admin, comme le reste de VOLDIS.

-- Fiche société : une seule ligne (id = 1) ---------------------------------------------------
create table voldis_settings (
  id              smallint primary key default 1 check (id = 1),
  company_name    text not null default 'VOLDIS',
  legal_form      text default 'SCI',
  siren           text default '332700186',
  vat_number      text default 'FR58332700186',
  address         text default '590 chemin d''Engoudes, 31450 Baziège',
  iban            text default 'FR7613106005003004930459176',
  bic             text,
  email           text,                                   -- adresse d'envoi des factures (aussi Reply-To)
  phone           text,
  payment_terms   text not null default 'Paiement à réception, par virement.',
  late_penalty    text not null default 'En cas de retard de paiement : pénalités égales à 3 fois le taux d''intérêt légal et indemnité forfaitaire de 40 € pour frais de recouvrement.',
  invoice_prefix  text not null default 'F',
  receipt_prefix  text not null default 'Q',
  updated_at      timestamptz not null default now()
);
insert into voldis_settings (id) values (1) on conflict (id) do nothing;

-- Locataires / baux / échéances : champs en plus -------------------------------------------
alter table voldis_tenants add column if not exists representative text;     -- gérant / contact
alter table voldis_tenants add column if not exists billing_email text;      -- si différent de l'e-mail principal

alter table voldis_leases add column if not exists index_type text check (index_type in ('ILC', 'ILAT', 'IRL', 'none'));
alter table voldis_leases add column if not exists next_revision_date date;
alter table voldis_leases add column if not exists notice_months smallint;
alter table voldis_leases add column if not exists terminated_on date;       -- date de fin réelle (résiliation)

alter table voldis_charges add column if not exists reminded_at timestamptz; -- dernière relance envoyée

-- Factures et quittances ------------------------------------------------------------------
create table voldis_invoices (
  id            uuid primary key default gen_random_uuid(),
  number        text not null unique,                     -- F-2026-0001 / Q-2026-0001
  kind          text not null default 'invoice' check (kind in ('invoice', 'receipt')),
  tenant_id     uuid references voldis_tenants(id) on delete set null,
  lease_id      uuid references voldis_leases(id) on delete set null,
  charge_id     uuid references voldis_charges(id) on delete set null,
  issue_date    date not null default current_date,
  due_date      date,
  period_start  date,
  period_end    date,
  lines         jsonb not null default '[]'::jsonb,       -- [{label, amount_ht, vat_rate, vat, amount_ttc}]
  total_ht      numeric(10,2) not null default 0,
  vat_amount    numeric(10,2) not null default 0,
  total_ttc     numeric(10,2) not null,
  status        text not null default 'draft' check (status in ('draft', 'sent', 'void')),
  pdf_path      text,
  sent_at       timestamptz,
  sent_to       text,
  notes         text,
  created_at    timestamptz not null default now()
);
create index voldis_invoices_tenant_idx on voldis_invoices (tenant_id);
create index voldis_invoices_charge_idx on voldis_invoices (charge_id);
-- une seule facture (et une seule quittance) active par échéance
create unique index voldis_invoices_charge_kind_uniq on voldis_invoices (charge_id, kind)
  where charge_id is not null and status <> 'void';

-- Documents (contrats, avenants, assurances, états des lieux, pièces d'identité…) ------------
create table voldis_documents (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid references voldis_tenants(id) on delete cascade,
  lease_id      uuid references voldis_leases(id) on delete cascade,
  property_id   uuid references voldis_properties(id) on delete cascade,
  kind          text not null default 'other'
                check (kind in ('contract', 'amendment', 'inventory', 'insurance', 'identity', 'invoice', 'other')),
  title         text not null,
  storage_path  text not null unique,
  mime          text,
  size_bytes    integer,
  uploaded_at   timestamptz not null default now()
);
create index voldis_documents_tenant_idx on voldis_documents (tenant_id);
create index voldis_documents_lease_idx on voldis_documents (lease_id);

alter table voldis_settings  enable row level security;
alter table voldis_invoices  enable row level security;
alter table voldis_documents enable row level security;

create policy voldis_settings_admin on voldis_settings for all
  using (current_role_name() = 'rh_admin') with check (current_role_name() = 'rh_admin');
create policy voldis_invoices_admin on voldis_invoices for all
  using (current_role_name() = 'rh_admin') with check (current_role_name() = 'rh_admin');
create policy voldis_documents_admin on voldis_documents for all
  using (current_role_name() = 'rh_admin') with check (current_role_name() = 'rh_admin');

grant select, insert, update, delete on voldis_settings, voldis_invoices, voldis_documents to authenticated, service_role;

-- Stockage privé : contrats, factures PDF, pièces - lecture/écriture rh_admin uniquement ------
insert into storage.buckets (id, name, public) values ('voldis-documents', 'voldis-documents', false)
  on conflict (id) do nothing;

create policy voldis_documents_storage_admin on storage.objects for all using (
  bucket_id = 'voldis-documents' and current_role_name() = 'rh_admin'
) with check (
  bucket_id = 'voldis-documents' and current_role_name() = 'rh_admin'
);
