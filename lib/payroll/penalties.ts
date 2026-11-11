/**
 * Справочник штрафов контролёра - из таблицы « Ошибки штраф.numbers »
 * (лист ШТРАФЫ, колонка « Цена х3 »), обновлён 11/11/2026 (3.6 = 150; 3.7 « CDC и Capo » = 150, 3.8 удалён; 1.2 убран) - заменяет версию от 10/11/2026.
 * Суммы - на команду из 3 человек : на одного человека штраф = сумма ÷ 3
 * (PENALTY_DEFAULT_DIVISOR). Цены « за шт. » (1.9 = 10 €, 3.2 = 5 €, 3.3 = 2 €) и « в день »
 * (3.1 = 5 €). Строки « стоимость кабеля / CDC + время на работы » и « увольнение, минус 100 % банк »
 * в таблице без суммы - в справочнике это unit "manual": сумму на команду вводят вручную.
 */
export type PenaltyUnit = "fixed" | "range" | "per_piece" | "per_day" | "manual";
export const PENALTY_SEVERITIES = ["Критическая", "Серьёзная", "Средняя", "Малая"] as const;
export type PenaltySeverity = (typeof PENALTY_SEVERITIES)[number];
export const PENALTY_UNITS: { value: PenaltyUnit; label: string }[] = [
  { value: "fixed", label: "фикс. на команду" },
  { value: "range", label: "диапазон от-до" },
  { value: "per_piece", label: "за штуку" },
  { value: "per_day", label: "за день" },
  { value: "manual", label: "вручную (сумму вводит контролёр)" },
];

export type PenaltyCatalogItem = {
  code: string;
  stage: string;
  description: string;
  severity: PenaltySeverity | null;
  amount: number;
  amountMax?: number;
  unit: PenaltyUnit;
  note?: string;
};

export const PENALTY_DEFAULT_DIVISOR = 3;

export const PENALTY_CATALOG: PenaltyCatalogItem[] = [
  { code: "1.1", stage: "Pose securite", description: "Отсутствуют средства защиты, нет ограждения", severity: "Критическая", amount: 0, unit: "manual", note: "Увольнение, минус 100 % БАНК - сумму на команду ввести вручную" },
  { code: "1.3", stage: "Marquage raille", description: "Неправильные расстояния между рельсами", severity: "Средняя", amount: 150, unit: "fixed" },
  { code: "1.4", stage: "Fixation raille", description: "Рельсы закреплены слабо", severity: "Серьёзная", amount: 300, unit: "fixed" },
  { code: "1.5", stage: "Fixation string", description: "Кабели string плохо закреплены", severity: "Малая", amount: 90, unit: "fixed" },
  { code: "1.6", stage: "Cable endommagé", description: "Кабель повреждён", severity: "Серьёзная", amount: 0, unit: "manual", note: "Стоимость кабеля + время на работы" },
  { code: "1.7", stage: "6mm² vert jaune", description: "Отсутствует или неправильное заземление", severity: "Серьёзная", amount: 150, unit: "fixed" },
  { code: "1.8", stage: "Pose panneaux", description: "Панели установлены криво", severity: "Серьёзная", amount: 150, amountMax: 300, unit: "range", note: "150 - небольшой перекос, 300 - очень криво" },
  { code: "1.9", stage: "Croche mal sertissage", description: "Панели плохо зажаты", severity: "Серьёзная", amount: 10, unit: "per_piece", note: "10 € за одну крошу" },
  { code: "1.10", stage: "Pose CDC", description: "Неправильный монтаж CDC", severity: "Серьёзная", amount: 0, unit: "manual", note: "Стоимость CDC + время на работы" },
  { code: "1.11", stage: "Cablage OND DC", description: "Неправильное подключение DC кабелей к инвертору (+ и −)", severity: "Критическая", amount: 300, unit: "fixed" },
  { code: "1.12", stage: "SONDE + WebDyn", description: "Нет связи с системой мониторинга", severity: "Средняя", amount: 60, unit: "fixed" },
  { code: "1.13", stage: "Crochets de sécurité", description: "Неправильно установлены крюки безопасности", severity: "Серьёзная", amount: 90, unit: "fixed" },
  { code: "1.14", stage: "25mm² cable de terre CDC", description: "Неправильное заземление CDC", severity: "Серьёзная", amount: 60, unit: "fixed" },
  { code: "1.15", stage: "Mise à la terre poteaux", description: "Неправильное заземление столбов", severity: "Серьёзная", amount: 60, unit: "fixed" },
  { code: "1.16", stage: "Cablage Terre", description: "Плохой контакт заземления", severity: "Серьёзная", amount: 60, unit: "fixed" },
  { code: "1.17", stage: "Pique de terre", description: "Неправильно установлен заземляющий стержень", severity: "Серьёзная", amount: 60, unit: "fixed" },
  { code: "2.1", stage: "Tirage COM", description: "Кабель связи повреждён или подключён неправильно", severity: "Средняя", amount: 0, unit: "manual", note: "Стоимость кабеля + время на работы" },
  { code: "2.2", stage: "Tirage ARU", description: "Неправильное подключение аварийной остановки", severity: "Критическая", amount: 0, unit: "manual", note: "Стоимость кабеля + время на работы" },
  { code: "2.3", stage: "Terre 25mm²", description: "Неправильное соединение заземления", severity: "Серьёзная", amount: 60, unit: "fixed" },
  { code: "2.4", stage: "Cablage AC TGBT", description: "Неправильные подключения в главном щите", severity: "Критическая", amount: 0, unit: "manual", note: "Стоимость кабеля + время на работы" },
  { code: "2.5", stage: "Bobine MX + ARU", description: "Неправильное подключение катушки отключения", severity: "Критическая", amount: 60, unit: "fixed" },
  { code: "2.6", stage: "Branchement cable com", description: "Нет связи с системой мониторинга", severity: "Средняя", amount: 60, unit: "fixed" },
  { code: "2.7", stage: "Cablage AC PDL", description: "Ошибка подключения к точке подключения сети", severity: "Критическая", amount: 0, unit: "manual", note: "Стоимость кабеля + время на работы" },
  { code: "2.8", stage: "Bretelle AGCP", description: "Неправильное соединение кабеля AGCP", severity: "Серьёзная", amount: 0, unit: "manual", note: "Стоимость кабеля + время на работы" },
  { code: "3.1", stage: "Фото объекта", description: "Отсутствуют фотографии выполненных работ", severity: "Малая", amount: 5, unit: "per_day" },
  { code: "3.2", stage: "Presetup", description: "Пресетапы не затянуты", severity: "Средняя", amount: 5, unit: "per_piece" },
  { code: "3.3", stage: "Conectique non cire", description: "Конектики не затянуты", severity: "Серьёзная", amount: 2, unit: "per_piece" },
  { code: "3.4", stage: "Нет наклеек AC-DC", description: "Отсутствуют наклейки для обозначения AC (переменный ток) и DC (постоянный ток)", severity: "Средняя", amount: 150, unit: "fixed" },
  { code: "3.5", stage: "AGCP / Rondelle crantée", description: "Не установлены или неправильно затянуты зубчатые шайбы (rondelle crantée) на соединениях AGCP", severity: "Серьёзная", amount: 150, unit: "fixed" },
  { code: "3.6", stage: "Nettoyage", description: "Мусор на объекте после завершения", severity: "Малая", amount: 150, unit: "fixed" },
  { code: "3.7", stage: "Manque joint CDC / Capo", description: "Нет Жуан на CDC и Capo", severity: "Серьёзная", amount: 150, unit: "fixed" },
  { code: "3.9", stage: "Manque ruban isolant de marquage", description: "Нет маркировочной изоленты N L1 L2 L3", severity: "Малая", amount: 150, unit: "fixed" },
];

// ── Справочник как документ (хранится в БД, см. migration 0134) ─────────────────────────────
// Встроенный PENALTY_CATALOG выше - только запасной вариант и стартовая точка для первой правки.

export type PenaltySection = { id: string; title: string };
/** Пункт справочника : id постоянный (не меняется при смене нумерации), code - номер в таблице. */
export type CatalogItem = PenaltyCatalogItem & { id: string; section: string };
export type PenaltyCatalogDoc = { divisor: number; sections: PenaltySection[]; items: CatalogItem[] };

export const DEFAULT_PENALTY_DOC: PenaltyCatalogDoc = {
  divisor: PENALTY_DEFAULT_DIVISOR,
  sections: [
    { id: "s1", title: "Монтаж и DC" },
    { id: "s2", title: "AC, щит и связь" },
    { id: "s3", title: "Порядок, фото и маркировка" },
  ],
  items: PENALTY_CATALOG.map((c) => ({ ...c, id: `c:${c.code}`, section: `s${c.code.split(".")[0]}` })),
};

/** Найти пункт по постоянному id, а для старых записей - по номеру ( « c:1.3 » = встроенный пункт 1.3 ). */
export function findCatalogItem(doc: PenaltyCatalogDoc, ref: { id?: string | null; code?: string | null }): CatalogItem | undefined {
  if (ref.id) {
    const byId = doc.items.find((i) => i.id === ref.id);
    if (byId) return byId;
  }
  if (ref.code) return doc.items.find((i) => i.id === `c:${ref.code}`) ?? doc.items.find((i) => i.code === ref.code);
  return undefined;
}

const clip = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);
const money = (v: unknown) => Math.round(Number(v) * 100) / 100;

/** Проверка и очистка присланного документа (на сервере перед записью черновика). */
export function sanitizeCatalogDoc(input: unknown): { ok: true; doc: PenaltyCatalogDoc } | { ok: false; error: string } {
  const raw = input as Partial<PenaltyCatalogDoc> | null;
  if (!raw || !Array.isArray(raw.sections) || !Array.isArray(raw.items)) return { ok: false, error: "Некорректный справочник" };
  const divisor = Number(raw.divisor);
  if (!(divisor > 0 && divisor <= 20)) return { ok: false, error: "Делитель должен быть от 1 до 20" };
  if (raw.sections.length < 1 || raw.sections.length > 30) return { ok: false, error: "Нужен хотя бы один раздел" };
  if (raw.items.length > 400) return { ok: false, error: "Слишком много пунктов" };

  const sections: PenaltySection[] = [];
  for (const s of raw.sections) {
    const id = clip(s?.id, 40);
    const title = clip(s?.title, 120);
    if (!id || !title) return { ok: false, error: "У каждого раздела должно быть название" };
    if (sections.some((x) => x.id === id)) return { ok: false, error: "Повторяющийся раздел" };
    sections.push({ id, title });
  }

  const items: CatalogItem[] = [];
  for (const it of raw.items) {
    const id = clip(it?.id, 60);
    const code = clip(it?.code, 20);
    const stage = clip(it?.stage, 160);
    const description = clip(it?.description, 600);
    const where = code ? `Пункт ${code}` : "Пункт без номера";
    if (!id) return { ok: false, error: `${where}: нет идентификатора` };
    if (!code) return { ok: false, error: "У каждого пункта должен быть номер" };
    if (!stage || !description) return { ok: false, error: `${where}: заполните название и описание` };
    if (items.some((x) => x.id === id)) return { ok: false, error: `${where}: повторяющийся идентификатор` };
    if (items.some((x) => x.code === code)) return { ok: false, error: `Номер ${code} используется дважды` };
    const section = clip(it?.section, 40);
    if (!sections.some((s) => s.id === section)) return { ok: false, error: `${where}: не выбран раздел` };
    const unit = it?.unit as PenaltyUnit;
    if (!PENALTY_UNITS.some((u) => u.value === unit)) return { ok: false, error: `${where}: неизвестный тип суммы` };
    const severity = it?.severity == null || it.severity === ("" as never) ? null : (it.severity as PenaltySeverity);
    if (severity !== null && !PENALTY_SEVERITIES.includes(severity)) return { ok: false, error: `${where}: неизвестная серьёзность` };
    const amount = money(it?.amount ?? 0);
    if (!(amount >= 0 && amount <= 100000)) return { ok: false, error: `${where}: некорректная сумма` };
    let amountMax: number | undefined;
    if (unit === "range") {
      amountMax = money(it?.amountMax ?? amount);
      if (!(amountMax >= amount)) return { ok: false, error: `${where}: максимум диапазона меньше минимума` };
    }
    if (unit !== "manual" && !(amount > 0)) return { ok: false, error: `${where}: укажите сумму больше 0 (или выберите «вручную»)` };
    const note = clip(it?.note, 300) || undefined;
    items.push({ id, code, stage, description, severity, amount, ...(amountMax !== undefined ? { amountMax } : {}), unit, ...(note ? { note } : {}), section });
  }
  return { ok: true, doc: { divisor: Math.round(divisor * 100) / 100, sections, items } };
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const fmt = (n: number) => r2(n).toFixed(2).replace(".", ",");

export type PenaltyPick = {
  item: PenaltyCatalogItem;
  /** количество (шт./дней) для per_piece / per_day, иначе 1 */
  qty: number;
  /** выбранная сумма для диапазона */
  rangeAmount?: number;
  /** название объекта (необязательно) */
  site?: string;
  divisor: number;
};

/** Сумма на команду и на одного человека + подробная строка для комментария. */
export function describePenaltyPick(p: PenaltyPick): { teamAmount: number; share: number; line: string } {
  const { item } = p;
  const base = item.unit === "range" || item.unit === "manual" ? (p.rangeAmount ?? item.amount) : item.amount;
  const qty = item.unit === "per_piece" || item.unit === "per_day" ? Math.max(0, p.qty) : 1;
  const teamAmount = r2(base * qty);
  const divisor = p.divisor > 0 ? p.divisor : PENALTY_DEFAULT_DIVISOR;
  const share = r2(teamAmount / divisor);
  const calc =
    item.unit === "per_piece"
      ? `${qty} шт × ${fmt(item.amount)} € = ${fmt(teamAmount)} €`
      : item.unit === "per_day"
        ? `${qty} дн × ${fmt(item.amount)} € = ${fmt(teamAmount)} €`
        : `${fmt(teamAmount)} €`;
  const line = `${p.site?.trim() ? `${p.site.trim()} · ` : ""}${item.code} ${item.stage} - ${item.description}: ${calc} ÷ ${divisor} = −${fmt(share)} €`;
  return { teamAmount, share, line };
}
