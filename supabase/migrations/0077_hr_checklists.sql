-- Manual check-marks for the hiring/termination checklists (Checklists RH
-- view). Items that can be inferred from data already in the app (a DPAE
-- document present, a date_sortie set…) are computed live in the UI and
-- never stored here — only items with no digital trace (material handed
-- back, a medical visit actually scheduled…) are tracked as rows.
-- Access mirrors employee_documents (0011/0017): rh_admin and rh only.
create table employee_checklist_items (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  registre_entry_id uuid not null references registre_unique_personnel(id) on delete cascade,
  checklist_type text not null check (checklist_type in ('embauche', 'depart')),
  item_code text not null,
  created_at timestamptz not null default now(),
  created_by_email text,
  unique (employee_id, registre_entry_id, checklist_type, item_code)
);

create index employee_checklist_items_employee_idx
  on employee_checklist_items (employee_id);

create or replace function set_checklist_item_created_by() returns trigger
language plpgsql security definer as $$
begin
  new.created_by_email := (select email from auth.users where id = auth.uid());
  return new;
end;
$$;

create trigger employee_checklist_items_set_created_by before insert on employee_checklist_items
  for each row execute function set_checklist_item_created_by();

alter table employee_checklist_items enable row level security;

create policy employee_checklist_items_admin_only on employee_checklist_items for all using (
  current_role_name() = 'rh_admin'
) with check (
  current_role_name() = 'rh_admin'
);
create policy employee_checklist_items_rh_all on employee_checklist_items for all using (
  current_role_name() = 'rh'
) with check (
  current_role_name() = 'rh'
);

grant select, insert, update, delete on employee_checklist_items to authenticated, service_role;
