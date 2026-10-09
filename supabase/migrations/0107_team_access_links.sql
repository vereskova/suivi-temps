-- Lien privé par équipe pour consulter ses lignes Primes & Bonus depuis le
-- téléphone de l'équipe (demandé le 09/10/2026). Le jeton est le seul "mot de
-- passe" : la page /equipe/<jeton> n'a ni compte ni mail à saisir — comme le
-- formulaire de pointage — mais, contrairement à lui, les données ne sont
-- renvoyées que pour l'équipe liée au jeton (API serveur, clé service). Seul
-- rh_admin peut lire/régénérer les jetons ; un jeton régénéré invalide l'ancien lien.
create table team_access_links (
  team_id     uuid primary key references teams(id) on delete cascade,
  token       text not null unique
                default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  created_at  timestamptz not null default now(),
  rotated_at  timestamptz
);

alter table team_access_links enable row level security;

create policy team_access_links_admin_all on team_access_links for all using (
  current_role_name() = 'rh_admin'
) with check (
  current_role_name() = 'rh_admin'
);

grant select, insert, update, delete on team_access_links to authenticated, service_role;

insert into team_access_links (team_id)
select id from teams where active = true
on conflict (team_id) do nothing;
