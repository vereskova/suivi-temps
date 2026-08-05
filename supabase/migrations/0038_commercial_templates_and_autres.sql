-- Refonte des check-lists Commercial :
-- 1. Un client peut désormais avoir plusieurs templates nommés (ex.
--    "ADVANCED EnerGies" a "Bâtiment" et "Ombrières" — même client, deux
--    types de chantier). Les clients à un seul template gardent un unique
--    template "Standard" — rien ne change pour eux côté utilisateur.
-- 2. Nouveau catalogue global "Autres" (tâches rarement demandées, pas
--    propres à un client) — piochées au cas par cas dans un dossier plutôt
--    que mises par défaut partout.

-- ── Templates nommés par client ──────────────────────────────────────────
create table commercial_checklist_templates (
  id             uuid primary key default gen_random_uuid(),
  client_id      uuid not null references commercial_clients(id) on delete cascade,
  variant_label  text not null default 'Standard',
  created_at     timestamptz not null default now(),
  unique (client_id, variant_label)
);

-- template_id remplace le lien direct au client pour savoir de quel
-- template (variante) une ligne provient ; client_id reste en place,
-- dénormalisé, pour ne pas casser les requêtes existantes qui filtrent
-- directement par client.
alter table commercial_checklist_template_items
  add column if not exists template_id uuid references commercial_checklist_templates(id) on delete cascade;

create index commercial_checklist_templates_client_idx on commercial_checklist_templates(client_id);
create index commercial_checklist_template_items_template_idx on commercial_checklist_template_items(template_id);

-- ── Catégories des "Autres" — mêmes table/FK que DEVIS/PLANNING pour que
-- commercial_case_items.category_code garde une seule taxonomie peu importe
-- l'origine de la ligne. Les 5 catégories qui disparaissent des nouveaux
-- templates (COMMANDE_MATERIEL, LIVRAISON, ETIQUETAGE, TS, RECUPERATION)
-- restent en base : des dossiers déjà créés peuvent encore les référencer.
insert into commercial_categories (code, label, label_ru, sort_order) values
  ('SECURITE',    'Sécurité',    'Безопасность',            10),
  ('CHARPENTE',   'Charpente',   'Стропильная конструкция', 11),
  ('ZINGUERIE',   'Zinguerie',   'Жестяные работы',         12),
  ('ELECTRICITE', 'Électricité', 'Электрика',               13),
  ('MATERIAUX',   'Matériaux',   'Материалы',               14)
on conflict (code) do nothing;

-- ── Catalogue global "Autres" — pas de client_id, un seul catalogue partagé ──
create table commercial_autre_items (
  id                uuid primary key default gen_random_uuid(),
  category_code     text not null references commercial_categories(code),
  position          integer not null,
  label             text not null,
  label_normalized  text not null,
  created_at        timestamptz not null default now()
);

create index commercial_autre_items_category_idx on commercial_autre_items(category_code);

-- ── commercial_case_items : nouvelle origine 'autre' + traçabilité du catalogue ──
alter table commercial_case_items drop constraint if exists commercial_case_items_origin_check;
alter table commercial_case_items add constraint commercial_case_items_origin_check
  check (origin in ('template', 'manual', 'autre'));

alter table commercial_case_items
  add column if not exists autre_item_id uuid references commercial_autre_items(id);

-- ── RLS : mêmes règles que commercial_checklist_template_items (référentiel,
-- lecture commercial+rh_admin, écriture rh_admin uniquement) ──
alter table commercial_checklist_templates enable row level security;
alter table commercial_autre_items enable row level security;

create policy commercial_checklist_templates_select on commercial_checklist_templates for select using (
  current_role_name() in ('commercial', 'rh_admin')
);
create policy commercial_checklist_templates_admin_write on commercial_checklist_templates for insert with check (
  current_role_name() = 'rh_admin'
);
create policy commercial_checklist_templates_admin_update on commercial_checklist_templates for update using (
  current_role_name() = 'rh_admin'
) with check (
  current_role_name() = 'rh_admin'
);
create policy commercial_checklist_templates_admin_delete on commercial_checklist_templates for delete using (
  current_role_name() = 'rh_admin'
);

create policy commercial_autre_items_select on commercial_autre_items for select using (
  current_role_name() in ('commercial', 'rh_admin')
);
create policy commercial_autre_items_admin_write on commercial_autre_items for insert with check (
  current_role_name() = 'rh_admin'
);
create policy commercial_autre_items_admin_update on commercial_autre_items for update using (
  current_role_name() = 'rh_admin'
) with check (
  current_role_name() = 'rh_admin'
);
create policy commercial_autre_items_admin_delete on commercial_autre_items for delete using (
  current_role_name() = 'rh_admin'
);

grant select, insert, update, delete on commercial_checklist_templates to authenticated, service_role;
grant select, insert, update, delete on commercial_autre_items to authenticated, service_role;
