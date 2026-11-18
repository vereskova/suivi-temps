"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, CalendarCheck, Check, ChevronRight, ClipboardList, FolderOpen, LogOut, Wallet } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { LogoMark } from "@/components/Logo";
import { workingDaysBetween } from "@/lib/commercial-durations/compute";
import ObjectFilesBrowser from "@/components/admin/ObjectFilesBrowser";
import FileSystemBrowser from "@/components/files/FileSystemBrowser";

// Кабинет бригадира: на экране только то, что нужно сегодня - что делаем сейчас и что дальше.
// Бригадир видит только свою команду; rh_admin - любую (режим проверки). Цен и сумм смет здесь нет.

type Status = "a_venir" | "en_cours" | "pas_fini" | "fini";
type Team = { id: string; name: string };
type ObjRow = { id: string; name: string; status: Status; variant: string; start_date: string | null; finished_at: string | null; total: number; done: number };
type Ctx = { role: "brigadir" | "rh_admin"; email: string; teams: Team[]; team: Team; token: string | null; objects: ObjRow[]; error?: string };
type Line = {
  id: string;
  label: string;
  unit: string | null;
  qty: number;
  measure: number | null;
  section: string | null;
  parallel: boolean;
  is_info?: boolean;
  days: number;
  planned_start: string | null;
  planned_end: string | null;
  actual_start: string | null;
  actual_end: string | null;
  delay_reason: string | null;
  notes: string[];
};
type ObjDetail = { object: { id: string; name: string; status: Status; variant: string; start_date: string | null }; lines: Line[]; error?: string };
type Change = Partial<Pick<Line, "actual_start" | "actual_end" | "delay_reason">>;
type Draft = { s: string; e: string; n: string };
const draftOf = (l: Line): Draft => ({ s: l.actual_start ?? "", e: l.actual_end ?? "", n: l.delay_reason ?? "" });
/** Даты отличаются от плана: тогда заметка обязательна. */
const deviates = (l: Line, d: Draft) => (!!l.planned_start && !!d.s && d.s !== l.planned_start) || (!!l.planned_end && !!d.e && d.e !== l.planned_end);

// Простые русские названия вместо французских папок
const GROUPS: { key: Status; title: string; dot: string }[] = [
  { key: "en_cours", title: "Сейчас в работе", dot: "bg-primary-500" },
  { key: "a_venir", title: "Скоро начнём", dot: "bg-stone-400" },
  { key: "pas_fini", title: "Не закончены", dot: "bg-warning-500" },
  { key: "fini", title: "Закончены", dot: "bg-success-500" },
];

const todayIso = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};
const dm = (iso: string | null) => (iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}` : "—");
const fmtDays = (n: number) => n.toLocaleString("ru-RU", { maximumFractionDigits: 1 });
const plural = (n: number, one: string, few: string, many: string) => {
  const m10 = n % 10,
    m100 = n % 100;
  return m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20) ? few : many;
};

export default function BrigadirPage() {
  const router = useRouter();
  const [ctx, setCtx] = useState<Ctx | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"work" | "files" | "pointage" | "primes">("work");
  const [openObject, setOpenObject] = useState<string | null>(null);
  const [showFini, setShowFini] = useState(false);
  const autoOpened = useRef(false);

  const load = useCallback(
    async (teamId?: string) => {
      const res = await fetch(`/api/brigadir/context${teamId ? `?team=${teamId}` : ""}`, { cache: "no-store" });
      if (res.status === 401) return router.replace("/login?next=/brigadir");
      const data = (await res.json()) as Ctx;
      if (!res.ok) return setError(data.error ?? "Нет доступа к этому экрану.");
      setCtx(data);
      setError(null);
      // Один объект « В работе » - сразу открываем: бригадир заходит и видит свои работы.
      if (!autoOpened.current) {
        autoOpened.current = true;
        const active = data.objects.filter((o) => o.status === "en_cours");
        if (active.length === 1) setOpenObject(active[0].id);
      }
    },
    [router]
  );
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function logout() {
    await createClient().auth.signOut();
    router.replace("/login");
  }

  if (error)
    return (
      <main className="mx-auto max-w-md p-6">
        <p className="rounded-2xl bg-white p-5 text-[16px] text-stone-700 shadow-sm">{error}</p>
        <button type="button" className="btn mt-4 w-full" onClick={logout}>
          Выйти
        </button>
      </main>
    );
  if (!ctx) return <main className="p-6 text-stone-500">Загрузка…</main>;

  const NAV = [
    { key: "work" as const, label: "Работа", icon: ClipboardList },
    { key: "files" as const, label: "Папки", icon: FolderOpen },
    { key: "pointage" as const, label: "Часы", icon: CalendarCheck },
    { key: "primes" as const, label: "Премии", icon: Wallet },
  ];

  return (
    <main className="mx-auto min-h-screen max-w-2xl pb-28">
      <header className="sticky top-0 z-20 border-b border-stone-200 bg-[#f5f4f2]/95 px-4 py-3 backdrop-blur">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-primary-600 text-white">
            <LogoMark size={40} />
          </div>
          <h1 className="min-w-0 flex-1 truncate text-xl font-extrabold tracking-tight text-stone-900">{ctx.team.name}</h1>
          <button type="button" onClick={logout} className="rounded-xl p-2.5 text-stone-500 hover:bg-stone-200" title="Выйти">
            <LogOut size={21} />
          </button>
        </div>
        {ctx.role === "rh_admin" && (
          <div className="mt-2 flex flex-wrap items-center gap-2 rounded-xl bg-warning-50 px-3 py-2 text-sm text-warning-800">
            <b>Режим проверки</b> · вы видите кабинет глазами бригадира
            <select
              className="ml-auto rounded-lg border border-warning-300 bg-white px-2 py-1 text-sm font-semibold text-stone-800"
              value={ctx.team.id}
              onChange={(e) => {
                setOpenObject(null);
                load(e.target.value);
              }}
            >
              {ctx.teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </header>

      <div className="px-4 pt-4">
        {tab === "work" &&
          (openObject ? (
            <ObjectScreen key={openObject} id={openObject} onBack={() => setOpenObject(null)} onChanged={() => load(ctx.team.id)} />
          ) : (
            <ObjectList objects={ctx.objects} showFini={showFini} setShowFini={setShowFini} onOpen={setOpenObject} />
          ))}

        {tab === "files" && <FileSystemBrowser key={ctx.team.id} api={ctx.role === "rh_admin" ? `/api/files/fs?as_team=${ctx.team.id}` : "/api/files/fs"} rootLabel="Мои папки" />}

        {tab === "pointage" && <iframe key={ctx.team.id} title="Часы" src={`/?embed=1&team=${ctx.team.id}`} className="h-[calc(100dvh-10rem)] min-h-[560px] w-full rounded-2xl border border-stone-200 bg-white" />}

        {tab === "primes" &&
          (ctx.token ? (
            <iframe key={ctx.token} title="Премии" src={`/equipe/${ctx.token}`} className="h-[calc(100dvh-10rem)] min-h-[560px] w-full rounded-2xl border border-stone-200 bg-white" />
          ) : (
            <p className="rounded-2xl bg-white p-5 text-[16px] text-stone-700">Страница премий для этой команды ещё не настроена. Обратитесь в офис.</p>
          ))}
      </div>

      {/* Нижнее меню - как в обычных приложениях на телефоне */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-stone-200 bg-white/95 backdrop-blur">
        <div className="mx-auto grid max-w-2xl grid-cols-4 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1.5">
          {NAV.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => {
                setTab(t.key);
                if (t.key === "work") setOpenObject(null);
              }}
              className={`flex flex-col items-center gap-0.5 rounded-xl py-1.5 text-[13px] font-semibold ${tab === t.key ? "text-primary-700" : "text-stone-500"}`}
            >
              <t.icon size={24} strokeWidth={tab === t.key ? 2.4 : 1.8} />
              {t.label}
            </button>
          ))}
        </div>
      </nav>
    </main>
  );
}

function ObjectList({ objects, showFini, setShowFini, onOpen }: { objects: ObjRow[]; showFini: boolean; setShowFini: (v: boolean) => void; onOpen: (id: string) => void }) {
  if (objects.length === 0) return <p className="rounded-2xl bg-white p-6 text-center text-[16px] text-stone-600">У вашей команды пока нет объектов. Они появятся здесь, когда офис их создаст.</p>;
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-extrabold tracking-tight text-stone-900">Выберите объект</h2>
      {GROUPS.map((g) => {
        const items = objects.filter((o) => o.status === g.key);
        if (items.length === 0) return null;
        const collapsed = g.key === "fini" && !showFini;
        return (
          <section key={g.key}>
            <button type="button" disabled={g.key !== "fini"} onClick={() => setShowFini(!showFini)} className="mb-2 flex w-full items-center gap-2 px-1 text-left">
              <span className={`h-3 w-3 rounded-full ${g.dot}`} />
              <h3 className="text-[16px] font-bold text-stone-800">{g.title}</h3>
              <span className="ml-1 text-[15px] text-stone-500">{items.length}</span>
              {g.key === "fini" && <ChevronRight size={18} className={`ml-auto text-stone-400 transition ${showFini ? "rotate-90" : ""}`} />}
            </button>
            {!collapsed && (
              <div className="space-y-2.5">
                {items.map((o) => {
                  const left = o.total - o.done;
                  return (
                    <button key={o.id} type="button" onClick={() => onOpen(o.id)} className="flex w-full items-center gap-3 rounded-2xl border border-stone-200 bg-white px-4 py-4 text-left shadow-sm active:bg-stone-50">
                      <span className="min-w-0 flex-1">
                        <span className="block text-[18px] font-bold leading-snug text-stone-900">{o.name}</span>
                        <span className="mt-0.5 block text-[15px] text-stone-600">
                          {o.total === 0 ? "Работы ещё не добавлены" : left === 0 ? "Все работы сделаны" : `Осталось ${left} ${plural(left, "работа", "работы", "работ")} из ${o.total}`}
                        </span>
                        {o.total > 0 && (
                          <span className="mt-2 block h-2 overflow-hidden rounded-full bg-stone-200">
                            <span className="block h-full rounded-full bg-success-500" style={{ width: `${(o.done / o.total) * 100}%` }} />
                          </span>
                        )}
                      </span>
                      <ChevronRight size={22} className="shrink-0 text-stone-400" />
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

function ObjectScreen({ id, onBack, onChanged }: { id: string; onBack: () => void; onChanged: () => void }) {
  const [data, setData] = useState<ObjDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [section, setSection] = useState<"works" | "files">("works");
  const [reportNote, setReportNote] = useState(false);
  const [draft, setDraft] = useState<Record<string, Draft>>({});
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [sending, setSending] = useState(false);
  const [sentNote, setSentNote] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/brigadir/object?id=${id}`, { cache: "no-store" });
    const json = (await res.json()) as ObjDetail;
    if (!res.ok) return setError(json.error ?? "Ошибка загрузки");
    setData(json);
    setDraft(Object.fromEntries(json.lines.map((l) => [l.id, draftOf(l)])));
  }, [id]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function save(lineId: string, change: Change) {
    setData((d) => (d ? { ...d, lines: d.lines.map((l) => (l.id === lineId ? { ...l, ...change } : l)) } : d));
    const res = await fetch("/api/brigadir/line", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ line_id: lineId, ...change }) });
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      setError(j.error ?? "Не удалось сохранить");
      load();
      return false;
    }
    setError(null);
    const j = (await res.json().catch(() => ({}))) as { report_saved?: boolean };
    if (j.report_saved) {
      setReportNote(true);
      setTimeout(() => setReportNote(false), 9000);
    }
    onChanged();
    return true;
  }
  const dirtyLines = (data?.lines ?? []).filter((l) => {
    const d = draft[l.id];
    if (l.is_info || !d) return false;
    const o = draftOf(l);
    return d.s !== o.s || d.e !== o.e || d.n.trim() !== o.n.trim();
  });
  async function send() {
    const bad: Record<string, string> = {};
    for (const l of dirtyLines) {
      const d = draft[l.id];
      if (d.s && d.e && d.e < d.s) bad[l.id] = "Окончание раньше начала";
      else if (deviates(l, d) && !d.n.trim()) bad[l.id] = "Даты отличаются от плана - напишите заметку";
    }
    setErrs(bad);
    const first = Object.keys(bad)[0];
    if (first) {
      document.getElementById(`work-${first}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    setSending(true);
    let ok = true;
    for (const l of dirtyLines) {
      const d = draft[l.id];
      if (!(await save(l.id, { actual_start: d.s || null, actual_end: d.e || null, delay_reason: d.n.trim() || null }))) {
        ok = false;
        break;
      }
    }
    setSending(false);
    if (ok) {
      setSentNote(true);
      setTimeout(() => setSentNote(false), 6000);
      await load();
    }
  }

  const view = useMemo(() => {
    const all = data?.lines ?? [];
    const lines = all.filter((l) => !l.is_info);
    return {
      going: lines.filter((l) => l.actual_start && !l.actual_end),
      next: lines.filter((l) => !l.actual_start),
      done: lines.filter((l) => l.actual_end),
      info: all.filter((l) => l.is_info),
    };
  }, [data]);

  if (error && !data) return <p className="rounded-2xl bg-error-50 p-4 text-error-700">{error}</p>;
  if (!data) return <p className="text-stone-500">Загрузка…</p>;

  const total = data.lines.filter((l) => !l.is_info).length;

  return (
    <div className="space-y-5">
      <button type="button" onClick={onBack} className="inline-flex items-center gap-1.5 text-[16px] font-semibold text-primary-700">
        <ArrowLeft size={20} /> Все объекты
      </button>

      <div>
        <h2 className="text-2xl font-extrabold leading-tight tracking-tight text-stone-900">{data.object.name}</h2>
        <div className="mt-2 flex items-center gap-3">
          <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-stone-200">
            <div className="h-full rounded-full bg-success-500 transition-all" style={{ width: `${total ? (view.done.length / total) * 100 : 0}%` }} />
          </div>
          <span className="text-[15px] font-bold text-stone-700">
            {view.done.length} из {total}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-1.5 rounded-2xl bg-stone-200/70 p-1">
        {(
          [
            { key: "works", label: "Работы" },
            { key: "files", label: "Документы и фото" },
          ] as const
        ).map((t) => (
          <button key={t.key} type="button" onClick={() => setSection(t.key)} className={`rounded-xl py-2.5 text-[15px] font-semibold transition ${section === t.key ? "bg-white text-stone-900 shadow-sm" : "text-stone-600"}`}>
            {t.label}
          </button>
        ))}
      </div>
      {error && <p className="rounded-xl bg-error-50 p-3 text-[15px] text-error-700">{error}</p>}

      {section === "files" && <ObjectFilesBrowser api="/api/brigadir/files" objectId={id} canEdit={false} />}

      {section === "works" && (
        <>
          {total === 0 && <p className="rounded-2xl bg-white p-6 text-center text-[16px] text-stone-600">В этом объекте пока нет работ. Офис добавит их.</p>}

          {data.lines.some((l) => !l.is_info) && (
            <section className="space-y-2.5">
              <p className="px-1 text-[14px] text-stone-500">Впишите даты, когда начали и закончили, и нажмите «Отправить». Если даты не совпали с планом, напишите заметку: почему.</p>
              {data.lines
                .filter((l) => !l.is_info)
                .map((l) => (
                  <WorkRow key={l.id} line={l} draft={draft[l.id] ?? draftOf(l)} dirty={dirtyLines.some((x) => x.id === l.id)} error={errs[l.id]} onDraft={(patch) => { setDraft((m) => ({ ...m, [l.id]: { ...(m[l.id] ?? draftOf(l)), ...patch } })); setErrs((m) => { const n = { ...m }; delete n[l.id]; return n; }); }} />
                ))}
            </section>
          )}

          {view.info.length > 0 && (
            <section className="space-y-2.5">
              <h3 className="px-1 text-[15px] font-bold uppercase tracking-wide text-stone-500">Техника и материалы для объекта</h3>
              {view.info.map((l) => (
                <div key={l.id} className="rounded-2xl border border-stone-200 bg-white px-4 py-3">
                  <p className="text-[16px] font-bold text-stone-900">{l.label}</p>
                  <p className="mt-0.5 text-[15px] text-stone-600">{`${String(l.qty).replace(".", ",")} ${l.unit ?? ""}`.trim()}</p>
                  {l.notes.length > 0 && <p className="mt-1 whitespace-pre-line text-[14px] text-stone-500">{l.notes.join("\n")}</p>}
                </div>
              ))}
            </section>
          )}

          {total > 0 && view.done.length === total && <p className="rounded-2xl bg-success-50 p-6 text-center text-[17px] font-bold text-success-800">Все работы сделаны. Отлично!</p>}
        </>
      )}

      {section === "works" && dirtyLines.length > 0 && (
        <div className="fixed inset-x-4 bottom-20 z-40 mx-auto max-w-md">
          <button type="button" disabled={sending} onClick={send} className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-primary-600 text-[18px] font-bold text-white shadow-xl active:bg-primary-700 disabled:opacity-60">
            {sending ? "Отправляю…" : `Отправить (${dirtyLines.length})`}
          </button>
        </div>
      )}
      {sentNote && <div className="fixed inset-x-4 bottom-20 z-40 mx-auto max-w-md rounded-2xl bg-success-700 px-4 py-3 text-center text-[16px] font-semibold text-white shadow-xl">Отправлено. Офис видит ваши даты.</div>}
      {reportNote && (
        <div className="fixed inset-x-4 bottom-36 z-40 mx-auto max-w-md rounded-2xl bg-success-700 px-4 py-3 text-[15px] font-semibold text-white shadow-xl">
          Все работы выполнены. Контрандю готово и лежит в папке объекта «Compte rendu».
        </div>
      )}
    </div>
  );
}

function WorkRow({ line: l, draft: d, dirty, error, onDraft }: { line: Line; draft: Draft; dirty: boolean; error?: string; onDraft: (patch: Partial<Draft>) => void }) {
  const today = todayIso();
  const done = !!l.actual_end && !dirty;
  const dev = deviates(l, d);
  const lateDays = d.e && l.planned_end ? workingDaysBetween(l.planned_end, d.e) : 0;

  const field = (key: "s" | "e", label: string) => (
    <div className="min-w-0 flex-1">
      <span className="block text-[13px] font-semibold text-stone-500">{label}</span>
      <div className="mt-1 flex items-center gap-1.5">
        <input type="date" max={today} value={d[key]} onChange={(e) => onDraft({ [key]: e.target.value })} className="input h-11 min-w-0 flex-1 px-2 text-[15px]" />
        {!d[key] && (
          <button type="button" className="h-11 shrink-0 rounded-xl border border-stone-300 bg-white px-3 text-[14px] font-bold text-primary-700 active:bg-stone-100" onClick={() => onDraft({ [key]: today })}>
            Сегодня
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div id={`work-${l.id}`} className={`rounded-2xl border bg-white p-4 shadow-sm ${error ? "border-error-400" : dirty ? "border-warning-400" : done ? "border-success-300" : "border-stone-200"}`}>
      <div className="flex items-start gap-2.5">
        {done && (
          <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-success-100 text-success-700">
            <Check size={15} strokeWidth={3} />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-[17px] font-bold leading-snug text-stone-900">{l.label}</p>
          <p className="mt-0.5 text-[14px] text-stone-600">
            {l.qty.toLocaleString("ru-RU")} {l.unit}
            {l.measure != null ? ` · ${l.measure} м` : ""}
            {l.days > 0 ? ` · ${fmtDays(l.days)} ${plural(Math.round(l.days), "день", "дня", "дней")}` : ""}
          </p>
          <p className="mt-0.5 text-[14px] font-semibold text-stone-700">{l.planned_start ? `План: ${dm(l.planned_start)}–${dm(l.planned_end)}` : "План: без дат"}</p>
        </div>
        {dirty && <span className="shrink-0 rounded-full bg-warning-100 px-2.5 py-1 text-[12px] font-bold text-warning-800">не отправлено</span>}
      </div>
      {l.notes.length > 0 && <p className="mt-2 whitespace-pre-line text-[13px] leading-snug text-stone-500">{l.notes.join("\n")}</p>}
      <div className="mt-3 flex gap-2.5">
        {field("s", "Начали")}
        {field("e", "Закончили")}
      </div>
      {lateDays > 0 && <p className="mt-2 text-[14px] font-semibold text-error-700">{`Опоздание ${lateDays} ${plural(lateDays, "день", "дня", "дней")}`}</p>}
      {lateDays < 0 && <p className="mt-2 text-[14px] font-semibold text-success-700">{`Раньше плана на ${-lateDays} ${plural(-lateDays, "день", "дня", "дней")}`}</p>}
      <label className="mt-3 block">
        <span className={`block text-[13px] font-semibold ${dev ? "text-warning-900" : "text-stone-500"}`}>{dev ? "Заметка: почему даты не по плану (обязательно)" : "Заметка (если нужно)"}</span>
        <textarea
          rows={2}
          value={d.n}
          maxLength={300}
          onChange={(e) => onDraft({ n: e.target.value })}
          placeholder={dev ? "Объясните причину" : "Например: ждали материал"}
          className={`mt-1 w-full rounded-xl border bg-white px-3 py-2.5 text-[16px] leading-snug outline-none focus:border-primary-500 ${dev && !d.n.trim() ? "border-warning-400" : "border-stone-300"}`}
        />
      </label>
      {error && <p className="mt-2 text-[14px] font-semibold text-error-700">{error}</p>}
    </div>
  );
}
