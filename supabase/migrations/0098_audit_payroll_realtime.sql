-- Journal d'audit étendu à Primes & Bonus et affichage en temps réel.
-- Demandé le 06/10/2026 après qu'une saisie de la comptable ait été écrasée
-- sans laisser de trace ("вести учет точно кто какие изменения вносит").
--
-- Nouveau déclencheur, plus compact que log_audit_action() (0032) : sur un
-- UPDATE il n'enregistre que les champs RÉELLEMENT modifiés (avant/après) +
-- le contexte (employee_id, run_id, work_date…), et ne logue rien quand un
-- "Enregistrer" renvoie les mêmes valeurs — sans cela, chaque sauvegarde de
-- Primes & Bonus (toutes les lignes du mois) noierait le journal.
create or replace function log_audit_changes() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_email   text;
  v_role    text;
  v_old     jsonb;
  v_new     jsonb;
  v_old_c   jsonb := '{}'::jsonb;
  v_new_c   jsonb := '{}'::jsonb;
  v_key     text;
  v_context text[] := array['employee_id', 'run_id', 'work_date', 'team_id', 'role_label'];
begin
  v_role := current_role_name();

  -- Les pointages envoyés par les comptes équipe / le formulaire public n'ont
  -- pas de rôle : on ne les journalise pas (bruit), seulement les corrections
  -- faites par un compte avec rôle (grille de Primes & Bonus, etc.).
  if tg_table_name = 'pointage_entries' and v_role is null then
    return null;
  end if;

  select email into v_email from auth.users where id = auth.uid();

  if tg_op = 'INSERT' then
    insert into audit_log (entity_type, entity_id, action, actor_email, actor_role, new_data)
    values (tg_table_name, new.id::text, 'insert', v_email, v_role, to_jsonb(new));
    return null;
  elsif tg_op = 'DELETE' then
    insert into audit_log (entity_type, entity_id, action, actor_email, actor_role, old_data)
    values (tg_table_name, old.id::text, 'delete', v_email, v_role, to_jsonb(old));
    return null;
  end if;

  v_old := to_jsonb(old);
  v_new := to_jsonb(new);
  for v_key in select jsonb_object_keys(v_new) loop
    if v_key in ('updated_at', 'created_at') then
      continue;
    end if;
    if (v_old -> v_key) is distinct from (v_new -> v_key) then
      v_old_c := v_old_c || jsonb_build_object(v_key, v_old -> v_key);
      v_new_c := v_new_c || jsonb_build_object(v_key, v_new -> v_key);
    end if;
  end loop;

  if v_new_c = '{}'::jsonb then
    return null;
  end if;

  foreach v_key in array v_context loop
    if v_new ? v_key and not (v_new_c ? v_key) then
      v_old_c := v_old_c || jsonb_build_object(v_key, v_new -> v_key);
      v_new_c := v_new_c || jsonb_build_object(v_key, v_new -> v_key);
    end if;
  end loop;

  insert into audit_log (entity_type, entity_id, action, actor_email, actor_role, old_data, new_data)
  values (tg_table_name, new.id::text, 'update', v_email, v_role, v_old_c, v_new_c);
  return null;
end;
$$;

create trigger payroll_extras_audit
  after insert or update or delete on payroll_extras
  for each row execute function log_audit_changes();

create trigger payroll_day_notes_audit
  after insert or update or delete on payroll_day_notes
  for each row execute function log_audit_changes();

create trigger pointage_entries_audit
  after insert or update or delete on pointage_entries
  for each row execute function log_audit_changes();

create trigger employee_phones_audit
  after insert or update or delete on employee_phones
  for each row execute function log_audit_changes();

create trigger company_quality_bank_audit
  after insert or update or delete on company_quality_bank
  for each row execute function log_audit_changes();

create index if not exists audit_log_created_at_idx on audit_log (created_at desc);

-- Realtime : le journal (rh_admin) reçoit les nouvelles lignes en direct.
do $$
begin
  alter publication supabase_realtime add table audit_log;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;
