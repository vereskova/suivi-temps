-- Справочник штрафов контролёра в базе (раньше - в коде lib/payroll/penalties.ts).
-- Офис правит ЧЕРНОВИК и нажимает « Подтвердить » : черновик становится новой опубликованной
-- версией, и её сразу видят все (контролёр, Primes & Bonus, страница бригады).
-- Опубликованные версии не меняются (история + откат). Пока нет ни одной опубликованной версии,
-- приложение использует встроенный справочник из кода - так ничего не ломается до первого подтверждения.
-- Доступ только через сервер (service role) : политик для authenticated нет.

create table penalty_catalog_versions (
  id                    uuid primary key default gen_random_uuid(),
  version               integer unique,                  -- номер опубликованной версии (у черновика null)
  status                text not null check (status in ('draft', 'published')),
  data                  jsonb not null,                  -- { divisor, sections[], items[] }
  note                  text,
  created_by_email      text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  published_by_email    text,
  published_at          timestamptz
);

-- Не больше одного черновика одновременно.
create unique index penalty_catalog_one_draft on penalty_catalog_versions ((status)) where status = 'draft';

alter table penalty_catalog_versions enable row level security;
grant select, insert, update, delete on penalty_catalog_versions to service_role;

-- Какой пункт справочника и какая версия применялись (номер пункта в таблице может поменяться, id - нет).
alter table control_penalties add column if not exists catalog_item_id text;
alter table control_penalties add column if not exists catalog_version integer;
