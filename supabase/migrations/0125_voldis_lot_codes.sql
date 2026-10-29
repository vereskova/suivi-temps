-- VOLDIS : номера помещений приведены к обозначениям таблицы Ajax и новому плану (фото с красными линиями).
--   здание A (верхнее левое, 5 ячеек): 1-5 -> A1-A5
--   здание B (центральное, 6 ячеек):   6 -> B1 (северо-восточная полоса, VLADIS), 7 -> B2 (большая средняя часть),
--                                       8 -> B3, 9 -> B4, плюс две новые ячейки B5 и B6 в юго-западной полосе
--   контейнер K остаётся как есть.
-- Договоры, платежи и банк привязаны к помещению по id, поэтому не затрагиваются.

update voldis_properties set lot_number = case lot_number
  when '1' then 'A1' when '2' then 'A2' when '3' then 'A3' when '4' then 'A4' when '5' then 'A5'
  when '6' then 'B1' when '7' then 'B2' when '8' then 'B3' when '9' then 'B4'
end
where lot_number in ('1','2','3','4','5','6','7','8','9');

update voldis_properties set label = 'Помещение ' || lot_number where lot_number ~ '^[AB][0-9]$';

insert into voldis_properties (lot_number, label, address, kind, status)
select v.lot, 'Помещение ' || v.lot, '590 chemin d''Engoudes, 31450 Baziège', 'Склад', 'available'
from (values ('B5'), ('B6')) as v(lot)
where not exists (select 1 from voldis_properties p where p.lot_number = v.lot);

-- Примечания в договорах, где упоминались старые номера
update voldis_leases set notes = replace(notes, 'Ancien lot 1 - déménagé au lot 7', 'Ancien lot A1 - déménagé au lot B2') where notes like '%Ancien lot 1 - déménagé au lot 7%';
update voldis_leases set notes = replace(notes, 'le lot 7 est repris', 'le lot B2 est repris') where notes like '%le lot 7 est repris%';
update voldis_leases set notes = replace(notes, 'Déménagé du lot 1', 'Déménagé du lot A1') where notes like '%Déménagé du lot 1%';

-- Таблица Ajax: Lux Motors теперь в B2, Rémy Métois в B3 (A3-A5 уже совпадают)
update voldis_ajax_access set lot = 'B2' where company = 'LUX MOTORS' and lot = 'A1';
update voldis_ajax_access set lot = 'B3' where company = 'REMY METOIS' and lot = 'B2';
