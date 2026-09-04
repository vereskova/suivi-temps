-- The employee profile only had one phone field ("Téléphone"). The source
-- "LISTE SALARIES" sheet tracks a personal number and a separate
-- professional/work number per employee — add a second column so both are
-- visible instead of collapsing them into one text field.
alter table employees add column if not exists phone_pro text;
