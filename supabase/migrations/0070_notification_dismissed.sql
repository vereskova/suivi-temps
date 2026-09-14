-- "Marked read" (seen/manual_unread) only ever changed the row's highlight
-- — the row itself kept showing forever, since the list is recomputed live
-- from documents/visits/birthdays each time. RH wants a real way to make a
-- handled/acknowledged item stop showing, even while the underlying date
-- hasn't changed (e.g. she knows about an overdue reminder and is already
-- on it) — a third, stronger flag alongside the existing two.
alter table notification_flags add column if not exists dismissed boolean not null default false;
