-- Автоматические количества в смете объекта: у позиции каталога есть правило « откуда берётся количество »,
-- у объекта - параметры (мощность, площадь кровли, число панелей, длина кабеля AC).
--   manual - вводится вручную; fixed - всегда 1; power - kWc объекта; roof_m2 - площадь кровли;
--   panels - число панелей; cable_m - длина кабеля AC, м; weeks - недель работы (ceil(рабочих дней / 5)).
-- Если в смете объекта количество поправили руками (qty_manual), оно больше не пересчитывается.

alter table work_positions add column if not exists qty_source text not null default 'manual'
  check (qty_source in ('manual', 'fixed', 'power', 'roof_m2', 'panels', 'cable_m', 'weeks'));

alter table work_objects add column if not exists roof_m2 numeric;
alter table work_objects add column if not exists panels_count integer;
alter table work_objects add column if not exists cable_m numeric;

alter table work_object_lines add column if not exists qty_source text not null default 'manual';
alter table work_object_lines add column if not exists qty_manual boolean not null default false;
alter table work_object_lines add column if not exists measure_manual boolean not null default false;

-- Правила по шаблону VLADIS (Modele_DEVIS_VLADIS2.xlsx).
update work_positions set qty_source = 'fixed' where section_code = 'chantier' and label = 'Pose & dépose sécurité collective en périphérie';
update work_positions set qty_source = 'roof_m2' where section_code = 'chantier' and label = 'Pose de filet de sécurité sous bac acier';
update work_positions set qty_source = 'weeks' where section_code = 'chantier' and label = 'Location d''engin';
update work_positions set qty_source = 'power' where section_code = 'mo' and label = 'Main-d''œuvre';
update work_positions set qty_source = 'roof_m2' where section_code = 'mo' and label = 'Pose Bac acier';
update work_positions set qty_source = 'fixed' where section_code = 'mo' and label = 'Tirage AC' and unit = 'U';
update work_positions set qty_source = 'cable_m' where section_code = 'mo' and label = 'Tirage AC' and unit = 'Ml';
update work_positions set qty_source = 'panels' where section_code = 'mo' and label = 'Démontage des panneaux';
update work_positions set qty_source = 'fixed' where section_code = 'reception';
update work_positions set qty_source = 'power' where section_code = 'fournitures' and label in ('Système d''intégration', 'Matériel elec', 'Petit matériel');
