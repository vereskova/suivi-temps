-- 0149: строки « не работа » (техника, бенна и т.п.) - только информация для команды.
-- Такие строки не считаются работами: у них нет кнопки « Начали », они не входят в « 3 из 12 » и не мешают собрать контрандю.
alter table work_positions add column if not exists is_info boolean not null default false;
alter table work_object_lines add column if not exists is_info boolean not null default false;

-- Каталог: аренда техники и бенна - информация
update work_positions set is_info = true where section_code = 'chantier' and position in (3, 4);

-- Уже созданные строки объектов по этим позициям
update work_object_lines l set is_info = true
from work_positions p
where l.catalog_position_id = p.id and p.is_info = true;
