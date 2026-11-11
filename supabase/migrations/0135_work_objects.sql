-- Объекты (chantiers) вместо досье по клиентам: у каждого объекта есть название, команда и статус
-- (как папки в iCloud: в работе / A venir / Pas fini / Fini), вариант сметы (Standard / Avec LT / Ombrière),
-- список работ из каталога (0133) с количеством, плановыми днями (считаются по нормам) и фактическими датами.
-- Плановые даты не хранятся: считаются на лету от даты старта и порядка работ (рабочие дни, без праздников).

create table work_objects (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null,
  team_id            uuid references teams(id) on delete set null,
  status             text not null default 'a_venir' check (status in ('a_venir', 'en_cours', 'pas_fini', 'fini')),
  variant            text not null default 'standard' check (variant in ('standard', 'lt', 'ombriere')),
  power_kwc          numeric,
  start_date         date,
  finished_at        date,
  client             text,
  address            text,
  notes              text,
  created_by_email   text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index work_objects_team_idx on work_objects(team_id, status);

create table work_object_lines (
  id                    uuid primary key default gen_random_uuid(),
  object_id             uuid not null references work_objects(id) on delete cascade,
  position              integer not null,
  section_code          text,
  catalog_position_id   uuid references work_positions(id) on delete set null,
  label                 text not null,
  unit                  text,
  qty                   numeric not null default 1,
  price_ht              numeric,
  measure               numeric,          -- мера из подпозиции (напр. 90 ml тиража кабеля)
  manual_days           numeric,          -- дни вручную (для работ без нормы или чтобы поправить норму)
  parallel              boolean not null default false,  -- идёт параллельно с предыдущей работой
  actual_start          date,
  actual_end            date,
  delay_reason          text,
  created_at            timestamptz not null default now()
);
create index work_object_lines_object_idx on work_object_lines(object_id, position);

alter table work_objects enable row level security;
alter table work_object_lines enable row level security;
grant select, insert, update, delete on work_objects, work_object_lines to authenticated, service_role;

create policy work_objects_all on work_objects for all
  using (current_role_name() in ('rh_admin', 'commercial', 'commercial_rh'))
  with check (current_role_name() in ('rh_admin', 'commercial', 'commercial_rh'));
create policy work_object_lines_all on work_object_lines for all
  using (current_role_name() in ('rh_admin', 'commercial', 'commercial_rh'))
  with check (current_role_name() in ('rh_admin', 'commercial', 'commercial_rh'));

-- Команды нужны Commercial для папок (rh_admin и так читает).
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'teams' and policyname = 'teams_commercial_select') then
    create policy teams_commercial_select on teams for select using (current_role_name() = 'commercial');
  end if;
end $$;
