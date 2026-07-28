-- Track who uploaded each document, and keep a durable history of
-- upload/delete actions even after a document itself is deleted.
-- Stored as auth.users.email (not employees.id) because the RH/comptable
-- logins aren't necessarily tied to an employee row — set server-side via
-- trigger so it can't be spoofed by the client.

alter table employee_documents add column if not exists uploaded_by_email text;

create table document_action_log (
  id            uuid primary key default gen_random_uuid(),
  employee_id   uuid not null references employees(id) on delete cascade,
  category_code text not null,
  file_name     text not null,
  action        text not null check (action in ('upload', 'delete')),
  actor_email   text,
  created_at    timestamptz not null default now()
);

alter table document_action_log enable row level security;

create policy document_action_log_admin_read on document_action_log for select using (
  current_role_name() in ('rh_admin', 'rh')
);

create or replace function log_employee_document_action() returns trigger
language plpgsql security definer as $$
begin
  if tg_op = 'INSERT' then
    new.uploaded_by_email := (select email from auth.users where id = auth.uid());
    insert into document_action_log (employee_id, category_code, file_name, action, actor_email)
    values (new.employee_id, new.category_code, new.file_name, 'upload', new.uploaded_by_email);
    return new;
  elsif tg_op = 'DELETE' then
    insert into document_action_log (employee_id, category_code, file_name, action, actor_email)
    values (old.employee_id, old.category_code, old.file_name, 'delete', (select email from auth.users where id = auth.uid()));
    return old;
  end if;
  return null;
end;
$$;

create trigger employee_documents_log_insert before insert on employee_documents
  for each row execute function log_employee_document_action();

create trigger employee_documents_log_delete before delete on employee_documents
  for each row execute function log_employee_document_action();

grant select on document_action_log to authenticated;
