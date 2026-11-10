"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { LogoMark } from "@/components/Logo";
import { PENALTY_CATALOG, PENALTY_DEFAULT_DIVISOR, describePenaltyPick, type PenaltyCatalogItem } from "@/lib/payroll/penalties";
import { Camera, CheckCircle2, ClipboardCheck, LogOut, Search, Trash2, X } from "lucide-react";

type Member = { id: string; name: string };
type Team = { id: string; name: string; number: string; members: Member[] };
type Target = { employee_id: string; share: number };
type Recent = {
  id: string;
  batch_id: string;
  created_at: string;
  inspection_date: string;
  site: string;
  team_id: string;
  catalog_code: string | null;
  stage: string;
  description: string;
  unit: string;
  qty: number;
  team_amount: number;
  divisor: number;
  share_each: number;
  note: string | null;
  photo_paths: string[] | null;
  created_by_email: string;
  status: "active" | "cancelled";
  control_penalty_targets: Target[];
};
type SiteJob = { name: string; team: string; from: string; to: string };
type LastCheck = { site: string; date: string; team_id: string; total: number; issues: number; by: string };
type Ctx = {
  email: string;
  role: string;
  teams: Team[];
  sitesByTeam: Record<string, string[]>;
  siteJobs: SiteJob[];
  lastChecks: Record<string, LastCheck>;
  recent: Recent[];
};
type Pick = { qty: string; amount: string };

const eur = (n: number) => `${(Math.round(n * 100) / 100).toFixed(2).replace(".", ",")} €`;
const todayIso = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};
const fr = (iso: string) => iso.split("-").reverse().join("/");

const SEV_COLOR: Record<string, string> = {
  Критическая: "bg-error-50 text-error-600",
  Серьёзная: "bg-warning-50 text-warning-600",
  Средняя: "bg-stone-100 text-stone-600",
  Малая: "bg-stone-50 text-stone-500",
};

/** Уменьшение фото на телефоне до ~1600 px (лимит тела запроса Vercel 4,5 МБ). */
async function shrink(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  return await new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("photo"))), "image/jpeg", 0.8));
}

export default function ControlePage() {
  const router = useRouter();
  const [ctx, setCtx] = useState<Ctx | null>(null);
  const [loadedAt, setLoadedAt] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [date, setDate] = useState(todayIso());
  const [teamId, setTeamId] = useState("");
  const [site, setSite] = useState("");
  const [picks, setPicks] = useState<Record<string, Pick>>({});
  const [members, setMembers] = useState<Record<string, boolean>>({});
  const [divisor, setDivisor] = useState(String(PENALTY_DEFAULT_DIVISOR));
  const [note, setNote] = useState("");
  const [search, setSearch] = useState("");
  const [photos, setPhotos] = useState<{ path: string; preview: string }[]>([]);
  // Фото каждого пункта отдельно (ключ = код пункта справочника).
  const [itemPhotos, setItemPhotos] = useState<Record<string, { path: string; preview: string }[]>>({});
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [tab, setTab] = useState<"check" | "sites" | "history">("check");
  const [siteFilter, setSiteFilter] = useState<"all" | "todo" | "done">("todo");
  const [siteSearch, setSiteSearch] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/controle/context", { cache: "no-store" });
    if (res.status === 401 || res.status === 403) {
      if (res.status === 401) router.replace("/login?next=/controle");
      else setLoadError("Нет доступа к этому экрану.");
      return;
    }
    const data = (await res.json()) as Ctx & { error?: string };
    if (!res.ok) {
      setLoadError(data.error ?? "Ошибка загрузки");
      return;
    }
    setCtx(data);
    setLoadedAt(Date.now());
  }, [router]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const team = ctx?.teams.find((t) => t.id === teamId) ?? null;
  const div = Number(divisor) > 0 ? Number(divisor) : PENALTY_DEFAULT_DIVISOR;

  function chooseTeam(id: string) {
    setTeamId(id);
    const t = ctx?.teams.find((x) => x.id === id);
    setMembers(Object.fromEntries((t?.members ?? []).map((m) => [m.id, true])));
    const first = ctx?.sitesByTeam[t?.number ?? ""]?.[0];
    if (first && !site) setSite(first);
  }

  function togglePick(item: PenaltyCatalogItem) {
    setPicks((prev) => {
      const next = { ...prev };
      if (next[item.code]) {
        delete next[item.code];
        setItemPhotos((ph) => {
          const rest = { ...ph };
          delete rest[item.code];
          return rest;
        });
      } else next[item.code] = { qty: "1", amount: item.unit === "range" ? String(item.amount) : "" };
      return next;
    });
  }

  const computed = useMemo(
    () =>
      PENALTY_CATALOG.filter((c) => picks[c.code]).map((item) => {
        const p = picks[item.code];
        const qty = Number(p.qty);
        const amount = Number(p.amount);
        const needQty = item.unit === "per_piece" || item.unit === "per_day";
        const needAmount = item.unit === "manual" || item.unit === "range";
        const valid = (!needQty || qty > 0) && (!needAmount || amount > 0);
        const r = valid
          ? describePenaltyPick({ item, qty: needQty ? qty : 1, rangeAmount: needAmount ? amount : undefined, site, divisor: div })
          : { teamAmount: 0, share: 0, line: "" };
        return { item, qty: needQty ? qty : 1, amount, valid, ...r };
      }),
    [picks, site, div]
  );
  const allValid = computed.length > 0 && computed.every((c) => c.valid);
  const teamTotal = computed.reduce((s, c) => s + c.teamAmount, 0);
  const shareTotal = computed.reduce((s, c) => s + c.share, 0);
  const chosenMembers = (team?.members ?? []).filter((m) => members[m.id]);

  const groups = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = PENALTY_CATALOG.filter((c) => !q || `${c.code} ${c.stage} ${c.description}`.toLowerCase().includes(q));
    return [
      { title: "Монтаж (1.x)", items: list.filter((c) => c.code.startsWith("1.")) },
      { title: "Электрика (2.x)", items: list.filter((c) => c.code.startsWith("2.")) },
      { title: "Финиш и порядок (3.x)", items: list.filter((c) => c.code.startsWith("3.")) },
    ].filter((g) => g.items.length > 0);
  }, [search]);

  /** Загрузка фото на сервер (с уменьшением на телефоне). code = код пункта, без кода - общие фото проверки. */
  async function addPhotos(files: FileList | null, code?: string) {
    if (!files) return;
    setUploading(true);
    try {
      const have = code ? (itemPhotos[code]?.length ?? 0) : photos.length;
      for (const f of Array.from(files).slice(0, Math.max(0, (code ? 6 : 8) - have))) {
        const blob = await shrink(f);
        const fd = new FormData();
        fd.append("file", new File([blob], "photo.jpg", { type: "image/jpeg" }));
        const res = await fetch("/api/controle/photo", { method: "POST", body: fd });
        const data = (await res.json()) as { path?: string; error?: string };
        if (!res.ok || !data.path) throw new Error(data.error ?? "Не удалось загрузить фото");
        const added = { path: data.path as string, preview: URL.createObjectURL(blob) };
        if (code) setItemPhotos((ph) => ({ ...ph, [code]: [...(ph[code] ?? []), added] }));
        else setPhotos((p) => [...p, added]);
      }
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Ошибка фото" });
    }
    setUploading(false);
  }

  const baseReady = !!teamId && site.trim().length >= 2 && !!date;
  const canSubmit = baseReady && !busy && !uploading;

  async function submit(clean: boolean) {
    if (!canSubmit) return;
    if (!clean && (!allValid || chosenMembers.length === 0)) return;
    setBusy(true);
    setMsg(null);
    const res = await fetch("/api/controle/penalties", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        inspection_date: date,
        site,
        team_id: teamId,
        clean,
        divisor: div,
        note,
        employee_ids: chosenMembers.map((m) => m.id),
        photo_paths: photos.map((p) => p.path),
        items: clean ? [] : computed.map((c) => ({ code: c.item.code, qty: c.qty, amount: c.amount, photo_paths: (itemPhotos[c.item.code] ?? []).map((x) => x.path) })),
      }),
    });
    const data = (await res.json()) as { error?: string; penalties?: number; team_total?: number; share_each?: number };
    setBusy(false);
    if (!res.ok) {
      setMsg({ ok: false, text: data.error ?? "Ошибка записи" });
      return;
    }
    setMsg({
      ok: true,
      text: clean
        ? "Записано: проверка без замечаний."
        : `Записано: ${data.penalties} пункт(ов), на команду ${eur(data.team_total ?? 0)}, на человека ${eur(data.share_each ?? 0)}.`,
    });
    setPicks({});
    setItemPhotos({});
    setNote("");
    setPhotos([]);
    setSearch("");
    window.scrollTo({ top: 0, behavior: "smooth" });
    load();
  }

  async function cancel(batchId: string) {
    const reason = window.prompt("Причина отмены (необязательно):");
    if (reason === null) return;
    const res = await fetch("/api/controle/penalties/cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ batch_id: batchId, reason }),
    });
    const data = (await res.json()) as { error?: string };
    setMsg(res.ok ? { ok: true, text: "Запись отменена, суммы возвращены." } : { ok: false, text: data.error ?? "Ошибка отмены" });
    load();
  }

  async function logout() {
    await createClient().auth.signOut();
    router.replace("/login");
  }

  // История сгруппирована по проверке (batch_id).
  const history = useMemo(() => {
    const map = new Map<string, Recent[]>();
    for (const r of ctx?.recent ?? []) map.set(r.batch_id, [...(map.get(r.batch_id) ?? []), r]);
    return Array.from(map.values());
  }, [ctx?.recent]);

  // Список объектов: из планинга + проверенные вручную. « Проверен » = последняя проверка не раньше начала работ.
  const siteList = useMemo(() => {
    if (!ctx) return [];
    const rows = ctx.siteJobs.map((j) => {
      const last = ctx.lastChecks[j.name.toLowerCase().trim()];
      return { name: j.name, team: j.team, from: j.from, to: j.to, last, checked: !!last && last.date >= j.from };
    });
    const known = new Set(rows.map((r) => r.name.toLowerCase().trim()));
    for (const [key, last] of Object.entries(ctx.lastChecks)) {
      if (known.has(key)) continue;
      const t = ctx.teams.find((x) => x.id === last.team_id);
      rows.push({ name: last.site, team: t?.number ?? "", from: "", to: "", last, checked: true });
    }
    return rows;
  }, [ctx]);
  const todoCount = siteList.filter((r) => !r.checked).length;

  function openCheck(name: string, teamNumber: string) {
    const t = ctx?.teams.find((x) => x.number === teamNumber);
    if (t) chooseTeam(t.id);
    setSite(name);
    setTab("check");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  if (loadError) return <main className="p-6 text-center font-bold text-error-600">{loadError}</main>;
  if (!ctx) return <main className="p-6 text-center font-semibold text-stone-500">Загрузка…</main>;

  const teamName = (id: string) => ctx.teams.find((t) => t.id === id)?.name ?? "";
  const memberName = (id: string) => ctx.teams.flatMap((t) => t.members).find((m) => m.id === id)?.name ?? "—";
  const sites = (team && ctx.sitesByTeam[team.number]) || [];

  return (
    <main className="mx-auto max-w-2xl space-y-4 p-4 pb-40">
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl bg-primary-600">
            <LogoMark size={40} />
          </div>
          <div>
            <h1 className="text-lg font-extrabold leading-tight text-stone-900">Контроль качества</h1>
            <p className="text-xs font-semibold text-stone-400">Штрафы бригад · Contrôle qualité</p>
          </div>
        </div>
        <button onClick={logout} className="btn border-stone-200 bg-white px-3 py-2 text-xs text-stone-600" title="Выйти">
          <LogOut size={14} /> Выйти
        </button>
      </header>

      {msg && (
        <p className={`rounded-xl px-3 py-2 text-sm font-bold ${msg.ok ? "bg-success-50 text-success-600" : "bg-error-50 text-error-600"}`}>{msg.text}</p>
      )}

      <nav className="grid grid-cols-3 gap-1 rounded-2xl bg-stone-100 p-1">
        {([
          ["check", "Проверка"],
          ["sites", `Объекты${todoCount > 0 ? ` · ${todoCount}` : ""}`],
          ["history", "История"],
        ] as const).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} className={`rounded-xl px-2 py-2 text-sm font-extrabold ${tab === k ? "bg-white text-primary-700 shadow-sm" : "text-stone-500"}`}>
            {label}
          </button>
        ))}
      </nav>

      {tab === "sites" && (
        <section className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {([["todo", `Не проверены (${todoCount})`], ["done", `Проверены (${siteList.length - todoCount})`], ["all", `Все (${siteList.length})`]] as const).map(([k, label]) => (
              <button key={k} onClick={() => setSiteFilter(k)} className={`rounded-full border px-3 py-1.5 text-xs font-bold ${siteFilter === k ? "border-primary-600 bg-primary-50 text-primary-700" : "border-stone-200 text-stone-600"}`}>
                {label}
              </button>
            ))}
          </div>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
            <input className="input pl-9" placeholder="Поиск объекта или бригады" value={siteSearch} onChange={(e) => setSiteSearch(e.target.value)} />
          </div>
          {siteList
            .filter((r) => (siteFilter === "all" || (siteFilter === "todo") === !r.checked) && `${r.name} ${r.team}`.toLowerCase().includes(siteSearch.trim().toLowerCase()))
            .map((r) => (
              <div key={`${r.name}|${r.team}`} className="rounded-2xl border border-stone-100 bg-white p-3 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-extrabold text-stone-800">{r.name}</p>
                    <p className="text-xs text-stone-400">
                      {r.team ? `бригада ${r.team}` : ""}
                      {r.from ? ` · работы ${fr(r.from).slice(0, 5)}–${fr(r.to).slice(0, 5)}` : ""}
                    </p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-extrabold ${r.checked ? "bg-success-50 text-success-600" : "bg-warning-50 text-warning-600"}`}>
                    {r.checked ? "проверен" : "не проверен"}
                  </span>
                </div>
                {r.last && (
                  <p className="mt-1 text-xs text-stone-500">
                    Последняя проверка {fr(r.last.date)}: {r.last.issues === 0 ? "без замечаний" : `${r.last.issues} замеч., ${eur(r.last.total)} на команду`}
                  </p>
                )}
                <button onClick={() => openCheck(r.name, r.team)} className="mt-2 text-xs font-extrabold text-primary-700">
                  {r.checked ? "Проверить ещё раз →" : "Проверить →"}
                </button>
              </div>
            ))}
          {siteList.length === 0 && <p className="text-sm text-stone-400">Объекты из планинга не загрузились.</p>}
        </section>
      )}

      {/* 1. Дата, бригада, объект */}
      {tab === "check" && <section className="space-y-3 rounded-2xl border border-stone-100 bg-white p-4 shadow-sm">
        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs font-bold text-stone-500">
            Дата проверки
            <input type="date" className="input mt-1" value={date} max={todayIso()} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label className="text-xs font-bold text-stone-500">
            Объект (шантьер)
            <input className="input mt-1" value={site} onChange={(e) => setSite(e.target.value)} placeholder="Название объекта" />
          </label>
        </div>
        {sites.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {sites.map((s) => (
              <button key={s} onClick={() => setSite(s)} className={`rounded-full border px-3 py-1 text-xs font-bold ${site === s ? "border-primary-600 bg-primary-50 text-primary-700" : "border-stone-200 text-stone-600"}`}>
                {s}
              </button>
            ))}
          </div>
        )}
        <div>
          <p className="text-xs font-bold text-stone-500">Бригада</p>
          <div className="mt-1 grid grid-cols-4 gap-2 sm:grid-cols-6">
            {ctx.teams.map((t) => (
              <button
                key={t.id}
                onClick={() => chooseTeam(t.id)}
                className={`rounded-xl border px-2 py-2.5 text-sm font-extrabold ${teamId === t.id ? "border-primary-600 bg-primary-600 text-white" : "border-stone-200 bg-white text-stone-700"}`}
              >
                {t.number || t.name}
              </button>
            ))}
          </div>
        </div>
      </section>}

      {/* 2. Ошибки */}
      {tab === "check" && team && (
        <section className="space-y-3 rounded-2xl border border-stone-100 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-extrabold text-stone-800">Что нашли</h2>
            <span className="text-xs font-semibold text-stone-400">выбрано: {computed.length}</span>
          </div>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
            <input className="input pl-9" placeholder="Поиск: заземление, панели, 1.4…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          {groups.map((g) => (
            <div key={g.title} className="space-y-2">
              <p className="text-[11px] font-extrabold uppercase tracking-wide text-stone-400">{g.title}</p>
              {g.items.map((item) => {
                const p = picks[item.code];
                const c = computed.find((x) => x.item.code === item.code);
                return (
                  <div key={item.code} className={`rounded-xl border p-3 ${p ? "border-primary-300 bg-primary-50/40" : "border-stone-100"}`}>
                    <button onClick={() => togglePick(item)} className="flex w-full items-start gap-3 text-left">
                      <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border text-xs ${p ? "border-primary-600 bg-primary-600 text-white" : "border-stone-300"}`}>{p ? "✓" : ""}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-bold text-stone-800">
                          {item.code} · {item.stage}
                        </span>
                        <span className="block text-xs text-stone-500">{item.description}</span>
                        <span className="mt-1 flex flex-wrap items-center gap-2 text-[11px] font-bold">
                          {item.severity && <span className={`rounded-full px-2 py-0.5 ${SEV_COLOR[item.severity]}`}>{item.severity}</span>}
                          <span className="text-stone-500">
                            {item.unit === "manual" ? "сумма вручную" : item.unit === "range" ? `${item.amount}–${item.amountMax} €` : item.unit === "per_piece" ? `${item.amount} € / шт.` : item.unit === "per_day" ? `${item.amount} € / день` : `${item.amount} €`}
                          </span>
                        </span>
                      </span>
                    </button>
                    {p && (
                      <div className="mt-3 flex flex-wrap items-center gap-3 pl-8">
                        {(item.unit === "per_piece" || item.unit === "per_day") && (
                          <label className="text-xs font-bold text-stone-500">
                            {item.unit === "per_piece" ? "Штук" : "Дней"}
                            <input type="number" inputMode="numeric" min={1} className="input mt-1 w-24" value={p.qty} onChange={(e) => setPicks({ ...picks, [item.code]: { ...p, qty: e.target.value } })} />
                          </label>
                        )}
                        {item.unit === "range" && (
                          <label className="text-xs font-bold text-stone-500">
                            Сумма, € ({item.amount}–{item.amountMax})
                            <input type="number" inputMode="numeric" min={item.amount} max={item.amountMax} className="input mt-1 w-28" value={p.amount} onChange={(e) => setPicks({ ...picks, [item.code]: { ...p, amount: e.target.value } })} />
                          </label>
                        )}
                        {item.unit === "manual" && (
                          <label className="text-xs font-bold text-stone-500">
                            Сумма на команду, €
                            <input type="number" inputMode="decimal" min={1} className="input mt-1 w-32" value={p.amount} onChange={(e) => setPicks({ ...picks, [item.code]: { ...p, amount: e.target.value } })} />
                          </label>
                        )}
                        {c?.valid && (
                          <span className="text-xs font-extrabold text-stone-700">
                            команда {eur(c.teamAmount)} → на человека {eur(c.share)}
                          </span>
                        )}
                      </div>
                    )}
                    {p && (
                      <div className="mt-3 flex flex-wrap items-center gap-2 pl-8">
                        {(itemPhotos[item.code] ?? []).map((ph) => (
                          <div key={ph.path} className="relative h-14 w-14 overflow-hidden rounded-lg border border-stone-200">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={ph.preview} alt="" className="h-full w-full object-cover" />
                            <button
                              onClick={() => setItemPhotos((all) => ({ ...all, [item.code]: (all[item.code] ?? []).filter((x) => x.path !== ph.path) }))}
                              className="absolute right-0 top-0 rounded-bl bg-black/60 p-0.5 text-white"
                            >
                              <X size={12} />
                            </button>
                          </div>
                        ))}
                        {(itemPhotos[item.code]?.length ?? 0) < 6 && (
                          <label className="flex h-14 cursor-pointer items-center gap-1.5 rounded-lg border border-dashed border-stone-300 px-3 text-xs font-bold text-stone-500">
                            <Camera size={16} /> Фото ошибки
                            <input type="file" accept="image/*" multiple capture="environment" className="hidden" onChange={(e) => { addPhotos(e.target.files, item.code); e.target.value = ""; }} />
                          </label>
                        )}
                      </div>
                    )}
                    {p && item.note && <p className="mt-2 pl-8 text-[11px] text-stone-400">{item.note}</p>}
                  </div>
                );
              })}
            </div>
          ))}
        </section>
      )}

      {/* 3. Кто платит */}
      {tab === "check" && team && (
        <section className="space-y-3 rounded-2xl border border-stone-100 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-extrabold text-stone-800">Кто в бригаде {team.number}</h2>
            <label className="flex items-center gap-2 text-xs font-bold text-stone-500">
              делить на
              <input type="number" inputMode="numeric" min={1} className="input w-16 py-1.5 text-center" value={divisor} onChange={(e) => setDivisor(e.target.value)} />
            </label>
          </div>
          <div className="space-y-2">
            {team.members.map((m) => (
              <label key={m.id} className="flex items-center justify-between gap-3 rounded-xl border border-stone-100 px-3 py-2.5">
                <span className="flex items-center gap-3 text-sm font-semibold text-stone-800">
                  <input type="checkbox" className="h-5 w-5" checked={!!members[m.id]} onChange={(e) => setMembers({ ...members, [m.id]: e.target.checked })} />
                  {m.name}
                </span>
                <span className="text-xs font-extrabold text-error-600">{members[m.id] && computed.length > 0 ? `−${eur(shareTotal)}` : ""}</span>
              </label>
            ))}
          </div>
          <label className="block text-xs font-bold text-stone-500">
            Комментарий (необязательно)
            <textarea className="input mt-1 min-h-[64px]" value={note} onChange={(e) => setNote(e.target.value)} maxLength={600} placeholder="Например: линия 3, ряд 2" />
          </label>
          {computed.length === 0 && (
          <div>
            <p className="text-xs font-bold text-stone-500">Фото проверки (для «Без замечаний», необязательно)</p>
            <div className="mt-1 flex flex-wrap gap-2">
              {photos.map((p) => (
                <div key={p.path} className="relative h-16 w-16 overflow-hidden rounded-lg border border-stone-200">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.preview} alt="" className="h-full w-full object-cover" />
                  <button onClick={() => setPhotos(photos.filter((x) => x.path !== p.path))} className="absolute right-0 top-0 rounded-bl bg-black/60 p-0.5 text-white">
                    <X size={12} />
                  </button>
                </div>
              ))}
              {photos.length < 8 && (
                <label className="flex h-16 w-16 cursor-pointer items-center justify-center rounded-lg border border-dashed border-stone-300 text-stone-400">
                  <Camera size={20} />
                  <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => { addPhotos(e.target.files); e.target.value = ""; }} />
                </label>
              )}
            </div>
            {uploading && <p className="mt-1 text-xs text-stone-400">Загрузка фото…</p>}
          </div>
          )}
          {uploading && computed.length > 0 && <p className="text-xs text-stone-400">Загрузка фото…</p>}
        </section>
      )}

      {/* История */}
      {tab === "history" && <section className="space-y-2">
        <h2 className="text-sm font-extrabold text-stone-800">{ctx.role === "rh_admin" ? "Последние проверки (30 дней)" : "Мои записи (30 дней)"}</h2>
        {history.length === 0 && <p className="text-sm text-stone-400">Пока ничего нет.</p>}
        {history.map((rows) => {
          const first = rows[0];
          const cancelled = first.status === "cancelled";
          const total = rows.reduce((s, r) => s + Number(r.team_amount), 0);
          const hrs = loadedAt - new Date(first.created_at).getTime();
          const canCancel = !cancelled && (ctx.role === "rh_admin" || (first.created_by_email === ctx.email && hrs < 48 * 3600 * 1000));
          return (
            <div key={first.batch_id} className={`rounded-2xl border bg-white p-3 shadow-sm ${cancelled ? "border-stone-100 opacity-60" : "border-stone-100"}`}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-extrabold text-stone-800">
                    {fr(first.inspection_date)} · {first.site} · бригада {teamName(first.team_id).replace(/\D+/g, "") || teamName(first.team_id)}
                  </p>
                  <p className="text-xs text-stone-400">{first.created_by_email}</p>
                </div>
                <span className={`shrink-0 text-sm font-extrabold ${cancelled ? "text-stone-400 line-through" : total === 0 ? "text-success-600" : "text-error-600"}`}>{total === 0 ? "без замечаний" : eur(total)}</span>
              </div>
              <ul className="mt-2 space-y-1 text-xs text-stone-600">
                {rows.map((r) => (
                  <li key={r.id}>
                    {r.catalog_code ? `${r.catalog_code} ${r.stage}` : r.stage}
                    {r.unit === "per_piece" || r.unit === "per_day" ? ` ×${r.qty}` : ""}
                    {r.catalog_code ? ` - ${eur(Number(r.team_amount))} (÷${r.divisor} = ${eur(Number(r.share_each))})` : ""}
                    {(r.photo_paths ?? []).map((ph, i) => (
                      <a key={ph} href={`/api/controle/photo?path=${encodeURIComponent(ph)}`} target="_blank" rel="noreferrer" className="ml-2 font-bold text-primary-700 underline">
                        фото {i + 1}
                      </a>
                    ))}
                  </li>
                ))}
              </ul>
              {first.control_penalty_targets.length > 0 && (
                <p className="mt-1 text-[11px] text-stone-400">{first.control_penalty_targets.map((t) => memberName(t.employee_id)).join(", ")}</p>
              )}
              {first.note && <p className="mt-1 text-[11px] italic text-stone-400">{first.note}</p>}
              {cancelled && <p className="mt-1 text-[11px] font-bold text-stone-500">ОТМЕНЕНО</p>}
              {canCancel && (
                <button onClick={() => cancel(first.batch_id)} className="mt-2 flex items-center gap-1 text-xs font-bold text-error-600">
                  <Trash2 size={12} /> Отменить
                </button>
              )}
            </div>
          );
        })}
      </section>}

      {/* Нижняя панель */}
      {tab === "check" && <div className="fixed inset-x-0 bottom-0 z-10 border-t border-stone-200 bg-white/95 p-3 backdrop-blur">
        <div className="mx-auto flex max-w-2xl flex-col gap-2">
          {computed.length > 0 && (
            <p className="text-center text-xs font-bold text-stone-600">
              {computed.length} пункт(ов) · команда {eur(teamTotal)} · на человека {eur(shareTotal)} · {chosenMembers.length} чел.
            </p>
          )}
          <div className="flex gap-2">
            <button onClick={() => submit(false)} disabled={!canSubmit || !allValid || chosenMembers.length === 0} className="btn btn-red flex-1">
              <ClipboardCheck size={16} /> {busy ? "Запись…" : "Записать штрафы"}
            </button>
            <button
              onClick={() => { if (window.confirm("Записать проверку без замечаний?")) submit(true); }}
              disabled={!canSubmit || computed.length > 0}
              className="btn btn-green"
              title="Проверка без замечаний"
            >
              <CheckCircle2 size={16} /> Без замечаний
            </button>
          </div>
          {!baseReady && <p className="text-center text-[11px] text-stone-400">Укажите дату, объект и бригаду</p>}
        </div>
      </div>}
    </main>
  );
}
