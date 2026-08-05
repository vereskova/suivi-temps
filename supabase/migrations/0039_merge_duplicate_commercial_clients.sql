-- The v2 checklist reseed (scripts/seed-commercial-checklists-v2.ts) upserts
-- commercial_clients by exact `name` — but the new reference spreadsheet
-- spells at least one client slightly differently than the original one did
-- ("ADVANCED EnerGies" vs "ADVANCED EnerGIes"), so the exact-name upsert
-- created a second row instead of reusing the existing one. name_normalized
-- (lowercase, accent-stripped) already collapses that difference, so use it
-- to find and merge any such duplicates generically, not just this one case.
--
-- For each name_normalized with more than one client row: keep the row that
-- already has checklist templates (i.e. the one the v2 script actually
-- populated), repoint every case/template/template-item reference from the
-- other row(s) onto it, then delete the now-empty duplicates.
do $$
declare
  dup record;
  keep_id uuid;
begin
  for dup in
    select name_normalized
    from commercial_clients
    group by name_normalized
    having count(*) > 1
  loop
    select c.id into keep_id
    from commercial_clients c
    where c.name_normalized = dup.name_normalized
    order by (
      select count(*) from commercial_checklist_templates t where t.client_id = c.id
    ) desc, c.created_at asc
    limit 1;

    update commercial_cases set client_id = keep_id
      where client_id in (select id from commercial_clients where name_normalized = dup.name_normalized and id <> keep_id);
    update commercial_checklist_templates set client_id = keep_id
      where client_id in (select id from commercial_clients where name_normalized = dup.name_normalized and id <> keep_id);
    update commercial_checklist_template_items set client_id = keep_id
      where client_id in (select id from commercial_clients where name_normalized = dup.name_normalized and id <> keep_id);

    delete from commercial_clients where name_normalized = dup.name_normalized and id <> keep_id;
  end loop;
end $$;

-- Prevent this from recurring silently — a second client row that only
-- differs by case/accents will now fail loudly at insert time instead of
-- quietly duplicating the client in the picker.
create unique index if not exists commercial_clients_name_normalized_idx on commercial_clients(name_normalized);
