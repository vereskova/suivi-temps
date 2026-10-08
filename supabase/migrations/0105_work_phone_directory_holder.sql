-- Annuaire des téléphones pro : nom du titulaire de chaque ligne — la
-- personne rattachée à la ligne (employee_phones.employee_id) ou, pour une
-- ligne d'équipe, le chef d'équipe — seulement s'il est encore en poste
-- (active / on_leave). Demandé le 08/10/2026 ("дай всем имена").
drop function if exists work_phone_directory();
create function work_phone_directory()
returns table (
  role_label     text,
  phone          text,
  has_work_phone boolean,
  has_new_sim    boolean,
  is_suspended   boolean,
  note           text,
  holder_name    text
)
language sql stable security definer set search_path = public as $$
  select
    p.role_label,
    nullif(btrim(coalesce(p.phone_number, '')), ''),
    p.has_work_phone,
    p.has_new_sim,
    p.is_suspended,
    p.note,
    case when h.id is not null then h.last_name || ' ' || h.first_name end
  from employee_phones p
  left join teams t on t.id = p.team_id
  left join employees h
    on h.id = coalesce(p.employee_id, t.chef_employee_id)
   and h.status::text in ('active', 'on_leave')
  where current_role_name() is not null;
$$;

revoke all on function work_phone_directory() from public;
grant execute on function work_phone_directory() to authenticated;
