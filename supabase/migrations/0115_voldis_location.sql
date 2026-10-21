-- VOLDIS (SCI) — 2e société du groupe (propriétaire du site 590 chemin d'Engoudes, Baziège).
-- Section « Аренда локалей » (location de boxes de stockage) : remplace Rentila.
-- Demandé le 21/10/2026. Données importées de Rentila par scripts/seed-voldis-rentila.ts.
-- Accès : rh_admin uniquement (finances d'une autre société, comme Paie).

-- Lots (boxes) ----------------------------------------------------------------------------
create table voldis_properties (
  id          uuid primary key default gen_random_uuid(),
  lot_number  text not null unique,
  label       text,
  address     text,
  surface_m2  numeric(8,2),
  kind        text not null default 'Box de stockage',
  list_rent   numeric(10,2),                      -- valeur locative mensuelle indicative
  status      text not null default 'available'
              check (status in ('available', 'rented', 'notice', 'unavailable', 'works')),
  notes       text,
  created_at  timestamptz not null default now()
);

-- Locataires ------------------------------------------------------------------------------
create table voldis_tenants (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  siren       text,
  vat_number  text,
  email       text,
  phone       text,
  address     text,
  is_active   boolean not null default true,
  notes       text,
  created_at  timestamptz not null default now()
);

-- Baux ------------------------------------------------------------------------------------
create table voldis_leases (
  id             uuid primary key default gen_random_uuid(),
  property_id    uuid not null references voldis_properties(id) on delete restrict,
  tenant_id      uuid not null references voldis_tenants(id) on delete restrict,
  lease_type     text not null default 'Bail stockage',
  start_date     date not null,
  end_date       date,
  rent_ht        numeric(10,2),
  vat            numeric(10,2),
  charges        numeric(10,2),
  monthly_total  numeric(10,2) not null,          -- montant réellement quittancé chaque mois
  deposit        numeric(10,2) not null default 0,
  billing_day    smallint not null default 1 check (billing_day between 1 and 28),
  tacit_renewal  boolean not null default true,
  is_active      boolean not null default true,
  notes          text,
  rentila_id     text unique,
  created_at     timestamptz not null default now()
);
create index voldis_leases_property_idx on voldis_leases (property_id);
create index voldis_leases_tenant_idx on voldis_leases (tenant_id);

-- Échéances / loyers (une ligne = un loyer appelé, avec ce qui a été encaissé) ---------------
create table voldis_charges (
  id           uuid primary key default gen_random_uuid(),
  lease_id     uuid references voldis_leases(id) on delete set null,
  property_id  uuid references voldis_properties(id) on delete set null,
  tenant_id    uuid references voldis_tenants(id) on delete set null,
  kind         text not null default 'rent' check (kind in ('rent', 'deposit', 'other')),
  due_date     date not null,
  period_start date,
  period_end   date,
  amount_due   numeric(10,2) not null,
  vat_amount   numeric(10,2) not null default 0,
  amount_paid  numeric(10,2) not null default 0,
  paid_on      date,
  status       text not null default 'unpaid'
               check (status in ('paid', 'partial', 'late', 'unpaid', 'lost')),
  description  text,
  rentila_id   text unique,
  created_at   timestamptz not null default now()
);
create index voldis_charges_due_idx on voldis_charges (due_date desc);
create index voldis_charges_tenant_idx on voldis_charges (tenant_id);
create index voldis_charges_lease_idx on voldis_charges (lease_id);

-- Opérations bancaires (Crédit Agricole : relevés OFX / QIF / CSV importés, comme dans Rentila) -----
create table voldis_bank_transactions (
  id            uuid primary key default gen_random_uuid(),
  external_id   text not null unique,             -- clé de dédoublonnage (date + montant + libellé)
  source        text not null default 'import',   -- 'rentila' (historique) ou 'import' (fichier)
  bank_account  text,
  iban          text,
  amount        numeric(12,2) not null,           -- toujours positif ; le sens est dans `side`
  side          text not null check (side in ('credit', 'debit')),
  currency      text not null default 'EUR',
  label         text,
  reference     text,
  note          text,
  counterparty  text,
  emitted_at    timestamptz,
  settled_at    timestamptz,
  status        text,
  category      text,
  raw           jsonb,
  charge_id     uuid references voldis_charges(id) on delete set null,
  created_at    timestamptz not null default now()
);
create index voldis_bank_tx_settled_idx on voldis_bank_transactions (settled_at desc);
create index voldis_bank_tx_charge_idx on voldis_bank_transactions (charge_id);

-- RLS : rh_admin uniquement ------------------------------------------------------------------
alter table voldis_properties        enable row level security;
alter table voldis_tenants           enable row level security;
alter table voldis_leases            enable row level security;
alter table voldis_charges           enable row level security;
alter table voldis_bank_transactions enable row level security;

create policy voldis_properties_admin on voldis_properties for all
  using (current_role_name() = 'rh_admin') with check (current_role_name() = 'rh_admin');
create policy voldis_tenants_admin on voldis_tenants for all
  using (current_role_name() = 'rh_admin') with check (current_role_name() = 'rh_admin');
create policy voldis_leases_admin on voldis_leases for all
  using (current_role_name() = 'rh_admin') with check (current_role_name() = 'rh_admin');
create policy voldis_charges_admin on voldis_charges for all
  using (current_role_name() = 'rh_admin') with check (current_role_name() = 'rh_admin');
create policy voldis_bank_tx_admin on voldis_bank_transactions for all
  using (current_role_name() = 'rh_admin') with check (current_role_name() = 'rh_admin');

grant select, insert, update, delete on voldis_properties, voldis_tenants, voldis_leases,
  voldis_charges, voldis_bank_transactions to authenticated, service_role;
