-- Auteur + date sur chaque commentaire (BONUS/Штраф/Штраф prочее/Bonus
-- prочее et les notes par jour), sur le modèle du bulle de commentaire de
-- "часы работы.numbers" (auteur + date affichés) qui avait servi de
-- référence visuelle plus tôt dans la session — demandé explicitement le
-- 30/09/2026 maintenant que trois rôles (rh_admin, comptable, rh_readonly
-- en lecture) touchent la même table.
alter table payroll_extras add column if not exists bonus_raison_by text;
alter table payroll_extras add column if not exists bonus_raison_at timestamptz;
alter table payroll_extras add column if not exists penalite_raison_by text;
alter table payroll_extras add column if not exists penalite_raison_at timestamptz;
alter table payroll_extras add column if not exists penalite_directe_raison_by text;
alter table payroll_extras add column if not exists penalite_directe_raison_at timestamptz;
alter table payroll_extras add column if not exists bonus_direct_raison_by text;
alter table payroll_extras add column if not exists bonus_direct_raison_at timestamptz;

alter table payroll_day_notes add column if not exists comment_by text;
alter table payroll_day_notes add column if not exists comment_at timestamptz;
