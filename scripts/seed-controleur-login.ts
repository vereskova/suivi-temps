/**
 * One-time provisioning: create a Supabase Auth user for an HR staff member
 * and give them the 'controleur' role (only the /controle penalty screen).
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/seed-controleur-login.ts controleur@example.com [employee_id]
 *
 * Safe to re-run: reuses an existing auth user by email, upserts the user_roles row.
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = process.argv[2];
const employeeId = process.argv[3] ?? null; // e.g. CIOBANU Valeriu 878a6357-4f00-4571-8fee-5b5081716dc4

if (!url || !serviceKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables.");
  process.exit(1);
}
if (!email) {
  console.error("Usage: npx tsx scripts/seed-controleur-login.ts controleur@example.com [employee_id]");
  process.exit(1);
}

const supabase = createClient(url, serviceKey);

async function findAuthUserByEmail(target: string) {
  const { data, error } = await supabase.auth.admin.listUsers();
  if (error) throw error;
  return data.users.find((u) => u.email?.toLowerCase() === target.toLowerCase());
}

async function ensureAuthUser(target: string) {
  const existing = await findAuthUserByEmail(target);
  if (existing) return existing.id;

  const { data, error } = await supabase.auth.admin.createUser({
    email: target,
    email_confirm: true, // pre-provisioned account, no confirmation email needed
  });
  if (error) throw error;
  return data.user.id;
}

async function main() {
  const authUserId = await ensureAuthUser(email);

  // employee_id stays null unless this HR person is also a listed employee.
  const { error } = await supabase
    .from("user_roles")
    .upsert({ auth_user_id: authUserId, role: "controleur", employee_id: employeeId }, { onConflict: "auth_user_id" });
  if (error) throw error;

  // Optional: set a password so the account can also sign in with email + password (no magic link).
  // Usage: CONTROLEUR_PASSWORD=... npx tsx scripts/seed-controleur-login.ts email [employee_id]
  const password = process.env.CONTROLEUR_PASSWORD;
  if (password) {
    const { error: pwErr } = await supabase.auth.admin.updateUserById(authUserId, { password });
    if (pwErr) throw pwErr;
    console.log("✓ password set");
  }

  console.log(`✓ ${email} -> role 'controleur'`);
  console.log("They can now log in via the magic-link form at /login and will land on /controle.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
