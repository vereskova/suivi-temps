-- "часы работы.numbers" (mois de référence : septembre 2026) montre que le
-- taux de vacance n'est PAS un 55€/jour unique pour tout le monde — il varie
-- par salarié exactement comme taux_journalier (55, 60, 65, 75, jusqu'à
-- 120€/jour selon la personne). Le code portait un seul taux global
-- (VACANCE_JOUR_RATE = 55) confirmé sur août, où ça ne se voyait pas encore.
alter table payroll_extras add column if not exists vacance_taux_journalier numeric(6,2) not null default 55;
