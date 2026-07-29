-- Grants the 'commercial' role access to its own section, alongside
-- rh_admin who can see/manage everything. Added as new, purely additive
-- policies (Postgres RLS ORs all permissive policies together) so no
-- existing role's access is touched.
--
-- Asymmetric on purpose: editing the client roster / checklist templates
-- is a rarer, heavier operation (master data) so it stays rh_admin-only to
-- write; day-to-day dossiers (cases/items) are read+write+delete for both
-- roles since correcting a mistaken dossier should stay simple.

create policy commercial_categories_select on commercial_categories for select using (
  current_role_name() in ('commercial', 'rh_admin')
);

create policy commercial_clients_select on commercial_clients for select using (
  current_role_name() in ('commercial', 'rh_admin')
);
create policy commercial_clients_admin_write on commercial_clients for insert with check (
  current_role_name() = 'rh_admin'
);
create policy commercial_clients_admin_update on commercial_clients for update using (
  current_role_name() = 'rh_admin'
) with check (
  current_role_name() = 'rh_admin'
);
create policy commercial_clients_admin_delete on commercial_clients for delete using (
  current_role_name() = 'rh_admin'
);

create policy commercial_template_items_select on commercial_checklist_template_items for select using (
  current_role_name() in ('commercial', 'rh_admin')
);
create policy commercial_template_items_admin_write on commercial_checklist_template_items for insert with check (
  current_role_name() = 'rh_admin'
);
create policy commercial_template_items_admin_update on commercial_checklist_template_items for update using (
  current_role_name() = 'rh_admin'
) with check (
  current_role_name() = 'rh_admin'
);
create policy commercial_template_items_admin_delete on commercial_checklist_template_items for delete using (
  current_role_name() = 'rh_admin'
);

create policy commercial_cases_select on commercial_cases for select using (
  current_role_name() in ('commercial', 'rh_admin')
);
create policy commercial_cases_insert on commercial_cases for insert with check (
  current_role_name() in ('commercial', 'rh_admin')
);
create policy commercial_cases_update on commercial_cases for update using (
  current_role_name() in ('commercial', 'rh_admin')
) with check (
  current_role_name() in ('commercial', 'rh_admin')
);
create policy commercial_cases_delete on commercial_cases for delete using (
  current_role_name() in ('commercial', 'rh_admin')
);

create policy commercial_case_items_select on commercial_case_items for select using (
  current_role_name() in ('commercial', 'rh_admin')
);
create policy commercial_case_items_insert on commercial_case_items for insert with check (
  current_role_name() in ('commercial', 'rh_admin')
);
create policy commercial_case_items_update on commercial_case_items for update using (
  current_role_name() in ('commercial', 'rh_admin')
) with check (
  current_role_name() in ('commercial', 'rh_admin')
);
create policy commercial_case_items_delete on commercial_case_items for delete using (
  current_role_name() in ('commercial', 'rh_admin')
);
