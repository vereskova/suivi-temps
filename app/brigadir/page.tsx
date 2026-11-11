"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, CalendarCheck, Check, ChevronRight, ClipboardList, LogOut, MoreHorizontal, Play, Undo2, Wallet } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { LogoMark } from "@/components/Logo";
import { workingDaysBetween } from "@/lib/commercial-durations/compute";
import ObjectFilesBrowser from "@/components/admin/ObjectFilesBrowser";

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
const shiftIso = (iso: string, days: number) => {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + days);
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
  const [tab, setTab] = useState<"work" | "pointage" | "primes">("work");
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
        <div className="mx-auto grid max-w-2xl grid-cols-3 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1.5">
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
  const [showDone, setShowDone] = useState(false);
  const [showAllNext, setShowAllNext] = useState(false);
  const [toast, setToast] = useState<{ text: string; undo: () => void } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/brigadir/object?id=${id}`, { cache: "no-store" });
    const json = (await res.json()) as ObjDetail;
    if (!res.ok) return setError(json.error ?? "Ошибка загрузки");
    setData(json);
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
    onChanged();
    return true;
  }
  /** Записать и показать « Отменить » на 7 секунд - чтобы не бояться ошибочного нажатия. */
  async function act(line: Line, change: Change, text: string) {
    const prev: Change = {};
    for (const k of Object.keys(change) as (keyof Change)[]) prev[k] = line[k];
    if (!(await save(line.id, change))) return;
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({
      text,
      undo: () => {
        save(line.id, prev);
        setToast(null);
      },
    });
    toastTimer.current = setTimeout(() => setToast(null), 7000);
  }

  const view = useMemo(() => {
    const lines = data?.lines ?? [];
    return {
      going: lines.filter((l) => l.actual_start && !l.actual_end),
      next: lines.filter((l) => !l.actual_start),
      done: lines.filter((l) => l.actual_end),
    };
  }, [data]);

  if (error && !data) return <p className="rounded-2xl bg-error-50 p-4 text-error-700">{error}</p>;
  if (!data) return <p className="text-stone-500">Загрузка…</p>;

  const total = data.lines.length;
  const nextShown = showAllNext ? view.next : view.next.slice(0, 3);

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

          {view.going.length > 0 && (
            <section className="space-y-2.5">
              <h3 className="px-1 text-[15px] font-bold uppercase tracking-wide text-primary-700">Сейчас делаем</h3>
              {view.going.map((l) => (
                <WorkCard key={l.id} line={l} onAct={act} />
              ))}
            </section>
          )}

          {view.next.length > 0 && (
            <section className="space-y-2.5">
              <h3 className="px-1 text-[15px] font-bold uppercase tracking-wide text-stone-500">{view.going.length > 0 ? "Дальше по плану" : "Что делаем дальше"}</h3>
              {nextShown.map((l, i) => (
                <WorkCard key={l.id} line={l} onAct={act} highlight={i === 0 && view.going.length === 0} />
              ))}
              {view.next.length > nextShown.length && (
                <button type="button" onClick={() => setShowAllNext(true)} className="w-full rounded-2xl border border-stone-300 bg-white py-3.5 text-[16px] font-semibold text-stone-700">
                  Показать ещё {view.next.length - nextShown.length}
                </button>
              )}
            </section>
          )}

          {total > 0 && view.going.length === 0 && view.next.length === 0 && <p className="rounded-2xl bg-success-50 p-6 text-center text-[17px] font-bold text-success-800">Все работы сделаны. Отлично!</p>}

          {view.done.length > 0 && (
            <section className="space-y-2">
              <button type="button" onClick={() => setShowDone((v) => !v)} className="flex w-full items-center gap-2 px-1 text-left">
                <h3 className="text-[15px] font-bold uppercase tracking-wide text-success-700">Сделано · {view.done.length}</h3>
                <ChevronRight size={18} className={`ml-auto text-stone-400 transition ${showDone ? "rotate-90" : ""}`} />
              </button>
              {showDone && view.done.map((l) => <DoneRow key={l.id} line={l} onAct={act} />)}
            </section>
          )}
        </>
      )}

      {toast && (
        <div className="fixed inset-x-4 bottom-24 z-40 mx-auto flex max-w-md items-center gap-3 rounded-2xl bg-stone-900 px-4 py-3.5 text-white shadow-xl">
          <Check size={20} className="shrink-0 text-success-400" />
          <span className="min-w-0 flex-1 text-[15px] font-semibold">{toast.text}</span>
          <button type="button" onClick={toast.undo} className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-white/15 px-3 py-1.5 text-[15px] font-bold">
            <Undo2 size={16} /> Отменить
          </button>
        </div>
      )}
    </div>
  );
}

/** Поле « Объясните причину »: бригадир пишет своими словами, почему задержка. */
function ReasonBox({ line: l, title, onAct }: { line: Line; title: string; onAct: (line: Line, change: Change, text: string) => void }) {
  const [text, setText] = useState(l.delay_reason ?? "");
  const [editing, setEditing] = useState(!l.delay_reason);
  const saved = (l.delay_reason ?? "").trim();
  return (
    <div className="mt-3 rounded-2xl bg-warning-50 p-3.5">
      <p className="text-[16px] font-bold text-warning-900">{title}</p>
      {editing ? (
        <>
          <textarea
            className="mt-2 min-h-[5.5rem] w-full rounded-xl border border-warning-300 bg-white px-3 py-2.5 text-[16px] leading-snug outline-none focus:border-warning-600"
            placeholder="Объясните причину"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <button
            type="button"
            disabled={!text.trim() || text.trim() === saved}
            className="mt-2 h-12 w-full rounded-xl bg-stone-900 text-[16px] font-bold text-white disabled:opacity-40"
            onClick={() => {
              onAct(l, { delay_reason: text.trim() }, "Причина записана");
              setEditing(false);
            }}
          >
            Сохранить
          </button>
        </>
      ) : (
        <>
          <p className="mt-2 whitespace-pre-line rounded-xl bg-white px-3 py-2.5 text-[16px] leading-snug text-stone-800">{saved}</p>
          <button type="button" className="mt-2 text-[15px] font-semibold text-warning-900 underline" onClick={() => setEditing(true)}>
            Изменить
          </button>
        </>
      )}
    </div>
  );
}

function WorkCard({ line: l, onAct, highlight }: { line: Line; onAct: (line: Line, change: Change, text: string) => void; highlight?: boolean }) {
  const today = todayIso();
  const [menu, setMenu] = useState(false);
  const going = !!l.actual_start && !l.actual_end;
  const planToday = !!l.planned_start && !!l.planned_end && l.planned_start <= today && today <= l.planned_end;
  const overdue = going && !!l.planned_end && today > l.planned_end ? workingDaysBetween(l.planned_end, today) : 0;

  return (
    <div className={`rounded-2xl border bg-white p-4 shadow-sm ${going ? "border-primary-300" : highlight ? "border-stone-400" : "border-stone-200"}`}>
      <p className="text-[19px] font-bold leading-snug text-stone-900">{l.label}</p>
      <p className="mt-1 text-[15px] text-stone-600">
        {l.qty.toLocaleString("ru-RU")} {l.unit}
        {l.measure != null ? ` · ${l.measure} м` : ""}
        {l.days > 0 ? ` · ${fmtDays(l.days)} ${plural(Math.round(l.days), "день", "дня", "дней")}` : ""}
        {l.planned_start ? ` · по плану ${dm(l.planned_start)}–${dm(l.planned_end)}` : ""}
      </p>
      {planToday && !going && <span className="mt-2 inline-block rounded-full bg-primary-50 px-3 py-1 text-[13px] font-bold text-primary-700">Сегодня по плану</span>}
      {going && <p className="mt-2 text-[15px] font-semibold text-primary-700">Идёт с {dm(l.actual_start)}</p>}
      {l.notes.length > 0 && <p className="mt-2 whitespace-pre-line text-[14px] leading-snug text-stone-500">{l.notes.join("\n")}</p>}

      <div className="mt-3 flex gap-2">
        {going ? (
          <button type="button" className="flex h-14 flex-1 items-center justify-center gap-2 rounded-2xl bg-success-600 text-[18px] font-bold text-white active:bg-success-700" onClick={() => onAct(l, { actual_end: today }, `Готово: ${l.label}`)}>
            <Check size={22} strokeWidth={3} /> Готово
          </button>
        ) : (
          <button type="button" className="flex h-14 flex-1 items-center justify-center gap-2 rounded-2xl bg-primary-600 text-[18px] font-bold text-white active:bg-primary-700" onClick={() => onAct(l, { actual_start: today }, `Начали: ${l.label}`)}>
            <Play size={20} fill="currentColor" /> Начали
          </button>
        )}
        <button type="button" aria-label="Другое" onClick={() => setMenu((v) => !v)} className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-stone-300 text-stone-600 active:bg-stone-100">
          <MoreHorizontal size={24} />
        </button>
      </div>

      {menu && (
        <div className="mt-2.5 space-y-2 rounded-2xl bg-stone-50 p-3">
          {going ? (
            <>
              <button
                type="button"
                className="w-full rounded-xl bg-white py-3 text-[16px] font-semibold text-stone-800 shadow-sm"
                onClick={() => {
                  onAct(l, { actual_end: shiftIso(today, -1) }, `Готово вчера: ${l.label}`);
                  setMenu(false);
                }}
              >
                Закончили вчера
              </button>
              <button
                type="button"
                className="w-full rounded-xl bg-white py-3 text-[16px] font-semibold text-stone-800 shadow-sm"
                onClick={() => {
                  onAct(l, { actual_start: null }, `Отменено: ${l.label}`);
                  setMenu(false);
                }}
              >
                Ещё не начинали
              </button>
            </>
          ) : (
            <button
              type="button"
              className="w-full rounded-xl bg-white py-3 text-[16px] font-semibold text-stone-800 shadow-sm"
              onClick={() => {
                onAct(l, { actual_start: shiftIso(today, -1) }, `Начали вчера: ${l.label}`);
                setMenu(false);
              }}
            >
              Начали вчера
            </button>
          )}
          <label className="block text-[14px] font-semibold text-stone-600">
            Другая дата {going ? "окончания" : "начала"}
            <input
              type="date"
              max={today}
              className="input mt-1 w-full"
              onChange={(e) => {
                if (!e.target.value) return;
                onAct(l, going ? { actual_end: e.target.value } : { actual_start: e.target.value }, `Записано: ${l.label}`);
                setMenu(false);
              }}
            />
          </label>
        </div>
      )}

      {overdue > 0 && <ReasonBox line={l} title={`Просрочено на ${overdue} ${plural(overdue, "день", "дня", "дней")}. Объясните причину`} onAct={onAct} />}
    </div>
  );
}

function DoneRow({ line: l, onAct }: { line: Line; onAct: (line: Line, change: Change, text: string) => void }) {
  const late = l.planned_end && l.actual_end ? workingDaysBetween(l.planned_end, l.actual_end) : 0;
  return (
    <div className="rounded-2xl border border-stone-200 bg-white px-4 py-3">
      <div className="flex items-center gap-3">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-success-100 text-success-700">
          <Check size={17} strokeWidth={3} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[16px] font-semibold leading-snug text-stone-900">{l.label}</span>
          <span className="block text-[14px] text-stone-500">
            {dm(l.actual_start)}–{dm(l.actual_end)}
            {late > 0 ? ` · опоздание ${late} ${plural(late, "день", "дня", "дней")}` : ""}
          </span>
        </span>
        <button type="button" onClick={() => onAct(l, { actual_end: null }, `Вернули в работу: ${l.label}`)} className="shrink-0 rounded-lg px-2 py-1.5 text-[14px] font-semibold text-stone-500 underline">
          Вернуть
        </button>
      </div>
      {late > 0 && <ReasonBox line={l} title="Закончено с опозданием. Объясните причину" onAct={onAct} />}
    </div>
  );
}
