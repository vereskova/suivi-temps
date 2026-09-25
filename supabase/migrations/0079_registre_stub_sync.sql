-- "+ Nouvel employé" (Checklists RH / Employés) only needs a first and last
-- name — but 0048's insert trigger still fires immediately and creates a
-- registre row from whatever's on the employee record at that instant,
-- which is mostly null. Filling in hire_date, date_of_birth, etc. on the
-- employee afterwards (as normal) never touched that row, leaving a
-- registre entry with a real numero but a blank date_entree — invisible to
-- anything sorting or filtering on it (see DOVHAL Yevhenii, 2026-09-25).
--
-- Both triggers only ever touch a registre row that still has date_entree
-- is null (the unmistakable "stub, never finished" signal) and only fill a
-- field that's itself still null — so a real, already-complete episode is
-- never touched, and a value someone typed directly into the registre is
-- never overwritten.
create or replace function sync_registre_stub_from_employee() returns trigger
language plpgsql security definer as $$
begin
  update registre_unique_personnel
  set
    date_entree = coalesce(date_entree, new.hire_date),
    date_naissance = coalesce(date_naissance, new.date_of_birth),
    sexe = coalesce(sexe, new.sex),
    emploi = coalesce(emploi, new.job_title),
    qualification = coalesce(qualification, new.qualification),
    type_contrat = coalesce(type_contrat, new.contract_type),
    nom_prenom = coalesce(nullif(nom_prenom, ''), new.last_name || ' ' || new.first_name)
  where employee_id = new.id
    and date_entree is null;
  return new;
end;
$$;

create trigger employees_registre_stub_sync after update on employees
  for each row execute function sync_registre_stub_from_employee();

create or replace function sync_registre_stub_from_confidential() returns trigger
language plpgsql security definer as $$
begin
  update registre_unique_personnel
  set nationalite = coalesce(nationalite, new.nationality)
  where employee_id = new.employee_id
    and date_entree is null;
  return new;
end;
$$;

create trigger employee_confidential_registre_stub_sync after insert or update on employee_confidential
  for each row execute function sync_registre_stub_from_confidential();
