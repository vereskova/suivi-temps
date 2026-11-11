-- Прежнее контрандю объектов (таблицы « Compte rendu … .numbers » из папок iCloud) - копия содержимого для чтения в приложении.
-- Листы хранятся как массивы строк. Доступ только через сервер (service role): читают Commercial, Production, rh_admin.
create table work_object_reports (
  id           uuid primary key default gen_random_uuid(),
  object_id    uuid not null references work_objects(id) on delete cascade,
  file_name    text not null,
  source_path  text,
  file_mtime   timestamptz,
  sheets       jsonb not null,            -- [{ "name": "…", "rows": [["…", …], …] }]
  imported_at  timestamptz not null default now()
);
create index work_object_reports_object_idx on work_object_reports(object_id);
alter table work_object_reports enable row level security;
grant select, insert, update, delete on work_object_reports to service_role;
