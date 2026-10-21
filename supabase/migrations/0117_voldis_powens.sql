-- VOLDIS : synchronisation bancaire automatique via Powens (agrégateur DSP2).
-- Une seule ligne : le jeton utilisateur permanent Powens de VOLDIS. Table réservée au serveur
-- (RLS activée SANS policy : seul le service_role y accède, jamais le navigateur).
create table voldis_powens_link (
  id             uuid primary key default gen_random_uuid(),
  powens_user_id integer not null,
  access_token   text not null,
  last_sync_at   timestamptz,
  last_error     text,
  created_at     timestamptz not null default now()
);

alter table voldis_powens_link enable row level security;
grant select, insert, update, delete on voldis_powens_link to service_role;
