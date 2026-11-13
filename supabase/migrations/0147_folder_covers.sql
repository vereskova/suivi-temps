-- Свои обложки папок (цвет, эмодзи, картинка) для файловой системы объектов. Ключ scope_key:
--   t:<team_id>               - папка команды (KOMANDA_N)
--   t:<team_id>:<status>      - папка статуса (En cours / A venir / Pas fini / Fini)
--   o:<object_id>             - папка объекта
--   o:<object_id>:<путь>      - вложенная папка внутри объекта
-- Картинки лежат в том же хранилище object-files под префиксом _covers/. Доступ только через сервер (service role).
create table if not exists fs_folder_covers (
  scope_key   text primary key,
  color       text,
  emoji       text,
  image_path  text,
  updated_by  text,
  updated_at  timestamptz not null default now()
);

alter table fs_folder_covers enable row level security;
grant select, insert, update, delete on fs_folder_covers to service_role;
