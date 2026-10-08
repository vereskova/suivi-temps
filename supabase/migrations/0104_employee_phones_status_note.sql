-- Annuaire des téléphones pro : ligne suspendue chez l'opérateur et nom de
-- la ligne tel qu'affiché dans le portail opérateur (ex. "Assistant Iryna",
-- "9-10 KOMANDA"). Mise à jour d'après le portail Bouygues, 08/10/2026.
alter table employee_phones add column if not exists is_suspended boolean not null default false;
alter table employee_phones add column if not exists note text;

drop function if exists work_phone_directory();
create function work_phone_directory()
returns table (
  role_label     text,
  phone          text,
  has_work_phone boolean,
  has_new_sim    boolean,
  is_suspended   boolean,
  note           text
)
language sql stable security definer set search_path = public as $$
  select p.role_label, nullif(btrim(coalesce(p.phone_number, '')), ''), p.has_work_phone, p.has_new_sim, p.is_suspended, p.note
  from employee_phones p
  where current_role_name() is not null;
$$;

revoke all on function work_phone_directory() from public;
grant execute on function work_phone_directory() to authenticated;
