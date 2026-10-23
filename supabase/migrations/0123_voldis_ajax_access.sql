-- VOLDIS : доступы Ajax (сигнализация) - кто из арендаторов и сотрудников имеет доступ в приложение Ajax.
-- Заменяет таблицу Ajax.numbers. Доступ только у rh_admin. Пароли и коды здесь не хранятся.

create table voldis_ajax_access (
  id         uuid primary key default gen_random_uuid(),
  position   int not null default 0,
  tenant_id  uuid references voldis_tenants(id) on delete set null,   -- арендатор из раздела «Аренда локалей» (если привязан)
  company    text,                                                   -- подпись группы, если арендатора нет (VLADIS, бригады)
  lot        text,
  email      text,
  name       text,
  phone      text,
  rights     text,                                                   -- что разрешено: полный доступ, охрана вкл/выкл, только уведомления и т.д.
  notes      text,
  status     text not null default 'active' check (status in ('active', 'removed')),
  created_at timestamptz not null default now()
);
create index voldis_ajax_access_position_idx on voldis_ajax_access (position);
create index voldis_ajax_access_tenant_idx on voldis_ajax_access (tenant_id);

alter table voldis_ajax_access enable row level security;
create policy voldis_ajax_access_admin on voldis_ajax_access for all
  using (current_role_name() = 'rh_admin') with check (current_role_name() = 'rh_admin');
grant select, insert, update, delete on voldis_ajax_access to authenticated, service_role;

insert into voldis_ajax_access (position, company, lot, email, name, phone, notes, status) values
  (1,  'VLADIS', null, 'vladis777fr@gmail.com', 'Владимир', '07 85 93 36 23', null, 'active'),
  (2,  'VLADIS', null, 'alyonavolodarska@icloud.com', 'Алена', '07 80 20 75 70', null, 'active'),
  (3,  'VLADIS', null, 'voronev@ukr.net', 'Женя', '07 80 12 98 10', null, 'active'),
  (4,  'VLADIS', null, 'stafiiboris@gmail.com', 'Борис', '07 83 69 36 56', null, 'active'),
  (5,  'VLADIS', null, 'directeurvladis@icloud.com', 'Ольга', '06 82 49 98 05', null, 'active'),
  (6,  'VLADIS', null, 'assistant@vladis.fr', 'Ирина', '+33 7 70 08 45 23', null, 'active'),
  (7,  'VLADIS', null, 'grigorijrasolov@gmail.com', 'Гриша', '+373 77 56 29 81', null, 'active'),
  (8,  'VLADIS', null, 'shurik.birch@gmail.com', 'Сын Жени', '07 80 12 98 28', null, 'active'),
  (9,  'ISPRA INSTITUT', 'B1', 'yann.serra@ispra-connect.com', null, null, null, 'active'),
  (10, 'ISPRA INSTITUT', 'B1', 'camille.a.kaffy@gmail.com', 'Camille', null, null, 'active'),
  (11, 'REMY METOIS', 'B2', 'metoisremi@gmail.com', 'Remi', null, null, 'active'),
  (12, 'LUX MOTORS', 'A1', 'contact@luxmotors.fr', 'Лев', '06 47 33 93 73', null, 'active'),
  (13, 'HISTOIRE', 'A3', 'ma.pieroni31@gmail.com', 'Marco', null, 'Bos', 'active'),
  (14, 'HISTOIRE', 'A3', 'itecphone@gmail.com', 'Charles-Eric', '07 61 17 44 15', null, 'active'),
  (15, 'HISTOIRE', 'A3', 'eothe13@gmail.com', 'Theo', '06 46 81 09 86', null, 'active'),
  (16, 'HISTOIRE', 'A3', 'tristan.vaille@histoiredefacade.fr', 'Tristan', '07 83 40 68 44', null, 'active'),
  (17, 'HISTOIRE', 'A3', 'tristan.vaille@histoiredefacade.fr', 'Camille', '06 31 26 24 06', null, 'active'),
  (18, 'HISTOIRE', 'A3', 'tristan.vaille@histoiredefacade.fr', 'Cédric', '07 84 22 22 82', null, 'active'),
  (19, 'HISTOIRE', 'A3', 'contact.histoiredefacade@gmail.com', 'Roues', null, null, 'active'),
  (20, 'HISTOIRE', 'A3', 'labaunecamille74@gmail.com', 'Camille', null, null, 'active'),
  (21, 'MIDOC JOUET', 'A4', 'stepha1512@hotmail.fr', 'Stephanie', '06 07 89 30 97', null, 'active'),
  (22, 'T2A&Co', 'A5', 'clemendot.t2@gmail.com', 'Thomas Clemendot', '06 58 07 35 76', null, 'active'),
  (23, 'T2A&Co', 'A5', 'Florian.golmard@gmail.com', 'Florian Golmard', '07 46 31 54 17', null, 'active'),
  (24, 'T2A&Co', 'A5', 'mathias31320@gmail.com', 'Mathias Collinet', '06 98 57 47 24', null, 'active'),
  (25, 'T2A&Co', 'A5', 'lizon@t-2-a.com', 'Anthony Lizon', '07 85 60 79 26', null, 'active'),
  (26, 'SPOOMS TRAITEUR', null, 'spoomstraiteur@gmail.com', null, null, 'Удалён', 'removed'),
  (27, 'Бригады VLADIS', 'K1', 'komanda_1@icloud.com', 'Бригада 1', null, null, 'active'),
  (28, 'Бригады VLADIS', 'K1', 'komanda_2@icloud.com', 'Бригада 2', null, null, 'active'),
  (29, 'Бригады VLADIS', 'K1', 'komanda_3@icloud.com', 'Бригада 3', null, null, 'active'),
  (30, 'Бригады VLADIS', 'K1', 'komanda_4@icloud.com', 'Бригада 4', null, null, 'active'),
  (31, 'Бригады VLADIS', 'K1', 'komanda_5@icloud.com', 'Бригада 5', null, null, 'active'),
  (32, 'Бригады VLADIS', 'K1', 'komanda_6@icloud.com', 'Бригада 6', null, null, 'active'),
  (33, 'Бригады VLADIS', 'K1', 'komanda_7@icloud.com', 'Бригада 7', null, null, 'active'),
  (34, 'Бригады VLADIS', 'K1', 'komanda8Vladis@icloud.com', 'Бригада 8', null, null, 'active'),
  (35, 'Бригады VLADIS', 'K1', 'komanda_9@icloud.com', 'Бригада 9', null, null, 'active'),
  (36, 'Бригады VLADIS', 'K1', 'komanda_10@icloud.com', 'Бригада 10', null, null, 'active'),
  (37, 'Бригады VLADIS', 'K1', 'conducteur_2@icloud.com', 'Водитель 2', null, null, 'active'),
  (38, 'Бригады VLADIS', 'K1', 'formation_vladis@icloud.com', 'Обучение', null, null, 'active');

-- Привязка к арендаторам по названию (проверяется и правится в разделе Ajax).
update voldis_ajax_access a set tenant_id = t.id
from voldis_tenants t
where a.tenant_id is null
  and a.company not like 'Бригады%'
  and (
    upper(regexp_replace(t.name, '[^A-Za-z0-9]', '', 'g')) = upper(regexp_replace(a.company, '[^A-Za-z0-9]', '', 'g'))
    or (a.company = 'HISTOIRE' and t.name = 'HISTOIRE DE FACADE')
    or (a.company = 'REMY METOIS' and t.name = 'METOIS REMY')
    or (a.company = 'MIDOC JOUET' and t.name = 'MIDOC JOUETS')
  );
