-- A roof is either bac acier or fibrociment, never both — so "Dépose Bac
-- acier" (the only checklist line for this, name never changes) needs its
-- Délai prévu computed from whichever norm actually applies: null defaults
-- to 'bac_acier' to match every dossier's existing behavior before this
-- column existed.
alter table commercial_cases add column if not exists toiture_materiau text
  check (toiture_materiau is null or toiture_materiau in ('bac_acier', 'fibrociment'));
