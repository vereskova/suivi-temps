-- Grants for the two roles added in 0067. Both read Employés the same
-- restricted way 'comptable' does (see 0015/0041): employees+teams
-- select-only, RIB via get_employee_rib(), nothing else from
-- employee_confidential (no salary, sécu sociale, nationalité, mutuelle,
-- titre de séjour). commercial_rh additionally gets the same Commercial
-- access 'commercial' already has (0027/0038/0060) — those policies use
-- current_role_name() in ('commercial', 'rh_admin'), so commercial_rh needs
-- its own additive policies rather than being folded into that list.

create policy employees_rh_readonly_select on employees for select using (
  current_role_name() in ('rh_readonly', 'commercial_rh')
);
create policy teams_rh_readonly_select on teams for select using (
  current_role_name() in ('rh_readonly', 'commercial_rh')
);

create or replace function get_employee_rib(p_employee_id uuid) returns text
language sql stable security definer set search_path = public as $$
  select rib from employee_confidential
  where employee_id = p_employee_id
    and current_role_name() in ('rh_admin', 'rh', 'comptable', 'rh_readonly', 'commercial_rh')
$$;

create policy commercial_categories_select_rh_commercial on commercial_categories for select using (
  current_role_name() = 'commercial_rh'
);
create policy commercial_clients_select_rh_commercial on commercial_clients for select using (
  current_role_name() = 'commercial_rh'
);
create policy commercial_template_items_select_rh_commercial on commercial_checklist_template_items for select using (
  current_role_name() = 'commercial_rh'
);
create policy commercial_checklist_templates_select_rh_commercial on commercial_checklist_templates for select using (
  current_role_name() = 'commercial_rh'
);
create policy commercial_autre_items_select_rh_commercial on commercial_autre_items for select using (
  current_role_name() = 'commercial_rh'
);
create policy commercial_duration_norms_select_rh_commercial on commercial_duration_norms for select using (
  current_role_name() = 'commercial_rh'
);
create policy commercial_duration_norm_points_select_rh_commercial on commercial_duration_norm_points for select using (
  current_role_name() = 'commercial_rh'
);

create policy commercial_cases_all_rh_commercial on commercial_cases for all using (
  current_role_name() = 'commercial_rh'
) with check (
  current_role_name() = 'commercial_rh'
);
create policy commercial_case_items_all_rh_commercial on commercial_case_items for all using (
  current_role_name() = 'commercial_rh'
) with check (
  current_role_name() = 'commercial_rh'
);
