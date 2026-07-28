-- Explicit product decision: drop the login requirement for the daily pointage
-- form at "/". Team leads found the magic-link email round-trip too much
-- friction on their phones every workday, and the team is fine with anyone who
-- has the link being able to submit hours for any team — there's no sensitive
-- data on that form and a wrong entry there isn't a real problem. The RH panel
-- at /admin keeps requiring login as before; this migration only opens up the
-- narrow set of things the public form needs.

-- Narrow view so the anonymous pointage form can list a team's roster without
-- ever being able to query the sensitive columns that live on `employees`
-- (RIB, salaire, adresse, sécurité sociale, etc.) — only these four columns
-- are exposed, regardless of what a client asks for.
create view pointage_roster as
  select id, first_name, last_name, team_id, status
  from employees
  where category = 'chantier';

grant select on pointage_roster to anon, authenticated;

create policy teams_select_anon on teams for select to anon using (active = true);
create policy absence_types_select_anon on absence_types for select to anon using (true);
create policy pointage_insert_anon on pointage_entries for insert to anon with check (true);
create policy pointage_update_anon on pointage_entries for update to anon using (true) with check (true);

grant select on teams to anon;
grant select on absence_types to anon;
grant insert, update on pointage_entries to anon;
