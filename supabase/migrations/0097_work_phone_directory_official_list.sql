-- L'annuaire des téléphones pro reprend EXACTEMENT la liste officielle de
-- l'utilisatrice (feuille "telefon" : BOSS, Psychopractisienne, Comptable,
-- ASSIST, PLANNING, HOTEL, CONTROL, PRODUCTION, DEPOT, FORMATION, équipes 1–10,
-- M.A.), c'est-à-dire employee_phones — et plus les numéros pro saisis dans
-- les fiches employés, qui n'en font pas partie. Confirmé le 06/10/2026 :
-- "это верный список, исправь все". Remplace work_phone_directory() de 0096.
drop function if exists work_phone_directory();

create function work_phone_directory()
returns table (
  role_label     text,
  phone          text,
  has_work_phone boolean,
  has_new_sim    boolean
)
language sql stable security definer set search_path = public as $$
  select p.role_label, nullif(btrim(coalesce(p.phone_number, '')), ''), p.has_work_phone, p.has_new_sim
  from employee_phones p
  where current_role_name() is not null;
$$;

revoke all on function work_phone_directory() from public;
grant execute on function work_phone_directory() to authenticated;
