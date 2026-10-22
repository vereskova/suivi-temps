"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

type Result = {
  salaireJours: number;
  penalitesControle: number;
  banqueQualiteDebut: number;
  banqueDepot: number;
  bonusEquipePaye: number;
  bonusDirect: number;
  banqueQualiteFin: number;
  penaliteSurPaie: number;
  controleBonusRecu: number;
  banqueQualitePrime: number;
  coutRoute: number;
  aPayer: number;
};
type Day = { date: string; state: "full" | "half" | "absent" | null; absence: string | null };
type Person = {
  id: string;
  name: string;
  isChef: boolean;
  isDriver: boolean;
  hireDate: string | null;
  jours: number;
  taux: number;
  bonusEquipe: number;
  bonusRaison: string;
  bonusDirect: number;
  bonusDirectRaison: string;
  penalite: number;
  penaliteRaison: string;
  penaliteDirecte: number;
  penaliteDirecteRaison: string;
  heuresRoute: number;
  avance: number;
  result: Result;
  days: Day[];
};
type BankTeam = { rank: number; name: string; mine: boolean; penalties: number; eligible: boolean; sharePct: number; amount: number };
type BankMember = { id: string; name: string; days: number; amount: number };
type QualityBank = { periodStart: string; payoutDate: string; pool: number; excludedWorst: number; teams: BankTeam[]; members: BankMember[] };
type Payload = { team: string; year: number; month: number; hasRun: boolean; employees: Person[]; qualityBank?: QualityBank | null };

const MONTHS_RU = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
const REFRESH_MS = 20000;
const BANK_CAP = 3000;

/** « 1 г. 3 мес. » / « 8 мес. » / « меньше месяца » — стаж от первой даты входа до сегодня. */
function tenureText(hireIso: string | null): string | null {
  if (!hireIso) return null;
  const from = new Date(hireIso + "T00:00:00Z");
  const now = new Date();
  let months = (now.getUTCFullYear() - from.getUTCFullYear()) * 12 + (now.getUTCMonth() - from.getUTCMonth());
  if (now.getUTCDate() < from.getUTCDate()) months -= 1;
  if (months < 1) return "меньше месяца";
  const y = Math.floor(months / 12);
  const m = months % 12;
  return [y > 0 ? `${y} г.` : "", m > 0 ? `${m} мес.` : ""].filter(Boolean).join(" ");
}

/** Банка БАНК 3000 : заполнена на amount / 3000. Цвет — по уровню заполнения. */
function BankJar({ amount, size = 44 }: { amount: number; size?: number }) {
  const pct = Math.max(0, Math.min(1, amount / BANK_CAP));
  const bodyTop = 14;
  const bodyH = 38;
  const fillH = bodyH * pct;
  const color = pct >= 0.66 ? "#16a34a" : pct >= 0.33 ? "#f59e0b" : "#0f83e3";
  const id = `jar-${Math.round(amount * 100)}-${size}`;
  return (
    <svg width={size} height={(size * 60) / 44} viewBox="0 0 44 60" role="img" aria-label={`БАНК 3000: ${Math.round(pct * 100)}%`}>
      <defs>
        <clipPath id={id}>
          <path d="M8 14 h28 a4 4 0 0 1 4 4 v30 a8 8 0 0 1 -8 8 h-20 a8 8 0 0 1 -8 -8 v-30 a4 4 0 0 1 4 -4 z" />
        </clipPath>
      </defs>
      <rect x="10" y="4" width="24" height="7" rx="2.5" fill="#a8a29e" />
      <rect x="12" y="10" width="20" height="4" fill="#d6d3d1" />
      <g clipPath={`url(#${id})`}>
        <rect x="0" y="0" width="44" height="60" fill="#f5f5f4" />
        <rect x="0" y={bodyTop + bodyH + 4 - fillH} width="44" height={fillH + 4} fill={color} opacity="0.92" />
        {pct > 0 && <rect x="0" y={bodyTop + bodyH + 4 - fillH} width="44" height="2" fill="#ffffff" opacity="0.45" />}
      </g>
      <path
        d="M8 14 h28 a4 4 0 0 1 4 4 v30 a8 8 0 0 1 -8 8 h-20 a8 8 0 0 1 -8 -8 v-30 a4 4 0 0 1 4 -4 z"
        fill="none"
        stroke="#78716c"
        strokeWidth="1.8"
      />
      <path d="M13 20 v22" stroke="#ffffff" strokeWidth="2.2" strokeLinecap="round" opacity="0.55" />
    </svg>
  );
}

function eur(n: number) {
  return `${n.toLocaleString("ru-RU", { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 })} €`;
}
function num(n: number) {
  return n.toLocaleString("ru-RU", { maximumFractionDigits: 2 });
}

function Line({
  ru,
  value,
  tone,
  note,
}: {
  ru: string;
  /** французская подпись больше не показывается (страница бригад только на русском) */
  fr?: string;
  value: string;
  tone?: "plus" | "minus" | "bank";
  note?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-t border-stone-100 py-2">
      <div className="min-w-0">
        <div className="text-[15px] font-medium text-stone-800">{ru}</div>
        {note && <div className="mt-0.5 whitespace-pre-line text-[13px] italic text-stone-600">«{note}»</div>}
      </div>
      <div
        className={`shrink-0 text-[17px] font-bold tabular-nums ${
          tone === "plus" ? "text-success-700" : tone === "minus" ? "text-error-600" : tone === "bank" ? "text-primary-700" : "text-stone-900"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function DayGrid({ days }: { days: Day[] }) {
  return (
    <div className="mt-3">
      <div className="grid grid-cols-7 gap-1">
        {days.map((d) => {
          const dt = new Date(d.date + "T00:00:00Z");
          const weekend = dt.getUTCDay() === 0 || dt.getUTCDay() === 6;
          const cls =
            d.state === "full"
              ? "bg-success-100 text-success-800 font-bold"
              : d.state === "half"
                ? "bg-warning-100 text-warning-800 font-bold"
                : d.state === "absent"
                  ? "bg-error-100 text-error-700 font-bold"
                  : weekend
                    ? "bg-stone-100 text-stone-300"
                    : "bg-stone-50 text-stone-300";
          return (
            <div key={d.date} title={d.absence ?? undefined} className={`rounded-md py-1.5 text-center text-[13px] tabular-nums ${cls}`}>
              {dt.getUTCDate()}
              {d.state === "half" && <span className="block text-[9px] leading-none">½</span>}
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-stone-500">
        <span>
          <span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-success-100 align-middle" />
          работал
        </span>
        <span>
          <span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-warning-100 align-middle" />
          0,5
        </span>
        <span>
          <span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-error-100 align-middle" />
          отсутствие
        </span>
      </div>
    </div>
  );
}

/** « Equipe 3 » → « Бригада 3 ». */
const ruTeam = (name: string) => name.replace(/^equipe\s*/i, "Бригада ");
const frDate = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
};

const QB_STORAGE_KEY = "equipe-qb-open";

/** Банк качества : рейтинг бригад « на сегодня » + доли своей бригады. Свёрнут до одной строки; состояние помнится на телефоне. */
function QualityBankCard({ bank }: { bank: QualityBank }) {
  const [open, setOpen] = useState(() => {
    try {
      return typeof window !== "undefined" && window.localStorage.getItem(QB_STORAGE_KEY) === "1";
    } catch {
      return false;
    }
  });
  function toggle() {
    setOpen((v) => {
      try {
        window.localStorage.setItem(QB_STORAGE_KEY, v ? "0" : "1");
      } catch {
        /* localStorage недоступен (приватный режим) — просто не запоминаем */
      }
      return !v;
    });
  }
  const mine = bank.teams.find((t) => t.mine);
  const total = bank.teams.length;
  const summary = mine
    ? mine.eligible
      ? `${mine.rank}-е из ${total} · ${eur(mine.amount)}`
      : `${mine.rank}-е из ${total} · пока вне рейтинга`
    : "Рейтинг бригад";
  const above = mine ? mine.rank - 1 : 0;
  const below = mine ? total - mine.rank : 0;

  return (
    <section className="rounded-2xl border border-stone-200 bg-white shadow-sm">
      <button type="button" onClick={toggle} aria-expanded={open} className="flex w-full items-center gap-3 px-4 py-3 text-left">
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-bold text-stone-900">Банк качества</div>
          <div className="truncate text-[13px] text-stone-500">{summary}</div>
        </div>
        <div className="shrink-0 text-right">
          <div className="whitespace-nowrap text-[17px] font-extrabold tabular-nums text-stone-900">{eur(Math.round(bank.pool))}</div>
          <div className="text-[11px] text-stone-400">до {frDate(bank.payoutDate)}</div>
        </div>
        <svg
          viewBox="0 0 20 20"
          className={`h-5 w-5 shrink-0 text-stone-400 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="m5 8 5 5 5-5" />
        </svg>
      </button>

      {open && (
        <div className="border-t border-stone-100 px-4 pb-4 pt-3">
          <p className="text-[12px] leading-snug text-stone-400">
            Меньше штрафов — выше место. Три худшие бригады без доли. Если человек перешёл в другую бригаду, штрафы и доля считаются по дням в каждой.
          </p>
          {mine && (
            <div className="mt-2 flex gap-2 text-[12px] font-semibold">
              <span className="rounded-lg bg-stone-100 px-2 py-1 text-stone-600">▲ лучше вас: {above}</span>
              <span className="rounded-lg bg-stone-100 px-2 py-1 text-stone-600">▼ хуже вас: {below}</span>
            </div>
          )}
          <ul className="mt-2 divide-y divide-stone-100">
            {bank.teams.map((t) => (
              <li key={t.rank} className={`flex items-center gap-3 py-2 ${t.mine ? "font-bold text-stone-900" : t.eligible ? "text-stone-700" : "text-stone-400"}`}>
                <span className="w-5 shrink-0 text-center text-[14px] tabular-nums">{t.rank}</span>
                <span className="w-3 shrink-0 text-center text-[10px] text-stone-400" aria-hidden="true">
                  {mine ? (t.mine ? "●" : t.rank < mine.rank ? "▲" : "▼") : ""}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px]">
                    {ruTeam(t.name)}
                    {t.mine && <span className="ml-1.5 text-[11px] font-semibold text-primary-600">вы</span>}
                  </span>
                  <span className="block text-[11px] font-normal text-stone-400">{t.penalties > 0 ? `штрафы ${eur(t.penalties)}` : "без штрафов"}</span>
                </span>
                <span className="shrink-0 whitespace-nowrap text-[14px] tabular-nums">{t.eligible ? eur(t.amount) : "—"}</span>
              </li>
            ))}
          </ul>
          {mine && bank.members.length > 0 && (
            <div className="mt-3 rounded-xl bg-stone-50 px-3 py-3">
              <div className="text-[13px] font-bold text-stone-800">Премия из Банка качества · ваша бригада</div>
              <p className="mt-0.5 text-[12px] leading-snug text-stone-500">
                {mine.eligible
                  ? `Бригаде ${eur(mine.amount)}. Делится между людьми по отработанным дням в бригаде: чем больше дней, тем больше премия. Выплата в конце ${frDate(bank.payoutDate).slice(3, 5) === "01" ? "января" : "сентября"}, если человек остаётся в компании.`
                  : "Сейчас бригада в трёх худших: премии из Банка нет. Чтобы подняться в рейтинг, нужно меньше штрафов."}
              </p>
              <ul className="mt-2 divide-y divide-stone-200">
                {bank.members.map((m) => (
                  <li key={m.id} className="flex items-center gap-2 py-1.5 text-[13px]">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-stone-800">{m.name}</span>
                      <span className="block text-[11px] text-stone-400">{num(m.days)} дн. в бригаде</span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block whitespace-nowrap font-bold tabular-nums text-stone-900">{mine.eligible ? eur(m.amount) : "—"}</span>
                      <span className="block text-[10px] text-stone-400">премия</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function PersonCard({ p, open, onToggle }: { p: Person; open: boolean; onToggle: () => void }) {
  const r = p.result;
  const bankRose = r.banqueQualiteFin - r.banqueQualiteDebut;
  return (
    <section className="rounded-2xl border border-stone-200 bg-white shadow-sm">
      <button type="button" onClick={onToggle} className="flex w-full items-start gap-3 p-4 text-left" aria-expanded={open}>
        <div className="flex w-14 shrink-0 flex-col items-center">
          <BankJar amount={r.banqueQualiteFin} />
          <span className="mt-0.5 text-[11px] font-bold tabular-nums text-stone-600">{Math.round((Math.min(r.banqueQualiteFin, BANK_CAP) / BANK_CAP) * 100)} %</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[17px] font-bold leading-tight text-stone-900">{p.name}</div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-stone-500">
            {p.isChef && <span className="rounded-md bg-primary-50 px-1.5 py-0.5 text-[11px] font-semibold text-primary-700">бригадир</span>}
            {p.isDriver && <span className="rounded-md bg-warning-100 px-1.5 py-0.5 text-[11px] font-semibold text-warning-800">водитель</span>}
            <span>{num(p.jours)} дн.</span>
            {tenureText(p.hireDate) && <span>· стаж {tenureText(p.hireDate)}</span>}
          </div>
          <div className="mt-1 text-[12px] text-stone-500">
            БАНК 3000: <b className="tabular-nums text-stone-700">{eur(r.banqueQualiteFin)}</b> из {eur(BANK_CAP)}
          </div>
          <div className="mt-2 flex items-baseline justify-between gap-2 border-t border-stone-100 pt-2">
            <span className="text-[12px] text-stone-400">К выплате · À payer</span>
            <span className="text-[22px] font-extrabold tabular-nums text-stone-900">{eur(r.aPayer)}</span>
          </div>
        </div>
      </button>

      {open && (
        <div className="px-4 pb-4">
          <Line ru="Отработано дней" fr="Jours travaillés" value={num(p.jours)} />
          <Line ru="Заработано в день" fr="Gagné par jour" value={eur(p.taux)} />
          <Line ru="Зарплата за дни" fr="Salaire des jours" value={eur(r.salaireJours)} />
          {p.bonusEquipe !== 0 && (
            <>
              <Line ru="BONUS команды (начислено)" fr="Bonus équipe" value={`${eur(p.bonusEquipe)}`} note={p.bonusRaison || undefined} />
              {r.banqueDepot > 0 && (
                <Line ru="Из него в БАНК 3000" fr="Dépôt banque qualité (30 %)" value={`−${eur(r.banqueDepot)}`} tone="bank" />
              )}
              <Line
                ru={r.banqueDepot > 0 ? "К выплате из бонуса" : "BONUS к выплате"}
                fr={r.banqueDepot > 0 ? `${eur(p.bonusEquipe)} − ${eur(r.banqueDepot)}` : "Bonus équipe payé"}
                value={`+${eur(r.bonusEquipePaye)}`}
                tone="plus"
              />
            </>
          )}
          {r.bonusDirect !== 0 && (
            <Line ru="Бонус" fr="Bonus direct" value={`+${eur(r.bonusDirect)}`} tone="plus" note={p.bonusDirectRaison || undefined} />
          )}
          {r.penalitesControle > 0 && (
            <Line
              ru="Штраф (из БАНК)"
              fr="Pénalité contrôle"
              value={`−${eur(r.penalitesControle)}`}
              tone="minus"
              note={p.penaliteRaison || undefined}
            />
          )}
          {p.penalite > 0 && (
            <Line ru="Корректировка" fr="Ajustement" value={`+${eur(p.penalite)}`} tone="plus" note={p.penaliteRaison || undefined} />
          )}
          {r.penaliteSurPaie > 0 && (
            <Line ru="Удержано из зарплаты (банка не хватило)" fr="Retenue sur paie" value={`−${eur(r.penaliteSurPaie)}`} tone="minus" />
          )}
          {p.penaliteDirecte !== 0 && (
            <Line
              ru={p.penaliteDirecte < 0 ? "Штраф из зарплаты" : "Корректировка зарплаты"}
              fr="Pénalité directe"
              value={`${p.penaliteDirecte < 0 ? "−" : "+"}${eur(Math.abs(p.penaliteDirecte))}`}
              tone={p.penaliteDirecte < 0 ? "minus" : "plus"}
              note={p.penaliteDirecteRaison || undefined}
            />
          )}
          {r.coutRoute > 0 && <Line ru={`Дорога (${num(p.heuresRoute)} ч)`} fr="Trajet" value={`+${eur(r.coutRoute)}`} tone="plus" />}
          {r.controleBonusRecu > 0 && <Line ru="Доля контролёра" fr="Part du contrôleur" value={`+${eur(r.controleBonusRecu)}`} tone="plus" />}
          {r.banqueQualitePrime > 0 && <Line ru="Премия Банка качества" fr="Prime Банк качества" value={`+${eur(r.banqueQualitePrime)}`} tone="plus" />}
          {p.avance > 0 && <Line ru="Аванс" fr="Avance" value={eur(p.avance)} />}
          <div className="mt-1 rounded-xl bg-stone-50 p-3">
            <div className="flex items-baseline justify-between">
              <div>
                <div className="text-[15px] font-semibold text-stone-800">БАНК 3000</div>
                <div className="text-[12px] text-stone-400">Banque qualité</div>
              </div>
              <div className="text-[17px] font-bold tabular-nums text-stone-900">{eur(r.banqueQualiteFin)}</div>
            </div>
            <div className="mt-1 text-[13px] text-stone-500">
              было {eur(r.banqueQualiteDebut)}
              {bankRose !== 0 && <span className={bankRose > 0 ? "text-success-700" : "text-error-600"}> ({bankRose > 0 ? "+" : "−"}{eur(Math.abs(bankRose))})</span>}
            </div>
          </div>
          <DayGrid days={p.days} />
        </div>
      )}
    </section>
  );
}

export default function TeamPrimesPage() {
  const { token } = useParams<{ token: string }>();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<"invalid" | "network" | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [lastOk, setLastOk] = useState<Date | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/team-primes?token=${encodeURIComponent(token)}&year=${year}&month=${month}`, { cache: "no-store" });
        if (cancelled) return;
        if (res.status === 404) {
          setError("invalid");
          return;
        }
        if (!res.ok) throw new Error(String(res.status));
        const json = (await res.json()) as Payload;
        if (cancelled) return;
        setData(json);
        setLastOk(new Date());
        setError(null);
      } catch {
        if (!cancelled) setError((e) => e ?? "network");
      }
    }
    void load();
    // Rafraîchissement automatique tant que la page est visible : une saisie de la
    // comptable ou des RH apparaît ici en quelques secondes.
    const tick = () => {
      if (document.visibilityState === "visible") void load();
    };
    const timer = window.setInterval(tick, REFRESH_MS);
    document.addEventListener("visibilitychange", tick);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [token, year, month]);

  const isCurrent = year === now.getFullYear() && month === now.getMonth() + 1;
  function shift(delta: number) {
    const d = new Date(Date.UTC(year, month - 1 + delta, 1));
    setYear(d.getUTCFullYear());
    setMonth(d.getUTCMonth() + 1);
    setOpenId(null);
    setData(null);
  }

  if (error === "invalid") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-stone-50 p-6">
        <div className="max-w-sm rounded-2xl border border-stone-200 bg-white p-6 text-center">
          <p className="text-lg font-bold text-stone-900">Ссылка не действует</p>
          <p className="mt-1 text-sm text-stone-500">Ссылка недействительна или заменена. Попроси у HR новую.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-stone-50 pb-10">
      <header className="sticky top-0 z-10 border-b border-stone-200 bg-white/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto max-w-xl">
          <div className="flex items-center justify-between gap-2">
            <button type="button" onClick={() => shift(-1)} className="h-11 w-11 rounded-xl bg-stone-100 text-xl font-bold text-stone-700 active:bg-stone-200" aria-label="Предыдущий месяц">
              ‹
            </button>
            <div className="min-w-0 text-center">
              <div className="truncate text-[17px] font-bold text-stone-900">
                {data?.team ?? "…"} · {MONTHS_RU[month - 1]} {year}
              </div>
              <div className="text-[12px] text-stone-400">Премии и бонусы</div>
            </div>
            <button
              type="button"
              onClick={() => shift(1)}
              disabled={isCurrent}
              className="h-11 w-11 rounded-xl bg-stone-100 text-xl font-bold text-stone-700 active:bg-stone-200 disabled:opacity-30"
              aria-label="Следующий месяц"
            >
              ›
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto mt-4 max-w-xl space-y-3 px-4">
        {error === "network" && (
          <div className="rounded-xl bg-warning-50 p-3 text-sm text-warning-800">Нет связи — показаны последние загруженные данные.</div>
        )}
        {data === null && !error && (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-20 animate-pulse rounded-2xl bg-stone-200" />
            ))}
          </div>
        )}
        {data && !data.hasRun && (
          <div className="rounded-2xl border border-stone-200 bg-white p-6 text-center text-stone-500">
            За этот месяц данных пока нет.
          </div>
        )}
        {data?.hasRun && data.employees.length === 0 && (
          <div className="rounded-2xl border border-stone-200 bg-white p-6 text-center text-stone-500">
            В этой команде сейчас нет сотрудников.
          </div>
        )}
        {data?.qualityBank && <QualityBankCard bank={data.qualityBank} />}
        {data?.hasRun &&
          data.employees.map((p) => <PersonCard key={p.id} p={p} open={openId === p.id} onToggle={() => setOpenId(openId === p.id ? null : p.id)} />)}
        {lastOk && (
          <p className="pt-2 text-center text-[12px] text-stone-400">
            Обновляется автоматически · обновлено {lastOk.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}
          </p>
        )}
      </div>
    </main>
  );
}
