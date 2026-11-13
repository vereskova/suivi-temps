import ExcelJS from "exceljs";
import { workingDaysBetween } from "@/lib/commercial-durations/compute";

// Контрандю объекта в Excel: работы, плановые даты (по нормам) и фактические, отклонение в рабочих днях, причины.
// Цен и сумм здесь нет - файл лежит в папке объекта и виден бригаде.

export type ReportRow = {
  section: string | null;
  label: string;
  qty: number;
  unit: string | null;
  days: number;
  planned_start: string | null;
  planned_end: string | null;
  actual_start: string | null;
  actual_end: string | null;
  delay_reason: string | null;
  notes?: string[];
};

const fr = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "");
const VARIANT: Record<string, string> = { standard: "Standard", lt: "Avec LT", ombriere: "Ombrière" };

export function buildReportWorkbook(obj: { name: string; team: string | null; variant: string; power_kwc: number | null; start_date: string | null }, rows: ReportRow[]): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Compte rendu");
  ws.columns = [{ width: 5 }, { width: 52 }, { width: 10 }, { width: 8 }, { width: 8 }, { width: 13 }, { width: 13 }, { width: 13 }, { width: 13 }, { width: 12 }, { width: 44 }];
  const font = { name: "Arial", size: 10 };
  const BLUE = "FF2B4AA8";
  const GREY = "FFE9EDF4";

  ws.getCell("A1").value = "VLADIS";
  ws.getCell("A1").font = { name: "Arial", size: 16, bold: true };
  ws.mergeCells("A2:K2");
  ws.getCell("A2").value = `COMPTE RENDU · КОНТРАНДЮ - ${obj.name.toUpperCase()}`;
  ws.getCell("A2").font = { name: "Arial", size: 12, bold: true };
  ws.mergeCells("A3:K3");
  const kwc = obj.power_kwc ? ` · ${Number(obj.power_kwc).toLocaleString("fr-FR")} kWc` : "";
  ws.getCell("A3").value = `${obj.team ?? ""} · ${VARIANT[obj.variant] ?? obj.variant}${kwc}${obj.start_date ? ` · старт ${fr(obj.start_date)}` : ""} · сформировано ${fr(new Date().toISOString().slice(0, 10))}`;
  ws.getCell("A3").font = { ...font, color: { argb: "FF5B6573" } };

  const head = ["№", "Работа / Désignation", "Кол-во", "Ед.", "Дней", "План: начало", "План: конец", "Факт: начало", "Факт: конец", "Откл., раб.дн.", "Причина"];
  head.forEach((h, i) => {
    const c = ws.getCell(5, i + 1);
    c.value = h;
    c.font = { ...font, bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BLUE } };
    c.alignment = { horizontal: i === 1 || i === 10 ? "left" : "center", vertical: "middle", wrapText: true };
  });
  ws.getRow(5).height = 30;

  let r = 6;
  let n = 0;
  let section: string | null | undefined = undefined;
  for (const l of rows) {
    if (l.section !== section) {
      section = l.section;
      if (l.section) {
        for (let c = 1; c <= 11; c++) ws.getCell(r, c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: GREY } };
        ws.getCell(r, 2).value = l.section;
        ws.getCell(r, 2).font = { ...font, bold: true };
        r++;
      }
    }
    n++;
    ws.getCell(r, 1).value = n;
    ws.getCell(r, 2).value = l.notes && l.notes.length ? `${l.label}\n${l.notes.join("\n")}` : l.label;
    ws.getCell(r, 2).alignment = { wrapText: true, vertical: "top", indent: l.section ? 1 : 0 };
    ws.getCell(r, 3).value = Number(l.qty);
    ws.getCell(r, 4).value = l.unit ?? "";
    ws.getCell(r, 5).value = l.days || "";
    ws.getCell(r, 6).value = fr(l.planned_start);
    ws.getCell(r, 7).value = fr(l.planned_end);
    ws.getCell(r, 8).value = fr(l.actual_start);
    ws.getCell(r, 9).value = fr(l.actual_end);
    if (l.planned_end && l.actual_end) {
      const d = workingDaysBetween(l.planned_end, l.actual_end);
      ws.getCell(r, 10).value = d;
      ws.getCell(r, 10).font = { ...font, bold: true, color: { argb: d > 0 ? "FFC0392B" : "FF1E8449" } };
    }
    ws.getCell(r, 11).value = l.delay_reason ?? "";
    ws.getCell(r, 11).alignment = { wrapText: true, vertical: "top" };
    for (let c = 1; c <= 11; c++) {
      const cell = ws.getCell(r, c);
      if (!(c === 10 && l.planned_end && l.actual_end)) cell.font = font;
      if (c !== 2 && c !== 11) cell.alignment = { horizontal: "center", vertical: "top" };
      cell.border = { bottom: { style: "hair", color: { argb: "FFC9D1DC" } } };
    }
    r++;
  }

  const planEnds = rows.map((x) => x.planned_end).filter((x): x is string => !!x).sort();
  const actEnds = rows.map((x) => x.actual_end).filter((x): x is string => !!x).sort();
  const allDone = rows.length > 0 && rows.every((x) => x.actual_end);
  r += 1;
  ws.mergeCells(r, 2, r, 11);
  const total = allDone && planEnds.length && actEnds.length ? workingDaysBetween(planEnds[planEnds.length - 1], actEnds[actEnds.length - 1]) : null;
  ws.getCell(r, 2).value =
    total == null
      ? actEnds.length === 0
        ? "Контрандю для команды: плановые даты посчитаны по смете и нормам. Факт бригада вносит в своём кабинете (вкладка « Работа »), файл обновляется."
        : "Работы выполнены не полностью."
      : total > 0
        ? `ИТОГО: объект закончен с опозданием ${total} раб. дн. (план ${fr(planEnds[planEnds.length - 1])}, факт ${fr(actEnds[actEnds.length - 1])}).`
        : total < 0
          ? `ИТОГО: объект закончен на ${-total} раб. дн. раньше плана (план ${fr(planEnds[planEnds.length - 1])}, факт ${fr(actEnds[actEnds.length - 1])}).`
          : `ИТОГО: объект закончен по плану (${fr(actEnds[actEnds.length - 1])}).`;
  ws.getCell(r, 2).font = { ...font, bold: true };
  ws.views = [{ state: "frozen", ySplit: 5 }];
  return wb;
}
