-- VOLDIS : la banque est Crédit Agricole (relevés importés en fichier), pas Qonto.
-- 0115 avait d'abord été exécutée avec la colonne qonto_id ; on aligne la table bancaire
-- (vide à ce stade) sur la version finale de 0115.
alter table voldis_bank_transactions rename column qonto_id to external_id;
alter table voldis_bank_transactions add column if not exists source text not null default 'import';
alter table voldis_bank_transactions add column if not exists category text;
