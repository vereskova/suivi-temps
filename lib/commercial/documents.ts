import { b, centered, DocContent, p, para, rule, t } from "@/lib/documents/types";

export type CommercialItemStatus = "active" | "inactive" | "pending";

export type CommercialCaseItemDoc = {
  categoryCode: string;
  label: string;
  status: CommercialItemStatus;
  note: string | null;
  position: number;
};

export type CommercialCategoryDoc = {
  code: string;
  label: string;
  labelRu: string;
  sortOrder: number;
};

export type CommercialCaseDoc = {
  title: string;
  clientName: string;
  desiredStartDate: string | null;
  desiredEndDate: string | null;
};

function groupByCategory<T extends { categoryCode: string; position: number }>(
  items: T[],
  categories: CommercialCategoryDoc[]
): { category: CommercialCategoryDoc; items: T[] }[] {
  const byCode = new Map(categories.map((c) => [c.code, c]));
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const list = groups.get(item.categoryCode) ?? [];
    list.push(item);
    groups.set(item.categoryCode, list);
  }
  return [...groups.entries()]
    .map(([code, list]) => ({
      category: byCode.get(code) ?? { code, label: code, labelRu: code, sortOrder: 999 },
      items: list.sort((a, b) => a.position - b.position),
    }))
    .sort((a, b) => a.category.sortOrder - b.category.sortOrder);
}

/**
 * Client-facing document (button 1) — French only, sent to the client so
 * they react and fill in whatever's still "en question". Lists everything:
 * active items confirmed, inactive marked not-needed, pending highlighted
 * with an exclamation mark and its clarification note (if any).
 */
export function buildClientChecklistDoc(
  caseInfo: CommercialCaseDoc,
  categories: CommercialCategoryDoc[],
  items: CommercialCaseItemDoc[]
): DocContent {
  const title = `Check-list — ${caseInfo.clientName} — ${caseInfo.title}`;
  const blocks: DocContent["blocks"] = [
    { type: "title", text: title },
    rule(),
    para(`Client : ${caseInfo.clientName}`),
    para(`Dossier : ${caseInfo.title}`),
  ];

  const pendingCount = items.filter((i) => i.status === "pending").length;
  if (pendingCount > 0) {
    blocks.push(
      para(
        `⚠ ${pendingCount} point(s) restent à confirmer avec vous — merci de bien vouloir nous répondre sur les lignes marquées ci-dessous.`
      )
    );
  }
  blocks.push({ type: "spacer" });

  for (const group of groupByCategory(items, categories)) {
    blocks.push({ type: "heading", text: group.category.label });
    for (const item of group.items) {
      if (item.status === "active") {
        blocks.push(p(t("✓  "), t(item.label)));
      } else if (item.status === "inactive") {
        blocks.push(p(t("—  "), t(`${item.label} (non applicable)`)));
      } else {
        blocks.push(p(t("⚠  "), b(`${item.label} — À CONFIRMER`)));
        if (item.note) {
          blocks.push(para(`     ${item.note}`));
        }
      }
    }
  }

  return { title, blocks };
}

/**
 * Team-facing work order (button 3) — bilingual FR/RU like the rest of the
 * app's crew-facing surfaces (pointage form). Active items only, grouped by
 * category, deliberately no pricing — scope and timing only.
 */
export function buildTeamWorkOrderDoc(
  caseInfo: CommercialCaseDoc,
  categories: CommercialCategoryDoc[],
  items: CommercialCaseItemDoc[]
): DocContent {
  const title = `Ordre de travail — ${caseInfo.clientName} — ${caseInfo.title}`;
  const blocks: DocContent["blocks"] = [
    { type: "title", text: title },
    centered("Client / Клиент : " + caseInfo.clientName),
    rule(),
    para(`Chantier / Объект : ${caseInfo.title}`),
  ];

  if (caseInfo.desiredStartDate) {
    blocks.push(para(`Début souhaité / Желаемое начало : ${caseInfo.desiredStartDate}`));
  }
  if (caseInfo.desiredEndDate) {
    blocks.push(para(`Fin souhaitée / Желаемое окончание : ${caseInfo.desiredEndDate}`));
  }
  blocks.push({ type: "spacer" });

  const activeItems = items.filter((i) => i.status === "active");
  for (const group of groupByCategory(activeItems, categories)) {
    blocks.push({ type: "heading", text: `${group.category.label} / ${group.category.labelRu}` });
    blocks.push({ type: "list", items: group.items.map((i) => i.label) });
  }

  return { title, blocks };
}
