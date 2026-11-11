-- Файлы объектов (планы, PPSPS, compte rendu, фото...) в приложении: закрытое хранилище + список файлов.
-- Все операции идут через сервер (service role): просмотр и загрузка - по подписанным ссылкам, прямых политик нет.
-- Ключ в хранилище непрозрачный (<object_id>/<uuid>.<ext>), настоящее имя и папка внутри объекта - в таблице.

insert into storage.buckets (id, name, public) values ('object-files', 'object-files', false)
on conflict (id) do nothing;

create table work_object_files (
  id            uuid primary key default gen_random_uuid(),
  object_id     uuid not null references work_objects(id) on delete cascade,
  storage_path  text not null unique,
  folder        text not null default '',        -- папка внутри объекта: 'Photo/1.Securite chantier'
  name          text not null,
  size_bytes    bigint,
  mime          text,
  source        text not null default 'app' check (source in ('app', 'icloud')),
  taken_at      timestamptz,                      -- дата изменения исходного файла
  uploaded_by   text,
  created_at    timestamptz not null default now()
);
create index work_object_files_object_idx on work_object_files(object_id, folder);

alter table work_object_files enable row level security;
grant select, insert, update, delete on work_object_files to service_role;
