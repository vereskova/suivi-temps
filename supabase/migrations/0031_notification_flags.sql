-- Notification read/unread state used to live in each browser's
-- localStorage (per user's request, on reflection: it should be shared
-- across everyone with rh_admin/rh access, like a team inbox, not siloed
-- per computer). notification_key mirrors the client-side key format
-- `${employeeId}|${type}|${date}` — there's no separate notifications
-- table; these are computed on the fly from documents/visits/birthdays, so
-- this table only ever tracks the two boolean flags the UI needs:
--   seen           — true once someone has opened the Notifications page
--                    while this key was in the list (clears the red dot)
--   manual_unread  — true when someone explicitly flagged it back as
--                    unread (either "mark all unread" from the nav link,
--                    or a right-click on a single row) — takes priority
--                    over `seen` so it isn't immediately re-marked seen
--                    the next time the page auto-marks everything.
create table notification_flags (
  notification_key text primary key,
  seen boolean not null default false,
  manual_unread boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table notification_flags enable row level security;

-- Shared state, so both rh_admin and rh (the only roles that see the
-- Notifications view) can read and write every row — no per-user column.
create policy notification_flags_select on notification_flags for select using (
  current_role_name() in ('rh_admin', 'rh')
);
create policy notification_flags_insert on notification_flags for insert with check (
  current_role_name() in ('rh_admin', 'rh')
);
create policy notification_flags_update on notification_flags for update using (
  current_role_name() in ('rh_admin', 'rh')
) with check (
  current_role_name() in ('rh_admin', 'rh')
);
