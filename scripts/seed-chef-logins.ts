/**
 * One-time provisioning: create a Supabase Auth user for each brigade's shared
 * device account and link it to that team's chef in `user_roles` (role='chef').
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/seed-chef-logins.ts
 *
 * Safe to re-run: reuses an existing auth user by email, upserts the user_roles row.
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error(
    "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables."
  );
  process.exit(1);
}

const supabase = createClient(url, serviceKey);

// Team name (must match `teams.name`) -> shared brigade device email.
const TEAM_EMAILS: Record<string, string> = {
  "Equipe 1": "komanda_1@icloud.com",
  "Equipe 2": "komanda_2@icloud.com",
  "Equipe 3": "komanda_3@icloud.com",
  "Equipe 4": "komanda_4@icloud.com",
  "Equipe 5": "komanda_5@icloud.com",
  "Equipe 6": "komanda_6@icloud.com",
  "Equipe 7": "komanda_7@icloud.com",
  "Equipe 8": "komanda8vladis@icloud.com",
  "Equipe 9": "komanda_9@icloud.com",
  "Equipe 10": "komanda_10@icloud.com",
};

async function findAuthUserByEmail(email: string) {
  // admin.listUsers doesn't filter by email server-side in older API versions,
  // so page through (10 teams -> well within one page in practice).
  const { data, error } = await supabase.auth.admin.listUsers();
  if (error) throw error;
  return data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
}

async function ensureAuthUser(email: string) {
  const existing = await findAuthUserByEmail(email);
  if (existing) return existing.id;

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    email_confirm: true, // pre-provisioned internal account, no confirmation email needed
  });
  if (error) throw error;
  return data.user.id;
}

async function main() {
  for (const [teamName, email] of Object.entries(TEAM_EMAILS)) {
    const { data: team, error: teamError } = await supabase
      .from("teams")
      .select("id, chef_employee_id")
      .eq("name", teamName)
      .maybeSingle();

    if (teamError) throw teamError;
    if (!team) {
      console.warn(`Skipping ${teamName}: team not found (run seed:equipes first?).`);
      continue;
    }
    if (!team.chef_employee_id) {
      console.warn(`Skipping ${teamName}: no chef_employee_id set on this team.`);
      continue;
    }

    const authUserId = await ensureAuthUser(email);

    const { error: roleError } = await supabase
      .from("user_roles")
      .upsert(
        { auth_user_id: authUserId, role: "chef", employee_id: team.chef_employee_id },
        { onConflict: "auth_user_id" }
      );
    if (roleError) throw roleError;

    console.log(`✓ ${teamName}: ${email} -> role 'chef'`);
  }

  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
