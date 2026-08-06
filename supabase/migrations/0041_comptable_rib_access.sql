-- comptable needs to see an employee's RIB (bank details, for payroll) but
-- none of the rest of employee_confidential (nationality, sécu sociale,
-- statut Ameli, mutuelle, titre de séjour, salaire brut, etc.). RLS alone
-- can't express this: it's row-level, not column-level, and every app role
-- shares the same underlying "authenticated" Postgres role, so a column
-- GRANT restriction would hit rh_admin/rh too. Instead: a security definer
-- function that bypasses RLS on employee_confidential internally but only
-- ever returns the one column, and checks the caller's app-role itself.
create or replace function get_employee_rib(p_employee_id uuid) returns text
language sql stable security definer set search_path = public as $$
  select rib from employee_confidential
  where employee_id = p_employee_id
    and current_role_name() in ('rh_admin', 'rh', 'comptable')
$$;

revoke all on function get_employee_rib(uuid) from public;
grant execute on function get_employee_rib(uuid) to authenticated;
