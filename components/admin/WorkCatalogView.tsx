"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { evalNorm, type NormDef } from "@/lib/commercial-durations/compute";

// Смета VLADIS (Modele_DEVIS_VLADIS2.xlsx) в том же виде :
//   раздел (серая полоса) -> позиция (с отступом : Quantité / Unité / P.U HT) -> подпозиция (на всю ширину),
//   справа три зелёные колонки Standard / Avec LT / Ombrière = дни по нормам.
// Здесь это « песочница » : количества и меры вводятся для проверки норм и нигде не сохраняются.
// Сохраняются только правки каталога (цена, текст подпозиции) - для rh_admin.

type Section = { code: string; label: string; label_ru: string; position: number };
type Pos = {
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
type Sub = { id: string; position_id: string; position: number; label: string; measure_value: number | null; measure_unit: string | null };

const VARIANTS = [
  { key: "norm_standard", label: "Standard" },
  { key: "norm_lt", label: "Avec LT" },
  { key: "norm_ombriere", label: "Ombrière" },
] as const;

const POS_COLS = "id, section_code, position, label, unit, price_ht, norm_standard, norm_lt, norm_ombriere, norm_basis";
const UNIT_SUGGESTIONS = ["U", "M2", "Ml", "Kwc", "pièce", "jour", "semaine", "heure", "forfait", "kg", "m3"];
/** Старые нормы (досье по клиентам) и вторые/третьи варианты Main-d'œuvre в выбор не попадают. */
const HIDDEN_NORMS = new Set(["main_doeuvre_standard", "main_doeuvre_ombriere", "pose_bac_acier", "depose_bac_acier", "depose_fibrociment", "demontage_panneau", "mo_lt", "mo_ombriere"]);
const MO_TRIPLE = "mo_standard";

type NewPos = { label: string; unit: string; price: string; norm: string; basis: Pos["norm_basis"] };
const EMPTY_NEW: NewPos = { label: "", unit: "U", price: "", norm: "", basis: "qty" };

const eur = (n: number) => n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
const days = (n: number) => n.toLocaleString("fr-FR", { maximumFractionDigits: 1 });
const num = (raw: string) => {
  const n = Number(raw.replace(",", ".").replace(/\s/g, ""));
  return Number.isFinite(n) ? n : 0;
};

const GHOST = "w-full rounded-md border border-transparent bg-transparent px-2 py-0.5 outline-none transition hover:border-stone-300 focus:border-primary-500 focus:bg-white";
const QTY_INPUT = "w-full rounded-md border border-stone-200 bg-stone-50 px-2 py-0.5 text-right outline-none focus:border-primary-500 focus:bg-white";
const UNIT_INPUT = `${GHOST} [&::-webkit-calendar-picker-indicator]:hidden`;

/** Цена: в покое выглядит как в смете (« 1 500,00 € »), при редактировании - обычное число. */
function PriceInput({ value, onCommit }: { value: number | null; onCommit: (raw: string) => void }) {
  const [focus, setFocus] = useState(false);
  const [draft, setDraft] = useState("");
  return (
    <input
      className={`${GHOST} text-right tabular-nums`}
      inputMode="decimal"
      value={focus ? draft : value == null ? "" : eur(value)}
      onFocus={() => {
        setFocus(true);
        setDraft(value == null ? "" : String(value).replace(".", ","));
      }}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        setFocus(false);
        onCommit(draft);
      }}
    />
  );
}

export default function WorkCatalogView({
  supabase,
  norms,
  normOptions,
  canEdit,
}: {
  supabase: SupabaseClient;
  norms: Record<string, NormDef>;
  normOptions: { code: string; label: string }[];
  canEdit: boolean;
}) {
  const [sections, setSections] = useState<Section[]>([]);
  const [positions, setPositions] = useState<Pos[]>([]);
  const [subs, setSubs] = useState<Sub[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // тестовые вводы (не сохраняются)
  const [kwc, setKwc] = useState("150");
  const [qty, setQty] = useState<Record<string, string>>({});
  const [measure, setMeasure] = useState<Record<string, string>>({});
  const [manualDays, setManualDays] = useState<Record<string, string>>({});
  const [adding, setAdding] = useState<string | null>(null); // код раздела, где открыта форма
  const [form, setForm] = useState<NewPos>(EMPTY_NEW);
  const [newSection, setNewSection] = useState<string | null>(null); // null = форма закрыта

  useEffect(() => {
    let alive = true;
    (async () => {
      const [s, p, sp] = await Promise.all([
        supabase.from("work_sections").select("code, label, label_ru, position").order("position"),
        supabase
          .from("work_positions")
          .select(POS_COLS)
          .eq("active", true)
          .order("position"),
        supabase.from("work_subpositions").select("id, position_id, position, label, measure_value, measure_unit").order("position"),
      ]);
      if (!alive) return;
      if (s.error || p.error || sp.error) {
        setError((s.error ?? p.error ?? sp.error)?.message ?? "Ошибка загрузки");
      } else {
        setSections((s.data as Section[]) ?? []);
        setPositions(((p.data as Pos[]) ?? []).map((x) => ({ ...x, price_ht: x.price_ht == null ? null : Number(x.price_ht) })));
        setSubs(((sp.data as Sub[]) ?? []).map((x) => ({ ...x, measure_value: x.measure_value == null ? null : Number(x.measure_value) })));
      }
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [supabase]);

  const subsByPos = useMemo(() => {
    const m = new Map<string, Sub[]>();
    for (const s of subs) m.set(s.position_id, [...(m.get(s.position_id) ?? []), s]);
    return m;
  }, [subs]);

  const power = num(kwc);

  /** Мощность подставляется в Quantité только у строк в kWc (Main-d'œuvre); у « U » количество вводится как обычно. */
  const qtyIsPower = (p: Pos) => p.norm_basis === "power" && p.unit.toLowerCase() === "kwc";
  function quantityOf(p: Pos): number {
    if (qtyIsPower(p)) return power;
    const raw = qty[p.id];
    return raw === undefined ? 1 : num(raw);
  }
  function measureOf(s: Sub): number {
    const raw = measure[s.id];
    return raw === undefined ? (s.measure_value ?? 0) : num(raw);
  }
  /** x pour la norme selon la base de calcul de la position. */
  function basisValue(p: Pos): number {
    if (p.norm_basis === "power") return power;
    if (p.norm_basis === "sub_measure") {
      const withMeasure = (subsByPos.get(p.id) ?? []).find((s) => s.measure_value != null);
      return withMeasure ? measureOf(withMeasure) : quantityOf(p);
    }
    return quantityOf(p);
  }
  function normDays(p: Pos, key: (typeof VARIANTS)[number]["key"]): { jours: number; out: boolean } | null {
    const code = p[key];
    if (!code || !norms[code]) return null;
    const x = basisValue(p);
    if (!(x > 0)) return { jours: 0, out: false };
    const r = evalNorm(norms[code], x);
    return { jours: r.jours, out: r.extrapolated };
  }

  const hasNorm = (p: Pos) => Boolean(p.norm_standard || p.norm_lt || p.norm_ombriere);

  // итоги
  const lineTotal = (p: Pos) => (p.price_ht ?? 0) * quantityOf(p);
  const sectionTotals = new Map(sections.map((s) => [s.code, positions.filter((p) => p.section_code === s.code).reduce((a, p) => a + lineTotal(p), 0)]));
  const totalHt = Array.from(sectionTotals.values()).reduce((a, b) => a + b, 0);
  const dayTotals = VARIANTS.map((v) =>
    positions.reduce((acc, p) => {
      if (!hasNorm(p)) return acc + num(manualDays[p.id] ?? "0");
      return acc + (normDays(p, v.key)?.jours ?? 0);
    }, 0)
  );

  async function savePrice(p: Pos, raw: string) {
    const value = raw.trim() === "" ? null : num(raw);
    if (value === p.price_ht) return;
    const { error: err } = await supabase.from("work_positions").update({ price_ht: value }).eq("id", p.id);
    if (err) {
      setError("Не удалось сохранить цену: " + err.message);
      return;
    }
    setPositions((prev) => prev.map((x) => (x.id === p.id ? { ...x, price_ht: value } : x)));
  }
  async function saveSubLabel(s: Sub, text: string) {
    if (text === s.label) return;
    const { error: err } = await supabase.from("work_subpositions").update({ label: text }).eq("id", s.id);
    if (err) {
      setError("Не удалось сохранить текст: " + err.message);
      return;
    }
    setSubs((prev) => prev.map((x) => (x.id === s.id ? { ...x, label: text } : x)));
  }

  const fail = (text: string, e: { message: string }) => setError(`${text}: ${e.message}`);
  const normalizePos = (x: Pos): Pos => ({ ...x, price_ht: x.price_ht == null ? null : Number(x.price_ht) });

  async function addPosition(sectionCode: string) {
    const label = form.label.trim();
    if (!label) return;
    const inSection = positions.filter((x) => x.section_code === sectionCode);
    const next = inSection.length ? Math.max(...inSection.map((x) => x.position)) + 1 : 1;
    const triple = form.norm === MO_TRIPLE;
    const row = {
      section_code: sectionCode,
      position: next,
      label,
      unit: form.unit.trim() || "U",
      price_ht: form.price.trim() === "" ? null : num(form.price),
      norm_standard: form.norm || null,
      norm_lt: triple ? "mo_lt" : form.norm || null,
      norm_ombriere: triple ? "mo_ombriere" : form.norm || null,
      norm_basis: form.norm ? form.basis : "qty",
    };
    const { data, error: err } = await supabase.from("work_positions").insert(row).select(POS_COLS).single();
    if (err || !data) return fail("Не удалось добавить позицию", err ?? { message: "нет данных" });
    setPositions((prev) => [...prev, normalizePos(data as Pos)]);
    setAdding(null);
    setForm(EMPTY_NEW);
    setError(null);
  }
  async function updatePosition(p: Pos, patch: Partial<Pick<Pos, "label" | "unit">>) {
    const clean = { ...patch };
    if (clean.label !== undefined) clean.label = clean.label.trim();
    if (clean.unit !== undefined) clean.unit = clean.unit.trim();
    if ((clean.label !== undefined && !clean.label) || (clean.unit !== undefined && !clean.unit)) return;
    const { error: err } = await supabase.from("work_positions").update(clean).eq("id", p.id);
    if (err) return fail("Не удалось сохранить", err);
    setPositions((prev) => prev.map((x) => (x.id === p.id ? { ...x, ...clean } : x)));
  }
  async function deletePosition(p: Pos) {
    if (!window.confirm(`Удалить позицию «${p.label}» вместе с её подпозициями?`)) return;
    const { error: err } = await supabase.from("work_positions").delete().eq("id", p.id);
    if (err) return fail("Не удалось удалить", err);
    setPositions((prev) => prev.filter((x) => x.id !== p.id));
    setSubs((prev) => prev.filter((x) => x.position_id !== p.id));
  }
  async function addSection() {
    const label = (newSection ?? "").trim();
    if (!label) return;
    const next = sections.length ? Math.max(...sections.map((x) => x.position)) + 1 : 1;
    const code = "s" + Date.now().toString(36);
    const { error: err } = await supabase.from("work_sections").insert({ code, label, label_ru: "", position: next });
    if (err) return fail("Не удалось добавить раздел", err);
    setSections((prev) => [...prev, { code, label, label_ru: "", position: next }]);
    setNewSection(null);
    setError(null);
  }
  async function deleteSection(sec: Section) {
    if (!window.confirm(`Удалить пустой раздел «${sec.label}»?`)) return;
    const { error: err } = await supabase.from("work_sections").delete().eq("code", sec.code);
    if (err) return fail("Не удалось удалить раздел", err);
    setSections((prev) => prev.filter((x) => x.code !== sec.code));
  }
  async function addSub(p: Pos) {
    const mine = subsByPos.get(p.id) ?? [];
    const next = mine.length ? Math.max(...mine.map((x) => x.position)) + 1 : 1;
    const { data, error: err } = await supabase
      .from("work_subpositions")
      .insert({ position_id: p.id, position: next, label: "Новая подпозиция" })
      .select("id, position_id, position, label, measure_value, measure_unit")
      .single();
    if (err || !data) return fail("Не удалось добавить подпозицию", err ?? { message: "нет данных" });
    setSubs((prev) => [...prev, { ...(data as Sub), measure_value: null }]);
  }
  async function updateSub(sub: Sub, patch: Partial<Pick<Sub, "measure_value" | "measure_unit">>) {
    const { error: err } = await supabase.from("work_subpositions").update(patch).eq("id", sub.id);
    if (err) return fail("Не удалось сохранить", err);
    setSubs((prev) => prev.map((x) => (x.id === sub.id ? { ...x, ...patch } : x)));
  }
  async function deleteSub(sub: Sub) {
    const { error: err } = await supabase.from("work_subpositions").delete().eq("id", sub.id);
    if (err) return fail("Не удалось удалить", err);
    setSubs((prev) => prev.filter((x) => x.id !== sub.id));
  }

  if (loading) return <p className="text-sm text-stone-400">Chargement…</p>;
  if (error && sections.length === 0)
    return (
      <p className="rounded-lg bg-error-50 p-3 text-sm text-error-700">
        {error}. Если это первый запуск - нужно выполнить миграцию 0133.
      </p>
    );

  const GREEN_HEAD = "bg-[#5b7f3a] text-white";
  const GREEN_CELL = "bg-[#e4eed6]";
  const GREEN_BAND = "bg-[#c9dcb0]";
  const TH = "bg-[#2b4aa8] px-3 py-2.5 text-[14px] font-semibold normal-case tracking-normal text-white";
  const ACTION = "opacity-0 transition group-hover:opacity-100 focus:opacity-100";

  return (
    <div className="space-y-3">
      <datalist id="work-units">
        {UNIT_SUGGESTIONS.map((u) => (
          <option key={u} value={u} />
        ))}
      </datalist>

      <div className="flex flex-wrap items-end gap-x-6 gap-y-3 rounded-xl border border-stone-200 bg-white px-4 py-3">
        <label className="text-sm font-semibold text-stone-700">
          Puissance (kWc)
          <input className={`${QTY_INPUT} mt-1 block w-32 !text-left text-[15px]`} inputMode="decimal" value={kwc} onChange={(e) => setKwc(e.target.value)} />
        </label>
        <p className="min-w-[16rem] flex-1 text-[13px] leading-relaxed text-stone-600">
          Тестовый расчёт: введите мощность, количества и меры - зелёные колонки покажут дни по нормам. Введённое здесь нигде не сохраняется. Для строк без нормы дни вводятся вручную.
          {canEdit ? " Названия, единицы, цены и тексты подпозиций правятся прямо в таблице (наведите на строку) и сохраняются в каталог." : ""}
        </p>
      </div>
      {error && <p className="rounded-lg bg-error-50 p-2 text-sm text-error-700">{error}</p>}

      <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white">
        <table className="w-full min-w-[1275px] table-fixed border-collapse text-[14px] text-stone-900">
          <colgroup>
            <col style={{ width: 52 }} />
            <col />
            <col style={{ width: 110 }} />
            <col style={{ width: 124 }} />
            <col style={{ width: 130 }} />
            <col style={{ width: 140 }} />
            <col style={{ width: 110 }} />
            <col style={{ width: 110 }} />
            <col style={{ width: 110 }} />
          </colgroup>
          <thead>
            <tr>
              <th className={`${TH} text-left`}>N°</th>
              <th className={`${TH} text-left`}>Désignation</th>
              <th className={`${TH} text-right`}>Quantité</th>
              <th className={`${TH} text-left`}>Unité</th>
              <th className={`${TH} text-right`}>P.U HT</th>
              <th className={`${TH} text-right`}>Total HT</th>
              {VARIANTS.map((v) => (
                <th key={v.key} className={`px-2 py-2.5 text-center text-[14px] font-semibold normal-case tracking-normal ${GREEN_HEAD}`}>
                  {v.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sections.map((sec, si) => {
              const secPositions = positions.filter((p) => p.section_code === sec.code);
              return (
                <Fragment key={sec.code}>
                  <tr className="bg-[#e9edf4]">
                    <td className="px-3 py-2 text-[13px] font-semibold">{si + 1}</td>
                    <td colSpan={5} className="px-3 py-2 text-[13px] font-semibold tracking-wide">
                      {sec.label}
                      {canEdit && secPositions.length === 0 && (
                        <button type="button" className="ml-4 text-xs font-normal text-stone-500 underline hover:text-error-600" onClick={() => deleteSection(sec)}>
                          удалить пустой раздел
                        </button>
                      )}
                    </td>
                    <td colSpan={3} className={GREEN_BAND} />
                  </tr>

                  {secPositions.map((p) => {
                    const ps = subsByPos.get(p.id) ?? [];
                    const manual = !hasNorm(p);
                    return (
                      <Fragment key={p.id}>
                        <tr className="group border-b border-stone-200 hover:bg-stone-50/70">
                          <td />
                          <td className="py-1 pl-6 pr-3">
                            {canEdit ? (
                              <div className="flex items-center gap-1">
                                <input
                                  key={p.id + p.label}
                                  className={GHOST}
                                  defaultValue={p.label}
                                  onBlur={(e) => e.target.value.trim() !== p.label && updatePosition(p, { label: e.target.value })}
                                />
                                <button type="button" className={`${ACTION} shrink-0 whitespace-nowrap text-xs font-semibold text-primary-600 hover:text-primary-700`} onClick={() => addSub(p)}>
                                  + подпозиция
                                </button>
                                <button type="button" className={`${ACTION} shrink-0 px-1.5 text-lg leading-none text-stone-500 hover:!text-error-600`} title="Удалить позицию" onClick={() => deletePosition(p)}>
                                  ×
                                </button>
                              </div>
                            ) : (
                              <span className="px-2">{p.label}</span>
                            )}
                          </td>
                          <td className="px-2 py-1 text-right">
                            {qtyIsPower(p) ? (
                              <span className="px-2 tabular-nums text-stone-600" title="Берётся из поля Puissance">
                                {power.toLocaleString("fr-FR")}
                              </span>
                            ) : (
                              <input className={`${QTY_INPUT} tabular-nums`} inputMode="decimal" value={qty[p.id] ?? "1"} onChange={(e) => setQty((q) => ({ ...q, [p.id]: e.target.value }))} />
                            )}
                          </td>
                          <td className="px-1 py-1">
                            {canEdit ? (
                              <input
                                key={p.id + p.unit}
                                list="work-units"
                                className={UNIT_INPUT}
                                defaultValue={p.unit}
                                onBlur={(e) => e.target.value.trim() !== p.unit && updatePosition(p, { unit: e.target.value })}
                              />
                            ) : (
                              <span className="px-2">{p.unit}</span>
                            )}
                          </td>
                          <td className="px-1 py-1 text-right">
                            {canEdit ? <PriceInput key={p.id + String(p.price_ht)} value={p.price_ht} onCommit={(raw) => savePrice(p, raw)} /> : <span className="px-2 tabular-nums">{p.price_ht == null ? "" : eur(p.price_ht)}</span>}
                          </td>
                          <td className="px-3 py-1 text-right tabular-nums">{p.price_ht == null ? "" : eur(lineTotal(p))}</td>
                          {manual ? (
                            <td colSpan={3} className={`px-3 py-1 text-center ${GREEN_CELL}`}>
                              <input
                                className="w-24 rounded-md border border-[#b9cf9b] bg-white px-2 py-1 text-center text-[15px] font-semibold outline-none focus:border-[#5b7f3a]"
                                inputMode="decimal"
                                placeholder="jours"
                                value={manualDays[p.id] ?? ""}
                                onChange={(e) => setManualDays((m) => ({ ...m, [p.id]: e.target.value }))}
                              />
                            </td>
                          ) : (
                            VARIANTS.map((v) => {
                              const r = normDays(p, v.key);
                              return (
                                <td
                                  key={v.key}
                                  className={`px-2 py-1 text-center text-[15px] font-semibold tabular-nums ${GREEN_CELL} ${r?.out ? "text-warning-700" : ""}`}
                                  title={r?.out ? "Вне шкалы нормы - значение ориентировочное" : (p[v.key] ?? undefined)}
                                >
                                  {r ? days(r.jours) : "-"}
                                  {r?.out ? " *" : ""}
                                </td>
                              );
                            })
                          )}
                        </tr>

                        {ps.map((sub) => (
                          <tr key={sub.id} className="group border-b border-stone-200">
                            <td colSpan={6} className="px-3 py-1.5 text-[13px] leading-snug text-stone-600">
                              <div className="flex items-start gap-2">
                                {/* Мера - в начале строки, как в исходной таблице: « 90 ml *Pour un tirage… » */}
                                {sub.measure_value != null ? (
                                  <span className="inline-flex shrink-0 items-center gap-1 pt-0.5 text-stone-800">
                                    <input
                                      className="w-16 rounded-md border border-stone-200 bg-stone-50 px-1.5 py-0.5 text-right outline-none focus:border-primary-500 focus:bg-white"
                                      inputMode="decimal"
                                      value={measure[sub.id] ?? String(sub.measure_value)}
                                      onChange={(e) => setMeasure((m) => ({ ...m, [sub.id]: e.target.value }))}
                                    />
                                    {canEdit ? (
                                      <input
                                        key={sub.id + sub.measure_unit}
                                        className="w-10 rounded-md border border-transparent bg-transparent px-1 py-0.5 outline-none hover:border-stone-300 focus:border-primary-500 focus:bg-white"
                                        defaultValue={sub.measure_unit ?? ""}
                                        onBlur={(e) => e.target.value !== (sub.measure_unit ?? "") && updateSub(sub, { measure_unit: e.target.value.trim() || null })}
                                      />
                                    ) : (
                                      <span>{sub.measure_unit}</span>
                                    )}
                                  </span>
                                ) : (
                                  canEdit && (
                                    <button type="button" className={`${ACTION} shrink-0 pt-0.5 text-xs font-semibold text-primary-600 hover:text-primary-700`} onClick={() => updateSub(sub, { measure_value: 0, measure_unit: "ml" })}>
                                      + мера
                                    </button>
                                  )
                                )}
                                {canEdit ? (
                                  <textarea
                                    className="min-w-[16rem] flex-1 resize-none rounded-md border border-transparent bg-transparent px-1.5 py-0.5 leading-snug outline-none transition [field-sizing:content] hover:border-stone-300 focus:border-primary-500 focus:bg-white"
                                    rows={Math.max(1, sub.label.split("\n").length)}
                                    defaultValue={sub.label}
                                    placeholder="Описание подпозиции"
                                    onBlur={(e) => saveSubLabel(sub, e.target.value)}
                                  />
                                ) : (
                                  <span className="flex-1 whitespace-pre-line px-1">{sub.label}</span>
                                )}
                                {canEdit && (
                                  <span className={`${ACTION} flex shrink-0 items-center gap-3 pt-0.5 text-xs`}>
                                    {sub.measure_value != null && (
                                      <button type="button" className="text-stone-500 hover:text-stone-800" onClick={() => updateSub(sub, { measure_value: null, measure_unit: null })}>
                                        убрать меру
                                      </button>
                                    )}
                                    <button type="button" className="text-base leading-none text-stone-500 hover:text-error-600" title="Удалить подпозицию" onClick={() => deleteSub(sub)}>
                                      ×
                                    </button>
                                  </span>
                                )}
                              </div>
                            </td>
                            <td colSpan={3} className={GREEN_CELL} />
                          </tr>
                        ))}
                      </Fragment>
                    );
                  })}

                  {canEdit && (
                    <tr className="border-b border-stone-200">
                      <td />
                      <td colSpan={5} className="px-3 py-1.5 pl-6">
                        {adding === sec.code ? (
                          <div className="flex flex-wrap items-end gap-2 rounded-lg border border-dashed border-stone-300 bg-stone-50/60 p-3">
                            <label className="flex-1 basis-60 text-[13px] font-semibold text-stone-700">
                              Désignation
                              <input className="input mt-1 w-full py-1.5 text-[15px]" value={form.label} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} autoFocus />
                            </label>
                            <label className="w-24 text-[13px] font-semibold text-stone-700">
                              Unité
                              <input list="work-units" className="input mt-1 w-full py-1.5 text-[15px]" value={form.unit} onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))} />
                            </label>
                            <label className="w-28 text-[13px] font-semibold text-stone-700">
                              P.U HT
                              <input className="input mt-1 w-full py-1.5 text-right text-[15px]" inputMode="decimal" value={form.price} onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))} />
                            </label>
                            <label className="w-60 text-[13px] font-semibold text-stone-700">
                              Дни (норма)
                              <select className="input mt-1 w-full py-1.5 text-[15px]" value={form.norm} onChange={(e) => setForm((f) => ({ ...f, norm: e.target.value }))}>
                                <option value="">вручную (без нормы)</option>
                                {normOptions
                                  .filter((n) => !HIDDEN_NORMS.has(n.code) || n.code === MO_TRIPLE)
                                  .map((n) => (
                                    <option key={n.code} value={n.code}>
                                      {n.code === MO_TRIPLE ? "Main-d'œuvre (Standard / LT / Ombrière)" : n.label}
                                    </option>
                                  ))}
                              </select>
                            </label>
                            {form.norm && (
                              <label className="w-48 text-[13px] font-semibold text-stone-700">
                                Считать от
                                <select className="input mt-1 w-full py-1.5 text-[15px]" value={form.basis} onChange={(e) => setForm((f) => ({ ...f, basis: e.target.value as Pos["norm_basis"] }))}>
                                  <option value="qty">количества позиции</option>
                                  <option value="power">мощности (kWc)</option>
                                  <option value="sub_measure">меры в подпозиции</option>
                                </select>
                              </label>
                            )}
                            <button type="button" className="btn btn-primary px-4 py-1.5 text-[15px]" disabled={!form.label.trim()} onClick={() => addPosition(sec.code)}>
                              Добавить
                            </button>
                            <button
                              type="button"
                              className="px-2 py-1.5 text-[15px] text-stone-600"
                              onClick={() => {
                                setAdding(null);
                                setForm(EMPTY_NEW);
                              }}
                            >
                              Отмена
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            className="text-sm font-semibold text-primary-600 hover:text-primary-700"
                            onClick={() => {
                              setAdding(sec.code);
                              setForm(EMPTY_NEW);
                            }}
                          >
                            + позиция в этот раздел
                          </button>
                        )}
                      </td>
                      <td colSpan={3} className={GREEN_CELL} />
                    </tr>
                  )}

                  <tr className="border-b border-stone-300">
                    <td colSpan={5} className="whitespace-nowrap px-3 py-2.5 text-right font-bold">
                      Sous-total HT :
                    </td>
                    <td className="px-3 py-2.5 text-right font-bold tabular-nums">{eur(sectionTotals.get(sec.code) ?? 0)}</td>
                    <td colSpan={3} className={GREEN_CELL} />
                  </tr>
                </Fragment>
              );
            })}

            <tr>
              <td colSpan={5} className="whitespace-nowrap px-3 py-2 text-right font-bold">
                Total € HT
              </td>
              <td className="px-3 py-2 text-right font-bold tabular-nums">{eur(totalHt)}</td>
              <td colSpan={3} />
            </tr>
            <tr>
              <td colSpan={5} className="whitespace-nowrap px-3 py-1.5 text-right text-stone-700">
                TVA 20 %
              </td>
              <td className="px-3 py-1.5 text-right tabular-nums text-stone-700">{eur(totalHt * 0.2)}</td>
              <td colSpan={3} />
            </tr>
            <tr>
              <td colSpan={5} className="whitespace-nowrap px-3 py-2 text-right font-bold">
                Total TTC
              </td>
              <td className="px-3 py-2 text-right font-bold tabular-nums">{eur(totalHt * 1.2)}</td>
              <td colSpan={3} className={`px-2 py-2 text-center text-[15px] font-bold ${GREEN_HEAD}`}>
                Total jours
              </td>
            </tr>
            <tr>
              <td colSpan={6} />
              {dayTotals.map((d, i) => (
                <td key={i} className={`px-2 py-2.5 text-center text-base font-bold tabular-nums ${GREEN_CELL}`}>
                  {days(d)}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      {canEdit && (
        <div>
          {newSection === null ? (
            <button type="button" className="text-sm font-semibold text-primary-600 hover:text-primary-700" onClick={() => setNewSection("")}>
              + раздел
            </button>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <input className="input w-80 py-1.5 text-[15px]" placeholder="Название раздела, напр. TRANSPORT" value={newSection} onChange={(e) => setNewSection(e.target.value)} autoFocus />
              <button type="button" className="btn btn-primary px-4 py-1.5 text-[15px]" disabled={!newSection.trim()} onClick={addSection}>
                Добавить раздел
              </button>
              <button type="button" className="px-2 py-1.5 text-[15px] text-stone-600" onClick={() => setNewSection(null)}>
                Отмена
              </button>
            </div>
          )}
        </div>
      )}
      <p className="text-[13px] text-stone-500">* - вне шкалы нормы (например, Avec LT свыше 500 kWc, Ombrière свыше 1000 kWc): значение ориентировочное.</p>
    </div>
  );
}
