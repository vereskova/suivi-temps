-- Каталог работ (Modele_DEVIS_VLADIS2.xlsx) : разделы -> позиции -> подпозиции,
-- с нормами сроков (дни) по трём вариантам объекта : Standard / Avec LT / Ombrière.
-- Старые нормы и досье НЕ трогаем (они продолжают работать до замены на «Объекты»).

-- 1. Нормы : режим « rate » (производительность в день : количество / x * y) и
--    « хвост » после последнего порога (Standard : +1 день за каждые 23 kWc сверх 500).
alter table commercial_duration_norms drop constraint commercial_duration_norms_mode_check;
alter table commercial_duration_norms add constraint commercial_duration_norms_mode_check
  check (mode in ('linear', 'step_ceil', 'step_floor', 'rate'));

alter table commercial_duration_norms drop constraint commercial_duration_norms_unit_check;
alter table commercial_duration_norms add constraint commercial_duration_norms_unit_check
  check (unit in ('kwc', 'm', 'm2', 'piece'));

alter table commercial_duration_norms add column if not exists overflow_step numeric;
alter table commercial_duration_norms add column if not exists overflow_days numeric;

-- Pose SI / Pose PPV : в новой смете их нет - убираем (решение 11/11/2026). Точки удаляются каскадом.
delete from commercial_duration_norms where code in ('pose_si', 'pose_ppv');

-- 2. Новые нормы для сметы (старые коды, кроме Pose SI/PPV, не меняем).
insert into commercial_duration_norms (code, label, label_ru, unit, mode, checklist_hint, position, overflow_step, overflow_days) values
  ('mo_standard', 'Main-d''œuvre - Standard', 'Main-d''œuvre - Standard', 'kwc', 'step_floor',
   'Таблица 1 письма 11/11/2026. Свыше 500 kWc : +1 день за каждые 23 kWc.', 20, 23, 1),
  ('mo_lt', 'Main-d''œuvre - Avec LT', 'Main-d''œuvre - Avec LT', 'kwc', 'step_floor',
   'Таблица 2 письма 11/11/2026. Свыше 500 kWc - вне шкалы.', 21, null, null),
  ('mo_ombriere', 'Main-d''œuvre - Ombrière', 'Main-d''œuvre - Ombrière', 'kwc', 'step_floor',
   'Таблица 3 письма 11/11/2026. Свыше 1000 kWc - вне шкалы.', 22, null, null),
  ('rate_pose_bac_acier', 'Pose Bac acier (m² в день)', 'Pose Bac acier (м² в день)', 'm2', 'rate',
   '230 m² = 1 день (производительность в день).', 23, null, null),
  ('rate_depose_bac_acier', 'Dépose Bac acier (m² в день)', 'Dépose Bac acier (м² в день)', 'm2', 'rate',
   '360 m² = 1 день (производительность в день).', 24, null, null),
  ('rate_demontage_panneau', 'Démontage panneaux (pièces en jour)', 'Демонтаж панелей (шт. в день)', 'piece', 'rate',
   '150 panneaux = 1 день (производительность в день).', 25, null, null);

insert into commercial_duration_norm_points (norm_id, x, y, position)
select n.id, v.x, v.y, v.position
from commercial_duration_norms n
join (values
  ('mo_standard', 100, 5, 1), ('mo_standard', 200, 9, 2), ('mo_standard', 300, 13, 3),
  ('mo_standard', 400, 17, 4), ('mo_standard', 500, 21, 5),

  ('mo_lt', 100, 6, 1), ('mo_lt', 150, 8, 2), ('mo_lt', 200, 10, 3), ('mo_lt', 250, 12, 4),
  ('mo_lt', 300, 14, 5), ('mo_lt', 350, 16, 6), ('mo_lt', 400, 18, 7), ('mo_lt', 450, 20, 8), ('mo_lt', 500, 22, 9),

  ('mo_ombriere', 100, 5, 1), ('mo_ombriere', 200, 8, 2), ('mo_ombriere', 300, 12, 3), ('mo_ombriere', 400, 16, 4),
  ('mo_ombriere', 500, 20, 5), ('mo_ombriere', 600, 24, 6), ('mo_ombriere', 700, 28, 7), ('mo_ombriere', 800, 32, 8),
  ('mo_ombriere', 900, 36, 9), ('mo_ombriere', 1000, 40, 10),

  ('rate_pose_bac_acier', 230, 1, 1),
  ('rate_depose_bac_acier', 360, 1, 1),
  ('rate_demontage_panneau', 150, 1, 1)
) as v(code, x, y, position) on v.code = n.code;

-- Tirage de câble (письмо) : <50 = 0,5 ; 50-100 = 1 ; 101-200 = 2 ; 201-300 = 2,5 ; 301-400 = 3.
delete from commercial_duration_norm_points
  where norm_id = (select id from commercial_duration_norms where code = 'tirage_cable');
insert into commercial_duration_norm_points (norm_id, x, y, position)
select n.id, v.x, v.y, v.position
from commercial_duration_norms n
join (values (49, 0.5, 1), (100, 1, 2), (200, 2, 3), (300, 2.5, 4), (400, 3, 5)) as v(x, y, position)
  on n.code = 'tirage_cable';

-- 3. Каталог.
create table work_sections (
  code      text primary key,
  label     text not null,
  label_ru  text not null,
  position  integer not null
);

-- Позиция сметы (строка с отступом : Quantité / Unité / P.U HT).
-- norm_* : код нормы для каждого из трёх вариантов (null = срок не считается).
-- norm_basis : от чего считать норму - 'power' (kWc объекта), 'qty' (количество позиции),
--              'sub_measure' (мера в подпозиции, напр. « 90 ml »; если пусто - количество).
create table work_positions (
  id             uuid primary key default gen_random_uuid(),
  section_code   text not null references work_sections(code) on delete cascade,
  position       integer not null,
  label          text not null,
  label_ru       text,
  unit           text not null,
  price_ht       numeric,
  norm_standard  text references commercial_duration_norms(code) on update cascade on delete set null,
  norm_lt        text references commercial_duration_norms(code) on update cascade on delete set null,
  norm_ombriere  text references commercial_duration_norms(code) on update cascade on delete set null,
  norm_basis     text not null default 'qty' check (norm_basis in ('power', 'qty', 'sub_measure')),
  active         boolean not null default true
);
create index work_positions_section_idx on work_positions(section_code, position);

-- Подпозиция (строка на всю ширину под позицией) : описание, которое может меняться,
-- и необязательная мера (« 90 ml »), от которой считается норма.
create table work_subpositions (
  id              uuid primary key default gen_random_uuid(),
  position_id     uuid not null references work_positions(id) on delete cascade,
  position        integer not null,
  label           text not null,
  measure_value   numeric,
  measure_unit    text
);
create index work_subpositions_position_idx on work_subpositions(position_id, position);

alter table work_sections enable row level security;
alter table work_positions enable row level security;
alter table work_subpositions enable row level security;

grant select, insert, update, delete on work_sections, work_positions, work_subpositions to authenticated, service_role;

create policy work_sections_select on work_sections for select using (
  current_role_name() in ('commercial', 'commercial_rh', 'rh_admin')
);
create policy work_positions_select on work_positions for select using (
  current_role_name() in ('commercial', 'commercial_rh', 'rh_admin')
);
create policy work_subpositions_select on work_subpositions for select using (
  current_role_name() in ('commercial', 'commercial_rh', 'rh_admin')
);
create policy work_sections_write on work_sections for all using (current_role_name() = 'rh_admin')
  with check (current_role_name() = 'rh_admin');
create policy work_positions_write on work_positions for all using (current_role_name() = 'rh_admin')
  with check (current_role_name() = 'rh_admin');
create policy work_subpositions_write on work_subpositions for all using (current_role_name() = 'rh_admin')
  with check (current_role_name() = 'rh_admin');

-- 4. Данные : ровно как в Modele_DEVIS_VLADIS2.xlsx.
insert into work_sections (code, label, label_ru, position) values
  ('chantier',   'GESTION DE CHANTIER',            'Организация объекта',           1),
  ('mo',         'MAIN-D''ŒUVRE',                  'Рабочая сила',                  2),
  ('reception',  'RÉCEPTION ET AUTOCONTRÔLES',     'Приёмка и самоконтроль',        3),
  ('fournitures','FOURNITURES, QUINCAILLERIE ET MATÉRIEL', 'Материалы и комплектующие', 4);

-- Позиции : (раздел, порядок, название, единица, цена, нормы std/lt/omb, основа)
insert into work_positions (section_code, position, label, unit, price_ht, norm_standard, norm_lt, norm_ombriere, norm_basis) values
  ('chantier', 1, 'Pose & dépose sécurité collective en périphérie', 'U', 1500, 'securite_collective', 'securite_collective', 'securite_collective', 'power'),
  ('chantier', 2, 'Pose de filet de sécurité sous bac acier', 'M2', 4.5, 'filet_sur_face', 'filet_sur_face', 'filet_sur_face', 'qty'),
  ('chantier', 3, 'Benne (DIB)', 'U', 1350, null, null, null, 'qty'),
  ('chantier', 4, 'Location d''engin', 'semaine', 1950, null, null, null, 'qty'),

  ('mo', 1, 'Main-d''œuvre', 'Kwc', 70, 'mo_standard', 'mo_lt', 'mo_ombriere', 'power'),
  ('mo', 2, 'Pose Bac acier', 'M2', 7, 'rate_pose_bac_acier', 'rate_pose_bac_acier', 'rate_pose_bac_acier', 'qty'),
  ('mo', 3, 'Tirage AC', 'U', 1500, 'tirage_cable', 'tirage_cable', 'tirage_cable', 'sub_measure'),
  ('mo', 4, 'Tirage AC', 'Ml', 15, 'tirage_cable', 'tirage_cable', 'tirage_cable', 'sub_measure'),
  ('mo', 5, 'Pose des rives et faîtages', 'jour', 0, null, null, null, 'qty'),
  ('mo', 6, 'Pose des gouttières', 'jour', 0, null, null, null, 'qty'),
  ('mo', 7, 'Fourniture et pose des rives', 'Ml', 52, null, null, null, 'qty'),
  ('mo', 8, 'Fourniture et pose des faîtages', 'Ml', 56, null, null, null, 'qty'),
  ('mo', 9, 'Démontage des panneaux', 'pièce', 15, 'rate_demontage_panneau', 'rate_demontage_panneau', 'rate_demontage_panneau', 'qty'),

  ('reception', 1, 'Étude projet + DOE', 'U', 0, null, null, null, 'qty'),
  ('reception', 2, 'CONSUEL', 'U', 450, null, null, null, 'qty'),
  ('reception', 3, 'CONSUEL (sans DRE)', 'U', 450, null, null, null, 'qty'),
  ('reception', 4, 'En option : Vérification de l''installation électrique par un organisme d''inspection agréé', 'forfait', 1000, null, null, null, 'qty'),

  ('fournitures', 1, 'Système d''intégration', 'Kwc', 40, null, null, null, 'qty'),
  ('fournitures', 2, 'SHELTERS', 'U', 0, null, null, null, 'qty'),
  ('fournitures', 3, 'Fournitures AC', 'U', 0, null, null, null, 'qty'),
  ('fournitures', 4, 'Chemin de câbles avec capot', 'ml', 0, null, null, null, 'qty'),
  ('fournitures', 5, 'Matériel elec', 'kwc', 18.6, null, null, null, 'qty'),
  ('fournitures', 6, 'Petit matériel', 'kwc', 6.26, null, null, null, 'qty');

-- Подпозиции (под нужной позицией, в том же порядке, что в таблице).
insert into work_subpositions (position_id, position, label, measure_value, measure_unit)
select p.id, v.pos, v.label, v.mval, v.munit
from work_positions p
join (values
  ('chantier', 4, 1, E'NACELLE ARTICULEE DIESEL\nCHARIOT TEL', null::numeric, null::text),
  ('mo', 1, 1, E'POSE SI OptiRoof pour les PST/DC/PPV/MALT/CDC\nCâblage AC/DC local', null, null),
  ('mo', 3, 1, '*Pour un tirage AC jusqu''à 100 mètres, le coût est toujours de 1 500 €.', 90, 'ml'),
  ('mo', 4, 1, '', 190, 'm'),
  ('reception', 1, 1, E'• Etudes d''exécution (Plan de calepinage & plan de chaines PV, note de calcul DC et AC & schéma unifilaire)\n• Assemblage du Dossier des Ouvrages Exécutés', null, null),
  ('reception', 3, 1, 'Dépot du dossier + attestation', null, null),
  ('reception', 4, 1, E'• Coordination et suivi\n• Intervention du bureau de contrôle', null, null),
  ('fournitures', 1, 1, 'Kit Bride Latérale 30-31 / KIT BRIDE CENTRALE ST02 30-50 TERRAGRIF / Kit Bride centrale ST02 30-50 / vis BZB 6,3 x 22mm inox / Rail Optiroof SUNSHINE + joint', null, null),
  ('fournitures', 2, 1, E'• SHELTER POUR 2 ONDULEURS (PDL 1) + SHELTER POUR 2 ONDULEURS (PDL 2)\n• Dalle Préfa CT XL - 2 p\n• Livraison', null, null),
  ('fournitures', 3, 1, E'Câble U1000 AR2V aluminium 4×(2×(1×240)) + 1G25_185 ml\nCâble U1000 R2V 2×1,5 mm² _185 ml\nFourreau Ø160 (2 par PDL)_370 ml\nFourreau Ø63 (1 par PDL) _185 ml\nCâble R2V FLEX 4×1×150 mm² _6 ml\nCX 240-12-Cosse Alu-Cuivre courte 240mm² -Bornage 12mm _32 p\nCosse tubulaire cuivre 25 mm² - PE 1G25_4 p\nGTI 3000 39/13mm Gaine Thermorétractable paroi mince en barre de 1m Noir\nGTI 3000 39/13mm Gaine Thermorétractable paroi mince en barre de 1m Bleu', null, null),
  ('fournitures', 4, 1, E'• Chemin de câbles (toiture, descente façade, local technique) 150mm\n• Couvercle de chemin de câbles 150mm\n• Éclisses de jonction avec boulonnerie, agrafes, tés', null, null),
  ('fournitures', 5, 1, 'cable DC / vert/jeune / connecteur / etc.', null, null),
  ('fournitures', 6, 1, 'Étiquettes / Surflex / CDC / Vis', null, null)
) as v(section_code, ppos, pos, label, mval, munit)
  on p.section_code = v.section_code and p.position = v.ppos;
