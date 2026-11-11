/**
 * Справочник штрафов контролёра - из таблицы « Ошибки штраф.numbers »
 * (лист ШТРАФЫ, колонка « Цена х3 »), обновлён 11/11/2026 (3.6 = 150; 3.7 « CDC и Capo » = 150, 3.8 удалён; 1.2 убран) - заменяет версию от 10/11/2026.
 * Суммы - на команду из 3 человек : на одного человека штраф = сумма ÷ 3
 * (PENALTY_DEFAULT_DIVISOR). Цены « за шт. » (1.9 = 10 €, 3.2 = 5 €, 3.3 = 2 €) и « в день »
 * (3.1 = 5 €). Строки « стоимость кабеля / CDC + время на работы » и « увольнение, минус 100 % банк »
 * в таблице без суммы - в справочнике это unit "manual": сумму на команду вводят вручную.
 */
export type PenaltyUnit = "fixed" | "range" | "per_piece" | "per_day" | "manual";

export type PenaltyCatalogItem = {
  code: string;
  stage: string;
  description: string;
  severity: "Критическая" | "Серьёзная" | "Средняя" | "Малая" | null;
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
