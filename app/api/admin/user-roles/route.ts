import { NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { requireRole } from "@/lib/auth/requireRole";

// rh_admin-only: powers the "who can see this page" badge (PageAccessBadge)
// with the actual account emails behind each role, not just the role name.
// Needs the service-role key to call auth.admin.listUsers() — user_roles
// only stores auth_user_id, and emails live in auth.users, which RLS-bound
// clients can't read.
export async function GET() {
  const check = await requireRole(["rh_admin"]);
  if (!check.ok) return check.response;

  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }
  const admin = createServiceClient(url, serviceKey);

  const [{ data: roleRows, error: roleError }, { data: userData, error: userError }] = await Promise.all([
    admin.from("user_roles").select("auth_user_id, role"),
    admin.auth.admin.listUsers(),
  ]);
  if (roleError || userError) {
    return NextResponse.json({ error: (roleError ?? userError)?.message }, { status: 500 });
  }

  const emailById = new Map(userData.users.map((u) => [u.id, u.email ?? "?"]));
  const byRole: Record<string, string[]> = {};
  for (const r of roleRows ?? []) {
    const email = emailById.get(r.auth_user_id);
    if (!email) continue;
    (byRole[r.role] ??= []).push(email);
  }
  return NextResponse.json({ byRole });
}
