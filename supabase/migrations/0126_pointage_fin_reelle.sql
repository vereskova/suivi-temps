-- Pointage : la vraie heure de fin est saisie (ex. 17:40) et les H. supp se calculent seules
-- (= temps après 17:00). Sans effet sur les anciennes lignes : elles gardent « fin 17:00 + H. supp à part ».
--
-- end_includes_overtime = false (défaut) : ancienne saisie, total = (fin - début - pause) + overtime_minutes
-- end_includes_overtime = true           : nouvelle saisie, total = fin - début - pause,
--                                          overtime_minutes = minutes après 17:00 (recalculé ici)
-- Les totaux et la paie ne changent pas : une ligne convertie garde exactement le même total_minutes.

alter table pointage_entries
  add column if not exists end_includes_overtime boolean not null default false;

create or replace function compute_pointage_total() returns trigger
language plpgsql as $$
declare
  worked_minutes int;
begin
  if new.is_absent then
    new.total_minutes := 0;
  elsif new.start_time is null or new.end_time is null then
    new.total_minutes := null;
  else
    worked_minutes := (extract(epoch from (new.end_time - new.start_time)) / 60)::int;
    if worked_minutes < 0 then
      worked_minutes := worked_minutes + 24 * 60; -- overnight shift safety net
    end if;
    worked_minutes := worked_minutes - coalesce(new.pause_minutes, 0);
    if new.end_includes_overtime then
      new.overtime_minutes := greatest(0, (extract(epoch from (new.end_time - time '17:00')) / 60)::int);
      new.total_minutes := worked_minutes;
    else
      new.total_minutes := worked_minutes + coalesce(new.overtime_minutes, 0);
    end if;
  end if;
  return new;
end;
$$;
