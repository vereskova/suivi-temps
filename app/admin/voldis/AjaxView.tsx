"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "@/components/Toast";
import type { Supabase } from "./data";
import { Empty, Field, Menu, Modal } from "./ui";

type Access = {
  id: string;
  position: number;
  tenant_id: string | null;
  company: string | null;
  lot: string | null;
  email: string | null;
  name: string | null;
  phone: string | null;
  rights: string | null;
  notes: string | null;
  status: "active" | "removed";
};
type Tenant = { id: string; name: string; is_active: boolean };
type LeaseRow = { tenant_id: string; property_id: string; is_active: boolean };
type Property = { id: string; lot_number: string };

type Form = { tenant_id: string; company: string; lot: string; email: string; name: string; phone: string; rights: string; notes: string };
const EMPTY: Form = { tenant_id: "", company: "", lot: "", email: "", name: "", phone: "", rights: "", notes: "" };
const RIGHTS = ["Полный доступ", "Охрана вкл/выкл", "Только уведомления", "Просмотр"];

const norm = (s: string | null | undefined) => (s ?? "").toUpperCase().replace(/[^A-ZА-ЯЁ0-9]/g, "");
const tokens = (s: string | null | undefined) =>
  (s ?? "").toUpperCase().split(/[^A-ZА-ЯЁ0-9]+/).filter(Boolean).sort().join(" ");

/** Арендатор записи: явная привязка, иначе подбор по названию компании (HISTOIRE → HISTOIRE DE FACADE, REMY METOIS → METOIS REMY). */
function matchTenant(r: Access, tenants: Tenant[]): Tenant | undefined {
  if (r.tenant_id) return tenants.find((t) => t.id === r.tenant_id);
  if (!r.company) return undefined;
  const c = norm(r.company);
  return tenants.find((t) => {
    const n = norm(t.name);
    return n === c || n.startsWith(c) || tokens(t.name) === tokens(r.company);
  });
}

export default function AjaxView({ supabase }: { supabase: Supabase }) {
  const [rows, setRows] = useState<Access[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [leases, setLeases] = useState<LeaseRow[]>([]);
  const [props, setProps] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);
  const [tick, setTick] = useState(0);
  const [search, setSearch] = useState("");
  const [showRemoved, setShowRemoved] = useState(false);
  const [editing, setEditing] = useState<Access | "new" | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [busy, setBusy] = useState(false);
  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let alive = true;
    Promise.all([
      supabase.from("voldis_ajax_access").select("*").order("position"),
      supabase.from("voldis_tenants").select("id,name,is_active").order("name"),
      supabase.from("voldis_leases").select("tenant_id,property_id,is_active"),
      supabase.from("voldis_properties").select("id,lot_number"),
    ]).then(([a, t, l, p]) => {
      if (!alive) return;
      if (a.error) {
        setMissing(true);
      } else {
        setMissing(false);
        setRows((a.data as Access[]) ?? []);
        setTenants((t.data as Tenant[]) ?? []);
        setLeases((l.data as LeaseRow[]) ?? []);
        setProps((p.data as Property[]) ?? []);
      }
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [supabase, tick]);

  const lotsOf = useCallback(
    (tenantId: string) =>
      leases
        .filter((l) => l.tenant_id === tenantId && l.is_active)
        .map((l) => props.find((p) => p.id === l.property_id)?.lot_number)
        .filter((x): x is string => !!x)
        .sort(),
    [leases, props]
  );

  const q = search.trim().toLowerCase();
  const matchesSearch = useCallback(
    (r: Access, tenant?: Tenant) =>
      !q || [tenant?.name, r.company, r.lot, r.email, r.name, r.phone, r.rights, r.notes].some((v) => (v ?? "").toLowerCase().includes(q)),
    [q]
  );

  const grouped = useMemo(() => {
    const byTenant = new Map<string, Access[]>();
    const other = new Map<string, Access[]>();
    rows.forEach((r) => {
      if (r.status === "removed" && !showRemoved) return;
      const t = matchTenant(r, tenants);
      if (!matchesSearch(r, t)) return;
      if (t) byTenant.set(t.id, [...(byTenant.get(t.id) ?? []), r]);
      else {
        const k = r.company?.trim() || "Без привязки";
        other.set(k, [...(other.get(k) ?? []), r]);
      }
    });
    return { byTenant, other: Array.from(other.entries()) };
  }, [rows, tenants, showRemoved, matchesSearch]);

  const tenantCards = useMemo(() => {
    const lotNum = (t: Tenant) => lotsOf(t.id)[0] ?? "zz";
    return tenants
      .filter((t) => t.is_active || (grouped.byTenant.get(t.id)?.length ?? 0) > 0)
      .filter((t) => !q || (grouped.byTenant.get(t.id)?.length ?? 0) > 0 || t.name.toLowerCase().includes(q))
      .sort((a, b) => Number(b.is_active) - Number(a.is_active) || lotNum(a).localeCompare(lotNum(b), "ru", { numeric: true }));
  }, [tenants, grouped, q, lotsOf]);

  function openEdit(r: Access | "new", tenantId = "") {
    setEditing(r);
    setForm(
      r === "new"
        ? { ...EMPTY, tenant_id: tenantId }
        : {
            tenant_id: matchTenant(r, tenants)?.id ?? "",
            company: r.company ?? "",
            lot: r.lot ?? "",
            email: r.email ?? "",
            name: r.name ?? "",
            phone: r.phone ?? "",
            rights: r.rights ?? "",
            notes: r.notes ?? "",
          }
    );
  }

  async function save() {
    if (!form.email.trim() && !form.name.trim()) return toast.error("Укажите email или имя");
    setBusy(true);
    const clean = (v: string) => (v.trim() === "" ? null : v.trim());
    const tenant = tenants.find((t) => t.id === form.tenant_id);
    const payload = {
      tenant_id: tenant?.id ?? null,
      company: tenant ? tenant.name : clean(form.company),
      lot: clean(form.lot),
      email: clean(form.email),
      name: clean(form.name),
      phone: clean(form.phone),
      rights: clean(form.rights),
      notes: clean(form.notes),
    };
    const res =
      editing === "new" || editing === null
        ? await supabase.from("voldis_ajax_access").insert({ ...payload, position: Math.max(0, ...rows.map((r) => r.position)) + 1 })
        : await supabase.from("voldis_ajax_access").update(payload).eq("id", editing.id);
    setBusy(false);
    if (res.error) return toast.error("Ошибка: " + res.error.message);
    toast.success("Сохранено");
    setEditing(null);
    reload();
  }

  async function setStatus(r: Access, status: Access["status"]) {
    const { error } = await supabase.from("voldis_ajax_access").update({ status }).eq("id", r.id);
    if (error) return toast.error("Ошибка: " + error.message);
    reload();
  }

  async function remove(r: Access) {
    if (!window.confirm(`Удалить запись «${r.email ?? r.name}» полностью?`)) return;
    const { error } = await supabase.from("voldis_ajax_access").delete().eq("id", r.id);
    if (error) return toast.error("Ошибка: " + error.message);
    reload();
  }

  if (missing) {
    return (
      <div className="rounded-2xl border border-stone-200 bg-white p-6">
        <p className="font-bold text-stone-800">Ajax: доступы</p>
        <p className="mt-2 text-sm text-stone-600">
          Таблица ещё не создана. Нужно выполнить миграцию <code>0123</code> в Supabase SQL editor.
        </p>
      </div>
    );
  }
  if (loading) return <div className="py-16 text-center text-sm text-stone-400">Загрузка...</div>;

  const activeCount = rows.filter((r) => r.status === "active").length;

  const AccessTable = ({ list }: { list: Access[] }) =>
    list.length === 0 ? (
      <p className="px-4 py-3 text-sm text-stone-400">Нет доступов</p>
    ) : (
      <div className="overflow-x-auto md:overflow-visible">
        <table className="w-full min-w-[44rem] table-fixed text-sm">
          <colgroup>
            <col style={{ width: "30%" }} />
            <col style={{ width: "19%" }} />
            <col style={{ width: "15%" }} />
            <col style={{ width: "17%" }} />
            <col style={{ width: "13%" }} />
            <col style={{ width: "6%" }} />
          </colgroup>
          <tbody>
            {list.map((r) => (
              <tr key={r.id} className={`border-t border-stone-50 ${r.status === "removed" ? "text-stone-400 line-through" : ""}`}>
                <td className="truncate px-4 py-2 font-medium" title={r.email ?? ""}>{r.email ?? "-"}</td>
                <td className="truncate px-2 py-2" title={r.name ?? ""}>{r.name ?? ""}</td>
                <td className="truncate whitespace-nowrap px-2 py-2 text-stone-500">{r.phone ?? ""}</td>
                <td className="px-2 py-2">
                  {r.rights ? (
                    <span className="rounded bg-stone-100 px-2 py-0.5 text-xs font-semibold text-stone-600">{r.rights}</span>
                  ) : (
                    <span className="text-xs text-stone-300">права не указаны</span>
                  )}
                </td>
                <td className="truncate px-2 py-2 text-xs text-stone-400" title={r.notes ?? ""}>{r.notes ?? ""}</td>
                <td className="px-2 py-2 text-right">
                  <Menu
                    items={[
                      { label: "Изменить", onClick: () => openEdit(r) },
                      r.status === "active"
                        ? { label: "Отметить удалённым", onClick: () => void setStatus(r, "removed") }
                        : { label: "Вернуть доступ", onClick: () => void setStatus(r, "active") },
                      { label: "Удалить запись", danger: true, onClick: () => void remove(r) },
                    ]}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );

  return (
    <div className="max-w-5xl">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-lg font-extrabold tracking-tight text-stone-900">Ajax: доступы</p>
          <p className="text-xs text-stone-400">Активных доступов: {activeCount}. Арендаторы берутся из раздела «Аренда локалей». Пароли и коды не храним.</p>
        </div>
        <button onClick={() => openEdit("new")} className="rounded-lg bg-stone-900 px-3.5 py-2 text-sm font-semibold text-white hover:bg-stone-700">
          + Доступ
        </button>
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-4">
        <input className="input w-72" placeholder="Поиск: арендатор, email, имя, телефон" value={search} onChange={(e) => setSearch(e.target.value)} />
        <label className="flex items-center gap-2 text-sm text-stone-500">
          <input type="checkbox" checked={showRemoved} onChange={(e) => setShowRemoved(e.target.checked)} />
          Показать удалённые
        </label>
      </div>

      <div className="grid gap-5">
        {tenantCards.map((t) => {
          const list = grouped.byTenant.get(t.id) ?? [];
          const lots = lotsOf(t.id);
          return (
            <section key={t.id} className="rounded-2xl border border-stone-200 bg-white">
              <div className="flex flex-wrap items-center gap-3 px-4 py-3">
                <p className="text-sm font-bold text-stone-800">{t.name}</p>
                {lots.map((l) => (
                  <span key={l} className="rounded bg-stone-100 px-2 py-0.5 text-xs font-semibold text-stone-600">
                    лот {l}
                  </span>
                ))}
                {!t.is_active && <span className="rounded bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">выехал</span>}
                <span className="text-xs text-stone-400">{list.filter((r) => r.status === "active").length} акт.</span>
                <button onClick={() => openEdit("new", t.id)} className="ml-auto text-xs font-semibold text-stone-500 hover:text-stone-900">
                  + доступ
                </button>
              </div>
              <AccessTable list={list} />
            </section>
          );
        })}

        {grouped.other.map(([label, list]) => (
          <section key={label} className="rounded-2xl border border-stone-200 bg-white">
            <div className="flex items-center gap-3 px-4 py-3">
              <p className="text-sm font-bold text-stone-800">{label}</p>
              {list[0]?.lot && <span className="rounded bg-stone-100 px-2 py-0.5 text-xs font-semibold text-stone-600">{list[0].lot}</span>}
              <span className="text-xs text-stone-400">внутренние и без арендатора</span>
            </div>
            <AccessTable list={list} />
          </section>
        ))}

        {tenantCards.length === 0 && grouped.other.length === 0 && <Empty>Ничего не найдено</Empty>}
      </div>

      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing === "new" ? "Новый доступ Ajax" : "Изменить доступ"}>
        <div className="grid gap-3">
          <Field label="Арендатор" ru="Арендатор (из «Аренда локалей»)">
            <select className="input" value={form.tenant_id} onChange={(e) => setForm({ ...form, tenant_id: e.target.value })}>
              <option value="">Без арендатора (внутренний доступ)</option>
              {tenants.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                  {t.is_active ? "" : " (выехал)"}
                </option>
              ))}
            </select>
          </Field>
          {!form.tenant_id && (
            <div className="grid gap-3 sm:grid-cols-[1fr_7rem]">
              <Field label="Группа" ru="Группа (VLADIS, бригады...)">
                <input className="input" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
              </Field>
              <Field label="Lot" ru="Лот">
                <input className="input" value={form.lot} onChange={(e) => setForm({ ...form, lot: e.target.value })} />
              </Field>
            </div>
          )}
          <Field label="Email" ru="Email (аккаунт Ajax)">
            <input className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Имя" ru="Имя">
              <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Field label="Téléphone" ru="Телефон">
              <input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </Field>
          </div>
          <Field label="Права" ru="Что может (права)">
            <input className="input" list="ajax-rights" value={form.rights} onChange={(e) => setForm({ ...form, rights: e.target.value })} />
            <datalist id="ajax-rights">
              {RIGHTS.map((r) => (
                <option key={r} value={r} />
              ))}
            </datalist>
          </Field>
          <Field label="Note" ru="Заметка">
            <input className="input" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </Field>
          <div className="mt-2 flex justify-end gap-2">
            <button onClick={() => setEditing(null)} className="rounded-lg px-3.5 py-2 text-sm text-stone-500 hover:bg-stone-100">
              Отмена
            </button>
            <button onClick={save} disabled={busy} className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-semibold text-white hover:bg-stone-700 disabled:opacity-50">
              Сохранить
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
