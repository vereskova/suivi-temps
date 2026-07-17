/**
 * One-time migration: data/equipes.ts -> Supabase `teams` + `employees`.
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/seed-equipes.ts
 *
 * Requires the service-role key (bypasses RLS) — never expose this key client-side.
 * Safe to re-run: it upserts teams by name and employees by (first_name, last_name, team_id).
 */
import { createClient } from "@supabase/supabase-js";
import { equipes } from "../data/equipes";

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error(
    "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables."
  );
  process.exit(1);
}

const supabase = createClient(url, serviceKey);

function parseName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "", lastName: fullName.trim() };

  const lastNameParts: string[] = [];
  let i = 0;
  // Leading all-caps tokens are treated as the last name (matches "GARBUZ Nicolai",
  // "DANDARA Ivan" etc.); the rest is the first name.
  while (i < parts.length && parts[i] === parts[i].toUpperCase()) {
    lastNameParts.push(parts[i]);
    i++;
  }
  if (lastNameParts.length === 0) {
    // No all-caps token found (e.g. a single lowercase-ish name) — fall back to
    // "first token = first name, rest = last name".
    return {
      firstName: parts[0],
      lastName: parts.slice(1).join(" ") || parts[0],
    };
  }
  return {
    firstName: parts.slice(i).join(" "),
    lastName: lastNameParts.join(" "),
  };
}

async function upsertEmployee(fullName: string, teamId: string) {
  const { firstName, lastName } = parseName(fullName);

  const { data: existing, error: findError } = await supabase
    .from("employees")
    .select("id")
    .eq("first_name", firstName)
    .eq("last_name", lastName)
    .eq("team_id", teamId)
    .maybeSingle();

  if (findError) throw findError;
  if (existing) return existing.id as string;

  const { data: inserted, error: insertError } = await supabase
    .from("employees")
    .insert({
      first_name: firstName,
      last_name: lastName,
      category: "chantier",
      team_id: teamId,
    })
    .select("id")
    .single();

  if (insertError) throw insertError;
  return inserted.id as string;
}

async function main() {
  for (const [teamName, equipe] of Object.entries(equipes)) {
    if (equipe.workers.length === 0) {
      console.log(`Skipping "${teamName}" — no workers listed.`);
      continue;
    }

    const { data: existingTeam, error: findTeamError } = await supabase
      .from("teams")
      .select("id")
      .eq("name", teamName)
      .maybeSingle();
    if (findTeamError) throw findTeamError;

    let teamId = existingTeam?.id as string | undefined;
    if (!teamId) {
      const { data: insertedTeam, error: insertTeamError } = await supabase
        .from("teams")
        .insert({ name: teamName })
        .select("id")
        .single();
      if (insertTeamError) throw insertTeamError;
      teamId = insertedTeam.id as string;
    }

    const workerIds: Record<string, string> = {};
    for (const worker of equipe.workers) {
      workerIds[worker] = await upsertEmployee(worker, teamId);
    }

    const chefId = workerIds[equipe.chef];
    if (!chefId) {
      console.warn(
        `Warning: chef "${equipe.chef}" for "${teamName}" not found among its workers — team left without a chef.`
      );
    } else {
      const { error: updateTeamError } = await supabase
        .from("teams")
        .update({ chef_employee_id: chefId })
        .eq("id", teamId);
      if (updateTeamError) throw updateTeamError;
    }

    console.log(`✓ ${teamName}: ${equipe.workers.length} worker(s) seeded, chef = ${equipe.chef}`);
  }

  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
