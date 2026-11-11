import ExcelJS from "exceljs";

// Смета объекта в Excel в формате Modele_DEVIS_VLADIS : разделы -> позиции -> подпозиции, суммы формулами.
// Дни по нормам (зелёные колонки шаблона) в документ для клиента не попадают.

export type DevisSub = { label?: string; measure_unit?: string | null };
export type DevisLine = { position: number; section_code: string | null; label: string; unit: string | null; qty: number; price_ht: number | null; measure: number | null; subs: DevisSub[] | null };

export function buildDevisWorkbook(obj: { name: string; power_kwc: number | null }, lines: DevisLine[], sections: { code: string; label: string }[]): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("DEVIS");
  ws.columns = [{ width: 6 }, { width: 62 }, { width: 11 }, { width: 11 }, { width: 15 }, { width: 17 }];
  const font = { name: "Arial", size: 10 };
  const EUR = '#,##0.00" €"';
  const BLUE = "FF2B4AA8";
  const GREY = "FFE9EDF4";

  ws.getCell("A1").value = "VLADIS";
  ws.getCell("A1").font = { name: "Arial", size: 16, bold: true };
  ws.mergeCells("A2:F2");
  const kwc = obj.power_kwc ? ` ${Number(obj.power_kwc).toLocaleString("fr-FR")} kWc ` : "";
  ws.getCell("A2").value = `${String(obj.name).toUpperCase()}_${kwc}`;
  ws.getCell("A2").font = { name: "Arial", size: 12, bold: true };

  const head = ["N°", "Désignation", "Quantité", "Unité", "P.U HT", "Total HT"];
  head.forEach((h, i) => {
    const c = ws.getCell(4, i + 1);
    c.value = h;
    c.font = { ...font, bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BLUE } };
    c.alignment = { horizontal: i >= 2 ? "right" : "left", vertical: "middle" };
  });

  const all = lines;
  const groups = [
    ...sections.map((s) => ({ label: s.label, items: all.filter((l) => l.section_code === s.code) })),
    { label: "AUTRES TRAVAUX", items: all.filter((l) => !l.section_code || !sections.some((s) => s.code === l.section_code)) },
  ].filter((g) => g.items.length > 0);

  let row = 5;
  const subtotalCells: string[] = [];
  groups.forEach((g, gi) => {
    for (let c = 1; c <= 6; c++) ws.getCell(row, c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: GREY } };
    ws.getCell(row, 1).value = gi + 1;
    ws.getCell(row, 2).value = g.label;
    ws.getCell(row, 1).font = { ...font, bold: true };
    ws.getCell(row, 2).font = { ...font, bold: true };
    row++;
    const first = row;
    for (const l of g.items) {
      ws.getCell(row, 2).value = l.label;
      ws.getCell(row, 2).alignment = { indent: 1, wrapText: true, vertical: "top" };
      ws.getCell(row, 3).value = Number(l.qty);
      ws.getCell(row, 4).value = l.unit ?? "";
      if (l.price_ht != null) {
        ws.getCell(row, 5).value = Number(l.price_ht);
        ws.getCell(row, 5).numFmt = EUR;
        ws.getCell(row, 6).value = { formula: `C${row}*E${row}` };
        ws.getCell(row, 6).numFmt = EUR;
      }
      for (let c = 1; c <= 6; c++) ws.getCell(row, c).font = font;
      ws.getCell(row, 3).numFmt = "#,##0.##";
      row++;
      const subs = Array.isArray(l.subs) ? l.subs : [];
      for (const s of subs) {
        const text = `${s.measure_unit && l.measure != null ? `${l.measure} ${s.measure_unit}\n` : ""}${s.label ?? ""}`.trim();
        if (!text) continue;
        ws.mergeCells(row, 1, row, 6);
        const c = ws.getCell(row, 1);
        c.value = text;
        c.font = { ...font, size: 9 };
        c.alignment = { wrapText: true, vertical: "top" };
        const visual = text.split("\n").reduce((n, ln) => n + Math.max(1, Math.ceil(ln.length / 105)), 0);
        ws.getRow(row).height = Math.max(15, visual * 12.5);
        row++;
      }
    }
    const last = row - 1;
    ws.getCell(row, 5).value = "Sous-total HT :";
    ws.getCell(row, 5).font = { ...font, bold: true };
    ws.getCell(row, 5).alignment = { horizontal: "right" };
    ws.getCell(row, 6).value = { formula: `SUM(F${first}:F${last})` };
    ws.getCell(row, 6).numFmt = EUR;
    ws.getCell(row, 6).font = { ...font, bold: true };
    subtotalCells.push(`F${row}`);
    row += 2;
  });

  const put = (label: string, formula: string, bold = true) => {
    ws.getCell(row, 5).value = label;
    ws.getCell(row, 5).font = { ...font, bold };
    ws.getCell(row, 5).alignment = { horizontal: "right" };
    ws.getCell(row, 6).value = { formula };
    ws.getCell(row, 6).numFmt = EUR;
    ws.getCell(row, 6).font = { ...font, bold };
    row++;
  };
  const htRow = row;
  put("Total € HT", subtotalCells.length ? subtotalCells.join("+") : "0");
  put("TVA 20 %", `F${htRow}*0.2`, false);
  put("Total TTC", `F${htRow}+F${htRow + 1}`);

  return wb;
}
