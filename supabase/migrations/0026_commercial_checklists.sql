-- Commercial module: per-client service checklists + dossiers (devis prep).
-- One dossier ("commercial_case") per chantier/devis for a client, seeded
-- from that client's checklist template (ported from the Trello model
-- cards in Checklists_Modeles_Clients_VLADIS.xlsx via a one-shot script).

create table commercial_categories (
  code        text primary key,
  label       text not null,
  label_ru    text not null,
  sort_order  integer not null
);

insert into commercial_categories (code, label, label_ru, sort_order) values
  ('DEVIS',              'Devis',                'Смета',              1),
  ('COMMANDE_MATERIEL',  'Commande matériel',    'Заказ материалов',   2),
  ('LIVRAISON',          'Livraison',             'Доставка',           3),
  ('PLANNING',           'Planning',              'Планирование',       4),
  ('ETIQUETAGE',         'Étiquetage',            'Маркировка',         5),
  ('TS',                 'TS',                    'ТБ',                 6),
  ('RECUPERATION',       'Récupération',          'Возврат',            7);

create table commercial_clients (
  id                    uuid primary key default gen_random_uuid(),
  name                  text not null unique,
  name_normalized       text not null,
  sinao_organization_id text,
  active                boolean not null default true,
  created_at            timestamptz not null default now()
);

-- Seeded once from the client's Trello-model checklist; a template's rows
-- are copied onto each new commercial_case rather than referenced live, so
-- editing the template later never rewrites an in-flight dossier.
create table commercial_checklist_template_items (
  id                uuid primary key default gen_random_uuid(),
  client_id         uuid not null references commercial_clients(id) on delete cascade,
  category_code     text not null references commercial_categories(code),
  position          integer not null,
  label             text not null,
  label_normalized  text not null,
  created_at        timestamptz not null default now()
);

create index commercial_checklist_template_items_client_idx
  on commercial_checklist_template_items(client_id);

-- One dossier per chantier/devis for a client — a client can have several,
-- at the same time or over time. The three action buttons operate on a
-- specific dossier, never on the client as a whole.
create table commercial_cases (
  id                     uuid primary key default gen_random_uuid(),
  client_id              uuid not null references commercial_clients(id),
  title                  text not null,
  desired_start_date     date,
  desired_end_date       date,
  status                 text not null default 'draft'
                           check (status in ('draft','clarifying','ready','quoted','archived')),
  sinao_quote_id         text,
  client_doc_sent_at     timestamptz,
  team_doc_generated_at  timestamptz,
  sinao_pushed_at        timestamptz,
  created_by             uuid not null references auth.users(id),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create index commercial_cases_client_idx on commercial_cases(client_id);

-- Copied from the client's template when the dossier is created, then
-- edited independently. Default 'active': in practice most lines in a
-- client's template really are needed for a typical chantier there — the
-- commercial rep turns off or flags the few exceptions, rather than
-- confirming every single line by hand.
create table commercial_case_items (
  id                uuid primary key default gen_random_uuid(),
  case_id           uuid not null references commercial_cases(id) on delete cascade,
  template_item_id  uuid references commercial_checklist_template_items(id),
  origin            text not null default 'template' check (origin in ('template','manual')),
  category_code     text not null references commercial_categories(code),
  position           integer not null,
  label             text not null,
  status            text not null default 'active' check (status in ('active','inactive','pending')),
  note              text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index commercial_case_items_case_idx on commercial_case_items(case_id);

alter table commercial_categories enable row level security;
alter table commercial_clients enable row level security;
alter table commercial_checklist_template_items enable row level security;
alter table commercial_cases enable row level security;
alter table commercial_case_items enable row level security;

grant select on commercial_categories to authenticated, service_role;
grant select, insert, update, delete on commercial_clients to authenticated, service_role;
grant select, insert, update, delete on commercial_checklist_template_items to authenticated, service_role;
grant select, insert, update, delete on commercial_cases to authenticated, service_role;
grant select, insert, update, delete on commercial_case_items to authenticated, service_role;
