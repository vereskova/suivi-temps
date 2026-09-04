-- Congés payés calculator, table form like Paie: one editable line per
-- employee per month, instead of picking one employee at a time.
create table conges_payes_line_items (
  id                             uuid primary key default gen_random_uuid(),
  employee_id                    uuid not null references employees(id) on delete cascade,
  month                          date not null, -- always the 1st of the month
  salaire_mensuel_brut           numeric(9,2),
  jours_conges                   numeric(5,2),
  somme_brute_periode_reference  numeric(9,2),
  jours_acquis_periode_reference numeric(5,2),
  updated_at                     timestamptz not null default now(),
  unique (employee_id, month)
);

create trigger conges_payes_line_items_set_updated_at before update on conges_payes_line_items
  for each row execute function set_updated_at();

alter table conges_payes_line_items enable row level security;
create policy conges_payes_line_items_rh on conges_payes_line_items for all using (
  current_role_name() in ('rh_admin', 'rh')
) with check (
  current_role_name() in ('rh_admin', 'rh')
);

grant select, insert, update, delete on conges_payes_line_items to authenticated, service_role;
