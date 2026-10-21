-- VOLDIS : occupants sans bail écrit / paiement en espèces (lots 8 et 9, conteneur K),
-- pour que le plan du site montre qui occupe quoi même hors contrat et hors virement bancaire.
alter table voldis_properties add column if not exists occupant text;
alter table voldis_properties add column if not exists pays_cash boolean not null default false;
