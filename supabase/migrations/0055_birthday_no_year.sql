-- For employees whose exact birth year isn't known (so date_of_birth can't
-- be filled in without fabricating a year), this lets the day/month alone
-- still drive the "Anniversaire" notification — just without an age shown.
alter table employees add column if not exists birthday_month smallint check (birthday_month between 1 and 12);
alter table employees add column if not exists birthday_day smallint check (birthday_day between 1 and 31);
