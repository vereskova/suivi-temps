"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ASSIGNABLE_ROLES, TAB_CATALOG, type TabsConfig } from "@/lib/access/tabs";

// Экран « Настройки » : кто и куда имеет доступ. Только rh_admin (см. /api/admin/users).

type UserRow = {
  id: string;
  email: string;
  role: string | null;
  employee_id: string | null;
  employee_name: string | null;
  tabs: Record<string, string> | null;
  last_sign_in_at: string | null;
  banned: boolean;
  is_me: boolean;
};
type Emp = { id: string; name: string };

const roleLabel = (r: string | null) => ASSIGNABLE_ROLES.find((x) => x.role === r)?.label ?? r ?? "нет доступа";

export default function SettingsView() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [employees, setEmployees] = useState<Emp[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [editing, setEditing] = useState<string | null>(null);

  // форма « добавить »
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("rh");
  const [empId, setEmpId] = useState("");
  const [password, setPassword] = useState("");
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/users", { cache: "no-store" });
    const data = (await res.json()) as { users?: UserRow[]; employees?: Emp[]; error?: string };
    if (!res.ok) setMsg({ ok: false, text: data.error ?? "Ошибка загрузки" });
    else {
      setUsers(data.users ?? []);
      setEmployees(data.employees ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function call(method: string, body?: unknown, query = ""): Promise<boolean> {
    const res = await fetch(`/api/admin/users${query}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      setMsg({ ok: false, text: data.error ?? "Ошибка" });
      return false;
    }
    return true;
  }

  async function add() {
    setAdding(true);
    setMsg(null);
    const ok = await call("POST", { email, role, employee_id: empId || null, password: password || undefined });
    setAdding(false);
    if (ok) {
      setMsg({ ok: true, text: `Доступ выдан: ${email}. Человек входит на /login по ссылке на почту${password ? " или по паролю" : ""}.` });
      setEmail("");
      setPassword("");
      setEmpId("");
      load();
    }
  }

  async function changeRole(u: UserRow, newRole: string) {
    if (!window.confirm(`Сменить роль ${u.email} на «${roleLabel(newRole)}»?`)) return;
    if (await call("PATCH", { user_id: u.id, role: newRole })) {
      setMsg({ ok: true, text: "Роль изменена" });
      load();
    }
  }

  async function revoke(u: UserRow) {
    if (!window.confirm(`Убрать доступ у ${u.email}? Вход будет заблокирован (вернуть можно, выдав роль заново).`)) return;
    if (await call("DELETE", undefined, `?user_id=${u.id}`)) {
      setMsg({ ok: true, text: "Доступ убран" });
      load();
    }
  }

  async function setPasswordFor(u: UserRow) {
    const pw = window.prompt(`Новый пароль для ${u.email} (минимум 8 символов). Он нигде не показывается.`);
    if (!pw) return;
    if (await call("PATCH", { user_id: u.id, password: pw })) setMsg({ ok: true, text: "Пароль задан" });
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-extrabold text-stone-900">Настройки · Paramètres</h2>
        <p className="text-sm text-stone-500">
          Кто имеет доступ, с какой ролью, какие вкладки видит и в каком режиме. Роль решает, что разрешено в базе;
          список вкладок только сужает меню.
        </p>
      </div>

      {msg && <p className={`rounded-xl px-3 py-2 text-sm font-bold ${msg.ok ? "bg-success-50 text-success-600" : "bg-error-50 text-error-600"}`}>{msg.text}</p>}

      <section className="card space-y-3">
        <h3 className="text-sm font-extrabold text-stone-800">Добавить человека</h3>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="text-xs font-bold text-stone-500">
            Почта
            <input type="email" className="input mt-1" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="prenom.nom@vladis.fr" />
          </label>
          <label className="text-xs font-bold text-stone-500">
            Роль
            <select className="input mt-1" value={role} onChange={(e) => setRole(e.target.value)}>
              {ASSIGNABLE_ROLES.map((r) => (
                <option key={r.role} value={r.role}>{r.label}</option>
              ))}
            </select>
          </label>
          <label className="text-xs font-bold text-stone-500">
            Сотрудник (если это он сам, необязательно)
            <select className="input mt-1" value={empId} onChange={(e) => setEmpId(e.target.value)}>
              <option value="">—</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>{e.name}</option>
              ))}
            </select>
          </label>
          <label className="text-xs font-bold text-stone-500">
            Пароль (необязательно, мин. 8 символов; без него вход по ссылке на почту)
            <input type="password" className="input mt-1" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
          </label>
        </div>
        <p className="text-xs text-stone-400">{ASSIGNABLE_ROLES.find((r) => r.role === role)?.hint}</p>
        <button className="btn btn-primary text-sm" disabled={adding || !email} onClick={add}>
          {adding ? "Добавление…" : "Выдать доступ"}
        </button>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-extrabold text-stone-800">Люди с доступом ({users.filter((u) => u.role).length})</h3>
        {loading && <p className="text-sm text-stone-400">Загрузка…</p>}
        {users.map((u) => (
          <div key={u.id} className={`card space-y-3 ${u.role ? "" : "opacity-60"}`}>
            <div className="flex flex-wrap items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold text-stone-900">
                  {u.email} {u.is_me && <span className="text-xs font-semibold text-stone-400">(это вы)</span>}
                </p>
                <p className="text-xs text-stone-400">
                  {u.employee_name ? `${u.employee_name} · ` : ""}
                  {u.last_sign_in_at ? `последний вход ${new Date(u.last_sign_in_at).toLocaleDateString("fr-FR")}` : "ещё не входил"}
                  {u.banned && " · заблокирован"}
                </p>
              </div>
              <select
                className="input"
                style={{ width: "auto" }}
                value={u.role ?? ""}
                disabled={u.is_me}
                onChange={(e) => e.target.value && changeRole(u, e.target.value)}
              >
                {!u.role && <option value="">нет доступа</option>}
                {ASSIGNABLE_ROLES.map((r) => (
                  <option key={r.role} value={r.role}>{r.label}</option>
                ))}
                {u.role && !ASSIGNABLE_ROLES.some((r) => r.role === u.role) && <option value={u.role}>{u.role}</option>}
              </select>
              {u.role && u.role !== "controleur" && u.role !== "rh_admin" && (
                <button className="btn btn-secondary text-xs px-2.5 py-1.5" onClick={() => setEditing(editing === u.id ? null : u.id)}>
                  Вкладки{u.tabs ? ` (${Object.keys(u.tabs).length})` : " (по роли)"}
                </button>
              )}
              <button className="btn btn-secondary text-xs px-2.5 py-1.5" onClick={() => setPasswordFor(u)}>Пароль</button>
              {!u.is_me && u.role && (
                <button className="btn btn-red text-xs px-2.5 py-1.5" onClick={() => revoke(u)}>Убрать доступ</button>
              )}
            </div>
            {editing === u.id && (
              <TabsEditor
                initial={u.tabs as TabsConfig | null}
                onSave={async (tabs) => {
                  if (await call("PATCH", { user_id: u.id, tabs })) {
                    setMsg({ ok: true, text: "Вкладки сохранены. Человек увидит изменения после обновления страницы." });
                    setEditing(null);
                    load();
                  }
                }}
                onReset={async () => {
                  if (await call("PATCH", { user_id: u.id, clear_tabs: true })) {
                    setMsg({ ok: true, text: "Сброшено: вкладки по роли" });
                    setEditing(null);
                    load();
                  }
                }}
              />
            )}
          </div>
        ))}
      </section>

      <section className="card text-xs text-stone-500 space-y-1">
        <p className="font-bold text-stone-700">Что значат режимы</p>
        <p><b>Скрыта</b> - вкладки нет в меню. <b>Просмотр</b> - вкладка открыта, но кнопки и поля заблокированы. <b>Редактирование</b> - как по роли.</p>
        <p>Режим «Просмотр» блокирует поля и кнопки в интерфейсе. Вкладки, которых нет у роли, выдать нельзя - для этого выберите роль повыше. Меню у rh_admin и «Контролёра» этим списком не меняется.</p>
      </section>
    </div>
  );
}

function TabsEditor({ initial, onSave, onReset }: { initial: TabsConfig | null; onSave: (t: TabsConfig) => void; onReset: () => void }) {
  // Исходно (нет настройки) - все вкладки редактируемые; снимаем лишние.
  const [cfg, setCfg] = useState<Record<string, "none" | "view" | "edit">>(() => {
    const out: Record<string, "none" | "view" | "edit"> = {};
    TAB_CATALOG.forEach((t) => (out[t.key] = initial ? (initial[t.key] ?? "none") : "edit"));
    return out;
  });
  const groups = useMemo(() => {
    const map = new Map<string, typeof TAB_CATALOG>();
    TAB_CATALOG.forEach((t) => map.set(t.group, [...(map.get(t.group) ?? []), t]));
    return Array.from(map.entries());
  }, []);

  const setAll = (mode: "none" | "view" | "edit") => setCfg(Object.fromEntries(TAB_CATALOG.map((t) => [t.key, mode])));

  return (
    <div className="rounded-xl border border-stone-200 bg-stone-50 p-3 space-y-3">
      <div className="flex flex-wrap gap-2 text-xs">
        <button className="btn btn-secondary px-2 py-1" onClick={() => setAll("edit")}>Все: редактирование</button>
        <button className="btn btn-secondary px-2 py-1" onClick={() => setAll("view")}>Все: просмотр</button>
        <button className="btn btn-secondary px-2 py-1" onClick={() => setAll("none")}>Все: скрыть</button>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {groups.map(([group, tabs]) => (
          <div key={group} className="space-y-1">
            <p className="text-[11px] font-extrabold uppercase tracking-wide text-stone-400">{group}</p>
            {tabs.map((t) => (
              <div key={t.key} className="flex items-center justify-between gap-2 rounded-lg bg-white px-2 py-1.5">
                <span className="text-sm text-stone-700">{t.labelRu || t.label}</span>
                <select className="input py-1 text-xs" style={{ width: "auto" }} value={cfg[t.key]} onChange={(e) => setCfg({ ...cfg, [t.key]: e.target.value as "none" | "view" | "edit" })}>
                  <option value="none">Скрыта</option>
                  <option value="view">Просмотр</option>
                  <option value="edit">Редактирование</option>
                </select>
              </div>
            ))}
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <button
          className="btn btn-primary text-sm"
          onClick={() => onSave(Object.fromEntries(Object.entries(cfg).filter(([, v]) => v !== "none")) as TabsConfig)}
        >
          Сохранить
        </button>
        <button className="btn btn-secondary text-sm" onClick={onReset}>Сбросить (по роли)</button>
      </div>
    </div>
  );
}
