/**
 * One-time provisioning: create a Supabase Auth user and give them the
 * 'rh_admin' role — full access to every section of the app.
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/seed-rh-admin-login.ts admin@example.com
 *
 * Safe to re-run: reuses an existing auth user by email, upserts the user_roles row.
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = process.argv[2];

if (!url || !serviceKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables.");
  process.exit(1);
}
if (!email) {
  console.error("Usage: npx tsx scripts/seed-rh-admin-login.ts admin@example.com");
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

  // employee_id stays null — matches the app's other rh_admin accounts.
  const { error } = await supabase
    .from("user_roles")
    .upsert({ auth_user_id: authUserId, role: "rh_admin", employee_id: null }, { onConflict: "auth_user_id" });
  if (error) throw error;

  console.log(`✓ ${email} -> role 'rh_admin'`);
  console.log("They can now log in via the magic-link form at /login and will have full access to every section.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
