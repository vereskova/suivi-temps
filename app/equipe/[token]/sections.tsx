"use client";

import { useMemo, useState } from "react";
import { PENALTY_CATALOG, PENALTY_DEFAULT_DIVISOR, type PenaltyCatalogItem } from "@/lib/payroll/penalties";
import { ONE_DAY_VOLUMES, OMBRIERE_POSE, POWER_TABLES, RANGE_TABLES } from "@/lib/team-info/norms";

export type TeamSection = "primes" | "errors" | "norms";

export const SECTION_TITLES: Record<TeamSection, { title: string; sub: string }> = {
  primes: { title: "Премии и бонусы", sub: "Ваши суммы за месяц" },
  errors: { title: "Список ошибок", sub: "За что и сколько штраф" },
  norms: { title: "Нормы работ", sub: "Сколько дней на объект" },
};

const eur = (n: number) => `${n.toLocaleString("ru-RU")} €`;

function priceText(it: PenaltyCatalogItem): string {
  if (it.unit === "range") return `${it.amount}-${it.amountMax} €`;
  if (it.unit === "per_piece") return `${eur(it.amount)} за шт.`;
  if (it.unit === "per_day") return `${eur(it.amount)} в день`;
  return eur(it.amount);
}

const LEVEL_STYLE: Record<string, string> = {
  Критическая: "bg-red-100 text-red-700",
  Серьёзная: "bg-orange-100 text-orange-700",
  Средняя: "bg-amber-100 text-amber-800",
  Малая: "bg-stone-100 text-stone-600",
};

const GROUPS: { prefix: string; title: string }[] = [
  { prefix: "1.", title: "1. Монтаж и DC" },
  { prefix: "2.", title: "2. AC, щит и связь" },
  { prefix: "3.", title: "3. Порядок, фото и маркировка" },
];

/** « Список ошибок »: справочник штрафов контролёра (тот же, что используется при начислении). */
export function ErrorsSection() {
  const [q, setQ] = useState("");
  const groups = useMemo(() => {
    const s = q.trim().toLowerCase();
    return GROUPS.map((g) => ({
      ...g,
      items: PENALTY_CATALOG.filter((it) => it.code.startsWith(g.prefix)).filter(
        (it) => !s || `${it.code} ${it.stage} ${it.description}`.toLowerCase().includes(s)
      ),
    })).filter((g) => g.items.length > 0);
  }, [q]);

  return (
    <div className="space-y-4">
      <p className="rounded-2xl border border-stone-200 bg-white p-3.5 text-[13px] leading-relaxed text-stone-600">
        Штраф указан на всю бригаду. На одного человека он делится на {PENALTY_DEFAULT_DIVISOR}. Уровень показывает, насколько ошибка серьёзная.
      </p>
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Поиск: заземление, панели, щит..."
        className="h-11 w-full rounded-xl border border-stone-200 bg-white px-3.5 text-[15px] outline-none focus:border-stone-400"
      />
      {groups.length === 0 && <p className="py-8 text-center text-sm text-stone-400">Ничего не найдено</p>}
      {groups.map((g) => (
        <section key={g.prefix}>
          <h2 className="mb-2 px-1 text-[13px] font-bold uppercase tracking-wide text-stone-400">{g.title}</h2>
          <div className="divide-y divide-stone-100 overflow-hidden rounded-2xl border border-stone-200 bg-white">
            {g.items.map((it) => (
              <div key={it.code} className="flex items-start gap-3 px-3.5 py-3">
                <span className="mt-0.5 w-9 shrink-0 text-[13px] font-semibold text-stone-400">{it.code}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-semibold leading-snug text-stone-900">{it.stage}</p>
                  <p className="mt-0.5 text-[14px] leading-snug text-stone-600">{it.description}</p>
                  {it.note && <p className="mt-0.5 text-[12px] text-stone-400">{it.note}</p>}
                  {it.severity && (
                    <span className={`mt-1.5 inline-block rounded-md px-2 py-0.5 text-[11px] font-bold ${LEVEL_STYLE[it.severity] ?? ""}`}>{it.severity}</span>
                  )}
                </div>
                <span className="shrink-0 text-right text-[15px] font-bold text-stone-900">{priceText(it)}</span>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 px-1 text-[13px] font-bold uppercase tracking-wide text-stone-400">{title}</h2>
      <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white">{children}</div>
    </section>
  );
}

function Row({ left, right }: { left: React.ReactNode; right: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-stone-100 px-3.5 py-2.5 text-[15px] last:border-0">
      <span className="text-stone-700">{left}</span>
      <span className="font-bold text-stone-900">{right}</span>
    </div>
  );
}

const dayWord = (d: number) => {
  const n = Math.abs(d);
  if (!Number.isInteger(n)) return "дня";
  if (n % 10 === 1 && n % 100 !== 11) return "день";
  if (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)) return "дня";
  return "дней";
};
const dayText = (d: number) => `${String(d).replace(".", ",")} ${dayWord(d)}`;

/** « Нормы работ »: сколько дней отводится на объект. */
export function NormsSection() {
  return (
    <div className="space-y-4">
      <p className="rounded-2xl border border-stone-200 bg-white p-3.5 text-[13px] leading-relaxed text-stone-600">
        Нормы времени на объект: сколько рабочих дней отводится в зависимости от мощности и вида работ.
      </p>

      {POWER_TABLES.map((t) => (
        <Card key={t.title} title={`${t.title} - по мощности`}>
          {t.rows.map((r) => (
            <Row key={r.power} left={`${r.power} кВт`} right={dayText(r.days)} />
          ))}
        </Card>
      ))}

      <Card title="Ombrière - способ монтажа (дней)">
        <div className="grid grid-cols-3 gap-2 border-b border-stone-100 px-3.5 py-2 text-[12px] font-bold uppercase tracking-wide text-stone-400">
          <span>Мощность</span>
          <span className="text-right">Pose SI</span>
          <span className="text-right">Pose PPV</span>
        </div>
        {OMBRIERE_POSE.map((r) => (
          <div key={r.power} className="grid grid-cols-3 gap-2 border-b border-stone-100 px-3.5 py-2.5 text-[15px] last:border-0">
            <span className="text-stone-700">{r.power} кВт</span>
            <span className="text-right font-bold text-stone-900">{String(r.si).replace(".", ",")}</span>
            <span className="text-right font-bold text-stone-900">{String(r.ppv).replace(".", ",")}</span>
          </div>
        ))}
      </Card>

      {RANGE_TABLES.map((t) => (
        <Card key={t.title} title={`${t.title} (${t.unit})`}>
          {t.rows.map((r) => (
            <Row key={r.range} left={r.range} right={r.days} />
          ))}
        </Card>
      ))}

      <Card title="Кровля и демонтаж - за 1 день">
        {ONE_DAY_VOLUMES.map((r) => (
          <Row key={r.work} left={r.work} right={r.volume} />
        ))}
      </Card>
    </div>
  );
}
