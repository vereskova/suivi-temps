-- Grants the 'rh' role read/write on every table backing the Effectif + RH
-- sidebar sections (Employés, Médical, Formations, Tailles, Documents,
-- Registre du personnel, Organigramme, Cours de français, Dossier salarié).
-- Deliberately excludes pointage_entries and the payroll_* tables — this
-- role is scoped to HR data, not day-to-day time tracking or payroll.
-- Added as new, purely additive policies (Postgres RLS ORs all permissive
-- policies together) so the existing rh_admin/chef/comptable policies are
-- untouched — 'rh' can only ever gain access, never narrow anyone else's.

-- Teams & employees — needed for Organigramme, Employés, and every other
-- view's team/employee dropdowns.
create policy teams_rh_select on teams for select using (
  current_role_name() = 'rh'
);
create policy employees_rh_all on employees for all using (
  current_role_name() = 'rh'
) with check (
  current_role_name() = 'rh'
);

-- Employee profile extensions: RIB/SSN/permit, médical, formations, tailles.
create policy employee_confidential_rh_all on employee_confidential for all using (
  current_role_name() = 'rh'
) with check (
  current_role_name() = 'rh'
);
create policy medical_visits_rh_all on medical_visits for all using (
  current_role_name() = 'rh'
) with check (
  current_role_name() = 'rh'
);
create policy training_types_rh_write on training_types for all using (
  current_role_name() = 'rh'
) with check (
  current_role_name() = 'rh'
);
create policy employee_trainings_rh_all on employee_trainings for all using (
  current_role_name() = 'rh'
) with check (
  current_role_name() = 'rh'
);
create policy employee_equipment_sizes_rh_all on employee_equipment_sizes for all using (
  current_role_name() = 'rh'
) with check (
  current_role_name() = 'rh'
);

-- Documents admin view: company-wide settings + generation log.
create policy company_settings_rh_all on company_settings for all using (
  current_role_name() = 'rh'
) with check (
  current_role_name() = 'rh'
);
create policy generated_documents_rh_all on generated_documents for all using (
  current_role_name() = 'rh'
) with check (
  current_role_name() = 'rh'
);

-- Registre du personnel + phone numbers.
create policy registre_unique_personnel_rh_all on registre_unique_personnel for all using (
  current_role_name() = 'rh'
) with check (
  current_role_name() = 'rh'
);
create policy employee_phones_rh_all on employee_phones for all using (
  current_role_name() = 'rh'
) with check (
  current_role_name() = 'rh'
);

-- Cours de français.
create policy french_class_students_rh_all on french_class_students for all using (
  current_role_name() = 'rh'
) with check (
  current_role_name() = 'rh'
);
create policy french_class_sessions_rh_all on french_class_sessions for all using (
  current_role_name() = 'rh'
) with check (
  current_role_name() = 'rh'
);
create policy french_class_attendance_rh_all on french_class_attendance for all using (
  current_role_name() = 'rh'
) with check (
  current_role_name() = 'rh'
);

-- Dossier salarié: document metadata + the private Storage bucket.
create policy employee_documents_rh_all on employee_documents for all using (
  current_role_name() = 'rh'
) with check (
  current_role_name() = 'rh'
);
create policy dossier_salarie_rh_storage on storage.objects for all using (
  bucket_id = 'dossier-salarie' and current_role_name() = 'rh'
) with check (
  bucket_id = 'dossier-salarie' and current_role_name() = 'rh'
);
