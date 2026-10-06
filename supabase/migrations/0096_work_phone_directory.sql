-- Annuaire des téléphones professionnels visible par TOUS les comptes de
-- l'application (quel que soit le rôle), demandé par l'utilisatrice le
-- 06/10/2026. Les rôles commercial/comptable n'ont pas accès à employees ni à
-- employee_phones en direct : cette fonction SECURITY DEFINER n'expose que
-- nom, poste, équipe et numéro PRO (jamais le téléphone personnel, la paie ou
-- le confidentiel), et seulement à un compte qui a un rôle.
create or replace function work_phone_directory()
returns table (
  kind        text,
  first_name  text,
  last_name   text,
  category    text,
  bureau_role text,
  job_title   text,
  team_name   text,
  is_chef     boolean,
  phone       text,
  role_label  text
)
language sql stable security definer set search_path = public as $$
  select
    'employee'::text, e.first_name, e.last_name, e.category::text, e.bureau_role::text,
    e.job_title, t.name, coalesce(t.chef_employee_id = e.id, false), e.phone_pro, null::text
  from employees e
  left join teams t on t.id = e.team_id
  where current_role_name() is not null
    and e.status::text in ('active', 'on_leave')
    and btrim(coalesce(e.phone_pro, '')) <> ''
  union all
  select
    'shared'::text, null, null, null, null, null, t.name, false, p.phone_number, p.role_label
  from employee_phones p
  left join teams t on t.id = p.team_id
  where current_role_name() is not null
    and btrim(coalesce(p.phone_number, '')) <> ''
    and not exists (
      select 1 from employees e
      where e.status::text in ('active', 'on_leave')
        and btrim(coalesce(e.phone_pro, '')) <> ''
        and right(regexp_replace(e.phone_pro, '\D', '', 'g'), 9) = right(regexp_replace(p.phone_number, '\D', '', 'g'), 9)
    );
$$;

revoke all on function work_phone_directory() from public;
grant execute on function work_phone_directory() to authenticated;
