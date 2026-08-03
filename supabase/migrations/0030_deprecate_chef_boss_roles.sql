-- 'chef' and 'boss' (added in 0001_init.sql) are no longer used anywhere in
-- the app: migration 0022 made the daily pointage form public/anonymous, so
-- team leads ("chef") no longer authenticate at all, and 'boss' was never
-- wired to any view or RLS policy. Kept in the enum (Postgres can't drop an
-- enum value without recreating the type) purely for compatibility with any
-- historical user_roles rows — do not build new features against them.
comment on type app_role is
  'Roles: rh_admin, rh, comptable, commercial are live. chef and boss are deprecated/unused since migration 0022 made pointage public — kept only for historical user_roles compatibility.';
