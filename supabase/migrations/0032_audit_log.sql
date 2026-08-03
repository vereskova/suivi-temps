-- Generic audit trail for the three modules where "who changed what, and
-- when" matters most for legal/financial exposure: employee records, the
-- legal hiring register, and payroll lines. Deliberately trigger-based
-- (same pattern as document_action_log in 0024) rather than a client-side
-- logging call at each write site — a trigger can't be forgotten by a
-- future code change the way a manual logAudit() call at N call sites can.
-- Scoped to these three tables only (not employee_confidential, not every
-- table in the app) per product decision — the goal is covering the
-- modules with real audit exposure, not a blanket change-log for everything.
create table audit_log (
  id            uuid primary key default gen_random_uuid(),
  entity_type   text not null,
  entity_id     text not null,
  action        text not null check (action in ('insert', 'update', 'delete')),
  actor_email   text,
  actor_role    text,
  old_data      jsonb,
  new_data      jsonb,
  created_at    timestamptz not null default now()
);

alter table audit_log enable row level security;

-- Read access is rh_admin-only — this is an oversight/compliance tool, not
-- a feature for the roles being audited to browse.
create policy audit_log_admin_read on audit_log for select using (
  current_role_name() = 'rh_admin'
);

create or replace function log_audit_action() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_email text;
  v_role text;
begin
  select email into v_email from auth.users where id = auth.uid();
  v_role := current_role_name();

  if tg_op = 'INSERT' then
    insert into audit_log (entity_type, entity_id, action, actor_email, actor_role, new_data)
    values (tg_table_name, new.id::text, 'insert', v_email, v_role, to_jsonb(new));
    return new;
  elsif tg_op = 'UPDATE' then
    insert into audit_log (entity_type, entity_id, action, actor_email, actor_role, old_data, new_data)
    values (tg_table_name, new.id::text, 'update', v_email, v_role, to_jsonb(old), to_jsonb(new));
    return new;
  elsif tg_op = 'DELETE' then
    insert into audit_log (entity_type, entity_id, action, actor_email, actor_role, old_data)
    values (tg_table_name, old.id::text, 'delete', v_email, v_role, to_jsonb(old));
    return old;
  end if;
  return null;
end;
$$;

create trigger employees_audit
  after insert or update or delete on employees
  for each row execute function log_audit_action();

create trigger registre_unique_personnel_audit
  after insert or update or delete on registre_unique_personnel
  for each row execute function log_audit_action();

create trigger payroll_line_items_audit
  after insert or update or delete on payroll_line_items
  for each row execute function log_audit_action();

grant select on audit_log to authenticated;
