-- Часы в дороге : nouvelles colonnes "heures route" (saisies à la main,
-- comme le reste de Primes & Bonus) et le statut "chauffeur", qui change le
-- taux appliqué (90/8 = 11,25 €/h chauffeur, sinon 9,61 €/h — SMIC net
-- horaire, cf. 12,31 €/h brut × (1 − 21,97 %) déjà utilisé dans Paie).
-- is_driver est un attribut durable du salarié (comme chef d'équipe), pas
-- mensuel — d'où la place dans employees plutôt que payroll_extras.
-- Confirmé avec l'utilisatrice, 30/09/2026.
alter table employees add column if not exists is_driver boolean not null default false;
alter table payroll_extras add column if not exists heures_route numeric(6,2) not null default 0;
