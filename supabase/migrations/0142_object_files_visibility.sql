-- Файлы объектов: отметка « видно бригаде ». Сметы, заказы и счета бригадир не должен видеть (кабинет /brigadir).
alter table work_object_files add column if not exists team_visible boolean not null default true;
