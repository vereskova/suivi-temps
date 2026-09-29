-- pointage_entries.team_id était NOT NULL depuis le tout début (0001), ce qui
-- empêchait silencieusement de marquer la présence de tout employé sans
-- équipe (Bureau, Contrôle & Formation, chantier "sans équipe") — aussi bien
-- dans "Par jour" que dans "Primes & Bonus". RLS (0001) reste sûre : les
-- policies vérifient `team_id = current_chef_team_id()`, jamais vrai pour
-- une ligne à team_id null, donc un chef d'équipe ne peut toujours voir/
-- modifier que sa propre équipe — seul rh_admin peut toucher les lignes
-- sans équipe, comme prévu.
alter table pointage_entries alter column team_id drop not null;
