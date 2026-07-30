import path from "path";
import React from "react";
import { Circle, Document, Font, Page, Path, Rect, StyleSheet, Svg, Text, View, pdf } from "@react-pdf/renderer";

/**
 * The standard PDF fonts (Times-Roman etc.) only cover WinAnsi/Latin-1 —
 * any Cyrillic in an item label, a dossier title, or a clarification note
 * (this app is bilingual FR/RU end to end) renders as garbled mojibake
 * under them. PT Sans (ParaType, OFL) was designed for Latin+Cyrillic
 * together, so it's registered here instead — see public/fonts/.
 *
 * The .ttf files here have their GSUB table stripped (via fontTools) from
 * the original ParaType release. PT Sans defines an "fi"/"fl" ligature
 * substitution in GSUB, and @react-pdf/renderer's text-shaping pipeline
 * silently drops the substituted glyph instead of drawing the ligature —
 * "confirmé" rendered as "confrmé", "Vérifier" as "Verifer", fully
 * deterministically (confirmed with a plain Node script, no Next.js
 * involved — this is a react-pdf/pdfkit bug, not a bundler quirk).
 * Ligatures aren't needed for a checklist document, so removing the GSUB
 * table entirely (rather than patching react-pdf) was the reliable fix.
 * Regular weight only is registered — Bold isn't used by this module.
 */
Font.register({
  family: "PT Sans",
  src: path.join(process.cwd(), "public/fonts/PTSans-Regular.ttf"),
});

const COLORS = {
  primary600: "#0075de",
  primary100: "#cfe7fd",
  success500: "#16a34a",
  success700: "#166534",
  success50: "#ecfdf5",
  warning500: "#d97706",
  warning700: "#92400e",
  warning50: "#fffbeb",
  warning200: "#fde68a",
  stone: "#292524",
  stoneMuted: "#78716c",
  stoneFaint: "#a8a29e",
  stoneLine: "#e7e5e4",
  stoneBg: "#fafaf9",
};

const styles = StyleSheet.create({
  page: { paddingTop: 0, paddingBottom: 56, paddingHorizontal: 40, fontFamily: "PT Sans", fontSize: 10.5, color: COLORS.stone },
  headerBar: { backgroundColor: COLORS.primary600, paddingHorizontal: 40, paddingVertical: 20, marginBottom: 20 },
  headerTitle: { color: "#ffffff", fontSize: 18 },
  headerSubtitle: { color: COLORS.primary100, fontSize: 10, marginTop: 4 },
  infoRow: { flexDirection: "row", gap: 28, marginBottom: 16 },
  infoLabel: { fontSize: 7.5, textTransform: "uppercase", color: COLORS.stoneFaint, letterSpacing: 0.8 },
  infoValue: { fontSize: 12, color: COLORS.stone, marginTop: 2 },
  summaryRow: { flexDirection: "row", gap: 8, marginBottom: 14 },
  summaryPill: { flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5 },
  summaryText: { fontSize: 9.5 },
  noticeBox: {
    backgroundColor: COLORS.warning50,
    borderWidth: 1,
    borderColor: COLORS.warning200,
    borderRadius: 6,
    padding: 10,
    marginBottom: 16,
  },
  noticeText: { fontSize: 9.5, color: COLORS.warning700 },
  categoryBlock: { marginBottom: 12 },
  categoryHeader: { backgroundColor: COLORS.stoneBg, paddingVertical: 5, paddingHorizontal: 8, borderRadius: 4, marginBottom: 5 },
  categoryLabel: { fontSize: 9.5, textTransform: "uppercase", color: COLORS.stoneMuted, letterSpacing: 0.8 },
  categoryLabelRu: { fontSize: 8, color: COLORS.stoneFaint, marginTop: 1 },
  row: { flexDirection: "row", alignItems: "flex-start", paddingVertical: 3.5, paddingHorizontal: 4, gap: 8 },
  rowLabel: { fontSize: 10.5, flex: 1 },
  rowLabelInactive: { color: COLORS.stoneFaint, textDecoration: "line-through" },
  rowLabelPending: { color: COLORS.warning700 },
  noteText: { fontSize: 9, color: COLORS.warning700, maxWidth: 200, textAlign: "right" },
  footer: {
    position: "absolute",
    bottom: 22,
    left: 40,
    right: 40,
    fontSize: 8,
    color: COLORS.stoneFaint,
    textAlign: "center",
    borderTopWidth: 1,
    borderTopColor: COLORS.stoneLine,
    paddingTop: 8,
  },
});

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

/** Drawn as vector shapes (not Unicode glyphs — a symbol font isn't guaranteed
 *  to cover ✓/⚠) so the checkbox always renders correctly, matching the
 *  same active/inactive/pending language used in the on-screen checklist. */
function StatusIcon({ status }: { status: CommercialItemStatus }) {
  if (status === "active") {
    return (
      <Svg width={13} height={13} viewBox="0 0 24 24" style={{ marginTop: 2 }}>
        <Rect x={2} y={2} width={20} height={20} rx={5} fill={COLORS.success500} />
        <Path d="M6.5 12.5l3.5 3.5 7.5-8" stroke="#ffffff" strokeWidth={2.6} fill="none" />
      </Svg>
    );
  }
  if (status === "pending") {
    return (
      <Svg width={13} height={13} viewBox="0 0 24 24" style={{ marginTop: 2 }}>
        <Circle cx={12} cy={12} r={10} fill={COLORS.warning500} />
        <Rect x={11} y={6} width={2} height={7} rx={1} fill="#ffffff" />
        <Circle cx={12} cy={16.3} r={1.4} fill="#ffffff" />
      </Svg>
    );
  }
  return (
    <Svg width={13} height={13} viewBox="0 0 24 24" style={{ marginTop: 2 }}>
      <Rect x={2} y={2} width={20} height={20} rx={5} fill="none" stroke="#d6d3d1" strokeWidth={2} />
    </Svg>
  );
}

function ClientChecklistDocument({
  caseInfo,
  categories,
  items,
}: {
  caseInfo: CommercialCaseDoc;
  categories: CommercialCategoryDoc[];
  items: CommercialCaseItemDoc[];
}) {
  const activeCount = items.filter((i) => i.status === "active").length;
  const inactiveCount = items.filter((i) => i.status === "inactive").length;
  const pendingCount = items.filter((i) => i.status === "pending").length;
  const groups = groupByCategory(items, categories);

  return (
    <Document title={`Check-list — ${caseInfo.clientName} — ${caseInfo.title}`}>
      <Page size="A4" style={styles.page}>
        <View style={styles.headerBar}>
          <Text style={styles.headerTitle}>Check-list — {caseInfo.title}</Text>
          <Text style={styles.headerSubtitle}>{caseInfo.clientName}</Text>
        </View>

        <View style={{ paddingHorizontal: 0 }}>
          <View style={styles.summaryRow}>
            <View style={[styles.summaryPill, { backgroundColor: COLORS.success50 }]}>
              <Text style={[styles.summaryText, { color: COLORS.success700 }]}>{activeCount} confirmé(s)</Text>
            </View>
            <View style={[styles.summaryPill, { backgroundColor: COLORS.stoneBg }]}>
              <Text style={[styles.summaryText, { color: COLORS.stoneMuted }]}>{inactiveCount} non applicable(s)</Text>
            </View>
            {pendingCount > 0 && (
              <View style={[styles.summaryPill, { backgroundColor: COLORS.warning50 }]}>
                <Text style={[styles.summaryText, { color: COLORS.warning700 }]}>{pendingCount} en question</Text>
              </View>
            )}
          </View>

          {pendingCount > 0 && (
            <View style={styles.noticeBox}>
              <Text style={styles.noticeText}>
                Merci de nous préciser les points marqués « à confirmer » ci-dessous, afin que nous puissions
                finaliser votre dossier.
              </Text>
            </View>
          )}

          {groups.map((group) => (
            <View key={group.category.code} style={styles.categoryBlock} wrap={false}>
              <View style={styles.categoryHeader}>
                <Text style={styles.categoryLabel}>{group.category.label}</Text>
              </View>
              {group.items.map((item) => (
                <View key={item.label + item.position} style={styles.row}>
                  <StatusIcon status={item.status} />
                  <Text
                    style={{
                      ...styles.rowLabel,
                      ...(item.status === "inactive" ? styles.rowLabelInactive : {}),
                      ...(item.status === "pending" ? styles.rowLabelPending : {}),
                    }}
                  >
                    {item.label}
                  </Text>
                  {item.status === "pending" && <Text style={styles.noteText}>{item.note || "à confirmer"}</Text>}
                </View>
              ))}
            </View>
          ))}
        </View>

        <Text style={styles.footer} fixed>
          Document généré automatiquement — les points « à confirmer » nécessitent votre retour avant la suite du
          dossier.
        </Text>
      </Page>
    </Document>
  );
}

function TeamWorkOrderDocument({
  caseInfo,
  categories,
  items,
}: {
  caseInfo: CommercialCaseDoc;
  categories: CommercialCategoryDoc[];
  items: CommercialCaseItemDoc[];
}) {
  const activeItems = items.filter((i) => i.status === "active");
  const groups = groupByCategory(activeItems, categories);

  return (
    <Document title={`Ordre de travail — ${caseInfo.clientName} — ${caseInfo.title}`}>
      <Page size="A4" style={styles.page}>
        <View style={styles.headerBar}>
          <Text style={styles.headerTitle}>Ordre de travail / Наряд на работу</Text>
          <Text style={styles.headerSubtitle}>
            {caseInfo.clientName} — {caseInfo.title}
          </Text>
        </View>

        <View>
          {(caseInfo.desiredStartDate || caseInfo.desiredEndDate) && (
            <View style={styles.infoRow}>
              {caseInfo.desiredStartDate && (
                <View>
                  <Text style={styles.infoLabel}>Début / Начало</Text>
                  <Text style={styles.infoValue}>{caseInfo.desiredStartDate}</Text>
                </View>
              )}
              {caseInfo.desiredEndDate && (
                <View>
                  <Text style={styles.infoLabel}>Fin / Окончание</Text>
                  <Text style={styles.infoValue}>{caseInfo.desiredEndDate}</Text>
                </View>
              )}
            </View>
          )}

          {groups.map((group) => (
            <View key={group.category.code} style={styles.categoryBlock} wrap={false}>
              <View style={styles.categoryHeader}>
                <Text style={styles.categoryLabel}>{group.category.label}</Text>
                <Text style={styles.categoryLabelRu}>{group.category.labelRu}</Text>
              </View>
              {group.items.map((item) => (
                <View key={item.label + item.position} style={styles.row}>
                  <StatusIcon status="active" />
                  <Text style={styles.rowLabel}>{item.label}</Text>
                </View>
              ))}
            </View>
          ))}
        </View>

        <Text style={styles.footer} fixed>
          Sans prix — pour information des équipes uniquement / Без цен — только для информации бригад.
        </Text>
      </Page>
    </Document>
  );
}

function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on("data", (chunk) => chunks.push(chunk as Buffer));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);
  });
}

export async function renderClientChecklistPdf(
  caseInfo: CommercialCaseDoc,
  categories: CommercialCategoryDoc[],
  items: CommercialCaseItemDoc[]
): Promise<Buffer> {
  const stream = await pdf(<ClientChecklistDocument caseInfo={caseInfo} categories={categories} items={items} />).toBuffer();
  return streamToBuffer(stream);
}

export async function renderTeamWorkOrderPdf(
  caseInfo: CommercialCaseDoc,
  categories: CommercialCategoryDoc[],
  items: CommercialCaseItemDoc[]
): Promise<Buffer> {
  const stream = await pdf(<TeamWorkOrderDocument caseInfo={caseInfo} categories={categories} items={items} />).toBuffer();
  return streamToBuffer(stream);
}
