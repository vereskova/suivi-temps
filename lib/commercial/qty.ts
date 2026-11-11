// Правила автоматического количества в смете объекта (см. migration 0137).

export type QtySource = "manual" | "fixed" | "power" | "roof_m2" | "panels" | "cable_m" | "weeks";

export const QTY_SOURCES: { value: QtySource; label: string; hint: string }[] = [
  { value: "manual", label: "вручную", hint: "Количество вводится вручную" },
  { value: "fixed", label: "всегда 1", hint: "Одна штука / один комплект" },
  { value: "power", label: "мощность, kWc", hint: "Берётся из поля «Puissance» объекта" },
  { value: "roof_m2", label: "площадь кровли, м²", hint: "Берётся из поля «Surface toiture» объекта" },
  { value: "panels", label: "число панелей", hint: "Берётся из поля «Nombre de panneaux» объекта" },
  { value: "cable_m", label: "длина кабеля AC, м", hint: "Берётся из поля «Longueur câble AC» объекта" },
  { value: "weeks", label: "недели работы", hint: "ceil(рабочих дней объекта / 5)" },
];

export type ObjectParams = { power: number | null; roof: number | null; panels: number | null; cable: number | null; weeks: number | null };

/** Количество по правилу; null = значение не определено (параметр объекта не заполнен) - тогда остаётся то, что есть. */
export function autoQty(source: string, p: ObjectParams): number | null {
  switch (source) {
    case "fixed":
      return 1;
    case "power":
      return p.power && p.power > 0 ? p.power : null;
    case "roof_m2":
      return p.roof && p.roof > 0 ? p.roof : null;
    case "panels":
      return p.panels && p.panels > 0 ? p.panels : null;
    case "cable_m":
      return p.cable && p.cable > 0 ? p.cable : null;
    case "weeks":
      return p.weeks && p.weeks > 0 ? p.weeks : null;
    default:
      return null;
  }
}

/** Недель работы по плановым датам: рабочих дней от первой даты до последней, делённые на 5, с округлением вверх. */
export function weeksFromWorkingDays(workingDays: number): number | null {
  return workingDays > 0 ? Math.ceil(workingDays / 5) : null;
}
