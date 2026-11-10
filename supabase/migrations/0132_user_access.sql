-- Настройки доступа : для каждого человека можно сузить список вкладок и выбрать режим
-- « просмотр / редактирование » поверх его роли (роль = что разрешено в базе, вкладки = что видно в меню).
-- tabs : { "<ключ вкладки>": "view" | "edit" } ; ключа нет или NULL во всей строке = как по роли по умолчанию.
create table if not exists user_access (
  auth_user_id uuid primary key references auth.users(id) on delete cascade,
  tabs         jsonb,
  note         text,
  updated_at   timestamptz not null default now(),
  updated_by   text
);

alter table user_access enable row level security;

create policy user_access_self_select on user_access for select using (auth.uid() = auth_user_id);
create policy user_access_admin_all on user_access for all
  using (current_role_name() = 'rh_admin')
  with check (current_role_name() = 'rh_admin');

grant select, insert, update, delete on user_access to authenticated, service_role;
