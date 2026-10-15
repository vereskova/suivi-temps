-- Раздел «Ремонтники» (Réparation) : nouveau rôle de bureau pour les ouvriers de réparation
-- (LEONS Sergejs, VOZNISENSKIY Andrey). Demandé le 15/10/2026.
-- Pas de БАНК / équipe chantier pour eux : ils sont comptés comme « hors équipe » dans Primes & Bonus
-- et n'apparaissent plus dans la matrice Formations (chantier uniquement).
alter type bureau_role add value if not exists 'repair';
