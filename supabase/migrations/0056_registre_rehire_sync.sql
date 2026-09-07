-- 0048 explicitly left rehiring unhandled ("the register's own convention
-- is that a returning employee gets a fresh row... that case still needs a
-- manual entry"). In practice this keeps happening (STARCICOV Andrei is on
-- his third episode) and each time needs a manual fix — so handle it the
-- same way as a fresh insert: a status flip from 'terminated' back to
-- 'active' creates a new registre row using the employee's current
-- hire_date, exactly like sync_registre_on_employee_insert() does for a
-- brand-new employee.
create or replace function sync_registre_on_employee_rehire() returns trigger
language plpgsql security definer as $$
declare
  next_numero integer;
begin
  if old.status = 'terminated' and new.status <> 'terminated' then
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
  end if;
  return new;
end;
$$;

create trigger employees_registre_rehire after update on employees
  for each row execute function sync_registre_on_employee_rehire();
