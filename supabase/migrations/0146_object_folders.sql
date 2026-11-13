-- Пустые папки внутри объекта (как в iCloud / Finder): обычные папки с файлами берутся из work_object_files.folder,
-- а эта таблица нужна, чтобы можно было создать папку заранее и она осталась видимой, пока в ней нет файлов.
-- Доступ только через сервер (service role).
create table if not exists work_object_folders (
  id            uuid primary key default gen_random_uuid(),
  object_id     uuid not null references work_objects(id) on delete cascade,
  path          text not null,                    -- 'Photo/1.Securite chantier' (внутри объекта)
  team_visible  boolean not null default true,    -- видна ли папка бригаде
  created_by    text,
  created_at    timestamptz not null default now(),
  unique (object_id, path)
);
create index if not exists work_object_folders_object_idx on work_object_folders(object_id);

alter table work_object_folders enable row level security;
grant select, insert, update, delete on work_object_folders to service_role;
