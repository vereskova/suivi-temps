-- Registre du personnel had no way to stay in sync with Effectif: nothing
-- created a row for a new hire, and nothing closed one out on termination —
-- someone had to remember to edit the register by hand every time, which
-- wasn't happening (new employees never appeared; departed ones never got
-- a date_sortie). Two triggers close that gap going forward.
--
-- FOP contractors (contract_type = 'FOP') are excluded — they're
-- freelancers, not salariés, and don't belong on the legal register. This
-- only catches contract_type known at creation time; an employee switched
-- to FOP after the fact keeps whatever registre row was already created.
--
-- Rehiring an existing employee record (status flipped back to active
-- after being terminated) is NOT handled here — the register's own
-- convention is that a returning employee gets a fresh row, which this
-- trigger doesn't attempt to detect; that case still needs a manual entry.
create or replace function sync_registre_on_employee_insert() returns trigger
language plpgsql security definer as $$
declare
  next_numero integer;
begin
  if new.contract_type is not distinct from 'FOP' then
    return new;
  end if;

  select coalesce(max(numero), 0) + 1 into next_numero from registre_unique_personnel;

  insert into registre_unique_personnel (
    numero, nom_prenom, date_entree, date_naissance, sexe, emploi, qualification, type_contrat, employee_id
  ) values (
    next_numero,
    new.last_name || ' ' || new.first_name,
    new.hire_date,
    new.date_of_birth,
    new.sex,
    new.job_title,
    new.qualification,
    new.contract_type,
    new.id
  );
  return new;
end;
$$;

create trigger employees_registre_insert after insert on employees
  for each row execute function sync_registre_on_employee_insert();

-- Closes the most recent open registre entry when status flips to
-- "terminated" — falls back to today's date if end_date isn't filled in
-- yet, since "we're processing the termination now" is the one fact we
-- actually know at that moment.
create or replace function sync_registre_on_employee_terminate() returns trigger
language plpgsql security definer as $$
begin
  if new.status = 'terminated' and old.status is distinct from 'terminated' then
    update registre_unique_personnel
    set date_sortie = coalesce(new.end_date, current_date)
    where employee_id = new.id and date_sortie is null;
  end if;
  return new;
end;
$$;

create trigger employees_registre_terminate after update on employees
  for each row execute function sync_registre_on_employee_terminate();
