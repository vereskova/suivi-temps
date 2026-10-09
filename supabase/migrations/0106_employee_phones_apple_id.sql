-- Annuaire des téléphones pro : Apple ID / iCloud de chaque téléphone d'équipe
-- (fourni par l'utilisatrice le 09/10/2026). Donnée sensible : work_phone_directory()
-- ne la renvoie qu'aux rôles RH (rh_admin, rh, rh_readonly), les autres reçoivent null.
alter table employee_phones add column if not exists apple_id text;

update employee_phones set apple_id = case role_label
  when 'Equipe 1'  then 'komanda_1@icloud.com'
  when 'Equipe 2'  then 'komanda_2@icloud.com'
  when 'Equipe 3'  then 'komanda_3@icloud.com'
  when 'Equipe 4'  then 'komanda_4@icloud.com'
  when 'Equipe 5'  then 'komanda_5@icloud.com'
  when 'Equipe 6'  then 'komanda_6@icloud.com'
  when 'Equipe 7'  then 'komanda_7@icloud.com'
  when 'Equipe 8'  then 'komanda8vladis@icloud.com'
  when 'Equipe 9'  then 'komanda_9@icloud.com'
  when 'Equipe 10' then 'komanda_10@icloud.com'
end
where role_label in ('Equipe 1','Equipe 2','Equipe 3','Equipe 4','Equipe 5','Equipe 6','Equipe 7','Equipe 8','Equipe 9','Equipe 10');

drop function if exists work_phone_directory();
create function work_phone_directory()
returns table (
  role_label     text,
  phone          text,
  has_work_phone boolean,
  has_new_sim    boolean,
  is_suspended   boolean,
  note           text,
  holder_name    text,
  apple_id       text
)
language sql stable security definer set search_path = public as $$
  select
    p.role_label,
    nullif(btrim(coalesce(p.phone_number, '')), ''),
    p.has_work_phone,
    p.has_new_sim,
    p.is_suspended,
    p.note,
    case when h.id is not null then h.last_name || ' ' || h.first_name end,
    case when current_role_name() in ('rh_admin', 'rh', 'rh_readonly') then p.apple_id end
  from employee_phones p
  left join teams t on t.id = p.team_id
  left join employees h
    on h.id = coalesce(p.employee_id, t.chef_employee_id)
   and h.status::text in ('active', 'on_leave')
  where current_role_name() is not null;
$$;

revoke all on function work_phone_directory() from public;
grant execute on function work_phone_directory() to authenticated;
