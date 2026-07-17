-- Fix: the helper functions used inside RLS policies (current_employee_id,
-- current_role_name, current_chef_team_id) query tables that are themselves
-- protected by RLS policies referencing these same functions. As plain
-- (security invoker) functions, each call re-triggers the calling table's RLS
-- policy, which calls the function again -> infinite recursion ("stack depth
-- limit exceeded").
--
-- Fix: mark them SECURITY DEFINER so their internal queries run as the
-- function owner (postgres, which has BYPASSRLS in Supabase) instead of the
-- calling role — this is the standard Supabase pattern for RLS helper
-- functions and breaks the recursive re-entry into RLS entirely.

create or replace function current_employee_id() returns uuid
language sql stable security definer set search_path = public as $$
  select employee_id from user_roles where auth_user_id = auth.uid()
$$;

create or replace function current_role_name() returns text
language sql stable security definer set search_path = public as $$
  select role::text from user_roles where auth_user_id = auth.uid()
$$;

create or replace function current_chef_team_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from teams where chef_employee_id = current_employee_id()
$$;
