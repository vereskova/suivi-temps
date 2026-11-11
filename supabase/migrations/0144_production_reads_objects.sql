-- Production (rh_readonly) читает « Объекты »: объекты, работы, каталог и нормы (только чтение; запись остаётся у Commercial / rh_admin).
create policy work_objects_select_production on work_objects for select using (current_role_name() = 'rh_readonly');
create policy work_object_lines_select_production on work_object_lines for select using (current_role_name() = 'rh_readonly');
create policy work_sections_select_production on work_sections for select using (current_role_name() = 'rh_readonly');
create policy work_positions_select_production on work_positions for select using (current_role_name() = 'rh_readonly');
create policy work_subpositions_select_production on work_subpositions for select using (current_role_name() = 'rh_readonly');
create policy commercial_duration_norms_select_production on commercial_duration_norms for select using (current_role_name() = 'rh_readonly');
create policy commercial_duration_norm_points_select_production on commercial_duration_norm_points for select using (current_role_name() = 'rh_readonly');
