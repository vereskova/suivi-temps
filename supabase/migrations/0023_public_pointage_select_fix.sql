-- 0022 granted anon INSERT/UPDATE on pointage_entries but missed that an
-- upsert (INSERT ... ON CONFLICT DO UPDATE) also needs SELECT to resolve the
-- conflict — without it PostgREST fails with "permission denied for table
-- pointage_entries" (confirmed live: the anon submit button errored out).
create policy pointage_select_anon on pointage_entries for select to anon using (true);
grant select on pointage_entries to anon;
