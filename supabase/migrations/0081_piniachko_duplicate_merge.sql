-- PINIACHKO Aleksandr (a851be99) is a duplicate/ghost of PINIACHKO Oleksandr
-- (effb615d): zero documents ever uploaded, no NAS folder ever found, and its
-- date_of_birth is identical to its own hire_date (2024-03-25 = 2024-03-25) —
-- a data-entry duplication bug, not a real birthdate. Meanwhile registre row
-- #44, currently linked to the ghost, has date_entree/date_sortie
-- (25/03/2024 -> 26/09/2025) that match EXACTLY what Oleksandr's own signed
-- contract, BTP card, certificat de travail and reçu solde de tout compte
-- (28 real uploaded documents) show. Reassign the registre row to the real
-- person, backfill his employee record from it, and remove the ghost.
-- One-off data fix, not a schema change — safe to run once.

-- 1. Registre row #44 now belongs to the real employee.
update registre_unique_personnel
set employee_id = 'effb615d-c5ae-445e-8448-12fb9315ea7c'
where id = 'd2cdf11d-1d67-492e-b183-4c8218ece1b7'
  and employee_id = 'a851be99-7359-4711-b7a5-d953613cbc07';

-- 2. Oleksandr's own hire_date/end_date were never filled in — backfill from
--    the now-correctly-linked registre row (only if still unset, so this is
--    safe to re-run).
update employees
set hire_date = coalesce(hire_date, '2024-03-25'),
    end_date = coalesce(end_date, '2025-09-26'),
    status = 'terminated'
where id = 'effb615d-c5ae-445e-8448-12fb9315ea7c';

-- 3. The ghost's only non-empty field (nationality) carries over if
--    Oleksandr doesn't already have one set.
update employee_confidential
set nationality = coalesce(nationality, 'France')
where employee_id = 'effb615d-c5ae-445e-8448-12fb9315ea7c';

-- 4. Remove the ghost record entirely — verified first that nothing else
--    references it (no pointage, no documents, no payroll, no audit trail
--    beyond its own row history).
delete from employee_confidential where employee_id = 'a851be99-7359-4711-b7a5-d953613cbc07';
delete from employees where id = 'a851be99-7359-4711-b7a5-d953613cbc07';
