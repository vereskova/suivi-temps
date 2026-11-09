-- Primes & Bonus : commentaire (raison) sur la colonne « Оспорено, возврат € » (penalite_contestee),
-- avec auteur et date comme les autres commentaires (voir 0091).
alter table payroll_extras add column if not exists penalite_contestee_raison text;
alter table payroll_extras add column if not exists penalite_contestee_raison_by text;
alter table payroll_extras add column if not exists penalite_contestee_raison_at timestamptz;
