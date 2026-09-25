-- "Terminé" on a Checklists RH card: the card is done being worked on and
-- should stop showing up in the grid, independent of whether every item
-- ended up checked or marked not-applicable. Kept as its own table rather
-- than a column so a later "afficher les terminées" toggle just means
-- reading this table instead of filtering it out.
create table employee_checklist_dismissed (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  registre_entry_id uuid not null references registre_unique_personnel(id) on delete cascade,
  checklist_type text not null check (checklist_type in ('embauche', 'depart')),
  created_at timestamptz not null default now(),
  created_by_email text,
  unique (employee_id, registre_entry_id, checklist_type)
);

create index employee_checklist_dismissed_employee_idx
  on employee_checklist_dismissed (employee_id);

create or replace function set_checklist_dismissed_created_by() returns trigger
language plpgsql security definer as $$
begin
  new.created_by_email := (select email from auth.users where id = auth.uid());
  return new;
end;
$$;

create trigger employee_checklist_dismissed_set_created_by before insert on employee_checklist_dismissed
  for each row execute function set_checklist_dismissed_created_by();

alter table employee_checklist_dismissed enable row level security;

create policy employee_checklist_dismissed_admin_only on employee_checklist_dismissed for all using (
  current_role_name() = 'rh_admin'
) with check (
  current_role_name() = 'rh_admin'
);
create policy employee_checklist_dismissed_rh_all on employee_checklist_dismissed for all using (
  current_role_name() = 'rh'
) with check (
  current_role_name() = 'rh'
);

grant select, insert, delete on employee_checklist_dismissed to authenticated, service_role;
