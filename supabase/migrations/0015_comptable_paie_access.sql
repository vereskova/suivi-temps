-- Grants the 'comptable' role exactly what the Paie admin view needs and
-- nothing else. Added as new, purely additive policies (Postgres RLS ORs all
-- permissive policies together) so the existing rh_admin/chef policies are
-- untouched — comptable can only ever gain access, never narrow anyone else's.

-- Paie needs the employee roster (name, team, category) and team names for
-- the Bureau/Contrôle & Formation/Équipe grouping, but never writes either.
create policy employees_comptable_select on employees for select using (
  current_role_name() = 'comptable'
);

create policy teams_comptable_select on teams for select using (
  current_role_name() = 'comptable'
);

-- payroll_parameters: Paie only ever reads these (rate, ceilings, etc.) —
-- editing them stays rh_admin-only via the existing policy.
create policy payroll_parameters_comptable_select on payroll_parameters for select using (
  current_role_name() = 'comptable'
);

-- payroll_runs: Paie selects the month's run and creates one if missing.
create policy payroll_runs_comptable_select on payroll_runs for select using (
  current_role_name() = 'comptable'
);
create policy payroll_runs_comptable_insert on payroll_runs for insert with check (
  current_role_name() = 'comptable'
);

-- payroll_line_items: Paie selects saved lines and upserts (insert+update)
-- on "Enregistrer" — no delete, matching what the UI actually does.
create policy payroll_line_items_comptable_select on payroll_line_items for select using (
  current_role_name() = 'comptable'
);
create policy payroll_line_items_comptable_insert on payroll_line_items for insert with check (
  current_role_name() = 'comptable'
);
create policy payroll_line_items_comptable_update on payroll_line_items for update using (
  current_role_name() = 'comptable'
) with check (
  current_role_name() = 'comptable'
);

-- pointage_entries: "Appliquer au pointage" reads that month's entries per
-- employee and overwrites overtime_minutes — no insert/delete, it only ever
-- touches rows that already exist.
create policy pointage_comptable_select on pointage_entries for select using (
  current_role_name() = 'comptable'
);
create policy pointage_comptable_update on pointage_entries for update using (
  current_role_name() = 'comptable'
) with check (
  current_role_name() = 'comptable'
);
