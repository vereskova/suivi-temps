-- Оргструктура : сценарии («План») + схема компании по Высоцкому.
-- Demandé le 14/10/2026. Voir docs/tz-orgstructura.md.
--
-- Principe : un scénario ne contient JAMAIS de copie des personnes ni ne modifie
-- employees / teams. Il stocke (1) l'arbre de la structure (blocs, sections,
-- postes, équipes, prestataires) et (2) uniquement les écarts par rapport à la
-- réalité (employé déplacé / mis en réserve, candidat placé, poste vacant).

-- ── Ordre des colonnes « Bureau » (glisser-déposer des blocs du bureau) ──
create table org_bureau_order (
  role        text primary key,
  sort_order  integer not null
);

-- ── Scénarios ──
create table org_scenarios (
  id                  uuid primary key default gen_random_uuid(),
  title               text not null,
  status              text not null default 'draft'
                        check (status in ('draft', 'review', 'approved', 'published', 'archived')),
  created_by_email    text,
  approved_by_email   text,
  approved_at         timestamptz,
  published_at        timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- Un seul scénario publié à la fois.
create unique index org_scenarios_one_published on org_scenarios ((true)) where status = 'published';

create table org_nodes (
  id           uuid primary key default gen_random_uuid(),
  scenario_id  uuid not null references org_scenarios(id) on delete cascade,
  parent_id    uuid references org_nodes(id) on delete cascade,
  kind         text not null check (kind in ('block', 'section', 'subsection', 'position', 'team', 'external')),
  title_fr     text not null default '',
  title_ru     text not null default '',
  color        text,
  sort_order   integer not null default 0,
  role_key     text,                                        -- kind = position : bureau_role
  team_id      uuid references teams(id) on delete set null, -- kind = team
  description  text,
  ckp          text,                                        -- ЦКП (ценный конечный продукт)
  contact      text,
  notes        text,
  created_at   timestamptz not null default now()
);
create index org_nodes_scenario_idx on org_nodes (scenario_id);

-- Écarts par rapport à la réalité.
--   employee_id + node_id      : employé placé ailleurs que dans sa fiche
--   employee_id, node_id null  : employé « en réserve » (hors schéma)
--   candidate_id + node_id     : candidat placé
--   candidate_id, node_id null : candidat explicitement « sans place »
--   vacancy_label + node_id    : poste vacant
create table org_placements (
  id             uuid primary key default gen_random_uuid(),
  scenario_id    uuid not null references org_scenarios(id) on delete cascade,
  node_id        uuid references org_nodes(id) on delete cascade,
  employee_id    uuid references employees(id) on delete cascade,
  candidate_id   uuid references org_candidates(id) on delete cascade,
  vacancy_label  text,
  sort_order     integer not null default 0,
  created_at     timestamptz not null default now(),
  check ((employee_id is not null)::int + (candidate_id is not null)::int + (vacancy_label is not null)::int = 1),
  check (node_id is not null or employee_id is not null or candidate_id is not null)
);
create unique index org_placements_employee_uniq on org_placements (scenario_id, employee_id) where employee_id is not null;
create unique index org_placements_candidate_uniq on org_placements (scenario_id, candidate_id) where candidate_id is not null;
create index org_placements_scenario_idx on org_placements (scenario_id);

create trigger org_scenarios_set_updated_at before update on org_scenarios
  for each row execute function set_updated_at();

create trigger org_scenarios_audit
  after insert or update or delete on org_scenarios
  for each row execute function log_audit_changes();

-- ── Le statut ne change que via org_scenario_set_status() ──
create or replace function org_scenarios_guard() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE'
     and new.status is distinct from old.status
     and coalesce(current_setting('app.org_status_rpc', true), '') <> '1' then
    raise exception 'Le statut doit être changé via org_scenario_set_status()';
  end if;
  return new;
end;
$$;

create trigger org_scenarios_guard_status before update on org_scenarios
  for each row execute function org_scenarios_guard();

create or replace function org_scenario_set_status(p_id uuid, p_status text) returns void
language plpgsql security definer set search_path = public as $$
declare
  cur text;
  r   text := current_role_name();
  em  text := auth.jwt() ->> 'email';
begin
  if r not in ('rh_admin', 'rh') then
    raise exception 'Accès refusé';
  end if;
  select status into cur from org_scenarios where id = p_id for update;
  if cur is null then
    raise exception 'Scénario introuvable';
  end if;

  if cur = 'draft' and p_status = 'review' then null;
  elsif cur = 'review' and p_status = 'draft' then null;
  elsif cur = 'review' and p_status = 'approved' and r = 'rh_admin' then null;
  elsif cur = 'approved' and p_status = 'draft' and r = 'rh_admin' then null;
  elsif cur = 'approved' and p_status = 'published' and r = 'rh_admin' then null;
  elsif cur = 'published' and p_status = 'archived' and r = 'rh_admin' then null;
  else
    raise exception 'Transition non autorisée (% -> %)', cur, p_status;
  end if;

  perform set_config('app.org_status_rpc', '1', true);
  if p_status = 'published' then
    update org_scenarios set status = 'archived' where status = 'published' and id <> p_id;
  end if;
  update org_scenarios set
    status            = p_status,
    approved_by_email = case when p_status = 'approved' then em else approved_by_email end,
    approved_at       = case when p_status = 'approved' then now() else approved_at end,
    published_at      = case when p_status = 'published' then now() else published_at end
  where id = p_id;
end;
$$;

grant execute on function org_scenario_set_status(uuid, text) to authenticated;

-- ── RLS ──
alter table org_bureau_order enable row level security;
alter table org_scenarios    enable row level security;
alter table org_nodes        enable row level security;
alter table org_placements   enable row level security;

create policy org_bureau_order_read on org_bureau_order for select using (
  current_role_name() in ('rh_admin', 'rh', 'rh_readonly', 'commercial_rh')
);
create policy org_bureau_order_write on org_bureau_order for all using (
  current_role_name() in ('rh_admin', 'rh', 'rh_readonly')
) with check (
  current_role_name() in ('rh_admin', 'rh', 'rh_readonly')
);

-- Brouillons visibles seulement par rh_admin / rh ; les autres rôles de
-- l'Organigramme ne voient que le scénario publié.
create policy org_scenarios_select on org_scenarios for select using (
  current_role_name() in ('rh_admin', 'rh')
  or (current_role_name() in ('rh_readonly', 'commercial_rh') and status = 'published')
);
create policy org_scenarios_insert on org_scenarios for insert with check (
  current_role_name() in ('rh_admin', 'rh') and status = 'draft'
);
create policy org_scenarios_update on org_scenarios for update using (
  current_role_name() in ('rh_admin', 'rh')
) with check (
  current_role_name() in ('rh_admin', 'rh')
);
create policy org_scenarios_delete on org_scenarios for delete using (
  (current_role_name() in ('rh_admin', 'rh') and status = 'draft')
  or (current_role_name() = 'rh_admin' and status in ('approved', 'archived'))
);

-- Nœuds et placements : lisibles si le scénario l'est (RLS de org_scenarios
-- s'applique dans le sous-select), modifiables seulement tant que le
-- scénario est un brouillon.
create policy org_nodes_select on org_nodes for select using (
  exists (select 1 from org_scenarios s where s.id = scenario_id)
);
create policy org_nodes_write on org_nodes for all using (
  current_role_name() in ('rh_admin', 'rh')
  and exists (select 1 from org_scenarios s where s.id = scenario_id and s.status = 'draft')
) with check (
  current_role_name() in ('rh_admin', 'rh')
  and exists (select 1 from org_scenarios s where s.id = scenario_id and s.status = 'draft')
);

create policy org_placements_select on org_placements for select using (
  exists (select 1 from org_scenarios s where s.id = scenario_id)
);
create policy org_placements_write on org_placements for all using (
  current_role_name() in ('rh_admin', 'rh')
  and exists (select 1 from org_scenarios s where s.id = scenario_id and s.status = 'draft')
) with check (
  current_role_name() in ('rh_admin', 'rh')
  and exists (select 1 from org_scenarios s where s.id = scenario_id and s.status = 'draft')
);

grant select, insert, update, delete on org_bureau_order, org_scenarios, org_nodes, org_placements
  to authenticated, service_role;
