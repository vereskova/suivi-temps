-- Норма и позиция «Dépose toiture fibrociment» (таблица норм от 28/10/2026 : 280 m² = 1 день).
-- Цена 19 €/m² - по devis VALENGIN (DEV000216). Количество вводится вручную (площадь фибро != площадь кровли).
-- Идемпотентно.
insert into commercial_duration_norms (code, label, label_ru, unit, mode, checklist_hint, position)
select 'rate_depose_fibrociment', 'Dépose fibrociment (m² en jour)', 'Dépose fibrociment (м² в день)', 'm2', 'rate',
       '280 m² = 1 день (производительность в день).', 26
where not exists (select 1 from commercial_duration_norms where code = 'rate_depose_fibrociment');

insert into commercial_duration_norm_points (norm_id, x, y, position)
select n.id, 280, 1, 1
from commercial_duration_norms n
where n.code = 'rate_depose_fibrociment'
  and not exists (select 1 from commercial_duration_norm_points p where p.norm_id = n.id);

insert into work_positions (section_code, position, label, unit, price_ht, norm_standard, norm_lt, norm_ombriere, norm_basis, qty_source)
select 'mo', (select coalesce(max(position), 0) + 1 from work_positions where section_code = 'mo'),
       'Dépose de la toiture en fibrociment non amianté', 'M2', 19,
       'rate_depose_fibrociment', 'rate_depose_fibrociment', 'rate_depose_fibrociment', 'qty', 'manual'
where not exists (select 1 from work_positions where section_code = 'mo' and label = 'Dépose de la toiture en fibrociment non amianté');
