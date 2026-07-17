-- Because "Automatically expose new tables" was left disabled when creating the project
-- (recommended — keeps access explicit), Postgres never granted table-level privileges to
-- the API roles. RLS policies from 0001_init.sql still apply on top of these grants.

grant usage on schema public to anon, authenticated, service_role;

grant select, insert, update, delete on
  public.teams,
  public.employees,
  public.user_roles,
  public.absence_types,
  public.pointage_entries
to authenticated, service_role;

-- So future tables (documents, payroll, etc. in later migrations) get the same treatment
-- automatically instead of needing another manual grant each time.
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated, service_role;
