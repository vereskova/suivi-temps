import type { SupabaseClient } from "@supabase/supabase-js";
import { requireRole } from "@/lib/auth/requireRole";
import { serviceClient } from "@/lib/controle/server";

// Доступ кабинета бригадира: бригадир видит только свою команду (по привязанному сотруднику),
// rh_admin - любую (режим проверки). Данные - только через сервер (service role), без прямого доступа к таблицам.

export type BrigadirTeam = { id: string; name: string };
export type BrigadirAccess = {
  ok: true;
  role: "brigadir" | "rh_admin";
  email: string;
  sb: SupabaseClient;
  teams: BrigadirTeam[];
};

const teamNum = (name: string) => Number(name.replace(/\D+/g, "")) || 999;

export async function requireBrigadir(): Promise<BrigadirAccess | { ok: false; response: Response }> {
  const check = await requireRole(["brigadir", "rh_admin"]);
  if (!check.ok) return { ok: false, response: check.response };
  const sb = serviceClient();
  if (!sb) return { ok: false, response: new Response(JSON.stringify({ error: "Server misconfigured" }), { status: 500 }) };

  let teams: BrigadirTeam[] = [];
  if (check.ctx.role === "rh_admin") {
    const { data } = await sb.from("teams").select("id, name").eq("active", true);
    teams = (data ?? []) as BrigadirTeam[];
  } else if (check.ctx.employeeId) {
    const { data: emp } = await sb.from("employees").select("team_id, secondary_team_id").eq("id", check.ctx.employeeId).maybeSingle();
    const ids = [emp?.team_id, emp?.secondary_team_id].filter((x): x is string => !!x);
    if (ids.length) {
      const { data } = await sb.from("teams").select("id, name").in("id", ids);
      teams = (data ?? []) as BrigadirTeam[];
    }
  }
  teams.sort((a, b) => teamNum(a.name) - teamNum(b.name));
  return { ok: true, role: check.ctx.role as "brigadir" | "rh_admin", email: check.ctx.email, sb, teams };
}
