"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, CalendarCheck, CheckCircle2, ChevronRight, ClipboardList, Clock, LogOut, Wallet } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { LogoMark } from "@/components/Logo";
import { workingDaysBetween } from "@/lib/commercial-durations/compute";

// Кабинет бригадира: объекты своей команды и контрандю (план / факт), ежедневные отметки, премии.
// Бригадир видит только свою команду; rh_admin - любую (режим проверки). Цен и сумм смет здесь нет.

type Status = "a_venir" | "en_cours" | "pas_fini" | "fini";
type Team = { id: string; name: string };
type ObjRow = { id: string; name: string; status: Status; variant: string; start_date: string | null; finished_at: string | null };
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

const STATUSES: { key: Status; fr: string; ru: string; dot: string }[] = [
  { key: "en_cours", fr: "En cours", ru: "В работе", dot: "bg-primary-500" },
  { key: "a_venir", fr: "A venir", ru: "Предстоит", dot: "bg-stone-400" },
  { key: "pas_fini", fr: "Pas fini", ru: "Не закончен", dot: "bg-warning-500" },
  { key: "fini", fr: "Fini", ru: "Закончен", dot: "bg-success-500" },
];
const VARIANT: Record<string, string> = { standard: "Standard", lt: "Avec LT", ombriere: "Ombrière" };

const todayIso = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};
const dm = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : "—");
const fmtDays = (n: number) => n.toLocaleString("ru-RU", { maximumFractionDigits: 1 });

export default function BrigadirPage() {
  const router = useRouter();
  const [ctx, setCtx] = useState<Ctx | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"objets" | "pointage" | "primes">("objets");
  const [openObject, setOpenObject] = useState<string | null>(null);
  const [showFini, setShowFini] = useState(false);

  const load = useCallback(
    async (teamId?: string) => {
      const res = await fetch(`/api/brigadir/context${teamId ? `?team=${teamId}` : ""}`, { cache: "no-store" });
      if (res.status === 401) return router.replace("/login?next=/brigadir");
      const data = (await res.json()) as Ctx;
      if (!res.ok) return setError(data.error ?? "Нет доступа к этому экрану.");
      setCtx(data);
      setError(null);
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
        <p className="rounded-2xl bg-white p-5 text-[15px] text-stone-700 shadow-sm">{error}</p>
        <button type="button" className="btn mt-4 w-full" onClick={logout}>
          Выйти
        </button>
      </main>
    );
  if (!ctx) return <main className="p-6 text-stone-500">Загрузка…</main>;

  const TABS = [
    { key: "objets" as const, label: "Объекты", fr: "Chantiers", icon: ClipboardList },
    { key: "pointage" as const, label: "Отметки", fr: "Pointage", icon: CalendarCheck },
    { key: "primes" as const, label: "Премии", fr: "Primes", icon: Wallet },
  ];

  return (
    <main className="mx-auto min-h-screen max-w-2xl pb-10">
      <header className="sticky top-0 z-20 border-b border-stone-200 bg-[#f5f4f2]/95 px-4 pb-3 pt-4 backdrop-blur">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-primary-600 text-white">
            <LogoMark size={44} />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-extrabold leading-tight tracking-tight text-stone-900">{ctx.team.name}</h1>
            <p className="truncate text-sm text-stone-500">Кабинет бригадира · {ctx.email}</p>
          </div>
          <button type="button" onClick={logout} className="rounded-xl p-2.5 text-stone-500 hover:bg-stone-200" title="Выйти">
            <LogOut size={20} />
          </button>
        </div>

        {ctx.role === "rh_admin" && (
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-warning-50 px-3 py-2 text-sm text-warning-800">
            <b>Режим проверки:</b> вы видите кабинет глазами бригадира
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

        <nav className="mt-3 grid grid-cols-3 gap-1.5 rounded-2xl bg-stone-200/70 p-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => {
                setTab(t.key);
                setOpenObject(null);
              }}
              className={`flex flex-col items-center gap-0.5 rounded-xl py-2 text-[13px] font-semibold transition ${tab === t.key ? "bg-white text-stone-900 shadow-sm" : "text-stone-600"}`}
            >
              <t.icon size={18} />
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      <div className="px-4 pt-4">
        {tab === "objets" &&
          (openObject ? (
            <ObjectScreen key={openObject} id={openObject} onBack={() => setOpenObject(null)} onChanged={() => load(ctx.team.id)} />
          ) : (
            <ObjectList objects={ctx.objects} showFini={showFini} setShowFini={setShowFini} onOpen={setOpenObject} />
          ))}

        {tab === "pointage" && (
          <iframe
            key={ctx.team.id}
            title="Отметки"
            src={`/?embed=1&team=${ctx.team.id}`}
            className="h-[calc(100dvh-13rem)] min-h-[600px] w-full rounded-2xl border border-stone-200 bg-white"
          />
        )}

        {tab === "primes" &&
          (ctx.token ? (
            <iframe key={ctx.token} title="Премии" src={`/equipe/${ctx.token}`} className="h-[calc(100dvh-13rem)] min-h-[600px] w-full rounded-2xl border border-stone-200 bg-white" />
          ) : (
            <p className="rounded-2xl bg-white p-5 text-[15px] text-stone-700">Страница премий для этой команды ещё не настроена. Обратитесь в офис.</p>
          ))}
      </div>
    </main>
  );
}

function ObjectList({ objects, showFini, setShowFini, onOpen }: { objects: ObjRow[]; showFini: boolean; setShowFini: (v: boolean) => void; onOpen: (id: string) => void }) {
  if (objects.length === 0)
    return <p className="rounded-2xl bg-white p-6 text-center text-[15px] text-stone-600">У вашей команды пока нет объектов. Они появятся здесь, когда офис их создаст.</p>;
  return (
    <div className="space-y-5">
      {STATUSES.map((st) => {
        const items = objects.filter((o) => o.status === st.key);
        if (items.length === 0) return null;
        const collapsed = st.key === "fini" && !showFini;
        return (
          <section key={st.key}>
            <button type="button" disabled={st.key !== "fini"} onClick={() => setShowFini(!showFini)} className="mb-2 flex w-full items-center gap-2 px-1 text-left">
              <span className={`h-2.5 w-2.5 rounded-full ${st.dot}`} />
              <h2 className="text-[15px] font-bold text-stone-800">
                {st.fr} <span className="font-normal text-stone-500">· {st.ru}</span>
              </h2>
              <span className="ml-auto rounded-full bg-white px-2.5 py-0.5 text-sm font-semibold text-stone-600">{items.length}</span>
              {st.key === "fini" && <ChevronRight size={16} className={`text-stone-400 transition ${showFini ? "rotate-90" : ""}`} />}
            </button>
            {!collapsed && (
              <div className="space-y-2">
                {items.map((o) => (
                  <button key={o.id} type="button" onClick={() => onOpen(o.id)} className="flex w-full items-center gap-3 rounded-2xl border border-stone-200 bg-white px-4 py-3.5 text-left shadow-sm active:bg-stone-50">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-base font-semibold text-stone-900">{o.name}</span>
                      <span className="block text-sm text-stone-500">
                        {VARIANT[o.variant] ?? o.variant}
                        {o.start_date ? ` · старт ${dm(o.start_date)}` : ""}
                      </span>
                    </span>
                    <ChevronRight size={18} className="shrink-0 text-stone-400" />
                  </button>
                ))}
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

  async function patch(lineId: string, change: Partial<Pick<Line, "actual_start" | "actual_end" | "delay_reason">>) {
    setData((d) => (d ? { ...d, lines: d.lines.map((l) => (l.id === lineId ? { ...l, ...change } : l)) } : d));
    const res = await fetch("/api/brigadir/line", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ line_id: lineId, ...change }) });
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      setError(j.error ?? "Не удалось сохранить");
      load();
    } else {
      setError(null);
      onChanged();
    }
  }

  const summary = useMemo(() => {
    if (!data) return null;
    const total = data.lines.length;
    const done = data.lines.filter((l) => l.actual_end).length;
    const ends = data.lines.map((l) => l.planned_end).filter(Boolean).sort();
    return { total, done, planEnd: ends.length ? (ends[ends.length - 1] as string) : null };
  }, [data]);

  if (error && !data) return <p className="rounded-2xl bg-error-50 p-4 text-error-700">{error}</p>;
  if (!data || !summary) return <p className="text-stone-500">Загрузка…</p>;

  // группы по разделам (в порядке появления)
  const groups: { title: string | null; lines: Line[] }[] = [];
  for (const l of data.lines) {
    const last = groups[groups.length - 1];
    if (last && last.title === l.section) last.lines.push(l);
    else groups.push({ title: l.section, lines: [l] });
  }

  return (
    <div className="space-y-4">
      <button type="button" onClick={onBack} className="inline-flex items-center gap-1.5 text-[15px] font-semibold text-primary-700">
        <ArrowLeft size={18} /> Все объекты
      </button>

      <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
        <h2 className="text-xl font-extrabold tracking-tight text-stone-900">{data.object.name}</h2>
        <p className="mt-1 text-sm text-stone-600">
          {VARIANT[data.object.variant] ?? data.object.variant}
          {data.object.start_date ? ` · старт ${dm(data.object.start_date)}` : " · дата старта не назначена"}
          {summary.planEnd ? ` · по плану до ${dm(summary.planEnd)}` : ""}
        </p>
        <div className="mt-3 flex items-center gap-3">
          <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-stone-200">
            <div className="h-full rounded-full bg-success-500 transition-all" style={{ width: `${summary.total ? (summary.done / summary.total) * 100 : 0}%` }} />
          </div>
          <span className="text-sm font-bold text-stone-700">
            {summary.done} из {summary.total}
          </span>
        </div>
      </div>
      {error && <p className="rounded-xl bg-error-50 p-3 text-sm text-error-700">{error}</p>}

      {groups.map((g, gi) => (
        <section key={gi} className="space-y-2">
          {g.title && <h3 className="px-1 text-[13px] font-bold uppercase tracking-wide text-stone-500">{g.title}</h3>}
          {g.lines.map((l) => (
            <LineCard key={l.id} line={l} onPatch={(c) => patch(l.id, c)} />
          ))}
        </section>
      ))}
      {data.lines.length === 0 && <p className="rounded-2xl bg-white p-6 text-center text-[15px] text-stone-600">В этом объекте пока нет работ. Офис добавит их.</p>}
    </div>
  );
}

function LineCard({ line: l, onPatch }: { line: Line; onPatch: (c: Partial<Pick<Line, "actual_start" | "actual_end" | "delay_reason">>) => void }) {
  const today = todayIso();
  // отклонение: по факту окончания; если работа начата, но не закончена и срок прошёл - просрочка
  let dev: { text: string; tone: "bad" | "good" | "warn" } | null = null;
  if (l.planned_end && l.actual_end) {
    const d = workingDaysBetween(l.planned_end, l.actual_end);
    dev = d > 0 ? { text: `Опоздание ${d} дн.`, tone: "bad" } : d < 0 ? { text: `Раньше срока на ${-d} дн.`, tone: "good" } : { text: "В срок", tone: "good" };
  } else if (l.planned_end && l.actual_start && today > l.planned_end) {
    const d = workingDaysBetween(l.planned_end, today);
    if (d > 0) dev = { text: `Просрочено на ${d} дн.`, tone: "warn" };
  }
  const late = dev && dev.tone !== "good";
  const state = l.actual_end ? "done" : l.actual_start ? "going" : "todo";
  const TONE = { bad: "bg-error-50 text-error-700", good: "bg-success-50 text-success-700", warn: "bg-warning-50 text-warning-800" };

  return (
    <div className={`rounded-2xl border bg-white p-4 shadow-sm ${state === "done" ? "border-success-200" : state === "going" ? "border-primary-300" : "border-stone-200"}`}>
      <div className="flex items-start gap-3">
        <span className="mt-0.5 shrink-0">{state === "done" ? <CheckCircle2 size={22} className="text-success-600" /> : state === "going" ? <Clock size={22} className="text-primary-600" /> : <span className="block h-[22px] w-[22px] rounded-full border-2 border-stone-300" />}</span>
        <div className="min-w-0 flex-1">
          <p className="text-base font-semibold leading-snug text-stone-900">{l.label}</p>
          <p className="mt-0.5 text-sm text-stone-600">
            {l.qty.toLocaleString("ru-RU")} {l.unit}
            {l.measure != null ? ` · ${l.measure} м` : ""}
            {l.days > 0 ? ` · ${fmtDays(l.days)} дн.` : ""}
            {l.parallel ? " · параллельно" : ""}
          </p>
          {l.notes.length > 0 && <p className="mt-1 whitespace-pre-line text-[13px] leading-snug text-stone-500">{l.notes.join("\n")}</p>}
        </div>
      </div>

      <div className="mt-3 rounded-xl bg-stone-50 px-3 py-2 text-sm text-stone-700">
        План: <b>{l.planned_start ? `${dm(l.planned_start)} → ${dm(l.planned_end)}` : "—"}</b>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <label className="text-[13px] font-semibold text-stone-600">
          Начало (факт)
          <input type="date" className="input mt-1 w-full" value={l.actual_start ?? ""} max={today} onChange={(e) => onPatch({ actual_start: e.target.value || null })} />
        </label>
        <label className="text-[13px] font-semibold text-stone-600">
          Конец (факт)
          <input type="date" className="input mt-1 w-full" value={l.actual_end ?? ""} max={today} onChange={(e) => onPatch({ actual_end: e.target.value || null })} />
        </label>
      </div>

      {state === "todo" && (
        <button type="button" className="btn btn-primary mt-3 h-12 w-full text-base" onClick={() => onPatch({ actual_start: today })}>
          Начал сегодня
        </button>
      )}
      {state === "going" && (
        <button type="button" className="btn btn-green mt-3 h-12 w-full text-base" onClick={() => onPatch({ actual_end: today })}>
          Закончил сегодня
        </button>
      )}

      {dev && <p className={`mt-3 rounded-xl px-3 py-2 text-sm font-bold ${TONE[dev.tone]}`}>{dev.text}</p>}
      {(late || l.delay_reason) && (
        <label className="mt-3 block text-[13px] font-semibold text-stone-600">
          Причина задержки
          <input key={l.id + String(l.delay_reason)} className="input mt-1 w-full" placeholder="Например: дождь, нет материала, ждали технику" defaultValue={l.delay_reason ?? ""} onBlur={(e) => (e.target.value.trim() || null) !== l.delay_reason && onPatch({ delay_reason: e.target.value.trim() || null })} />
        </label>
      )}
    </div>
  );
}
