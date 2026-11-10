-- Публикация бонусов и штрафов : бригады видят их на странице /equipe/<ссылка> только после того,
-- как rh_admin нажал « Опубликовать » за месяц (окончательные данные).
-- Месяцы до октября 2026 считаются уже опубликованными, чтобы ничего не пропало.
alter table payroll_runs add column if not exists extras_published_at timestamptz;
alter table payroll_runs add column if not exists extras_published_by text;

update payroll_runs
   set extras_published_at = coalesce(extras_published_at, now()),
       extras_published_by = coalesce(extras_published_by, 'migration 0131')
 where month < date '2026-10-01';
