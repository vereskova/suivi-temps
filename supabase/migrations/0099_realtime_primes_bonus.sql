-- Édition à plusieurs en direct dans Primes & Bonus ("как в Numbers",
-- demandé le 06/10/2026) : les changements de ces trois tables sont diffusés
-- aux autres utilisateurs connectés (Supabase Realtime). Les règles RLS
-- existantes s'appliquent : chacun ne reçoit que ce qu'il a le droit de lire.
do $$
begin
  alter publication supabase_realtime add table payroll_extras;
exception when duplicate_object then null; when undefined_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table pointage_entries;
exception when duplicate_object then null; when undefined_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table payroll_day_notes;
exception when duplicate_object then null; when undefined_object then null;
end $$;
