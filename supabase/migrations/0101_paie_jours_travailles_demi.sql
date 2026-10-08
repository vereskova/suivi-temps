-- Jours travaillés avec demi-journées (15,5) : la colonne était un entier.
-- Les valeurs existantes sont conservées telles quelles. Demandé le 08/10/2026
-- (jours repris de Primes & Bonus, où une demi-journée vaut 0,5).
alter table payroll_line_items alter column jours_travailles type numeric(5,1) using jours_travailles::numeric;
