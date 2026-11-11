-- Смета объекта: у каждой работы свои подпозиции (текст + необязательная мера), копируются из каталога
-- при добавлении работы и дальше правятся отдельно для этого объекта.
-- Формат: [{ "label": "…", "measure_unit": "ml" | null }]; число меры хранится в work_object_lines.measure.
alter table work_object_lines add column if not exists subs jsonb not null default '[]'::jsonb;
