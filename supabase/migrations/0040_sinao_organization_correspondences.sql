-- Explicit client → Sinao organization correspondences, confirmed by hand
-- with the user (names don't line up closely enough — or at all, for the
-- last three — to trust fuzzy name search at push time; see
-- scripts/list-sinao-organizations.ts for how the id list was pulled).
-- Pre-filling sinao_organization_id means createDraftQuote() in
-- lib/sinao/client.ts skips findOrganizationByName() entirely for these
-- clients and pushes straight to the right contact.
update commercial_clients set sinao_organization_id = '14' where lower(name) = lower('Triangle Energie');
update commercial_clients set sinao_organization_id = '15' where lower(name) = lower('Triangle Horizon');
update commercial_clients set sinao_organization_id = '23' where lower(name) = lower('HML construction');
update commercial_clients set sinao_organization_id = '25' where lower(name) = lower('CME');
update commercial_clients set sinao_organization_id = '12' where name ilike 'DEVELOPP%SUN';
update commercial_clients set sinao_organization_id = '10' where lower(name) = lower('Tenergie');
update commercial_clients set sinao_organization_id = '16' where lower(name) = lower('Cegelec');
update commercial_clients set sinao_organization_id = '5'  where lower(name) = lower('Mateos');
update commercial_clients set sinao_organization_id = '20' where lower(name) = lower('Easing');
-- Name mismatches confirmed by the user directly (no name overlap at all):
update commercial_clients set sinao_organization_id = '13' where lower(name) = lower('ADVANCED EnerGies'); -- Sinao: IN' ENERGIES
update commercial_clients set sinao_organization_id = '18' where lower(name) = lower('Volta');             -- Sinao: PV PROD 2
update commercial_clients set sinao_organization_id = '11' where lower(name) = lower('Feedgy');             -- Sinao: QUANTOM
