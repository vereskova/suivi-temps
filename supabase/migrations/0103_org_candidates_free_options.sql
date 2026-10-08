-- Type, statut et équipe prévue des candidats deviennent libres : les RH
-- peuvent ajouter une nouvelle valeur depuis la liste déroulante
-- ("+ Новый…"). On retire donc les CHECK de 0102 et on ajoute team_label
-- (nom d'une équipe prévue qui n'existe pas encore). Demandé le 08/10/2026.
alter table org_candidates drop constraint if exists org_candidates_category_check;
alter table org_candidates drop constraint if exists org_candidates_status_check;
alter table org_candidates add column if not exists team_label text;
