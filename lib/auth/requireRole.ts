import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type RoleCheckContext = {
  supabase: SupabaseServerClient;
  userId: string;
  role: string;
  employeeId: string | null;
};

export type RoleCheckResult =
  | { ok: true; ctx: RoleCheckContext }
  | { ok: false; response: NextResponse };

/**
 * Shared auth+role gate for API routes: resolves the current Supabase user,
 * looks up their app_role, and rejects with the right status code (401 vs
 * 403) if they're not signed in or not one of allowedRoles. Each route used
 * to duplicate this exact block — kept in one place so a future role change
 * can't be updated in two of the three routes and forgotten in the third.
 */
export async function requireRole(allowedRoles: readonly string[]): Promise<RoleCheckResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, response: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };
  }

  const { data: roleRow } = await supabase
    .from("user_roles")
    .select("role, employee_id")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (!roleRow || !allowedRoles.includes(roleRow.role)) {
    return { ok: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return {
    ok: true,
    ctx: { supabase, userId: user.id, role: roleRow.role, employeeId: roleRow.employee_id ?? null },
  };
}
