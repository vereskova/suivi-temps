import { NextRequest, NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { requireRole } from "@/lib/auth/requireRole";
import { ASSIGNABLE_ROLES, TAB_CATALOG } from "@/lib/access/tabs";

// Управление доступами (экран « Настройки »). Только rh_admin.
//   GET    - все пользователи : почта, роль, привязка к сотруднику, вкладки, последний вход
//   POST   - добавить человека : { email, role, password?, employee_id?, tabs? } (аккаунт создаётся сразу, вход по ссылке на почту или по паролю)
//   PATCH  - изменить : { user_id, role?, employee_id?, tabs?, password? }
//   DELETE - убрать доступ : ?user_id=  (роль и вкладки удаляются; сам аккаунт блокируется, чтобы войти больше нельзя было)

const NO_STORE = { "Cache-Control": "no-store" };
const ROLES = new Set(ASSIGNABLE_ROLES.map((r) => r.role));
const TAB_KEYS = new Set(TAB_CATALOG.map((t) => t.key));

function sb() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? createServiceClient(url, key, { auth: { persistSession: false } }) : null;
}
const bad = (msg: string, status = 400) => NextResponse.json({ error: msg }, { status, headers: NO_STORE });

function cleanTabs(raw: unknown): Record<string, "view" | "edit"> | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== "object") return null;
  const out: Record<string, "view" | "edit"> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (TAB_KEYS.has(k) && (v === "view" || v === "edit")) out[k] = v;
  }
  return out;
}

export async function GET() {
  const check = await requireRole(["rh_admin"]);
  if (!check.ok) return check.response;
  const db = sb();
  if (!db) return bad("Server misconfigured", 500);

  const [{ data: list, error }, { data: roles }, { data: access }, { data: emps }] = await Promise.all([
    db.auth.admin.listUsers({ perPage: 500 }),
    db.from("user_roles").select("auth_user_id, role, employee_id"),
    db.from("user_access").select("auth_user_id, tabs, note"),
    db.from("employees").select("id, first_name, last_name").order("last_name"),
  ]);
  if (error) return bad(error.message, 500);

  const roleBy = new Map((roles ?? []).map((r) => [r.auth_user_id as string, r]));
  const accessBy = new Map((access ?? []).map((a) => [a.auth_user_id as string, a]));
  const empName = new Map((emps ?? []).map((e) => [e.id as string, `${String(e.last_name).toUpperCase()} ${e.first_name}`]));

  const users = (list?.users ?? [])
    .map((u) => {
      const r = roleBy.get(u.id);
      const a = accessBy.get(u.id);
      return {
        id: u.id,
        email: u.email ?? "",
        role: (r?.role as string) ?? null,
        employee_id: (r?.employee_id as string) ?? null,
        employee_name: r?.employee_id ? (empName.get(r.employee_id as string) ?? null) : null,
        tabs: (a?.tabs as Record<string, string> | null) ?? null,
        last_sign_in_at: u.last_sign_in_at ?? null,
        banned: !!(u as unknown as { banned_until?: string | null }).banned_until,
        is_me: u.id === check.ctx.userId,
      };
    })
    .sort((a, b) => (a.role ? 0 : 1) - (b.role ? 0 : 1) || a.email.localeCompare(b.email));

  return NextResponse.json(
    { users, employees: (emps ?? []).map((e) => ({ id: e.id, name: `${String(e.last_name).toUpperCase()} ${e.first_name}` })) },
    { headers: NO_STORE }
  );
}

export async function POST(request: NextRequest) {
  const check = await requireRole(["rh_admin"]);
  if (!check.ok) return check.response;
  const db = sb();
  if (!db) return bad("Server misconfigured", 500);

  const body = (await request.json().catch(() => null)) as {
    email?: string; role?: string; password?: string; employee_id?: string | null; tabs?: unknown;
  } | null;
  const email = String(body?.email ?? "").trim().toLowerCase();
  const role = String(body?.role ?? "");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return bad("Некорректная почта");
  if (!ROLES.has(role)) return bad("Неизвестная роль");
  const password = body?.password ? String(body.password) : "";
  if (password && password.length < 8) return bad("Пароль: минимум 8 символов");

  // Найти существующий аккаунт по почте или создать (почта считается подтверждённой - вход по ссылке сразу работает).
  const { data: list } = await db.auth.admin.listUsers({ perPage: 500 });
  let user = list?.users.find((u) => u.email?.toLowerCase() === email);
  if (!user) {
    const { data, error } = await db.auth.admin.createUser({ email, email_confirm: true, ...(password ? { password } : {}) });
    if (error || !data.user) return bad("Не удалось создать аккаунт: " + (error?.message ?? ""), 500);
    user = data.user;
  } else {
    // Уже есть (в том числе заблокированный ранее) : снимаем блокировку, при необходимости ставим пароль.
    const { error } = await db.auth.admin.updateUserById(user.id, { ban_duration: "none", ...(password ? { password } : {}) });
    if (error) return bad(error.message, 500);
  }

  const { error: roleErr } = await db
    .from("user_roles")
    .upsert({ auth_user_id: user.id, role, employee_id: body?.employee_id || null }, { onConflict: "auth_user_id" });
  if (roleErr) return bad(roleErr.message, 500);

  const tabs = cleanTabs(body?.tabs);
  if (tabs) {
    await db.from("user_access").upsert({ auth_user_id: user.id, tabs, updated_by: check.ctx.email, updated_at: new Date().toISOString() }, { onConflict: "auth_user_id" });
  }
  return NextResponse.json({ ok: true, user_id: user.id }, { headers: NO_STORE });
}

export async function PATCH(request: NextRequest) {
  const check = await requireRole(["rh_admin"]);
  if (!check.ok) return check.response;
  const db = sb();
  if (!db) return bad("Server misconfigured", 500);

  const body = (await request.json().catch(() => null)) as {
    user_id?: string; role?: string; employee_id?: string | null; tabs?: unknown; password?: string; clear_tabs?: boolean;
  } | null;
  const userId = String(body?.user_id ?? "");
  if (!userId) return bad("Не указан пользователь");

  if (body?.role !== undefined) {
    if (!ROLES.has(body.role)) return bad("Неизвестная роль");
    if (userId === check.ctx.userId && body.role !== "rh_admin") return bad("Нельзя понизить собственную роль");
    const { data: cur } = await db.from("user_roles").select("employee_id").eq("auth_user_id", userId).maybeSingle();
    const { error } = await db
      .from("user_roles")
      .upsert({ auth_user_id: userId, role: body.role, employee_id: body.employee_id !== undefined ? body.employee_id || null : (cur?.employee_id ?? null) }, { onConflict: "auth_user_id" });
    if (error) return bad(error.message, 500);
  } else if (body?.employee_id !== undefined) {
    const { error } = await db.from("user_roles").update({ employee_id: body.employee_id || null }).eq("auth_user_id", userId);
    if (error) return bad(error.message, 500);
  }

  if (body?.clear_tabs) {
    await db.from("user_access").delete().eq("auth_user_id", userId);
  } else if (body?.tabs !== undefined) {
    const tabs = cleanTabs(body.tabs);
    const { error } = await db
      .from("user_access")
      .upsert({ auth_user_id: userId, tabs, updated_by: check.ctx.email, updated_at: new Date().toISOString() }, { onConflict: "auth_user_id" });
    if (error) return bad(error.message, 500);
  }

  if (body?.password) {
    if (String(body.password).length < 8) return bad("Пароль: минимум 8 символов");
    const { error } = await db.auth.admin.updateUserById(userId, { password: String(body.password) });
    if (error) return bad(error.message, 500);
  }
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}

export async function DELETE(request: NextRequest) {
  const check = await requireRole(["rh_admin"]);
  if (!check.ok) return check.response;
  const db = sb();
  if (!db) return bad("Server misconfigured", 500);

  const userId = request.nextUrl.searchParams.get("user_id") ?? "";
  if (!userId) return bad("Не указан пользователь");
  if (userId === check.ctx.userId) return bad("Нельзя убрать доступ у самого себя");

  // Последний rh_admin остаться без доступа не должен.
  const { data: admins } = await db.from("user_roles").select("auth_user_id").eq("role", "rh_admin");
  const { data: target } = await db.from("user_roles").select("role").eq("auth_user_id", userId).maybeSingle();
  if (target?.role === "rh_admin" && (admins ?? []).length <= 1) return bad("Нельзя убрать последнего rh_admin");

  await db.from("user_roles").delete().eq("auth_user_id", userId);
  await db.from("user_access").delete().eq("auth_user_id", userId);
  // Блокируем вход (аккаунт остаётся, чтобы не терять историю действий) - снимается повторной выдачей роли.
  await db.auth.admin.updateUserById(userId, { ban_duration: "876000h" });
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}
