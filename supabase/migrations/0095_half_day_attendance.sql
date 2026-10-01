-- Demi-journée (0,5) dans la grille de présence de "Primes & Bonus" — un jour
-- travaillé mais compté pour 0,5 jour au lieu de 1 dans le total "Jours" qui
-- alimente Salaire jours. Distinct des types d'absence (maladie, CP, RTT…) :
-- ici l'employé est bien présent (is_absent reste false), seule la quotité
-- change. Demandé par l'utilisatrice, 01/10/2026.
alter table pointage_entries add column if not exists half_day boolean not null default false;
