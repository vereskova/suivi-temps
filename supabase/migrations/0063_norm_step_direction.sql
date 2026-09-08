-- All norms turn out to be fixed brackets (no norm actually interpolates
-- smoothly) — but there are two different bracket conventions in the
-- source, and 'step' alone couldn't distinguish them:
--   'step_ceil'  — each point is the END of its range (as literally
--                  written in the source, e.g. "0-300 kWc -> 1 jour,
--                  300-500 kWc -> 2 jours"): 350 falls in "300-500", fixed
--                  at 2. Used by tirage_cable/securite_collective/filet_sur_face.
--   'step_floor' — each point is the THRESHOLD its value starts applying
--                  at (raw "puissance -> jours" pairs, e.g. "100 -> 6,
--                  150 -> 8, 200 -> 10"): 170 hasn't reached the 200
--                  threshold yet, stays fixed at the 150 threshold's 8.
--                  Used by Main-d'œuvre (standard/ombrière), Pose SI, Pose PPV
--                  — previously (wrongly) 'linear', which smoothly
--                  interpolated between brackets instead of snapping to one.
-- Drop the old constraint before touching the data — it only allows
-- ('linear','step'), so renaming rows to 'step_ceil'/'step_floor' first
-- would fail just as adding the new constraint before updating 'step'
-- rows did.
alter table commercial_duration_norms drop constraint commercial_duration_norms_mode_check;

update commercial_duration_norms set mode = 'step_ceil' where mode = 'step';
update commercial_duration_norms set mode = 'step_floor'
  where code in ('main_doeuvre_standard', 'main_doeuvre_ombriere', 'pose_si', 'pose_ppv');

alter table commercial_duration_norms add constraint commercial_duration_norms_mode_check
  check (mode in ('linear', 'step_ceil', 'step_floor'));
