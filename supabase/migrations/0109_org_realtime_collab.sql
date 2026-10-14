-- Оргструктура : édition à plusieurs en direct (comme Primes & Bonus) + droits d'édition
-- étendus à rh_readonly (production). Demandé le 14/10/2026.
--   * les changements des scénarios / nœuds / placements sont diffusés en temps réel
--     (Supabase Realtime, RLS respectée) ;
--   * rh_admin, rh et rh_readonly peuvent éditer les brouillons ; commercial_rh ne voit
--     que le scénario publié ; valider / publier reste réservé à rh_admin.

do $$
begin
  alter publication supabase_realtime add table org_scenarios;
exception when duplicate_object then null; when undefined_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table org_nodes;
exception when duplicate_object then null; when undefined_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table org_placements;
exception when duplicate_object then null; when undefined_object then null;
end $$;

-- Pour que les suppressions (y compris en cascade) soient diffusées avec leur filtre.
alter table org_scenarios  replica identity full;
alter table org_nodes      replica identity full;
alter table org_placements replica identity full;

-- ── Droits d'édition : rh_admin, rh, rh_readonly ──
drop policy if exists org_scenarios_select on org_scenarios;
drop policy if exists org_scenarios_insert on org_scenarios;
drop policy if exists org_scenarios_update on org_scenarios;
drop policy if exists org_scenarios_delete on org_scenarios;
drop policy if exists org_nodes_write on org_nodes;
drop policy if exists org_placements_write on org_placements;

create policy org_scenarios_select on org_scenarios for select using (
  current_role_name() in ('rh_admin', 'rh', 'rh_readonly')
  or (current_role_name() = 'commercial_rh' and status = 'published')
);
create policy org_scenarios_insert on org_scenarios for insert with check (
  current_role_name() in ('rh_admin', 'rh', 'rh_readonly') and status = 'draft'
);
create policy org_scenarios_update on org_scenarios for update using (
  current_role_name() in ('rh_admin', 'rh', 'rh_readonly')
) with check (
  current_role_name() in ('rh_admin', 'rh', 'rh_readonly')
);
create policy org_scenarios_delete on org_scenarios for delete using (
  (current_role_name() in ('rh_admin', 'rh', 'rh_readonly') and status = 'draft')
  or (current_role_name() = 'rh_admin' and status in ('approved', 'archived'))
);

create policy org_nodes_write on org_nodes for all using (
  current_role_name() in ('rh_admin', 'rh', 'rh_readonly')
  and exists (select 1 from org_scenarios s where s.id = scenario_id and s.status = 'draft')
) with check (
  current_role_name() in ('rh_admin', 'rh', 'rh_readonly')
  and exists (select 1 from org_scenarios s where s.id = scenario_id and s.status = 'draft')
);

create policy org_placements_write on org_placements for all using (
  current_role_name() in ('rh_admin', 'rh', 'rh_readonly')
  and exists (select 1 from org_scenarios s where s.id = scenario_id and s.status = 'draft')
) with check (
  current_role_name() in ('rh_admin', 'rh', 'rh_readonly')
  and exists (select 1 from org_scenarios s where s.id = scenario_id and s.status = 'draft')
);

-- Changement de statut : brouillon <-> validation pour les trois rôles d'édition ;
-- valider / publier / dépublier : rh_admin uniquement.
create or replace function org_scenario_set_status(p_id uuid, p_status text) returns void
language plpgsql security definer set search_path = public as $$
declare
  cur text;
  r   text := current_role_name();
  em  text := auth.jwt() ->> 'email';
begin
  if r not in ('rh_admin', 'rh', 'rh_readonly') then
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
