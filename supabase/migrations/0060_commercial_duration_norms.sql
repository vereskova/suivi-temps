-- Turns the hardcoded brackets in lib/commercial-durations/compute.ts into
-- an editable reference table: a "Normes" tab lets the norms driving the
-- Délais auto-calculator (Main-d'œuvre, Pose SI/PPV, Tirage de câble...) be
-- adjusted without a code change whenever the source rates/deadlines move.
--
-- Two curve shapes cover everything in the source spreadsheet:
--   'linear' — interpolate between points (Main-d'œuvre, Pose SI, Pose PPV);
--   'step'   — each point's x is the upper bound of a range, its y the flat
--              value for that range (Tirage de câble, Sécurité collective,
--              Filet sur face); a single point is just a constant (Pose/
--              Dépose Bac acier, Démontage panneau — one measured value in
--              the source, no second point to derive a rate from).
-- Same access split as the other commercial master-data tables (0027):
-- read for commercial+rh_admin, write rh_admin-only.
create table commercial_duration_norms (
  id             uuid primary key default gen_random_uuid(),
  code           text unique not null,
  label          text not null,
  label_ru       text not null,
  unit           text not null check (unit in ('kwc', 'm', 'm2')),
  mode           text not null check (mode in ('linear', 'step')),
  checklist_hint text,
  position       integer not null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table commercial_duration_norm_points (
  id       uuid primary key default gen_random_uuid(),
  norm_id  uuid not null references commercial_duration_norms(id) on delete cascade,
  x        numeric not null,
  y        numeric not null,
  position integer not null
);

create index commercial_duration_norm_points_norm_idx on commercial_duration_norm_points(norm_id);

alter table commercial_duration_norms enable row level security;
alter table commercial_duration_norm_points enable row level security;

grant select, insert, update, delete on commercial_duration_norms to authenticated, service_role;
grant select, insert, update, delete on commercial_duration_norm_points to authenticated, service_role;

create policy commercial_duration_norms_select on commercial_duration_norms for select using (
  current_role_name() in ('commercial', 'rh_admin')
);
create policy commercial_duration_norms_admin_write on commercial_duration_norms for insert with check (
  current_role_name() = 'rh_admin'
);
create policy commercial_duration_norms_admin_update on commercial_duration_norms for update using (
  current_role_name() = 'rh_admin'
) with check (
  current_role_name() = 'rh_admin'
);
create policy commercial_duration_norms_admin_delete on commercial_duration_norms for delete using (
  current_role_name() = 'rh_admin'
);

create policy commercial_duration_norm_points_select on commercial_duration_norm_points for select using (
  current_role_name() in ('commercial', 'rh_admin')
);
create policy commercial_duration_norm_points_admin_write on commercial_duration_norm_points for insert with check (
  current_role_name() = 'rh_admin'
);
create policy commercial_duration_norm_points_admin_update on commercial_duration_norm_points for update using (
  current_role_name() = 'rh_admin'
) with check (
  current_role_name() = 'rh_admin'
);
create policy commercial_duration_norm_points_admin_delete on commercial_duration_norm_points for delete using (
  current_role_name() = 'rh_admin'
);

-- Seed with today's values (byte-for-byte the same numbers previously
-- hardcoded in lib/commercial-durations/compute.ts) so nothing changes
-- until someone edits the table.
insert into commercial_duration_norms (code, label, label_ru, unit, mode, checklist_hint, position) values
  ('main_doeuvre_standard', 'Main-d''œuvre (standard)', 'Main-d''œuvre (стандарт)', 'kwc', 'linear',
   'Ligne « Main-d''œuvre » — sauf si le dossier a aussi une ligne Pose SI/Pose PPV.', 1),
  ('main_doeuvre_ombriere', 'Main-d''œuvre (ombrière)', 'Main-d''œuvre (ombrière)', 'kwc', 'linear',
   'Ligne « Main-d''œuvre » — dès que le dossier a une ligne Pose SI et/ou Pose PPV.', 2),
  ('pose_si', 'Pose SI', 'Pose SI', 'kwc', 'linear',
   'Ligne « Pose SI ».', 3),
  ('pose_ppv', 'Pose PPV', 'Pose PPV', 'kwc', 'linear',
   'Ligne « Pose PPV ».', 4),
  ('tirage_cable', 'Tirage de câble', 'Протяжка кабеля', 'm', 'step',
   'Ligne « Tirage AC » — par longueur de câble (m).', 5),
  ('pose_bac_acier', 'Pose Bac acier', 'Pose Bac acier', 'm', 'step',
   'Ligne « Pose Bac acier » — un seul point mesuré dans la source (230 m), pas de courbe.', 6),
  ('depose_bac_acier', 'Dépose Bac acier', 'Dépose Bac acier', 'm', 'step',
   'Ligne « Dépose Bac acier » — un seul point mesuré dans la source (360 m), pas de courbe.', 7),
  ('demontage_panneau', 'Démonter panneau', 'Démonter panneau', 'm2', 'step',
   'Ligne « Démonter panneau » — un seul point mesuré dans la source (150, unité non précisée), pas de courbe.', 8),
  ('securite_collective', 'Sécurité collective (filet périmètre)', 'Сетка по периметру', 'kwc', 'step',
   'Ligne « Pose & dépose sécurité colective » — par puissance (kWc).', 9),
  ('filet_sur_face', 'Filet sur face (sous bac acier)', 'Сетка под bac acier', 'm2', 'step',
   'Ligne « Pose /depose fille sur face » — par surface de toiture (m²).', 10);

insert into commercial_duration_norm_points (norm_id, x, y, position)
select n.id, v.x, v.y, v.position
from commercial_duration_norms n
join (values
  ('main_doeuvre_standard', 100, 6, 1), ('main_doeuvre_standard', 150, 8, 2), ('main_doeuvre_standard', 200, 10, 3),
  ('main_doeuvre_standard', 250, 12, 4), ('main_doeuvre_standard', 300, 14, 5), ('main_doeuvre_standard', 350, 16, 6),
  ('main_doeuvre_standard', 400, 18, 7), ('main_doeuvre_standard', 450, 20, 8), ('main_doeuvre_standard', 500, 22, 9),

  ('main_doeuvre_ombriere', 100, 5, 1), ('main_doeuvre_ombriere', 200, 8, 2), ('main_doeuvre_ombriere', 300, 12, 3),
  ('main_doeuvre_ombriere', 400, 16, 4), ('main_doeuvre_ombriere', 500, 20, 5), ('main_doeuvre_ombriere', 600, 24, 6),
  ('main_doeuvre_ombriere', 700, 28, 7), ('main_doeuvre_ombriere', 800, 32, 8), ('main_doeuvre_ombriere', 900, 36, 9),
  ('main_doeuvre_ombriere', 1000, 40, 10),

  ('pose_si', 100, 1, 1), ('pose_si', 200, 1, 2), ('pose_si', 300, 1.5, 3), ('pose_si', 400, 2, 4),
  ('pose_si', 500, 2.5, 5), ('pose_si', 600, 3, 6), ('pose_si', 700, 3.5, 7), ('pose_si', 800, 4, 8),
  ('pose_si', 900, 5, 9), ('pose_si', 1000, 5, 10),

  ('pose_ppv', 100, 1, 1), ('pose_ppv', 200, 1.5, 2), ('pose_ppv', 300, 2, 3), ('pose_ppv', 400, 2.5, 4),
  ('pose_ppv', 500, 3, 5), ('pose_ppv', 600, 3.5, 6), ('pose_ppv', 700, 4, 7), ('pose_ppv', 800, 5, 8),
  ('pose_ppv', 900, 7, 9), ('pose_ppv', 1000, 9, 10),

  ('tirage_cable', 100, 1, 1), ('tirage_cable', 200, 2, 2), ('tirage_cable', 400, 3, 3),

  ('pose_bac_acier', 230, 1, 1),
  ('depose_bac_acier', 360, 1, 1),
  ('demontage_panneau', 150, 1, 1),

  ('securite_collective', 300, 1, 1), ('securite_collective', 500, 2, 2),

  ('filet_sur_face', 600, 1, 1), ('filet_sur_face', 1000, 2, 2)
) as v(code, x, y, position) on v.code = n.code;
