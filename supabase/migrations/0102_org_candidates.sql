-- Candidats / prévisions d'embauche dans l'Organigramme : liste par poste
-- des personnes envisagées, saisie par les RH (poste existant ou nouveau
-- rôle, dates prévues d'entretien / d'arrivée / de début, statut, notes).
-- Demandé le 08/10/2026.
create table org_candidates (
  id                 uuid primary key default gen_random_uuid(),
  full_name          text,
  position_label     text not null,
  category           text not null default 'chantier' check (category in ('bureau', 'chantier')),
  team_id            uuid references teams(id) on delete set null,
  status             text not null default 'considering'
                       check (status in ('considering', 'interview', 'offered', 'confirmed', 'arrived', 'rejected')),
  interview_date     date,
  arrival_date       date,
  start_date         date,
  phone              text,
  notes              text,
  -- Valeurs des champs personnalisés (org_candidate_fields), clé = id du champ.
  custom_data        jsonb not null default '{}'::jsonb,
  created_by_email   text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- Champs personnalisés définis par les RH (nom + type), affichés comme des
-- colonnes supplémentaires pour tous les candidats.
create table org_candidate_fields (
  id          uuid primary key default gen_random_uuid(),
  label       text not null,
  field_type  text not null default 'text' check (field_type in ('text', 'number', 'date')),
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);

create trigger org_candidates_set_updated_at before update on org_candidates
  for each row execute function set_updated_at();

create trigger org_candidates_audit
  after insert or update or delete on org_candidates
  for each row execute function log_audit_changes();

alter table org_candidates enable row level security;
alter table org_candidate_fields enable row level security;

-- Les RH (rh_admin, rh, rh_readonly) lisent et modifient ; commercial_rh,
-- qui voit déjà l'Organigramme en lecture seule, peut seulement lire.
create policy org_candidates_hr_all on org_candidates for all using (
  current_role_name() in ('rh_admin', 'rh', 'rh_readonly')
) with check (
  current_role_name() in ('rh_admin', 'rh', 'rh_readonly')
);

create policy org_candidates_commercial_rh_select on org_candidates for select using (
  current_role_name() = 'commercial_rh'
);

create policy org_candidate_fields_hr_all on org_candidate_fields for all using (
  current_role_name() in ('rh_admin', 'rh', 'rh_readonly')
) with check (
  current_role_name() in ('rh_admin', 'rh', 'rh_readonly')
);

create policy org_candidate_fields_commercial_rh_select on org_candidate_fields for select using (
  current_role_name() = 'commercial_rh'
);

grant select, insert, update, delete on org_candidates, org_candidate_fields to authenticated, service_role;
