"use client";

export type Sheet = { name: string; rows: string[][] };

/** Лист таблицы « Compte rendu » как есть: строки и колонки, первая колонка закреплена, заголовки разделов выделены. */
export default function SheetGrid({ sheet }: { sheet: Sheet }) {
  const cols = Math.max(...sheet.rows.map((r) => r.length), 1);
  return (
    <div className="max-h-[70vh] overflow-auto rounded-xl border border-stone-200 bg-white">
      <table className="border-collapse text-[13px]">
        <tbody>
          {sheet.rows.map((r, i) => {
            const empty = !r.some(Boolean);
            const lead = r[0] ?? "";
            const heading = !!lead && r.slice(1).every((c) => !c) && lead.length < 90;
            return (
              <tr key={i} className={empty ? "h-3" : heading ? "bg-stone-100" : "border-t border-stone-100"}>
                {Array.from({ length: cols }, (_, j) => {
                  const v = r[j] ?? "";
                  return (
                    <td
                      key={j}
                      className={`px-2.5 py-1.5 align-top ${j === 0 ? "sticky left-0 z-10 min-w-[11rem] max-w-[22rem] whitespace-pre-line font-semibold" : "whitespace-pre-line text-stone-800"} ${j === 0 && !heading ? "bg-white" : ""} ${v === "✓" ? "text-center font-bold text-success-700" : ""}`}
                    >
                      {v}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
