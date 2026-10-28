/**
 * Нормы работ на объектах для бригад - из таблицы « Нормы работа на объектах для команд Delais.numbers »
 * (лист « нормы »). Коммерческие тарифы обслуживания (Veridian: preventive / curative / nettoyage / mise en service)
 * и фактические дни по бригадам из этой таблицы сюда НЕ входят: бригадам они не нужны.
 */
export type PowerTable = { title: string; hint?: string; rows: { power: number; days: number }[] };

export const POWER_TABLES: PowerTable[] = [
  {
    title: "AGRICOL horizon",
    rows: [
      { power: 100, days: 5 },
      { power: 200, days: 9 },
      { power: 300, days: 13 },
      { power: 400, days: 17 },
      { power: 500, days: 21 },
    ],
  },
  {
    title: "Advanced énergie + LT + Feedgy",
    rows: [
      { power: 100, days: 6 },
      { power: 150, days: 8 },
      { power: 200, days: 10 },
      { power: 250, days: 12 },
      { power: 300, days: 14 },
      { power: 350, days: 16 },
      { power: 400, days: 18 },
      { power: 450, days: 20 },
      { power: 500, days: 22 },
    ],
  },
  {
    title: "Ombrière",
    rows: [
      { power: 100, days: 5 },
      { power: 200, days: 8 },
      { power: 300, days: 12 },
      { power: 400, days: 16 },
      { power: 500, days: 20 },
      { power: 600, days: 24 },
      { power: 700, days: 28 },
      { power: 800, days: 32 },
      { power: 900, days: 36 },
      { power: 1000, days: 40 },
    ],
  },
];

/** Ombrière: дни по мощности для двух способов монтажа (столбцы « Pose SI » и « Pose PPV » таблицы). */
export const OMBRIERE_POSE: { power: number; si: number; ppv: number }[] = [
  { power: 100, si: 1, ppv: 1 },
  { power: 200, si: 1, ppv: 1.5 },
  { power: 300, si: 1.5, ppv: 2 },
  { power: 400, si: 2, ppv: 2.5 },
  { power: 500, si: 2.5, ppv: 3 },
  { power: 600, si: 3, ppv: 3.5 },
  { power: 700, si: 3.5, ppv: 4 },
  { power: 800, si: 4, ppv: 5 },
  { power: 900, si: 5, ppv: 7 },
  { power: 1000, si: 5, ppv: 9 },
];

export type RangeTable = { title: string; unit: string; rows: { range: string; days: string }[] };

export const RANGE_TABLES: RangeTable[] = [
  {
    title: "Протяжка кабеля (tirage de câble)",
    unit: "длина, м",
    rows: [
      { range: "до 50", days: "0,5 дня" },
      { range: "50-100", days: "1 день" },
      { range: "101-200", days: "2 дня" },
      { range: "201-300", days: "2,5 дня" },
      { range: "301-400", days: "3 дня" },
    ],
  },
  {
    title: "Сетка под bac acier: снять / поставить",
    unit: "площадь, м²",
    rows: [
      { range: "0-600", days: "1 день" },
      { range: "600-1000", days: "2 дня" },
    ],
  },
  {
    title: "Сетка по периметру: снять / поставить",
    unit: "мощность, кВт",
    rows: [
      { range: "0-300", days: "1 день" },
      { range: "300-500", days: "2 дня" },
    ],
  },
];

/** Кровля и демонтаж: объём, который бригада делает за 1 день. */
export const ONE_DAY_VOLUMES: { work: string; volume: string }[] = [
  { work: "Монтаж bac acier (pose bac acier)", volume: "230 м" },
  { work: "Демонтаж bac acier (dépose bac acier)", volume: "360 м" },
  { work: "Демонтаж fibrociment (dépose fibrociment)", volume: "280 м" },
  { work: "Демонтаж панелей (démontage panneaux)", volume: "150 шт." },
];
