"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ChevronRight, Folder, FolderOpen, Plus, Search, Trash2 } from "lucide-react";
import { evalNorm, planSchedule, workingDaysBetween, type NormDef } from "@/lib/commercial-durations/compute";

// Объекты (chantiers): папки по командам как в iCloud (KOMANDA_N), внутри статусы
// En cours / A venir / Pas fini / Fini. У объекта - вариант сметы (Standard / Avec LT / Ombrière),
// мощность, дата старта и список работ из каталога. Плановые дни считаются по нормам, даты - подряд по
// рабочим дням; к каждой работе вносятся фактические даты, причина задержки, и считается отклонение.

type Variant = "standard" | "lt" | "ombriere";
type Status = "a_venir" | "en_cours" | "pas_fini" | "fini";
type Team = { id: string; name: string };
type Obj = {
  id: string;
  name: string;
  team_id: string | null;
  status: Status;
  variant: Variant;
  power_kwc: number | null;
  start_date: string | null;
  finished_at: string | null;
  client: string | null;
  address: string | null;
  notes: string | null;
};
type Line = {
  id: string;
  object_id: string;
  position: number;
  section_code: string | null;
  catalog_position_id: string | null;
  label: string;
  unit: string | null;
  qty: number;
  price_ht: number | null;
  measure: number | null;
  manual_days: number | null;
  parallel: boolean;
  actual_start: string | null;
  actual_end: string | null;
  delay_reason: string | null;
};
type CatSection = { code: string; label: string; position: number };
type CatPos = {
  id: string;
  section_code: string;
  position: number;
  label: string;
  unit: string;
  price_ht: number | null;
  norm_standard: string | null;
  norm_lt: string | null;
  norm_ombriere: string | null;
  norm_basis: "power" | "qty" | "sub_measure";
};
type CatSub = { position_id: string; measure_value: number | null; measure_unit: string | null };

const STATUSES: { key: Status; fr: string; ru: string }[] = [
  { key: "en_cours", fr: "En cours", ru: "В работе" },
  { key: "a_venir", fr: "A venir", ru: "Предстоит" },
  { key: "pas_fini", fr: "Pas fini", ru: "Не закончен" },
  { key: "fini", fr: "Fini", ru: "Закончен" },
];
const STATUS_DOT: Record<Status, string> = { en_cours: "bg-primary-500", a_venir: "bg-stone-400", pas_fini: "bg-warning-500", fini: "bg-success-500" };
const VARIANTS: { key: Variant; label: string; norm: "norm_standard" | "norm_lt" | "norm_ombriere" }[] = [
  { key: "standard", label: "Standard", norm: "norm_standard" },
  { key: "lt", label: "Avec LT", norm: "norm_lt" },
  { key: "ombriere", label: "Ombrière", norm: "norm_ombriere" },
];

const LINE_COLS = "id, object_id, position, section_code, catalog_position_id, label, unit, qty, price_ht, measure, manual_days, parallel, actual_start, actual_end, delay_reason";
const OBJ_COLS = "id, name, team_id, status, variant, power_kwc, start_date, finished_at, client, address, notes";

const GHOST = "w-full rounded-md border border-transparent bg-transparent px-2 py-1 outline-none transition hover:border-stone-300 focus:border-primary-500 focus:bg-white";
const FIELD = "rounded-md border border-stone-300 bg-white px-2 py-1.5 text-[15px] outline-none focus:border-primary-500";

const num = (raw: string) => {
  const n = Number(String(raw).replace(",", ".").replace(/\s/g, ""));
  return Number.isFinite(n) ? n : 0;
};
const fmtDays = (n: number) => n.toLocaleString("fr-FR", { maximumFractionDigits: 1 });
const frDate = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : "—");
const todayIso = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};
const teamNum = (name: string) => Number(name.replace(/\D+/g, "")) || 999;

export default function WorkObjectsView({ supabase, norms, userEmail }: { supabase: SupabaseClient; norms: Record<string, NormDef>; userEmail?: string }) {
  const [teams, setTeams] = useState<Team[]>([]);
  const [objects, setObjects] = useState<Obj[]>([]);
  const [catSections, setCatSections] = useState<CatSection[]>([]);
  const [catPos, setCatPos] = useState<CatPos[]>([]);
  const [catSubs, setCatSubs] = useState<CatSub[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [search, setSearch] = useState("");
  const [openTeams, setOpenTeams] = useState<Set<string>>(new Set());
  const [openFini, setOpenFini] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);
  const [newForm, setNewForm] = useState({ name: "", team_id: "", variant: "standard" as Variant, power: "", start: "" });
  const [pickerOpen, setPickerOpen] = useState(false);
  const [custom, setCustom] = useState({ label: "", unit: "jour", qty: "1", days: "" });

  useEffect(() => {
    let alive = true;
    (async () => {
      const [t, o, s, p, sp] = await Promise.all([
        supabase.from("teams").select("id, name").order("name"),
        supabase.from("work_objects").select(OBJ_COLS).order("name"),
        supabase.from("work_sections").select("code, label, position").order("position"),
        supabase.from("work_positions").select("id, section_code, position, label, unit, price_ht, norm_standard, norm_lt, norm_ombriere, norm_basis").eq("active", true).order("position"),
        supabase.from("work_subpositions").select("position_id, measure_value, measure_unit").order("position"),
      ]);
      if (!alive) return;
      const failed = t.error ?? o.error ?? s.error ?? p.error ?? sp.error;
      if (failed) setError(failed.message);
      else {
        setTeams(((t.data as Team[]) ?? []).sort((a, b) => teamNum(a.name) - teamNum(b.name)));
        setObjects(((o.data as Obj[]) ?? []).map((x) => ({ ...x, power_kwc: x.power_kwc == null ? null : Number(x.power_kwc) })));
        setCatSections((s.data as CatSection[]) ?? []);
        setCatPos(((p.data as CatPos[]) ?? []).map((x) => ({ ...x, price_ht: x.price_ht == null ? null : Number(x.price_ht) })));
        setCatSubs(((sp.data as CatSub[]) ?? []).map((x) => ({ ...x, measure_value: x.measure_value == null ? null : Number(x.measure_value) })));
      }
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [supabase]);

  const loadLines = useCallback(
    async (objectId: string) => {
      const { data, error: err } = await supabase.from("work_object_lines").select(LINE_COLS).eq("object_id", objectId).order("position");
      if (err) {
        setError(err.message);
        return;
      }
      setLines(
        ((data as Line[]) ?? []).map((l) => ({
          ...l,
          qty: Number(l.qty),
          price_ht: l.price_ht == null ? null : Number(l.price_ht),
          measure: l.measure == null ? null : Number(l.measure),
          manual_days: l.manual_days == null ? null : Number(l.manual_days),
        }))
      );
    },
    [supabase]
  );

  function selectObject(o: Obj) {
    setSelectedId(o.id);
    setLines([]);
    setPickerOpen(false);
    if (o.team_id) setOpenTeams((s) => new Set(s).add(o.team_id!));
    loadLines(o.id);
  }

  const obj = objects.find((o) => o.id === selectedId) ?? null;
  const catById = useMemo(() => new Map(catPos.map((p) => [p.id, p])), [catPos]);

  // ── дни по нормам и плановые даты ──────────────────────────────────────────
  const daysOf = useCallback(
    (l: Line): number => {
      if (l.manual_days != null) return l.manual_days;
      const cp = l.catalog_position_id ? catById.get(l.catalog_position_id) : undefined;
      if (!cp || !obj) return 0;
      const varDef = VARIANTS.find((v) => v.key === obj.variant)!;
      const code = cp[varDef.norm];
      if (!code || !norms[code]) return 0;
      const x = cp.norm_basis === "power" ? (obj.power_kwc ?? 0) : cp.norm_basis === "sub_measure" ? (l.measure ?? l.qty) : l.qty;
      return x > 0 ? evalNorm(norms[code], x).jours : 0;
    },
    [catById, norms, obj]
  );
  const schedule = useMemo(() => planSchedule(obj?.start_date ?? null, lines.map((l) => ({ days: daysOf(l), parallel: l.parallel }))), [obj, lines, daysOf]);

  // ── изменения объекта ──────────────────────────────────────────────────────
  async function patchObject(id: string, patch: Partial<Obj>) {
    setObjects((prev) => prev.map((o) => (o.id === id ? { ...o, ...patch } : o)));
    const { error: err } = await supabase.from("work_objects").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);
    if (err) setError("Не удалось сохранить: " + err.message);
  }
  async function setStatus(o: Obj, status: Status) {
    await patchObject(o.id, { status, finished_at: status === "fini" ? (o.finished_at ?? todayIso()) : null });
  }
  async function createObject() {
    const name = newForm.name.trim();
    if (!name) return;
    const row = {
      name,
      team_id: newForm.team_id || null,
      variant: newForm.variant,
      power_kwc: newForm.power.trim() ? num(newForm.power) : null,
      start_date: newForm.start || null,
      status: "a_venir" as Status,
      created_by_email: userEmail ?? null,
    };
    const { data, error: err } = await supabase.from("work_objects").insert(row).select(OBJ_COLS).single();
    if (err || !data) {
      setError("Не удалось создать объект: " + (err?.message ?? ""));
      return;
    }
    const created = { ...(data as Obj), power_kwc: (data as Obj).power_kwc == null ? null : Number((data as Obj).power_kwc) };
    setObjects((prev) => [...prev, created]);
    setCreating(false);
    setNewForm({ name: "", team_id: "", variant: "standard", power: "", start: "" });
    setError(null);
    selectObject(created);
  }
  async function deleteObject(o: Obj) {
    if (!window.confirm(`Удалить объект «${o.name}» вместе со списком работ? Это нельзя отменить.`)) return;
    const { error: err } = await supabase.from("work_objects").delete().eq("id", o.id);
    if (err) return setError("Не удалось удалить: " + err.message);
    setObjects((prev) => prev.filter((x) => x.id !== o.id));
    setSelectedId(null);
    setLines([]);
  }

  // ── работы объекта ─────────────────────────────────────────────────────────
  async function addLine(base: Omit<Line, "id" | "object_id" | "position">) {
    if (!obj) return;
    const position = lines.length ? Math.max(...lines.map((l) => l.position)) + 1 : 1;
    const { data, error: err } = await supabase.from("work_object_lines").insert({ ...base, object_id: obj.id, position }).select(LINE_COLS).single();
    if (err || !data) return setError("Не удалось добавить работу: " + (err?.message ?? ""));
    const l = data as Line;
    setLines((prev) => [...prev, { ...l, qty: Number(l.qty), price_ht: l.price_ht == null ? null : Number(l.price_ht), measure: l.measure == null ? null : Number(l.measure), manual_days: l.manual_days == null ? null : Number(l.manual_days) }]);
  }
  function addFromCatalog(cp: CatPos) {
    const isKwc = cp.unit.toLowerCase() === "kwc";
    const sub = catSubs.find((s) => s.position_id === cp.id && s.measure_value != null);
    addLine({
      section_code: cp.section_code,
      catalog_position_id: cp.id,
      label: cp.label,
      unit: cp.unit,
      qty: isKwc ? (obj?.power_kwc ?? 1) : 1,
      price_ht: cp.price_ht,
      measure: cp.norm_basis === "sub_measure" ? (sub?.measure_value ?? null) : null,
      manual_days: null,
      parallel: false,
      actual_start: null,
      actual_end: null,
      delay_reason: null,
    });
  }
  function addCustom() {
    const label = custom.label.trim();
    if (!label) return;
    addLine({
      section_code: null,
      catalog_position_id: null,
      label,
      unit: custom.unit.trim() || null,
      qty: custom.qty.trim() ? num(custom.qty) : 1,
      price_ht: null,
      measure: null,
      manual_days: custom.days.trim() ? num(custom.days) : null,
      parallel: false,
      actual_start: null,
      actual_end: null,
      delay_reason: null,
    });
    setCustom({ label: "", unit: "jour", qty: "1", days: "" });
  }
  async function patchLine(id: string, patch: Partial<Line>) {
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
    const { error: err } = await supabase.from("work_object_lines").update(patch).eq("id", id);
    if (err) setError("Не удалось сохранить: " + err.message);
  }
  async function deleteLine(id: string) {
    const { error: err } = await supabase.from("work_object_lines").delete().eq("id", id);
    if (err) return setError("Не удалось удалить: " + err.message);
    setLines((prev) => prev.filter((l) => l.id !== id));
  }

  // ── папки ──────────────────────────────────────────────────────────────────
  const q = search.trim().toLowerCase();
  const visible = objects.filter((o) => !q || o.name.toLowerCase().includes(q));
  const folders = useMemo(() => {
    const list = teams.map((t) => ({ id: t.id as string | null, name: t.name, items: visible.filter((o) => o.team_id === t.id) }));
    const none = visible.filter((o) => !o.team_id || !teams.some((t) => t.id === o.team_id));
    if (none.length) list.push({ id: null, name: "Sans équipe · без команды", items: none });
    return list;
  }, [teams, visible]);

  if (loading) return <p className="text-sm text-stone-500">Chargement…</p>;
  if (error && objects.length === 0 && teams.length === 0)
    return <p className="rounded-lg bg-error-50 p-3 text-sm text-error-700">{error}. Если это первый запуск - нужно выполнить миграцию 0135.</p>;

  // суммарно по плану / факту выбранного объекта
  const lastPlanEnd = schedule.filter(Boolean).map((s) => s!.end).sort().pop() ?? null;
  const firstPlanStart = schedule.filter(Boolean).map((s) => s!.start).sort()[0] ?? null;
  const totalPlanDays = lines.reduce((a, l) => a + daysOf(l), 0);
  const lastActualEnd = lines.map((l) => l.actual_end).filter(Boolean).sort().pop() ?? null;
  const allDone = lines.length > 0 && lines.every((l) => l.actual_end);
  const totalDeviation = allDone && lastActualEnd && lastPlanEnd ? workingDaysBetween(lastPlanEnd, lastActualEnd) : null;

  return (
    <div className="space-y-4">
      {error && <p className="rounded-lg bg-error-50 p-2 text-sm text-error-700">{error}</p>}
      <div className="grid gap-4 lg:grid-cols-[19rem_minmax(0,1fr)]">
        {/* Папки команд */}
        <aside className="space-y-3">
          <div className="relative">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
            <input className={`${FIELD} w-full pl-9`} placeholder="Найти объект…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <button type="button" className="btn btn-primary w-full gap-1.5 px-3 py-2 text-[15px]" onClick={() => setCreating((v) => !v)}>
            <Plus size={16} /> Новый объект
          </button>

          {creating && (
            <div className="space-y-2 rounded-xl border border-stone-200 bg-white p-3">
              <input className={`${FIELD} w-full`} placeholder="Название объекта" autoFocus value={newForm.name} onChange={(e) => setNewForm((f) => ({ ...f, name: e.target.value }))} />
              <select className={`${FIELD} w-full`} value={newForm.team_id} onChange={(e) => setNewForm((f) => ({ ...f, team_id: e.target.value }))}>
                <option value="">Команда не выбрана</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              <div className="flex gap-1">
                {VARIANTS.map((v) => (
                  <button key={v.key} type="button" onClick={() => setNewForm((f) => ({ ...f, variant: v.key }))} className={`flex-1 rounded-md border px-1 py-1.5 text-sm font-semibold ${newForm.variant === v.key ? "border-stone-900 bg-stone-900 text-white" : "border-stone-300 text-stone-700"}`}>
                    {v.label}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <input className={`${FIELD} w-1/2`} placeholder="kWc" inputMode="decimal" value={newForm.power} onChange={(e) => setNewForm((f) => ({ ...f, power: e.target.value }))} />
                <input type="date" className={`${FIELD} w-1/2`} value={newForm.start} onChange={(e) => setNewForm((f) => ({ ...f, start: e.target.value }))} />
              </div>
              <div className="flex gap-2">
                <button type="button" className="btn btn-primary flex-1 py-1.5 text-[15px]" disabled={!newForm.name.trim()} onClick={createObject}>
                  Создать
                </button>
                <button type="button" className="px-2 text-[15px] text-stone-600" onClick={() => setCreating(false)}>
                  Отмена
                </button>
              </div>
            </div>
          )}

          <div className="space-y-1">
            {folders.map((f) => {
              const key = f.id ?? "none";
              const isOpen = !!q || openTeams.has(key) || (selectedId != null && f.items.some((o) => o.id === selectedId));
              return (
                <div key={key} className="rounded-xl border border-stone-200 bg-white">
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 px-3 py-2.5 text-left"
                    onClick={() =>
                      setOpenTeams((s) => {
                        const n = new Set(s);
                        if (n.has(key)) n.delete(key);
                        else n.add(key);
                        return n;
                      })
                    }
                  >
                    {isOpen ? <FolderOpen size={17} className="text-primary-600" /> : <Folder size={17} className="text-stone-500" />}
                    <span className="flex-1 text-[15px] font-semibold text-stone-900">{f.name}</span>
                    <span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs font-semibold text-stone-600">{f.items.length}</span>
                    <ChevronRight size={15} className={`text-stone-400 transition ${isOpen ? "rotate-90" : ""}`} />
                  </button>
                  {isOpen && (
                    <div className="border-t border-stone-100 pb-1.5">
                      {f.items.length === 0 && <p className="px-4 py-2 text-sm text-stone-500">Пусто</p>}
                      {STATUSES.map((st) => {
                        const items = f.items.filter((o) => o.status === st.key);
                        if (items.length === 0) return null;
                        const finiKey = `${key}:fini`;
                        const collapsed = st.key === "fini" && !q && !openFini.has(finiKey) && !items.some((o) => o.id === selectedId);
                        return (
                          <div key={st.key} className="pt-1.5">
                            <button
                              type="button"
                              disabled={st.key !== "fini"}
                              className="flex w-full items-center gap-2 px-4 py-1 text-left text-[13px] font-semibold text-stone-600"
                              onClick={() =>
                                setOpenFini((s) => {
                                  const n = new Set(s);
                                  if (n.has(finiKey)) n.delete(finiKey);
                                  else n.add(finiKey);
                                  return n;
                                })
                              }
                            >
                              <span className={`h-2 w-2 rounded-full ${STATUS_DOT[st.key]}`} />
                              {st.fr} <span className="font-normal text-stone-500">· {st.ru}</span>
                              <span className="ml-auto text-xs font-normal text-stone-500">{items.length}</span>
                            </button>
                            {!collapsed &&
                              items.map((o) => (
                                <button
                                  key={o.id}
                                  type="button"
                                  onClick={() => selectObject(o)}
                                  className={`block w-full truncate px-4 py-1.5 pl-8 text-left text-[15px] transition ${o.id === selectedId ? "bg-primary-50 font-semibold text-primary-800" : "text-stone-800 hover:bg-stone-50"}`}
                                >
                                  {o.name}
                                </button>
                              ))}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </aside>

        {/* Карточка объекта */}
        <section className="min-w-0">
          {!obj ? (
            <div className="rounded-xl border border-dashed border-stone-300 bg-white p-10 text-center text-[15px] text-stone-600">Выберите объект в папке команды или создайте новый.</div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-4 rounded-xl border border-stone-200 bg-white p-5">
                <div className="flex flex-wrap items-start gap-3">
                  <input key={obj.id + obj.name} className={`${GHOST} min-w-[14rem] flex-1 !text-xl font-bold`} defaultValue={obj.name} onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== obj.name && patchObject(obj.id, { name: e.target.value.trim() })} />
                  <button type="button" className="rounded-lg p-2 text-stone-400 hover:bg-stone-100 hover:text-error-600" title="Удалить объект" onClick={() => deleteObject(obj)}>
                    <Trash2 size={17} />
                  </button>
                </div>

                <div className="flex flex-wrap gap-2">
                  {STATUSES.map((st) => (
                    <button key={st.key} type="button" onClick={() => setStatus(obj, st.key)} className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-[15px] font-semibold transition ${obj.status === st.key ? "border-stone-900 bg-stone-900 text-white" : "border-stone-300 text-stone-700 hover:bg-stone-50"}`}>
                      <span className={`h-2 w-2 rounded-full ${obj.status === st.key ? "bg-white" : STATUS_DOT[st.key]}`} />
                      {st.fr}
                    </button>
                  ))}
                  {obj.status === "fini" && obj.finished_at && <span className="self-center text-sm text-stone-600">закончен {obj.finished_at.split("-").reverse().join("/")}</span>}
                </div>

                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <label className="text-[13px] font-semibold text-stone-700">
                    Команда
                    <select className={`${FIELD} mt-1 w-full`} value={obj.team_id ?? ""} onChange={(e) => patchObject(obj.id, { team_id: e.target.value || null })}>
                      <option value="">не выбрана</option>
                      {teams.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="text-[13px] font-semibold text-stone-700">
                    Вариант
                    <div className="mt-1 flex gap-1">
                      {VARIANTS.map((v) => (
                        <button key={v.key} type="button" onClick={() => patchObject(obj.id, { variant: v.key })} className={`flex-1 rounded-md border px-1 py-1.5 text-sm font-semibold ${obj.variant === v.key ? "border-stone-900 bg-stone-900 text-white" : "border-stone-300 text-stone-700"}`}>
                          {v.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <label className="text-[13px] font-semibold text-stone-700">
                    Puissance, kWc
                    <input key={obj.id + String(obj.power_kwc)} className={`${FIELD} mt-1 w-full`} inputMode="decimal" defaultValue={obj.power_kwc ?? ""} onBlur={(e) => patchObject(obj.id, { power_kwc: e.target.value.trim() ? num(e.target.value) : null })} />
                  </label>
                  <label className="text-[13px] font-semibold text-stone-700">
                    Дата старта
                    <input type="date" className={`${FIELD} mt-1 w-full`} value={obj.start_date ?? ""} onChange={(e) => patchObject(obj.id, { start_date: e.target.value || null })} />
                  </label>
                </div>

                <div className="flex flex-wrap items-center gap-x-8 gap-y-1 border-t border-stone-100 pt-3 text-[15px]">
                  <span>
                    План: <b>{fmtDays(totalPlanDays)} дн.</b>
                    {firstPlanStart && lastPlanEnd && (
                      <span className="text-stone-600">
                        {" "}
                        · {frDate(firstPlanStart)} → {frDate(lastPlanEnd)}
                      </span>
                    )}
                  </span>
                  {totalDeviation != null && (
                    <span className={`font-bold ${totalDeviation > 0 ? "text-error-700" : "text-success-700"}`}>
                      {totalDeviation > 0 ? `Опоздание ${totalDeviation} раб. дн.` : totalDeviation < 0 ? `Раньше срока на ${-totalDeviation} раб. дн.` : "Закончено в срок"}
                    </span>
                  )}
                  {!obj.start_date && <span className="text-warning-700">Укажите дату старта - тогда посчитаются плановые даты</span>}
                </div>
              </div>

              {/* Работы / контрандю */}
              <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white">
                <table className="w-full min-w-[1280px] table-fixed border-collapse text-[15px]">
                  <colgroup>
                    <col />
                    <col style={{ width: 90 }} />
                    <col style={{ width: 70 }} />
                    <col style={{ width: 150 }} />
                    <col style={{ width: 140 }} />
                    <col style={{ width: 140 }} />
                    <col style={{ width: 110 }} />
                    <col style={{ width: 200 }} />
                    <col style={{ width: 40 }} />
                  </colgroup>
                  <thead>
                    <tr className="bg-[#2b4aa8] text-white">
                      <th className="px-3 py-3 text-left font-bold">Travaux / работы</th>
                      <th className="px-2 py-3 text-right font-bold">Quantité</th>
                      <th className="px-2 py-3 text-right font-bold">Jours</th>
                      <th className="bg-[#5b7f3a] px-2 py-3 text-center font-bold">Prévu / план</th>
                      <th className="px-2 py-3 text-center font-bold">Début réel</th>
                      <th className="px-2 py-3 text-center font-bold">Fin réelle</th>
                      <th className="px-2 py-3 text-center font-bold">Écart</th>
                      <th className="px-2 py-3 text-left font-bold">Причина задержки</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {lines.length === 0 && (
                      <tr>
                        <td colSpan={9} className="px-4 py-8 text-center text-stone-600">
                          Работ пока нет. Добавьте их из каталога сметы.
                        </td>
                      </tr>
                    )}
                    {lines.map((l, i) => {
                      const days = daysOf(l);
                      const sc = schedule[i];
                      const cp = l.catalog_position_id ? catById.get(l.catalog_position_id) : undefined;
                      const subMeasure = cp?.norm_basis === "sub_measure";
                      const sectionLabel = catSections.find((s) => s.code === l.section_code)?.label;
                      // отклонение: по факту окончания, либо « просрочено », если срок прошёл, а работа не закончена
                      let dev: { text: string; cls: string } | null = null;
                      if (sc && l.actual_end) {
                        const d = workingDaysBetween(sc.end, l.actual_end);
                        dev = d > 0 ? { text: `+${d} дн.`, cls: "text-error-700" } : d < 0 ? { text: `${d} дн.`, cls: "text-success-700" } : { text: "в срок", cls: "text-success-700" };
                      } else if (sc && l.actual_start && todayIso() > sc.end) {
                        const d = workingDaysBetween(sc.end, todayIso());
                        if (d > 0) dev = { text: `просрочено +${d}`, cls: "text-warning-700" };
                      }
                      return (
                        <tr key={l.id} className="group border-b border-stone-200 align-top hover:bg-stone-50/60">
                          <td className="px-3 py-2">
                            <input key={l.id + l.label} className={`${GHOST} font-medium`} defaultValue={l.label} onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== l.label && patchLine(l.id, { label: e.target.value.trim() })} />
                            <div className="flex flex-wrap items-center gap-x-3 px-2 text-[13px] text-stone-600">
                              {sectionLabel && <span>{sectionLabel}</span>}
                              {subMeasure && (
                                <label className="inline-flex items-center gap-1">
                                  мера
                                  <input key={l.id + String(l.measure)} className="w-16 rounded border border-stone-300 bg-white px-1 py-0.5 text-right" inputMode="decimal" defaultValue={l.measure ?? ""} onBlur={(e) => patchLine(l.id, { measure: e.target.value.trim() ? num(e.target.value) : null })} />
                                  ml
                                </label>
                              )}
                              {i > 0 && (
                                <label className="inline-flex cursor-pointer items-center gap-1" title="Эта работа идёт одновременно с предыдущей">
                                  <input type="checkbox" checked={l.parallel} onChange={(e) => patchLine(l.id, { parallel: e.target.checked })} />
                                  параллельно
                                </label>
                              )}
                            </div>
                          </td>
                          <td className="px-2 py-2 text-right">
                            <input key={l.id + String(l.qty)} className={`${GHOST} text-right tabular-nums`} inputMode="decimal" defaultValue={l.qty} onBlur={(e) => num(e.target.value) !== l.qty && patchLine(l.id, { qty: num(e.target.value) })} />
                            <span className="block px-2 text-[13px] text-stone-500">{l.unit}</span>
                          </td>
                          <td className="px-2 py-2 text-right">
                            <input
                              key={l.id + String(l.manual_days) + String(days)}
                              className={`${GHOST} text-right font-bold tabular-nums ${l.manual_days != null ? "!border-warning-400" : ""}`}
                              inputMode="decimal"
                              title={l.manual_days != null ? "Дни введены вручную (очистите поле, чтобы вернуть норму)" : "Дни по норме; можно ввести своё значение"}
                              defaultValue={days ? fmtDays(days) : ""}
                              placeholder="—"
                              onBlur={(e) => {
                                const raw = e.target.value.trim();
                                if (raw === (days ? fmtDays(days) : "")) return;
                                patchLine(l.id, { manual_days: raw === "" ? null : num(raw) });
                              }}
                            />
                          </td>
                          <td className="bg-[#e4eed6] px-2 py-2 text-center text-sm font-semibold tabular-nums">{sc ? `${frDate(sc.start)} → ${frDate(sc.end)}` : "—"}</td>
                          <td className="px-2 py-2">
                            <input type="date" className={`${GHOST} text-center`} value={l.actual_start ?? ""} onChange={(e) => patchLine(l.id, { actual_start: e.target.value || null })} />
                          </td>
                          <td className="px-2 py-2">
                            <input type="date" className={`${GHOST} text-center`} value={l.actual_end ?? ""} onChange={(e) => patchLine(l.id, { actual_end: e.target.value || null })} />
                          </td>
                          <td className={`px-2 py-3 text-center text-sm font-bold ${dev?.cls ?? ""}`}>{dev?.text ?? ""}</td>
                          <td className="px-2 py-2">
                            <input key={l.id + String(l.delay_reason)} className={GHOST} placeholder={dev && dev.cls !== "text-success-700" ? "Почему?" : ""} defaultValue={l.delay_reason ?? ""} onBlur={(e) => (e.target.value.trim() || null) !== l.delay_reason && patchLine(l.id, { delay_reason: e.target.value.trim() || null })} />
                          </td>
                          <td className="px-1 py-2 text-center">
                            <button type="button" className="p-1 text-stone-400 opacity-70 hover:text-error-600 group-hover:opacity-100" title="Удалить работу" onClick={() => deleteLine(l.id)}>
                              <Trash2 size={15} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Добавление работ */}
              <div className="space-y-3">
                <button type="button" className="btn gap-1.5 px-3 py-2 text-[15px]" onClick={() => setPickerOpen((v) => !v)}>
                  <Plus size={16} /> Добавить работу из каталога
                </button>
                {pickerOpen && (
                  <div className="space-y-4 rounded-xl border border-stone-200 bg-white p-4">
                    {catSections.map((s) => {
                      const items = catPos.filter((p) => p.section_code === s.code);
                      if (items.length === 0) return null;
                      return (
                        <div key={s.code}>
                          <p className="mb-1.5 text-[13px] font-bold text-stone-700">{s.label}</p>
                          <div className="flex flex-wrap gap-2">
                            {items.map((p) => (
                              <button key={p.id} type="button" onClick={() => addFromCatalog(p)} className="rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-left text-[14px] text-stone-800 transition hover:border-primary-400 hover:bg-primary-50">
                                {p.label} <span className="text-stone-500">· {p.unit}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                    <div className="flex flex-wrap items-end gap-2 border-t border-stone-100 pt-3">
                      <label className="flex-1 basis-56 text-[13px] font-semibold text-stone-700">
                        Своя работа
                        <input className={`${FIELD} mt-1 w-full`} placeholder="Название" value={custom.label} onChange={(e) => setCustom((c) => ({ ...c, label: e.target.value }))} />
                      </label>
                      <label className="w-20 text-[13px] font-semibold text-stone-700">
                        Кол-во
                        <input className={`${FIELD} mt-1 w-full text-right`} inputMode="decimal" value={custom.qty} onChange={(e) => setCustom((c) => ({ ...c, qty: e.target.value }))} />
                      </label>
                      <label className="w-24 text-[13px] font-semibold text-stone-700">
                        Ед.
                        <input className={`${FIELD} mt-1 w-full`} value={custom.unit} onChange={(e) => setCustom((c) => ({ ...c, unit: e.target.value }))} />
                      </label>
                      <label className="w-24 text-[13px] font-semibold text-stone-700">
                        Дни
                        <input className={`${FIELD} mt-1 w-full text-right`} inputMode="decimal" value={custom.days} onChange={(e) => setCustom((c) => ({ ...c, days: e.target.value }))} />
                      </label>
                      <button type="button" className="btn btn-primary px-4 py-2 text-[15px]" disabled={!custom.label.trim()} onClick={addCustom}>
                        Добавить
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
