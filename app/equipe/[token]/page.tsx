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
type Payload = { team: string; year: number; month: number; hasRun: boolean; employees: Person[] };

const MONTHS_RU = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
const MONTHS_FR = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
const REFRESH_MS = 20000;

function eur(n: number) {
  return `${n.toLocaleString("fr-FR", { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 })} €`;
}
function num(n: number) {
  return n.toLocaleString("fr-FR", { maximumFractionDigits: 2 });
}

function Line({
  ru,
  fr,
  value,
  tone,
  note,
}: {
  ru: string;
  fr: string;
  value: string;
  tone?: "plus" | "minus";
  note?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-t border-stone-100 py-2">
      <div className="min-w-0">
        <div className="text-[15px] font-medium text-stone-800">{ru}</div>
        <div className="text-[12px] text-stone-400">{fr}</div>
        {note && <div className="mt-0.5 text-[13px] italic text-stone-600">«{note}»</div>}
      </div>
      <div
        className={`shrink-0 text-[17px] font-bold tabular-nums ${
          tone === "plus" ? "text-success-700" : tone === "minus" ? "text-error-600" : "text-stone-900"
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

function PersonCard({ p, open, onToggle }: { p: Person; open: boolean; onToggle: () => void }) {
  const r = p.result;
  const bankRose = r.banqueQualiteFin - r.banqueQualiteDebut;
  return (
    <section className="rounded-2xl border border-stone-200 bg-white shadow-sm">
      <button type="button" onClick={onToggle} className="flex w-full items-center justify-between gap-3 p-4 text-left" aria-expanded={open}>
        <div className="min-w-0">
          <div className="truncate text-[17px] font-bold text-stone-900">{p.name}</div>
          <div className="mt-0.5 text-[13px] text-stone-500">
            {p.isChef && <span className="mr-2 rounded-md bg-primary-50 px-1.5 py-0.5 text-[11px] font-semibold text-primary-700">бригадир</span>}
            {num(p.jours)} дн.
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-[12px] text-stone-400">К выплате · À payer</div>
          <div className="text-[22px] font-extrabold tabular-nums text-stone-900">{eur(r.aPayer)}</div>
        </div>
      </button>

      {open && (
        <div className="px-4 pb-4">
          <Line ru="Отработано дней" fr="Jours travaillés" value={num(p.jours)} />
          <Line ru="Ставка за день" fr="Taux journalier" value={eur(p.taux)} />
          <Line ru="Зарплата за дни" fr="Salaire des jours" value={eur(r.salaireJours)} />
          {p.bonusEquipe !== 0 && (
            <Line
              ru="BONUS команды"
              fr={`Bonus équipe (в банк ${eur(r.banqueDepot)})`}
              value={`+${eur(r.bonusEquipePaye)}`}
              tone="plus"
              note={p.bonusRaison || undefined}
            />
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
          <p className="mt-1 text-sm text-stone-500">Lien invalide ou remplacé. Попроси у RH новую ссылку.</p>
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
              <div className="text-[12px] text-stone-400">Primes &amp; Bonus · {MONTHS_FR[month - 1]}</div>
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
          <div className="rounded-xl bg-warning-50 p-3 text-sm text-warning-800">Нет связи — показаны последние загруженные данные. Pas de connexion.</div>
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
            <div className="text-[12px] text-stone-400">Pas encore de données ce mois-ci.</div>
          </div>
        )}
        {data?.hasRun && data.employees.length === 0 && (
          <div className="rounded-2xl border border-stone-200 bg-white p-6 text-center text-stone-500">
            В этой команде сейчас нет сотрудников.
            <div className="text-[12px] text-stone-400">Aucun salarié dans cette équipe ce mois-ci.</div>
          </div>
        )}
        {data?.hasRun &&
          data.employees.map((p) => <PersonCard key={p.id} p={p} open={openId === p.id} onToggle={() => setOpenId(openId === p.id ? null : p.id)} />)}
        {lastOk && (
          <p className="pt-2 text-center text-[12px] text-stone-400">
            Обновляется автоматически · обновлено {lastOk.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
          </p>
        )}
      </div>
    </main>
  );
}
