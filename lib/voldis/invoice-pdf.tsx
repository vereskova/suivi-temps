import path from "path";
import React from "react";
import { Document, Font, Page, StyleSheet, Text, View, pdf } from "@react-pdf/renderer";
import { num, type InvoiceLine, type VInvoice, type VSettings, type VTenant } from "./rental";

Font.register({
  family: "PT Sans",
  fonts: [
    { src: path.join(process.cwd(), "public/fonts/PTSans-Regular.ttf"), fontWeight: "normal" },
    { src: path.join(process.cwd(), "public/fonts/PTSans-Bold.ttf"), fontWeight: "bold" },
  ],
});

const INK = "#1c1917";
const MUTED = "#78716c";
const LINE = "#e7e5e4";

const s = StyleSheet.create({
  page: { paddingTop: 52, paddingBottom: 60, paddingHorizontal: 52, fontFamily: "PT Sans", fontSize: 10, color: INK, lineHeight: 1.35 },
  head: { flexDirection: "row", justifyContent: "space-between", marginBottom: 36 },
  company: { fontSize: 15, fontWeight: 700 },
  muted: { color: MUTED },
  title: { fontSize: 17, fontWeight: 700, textAlign: "right", lineHeight: 1.3, marginBottom: 6 },
  meta: { textAlign: "right", marginTop: 2, color: MUTED },
  parties: { flexDirection: "row", marginBottom: 28 },
  partyLabel: { fontSize: 8, color: MUTED, textTransform: "uppercase", marginBottom: 3 },
  party: { width: "50%" },
  th: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: INK, paddingBottom: 5, marginBottom: 2 },
  tr: { flexDirection: "row", paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: LINE },
  cLabel: { width: "46%" },
  cNum: { width: "18%", textAlign: "right" },
  cVat: { width: "18%", textAlign: "right" },
  totals: { marginTop: 14, alignSelf: "flex-end", width: "46%" },
  totRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 },
  totBig: { flexDirection: "row", justifyContent: "space-between", paddingTop: 7, marginTop: 5, borderTopWidth: 1, borderTopColor: INK, fontSize: 13, fontWeight: 700 },
  box: { marginTop: 30, paddingTop: 12, borderTopWidth: 1, borderTopColor: LINE },
  small: { fontSize: 8.5, color: MUTED, marginTop: 4 },
  footer: { position: "absolute", bottom: 28, left: 52, right: 52, fontSize: 8, color: MUTED, textAlign: "center" },
  para: { marginBottom: 8, fontSize: 11, lineHeight: 1.5 },
  sign: { marginTop: 36, alignItems: "flex-end" },
  // Счёт в стиле счетов VLADIS (Sinao): синяя шапка таблицы, рамка получателя, синяя полоса « Total TTC »
  fBlue: { color: "#1f4aa8" },
  fTitle: { fontSize: 24, color: "#b5b5b5", textAlign: "right" },
  fBrand: { fontSize: 26, fontWeight: 700, color: "#1f4aa8", letterSpacing: 1, lineHeight: 1.15 },
  fBox: { borderWidth: 1, borderColor: "#cfcfcf", paddingVertical: 12, paddingHorizontal: 14, alignItems: "center", marginTop: 18 },
  fTh: { flexDirection: "row", backgroundColor: "#1f4aa8", color: "#ffffff", fontWeight: 700 },
  fTr: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#e4e4e4" },
  fCell: { paddingVertical: 7, paddingHorizontal: 8 },
  fTot: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 7, paddingHorizontal: 10, backgroundColor: "#eef0f3" },
  fTotBlue: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 8, paddingHorizontal: 10, backgroundColor: "#1f4aa8", color: "#ffffff", fontWeight: 700 },
  fRib: { borderWidth: 1, borderColor: "#d6d6d6", padding: 10, width: "48%" },
});

const eur = (n: number) => `${num(n).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/[  ]/g, " ")} €`;
const date = (iso: string | null) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "");

function Header({ cfg, invoice, title }: { cfg: VSettings; invoice: VInvoice; title: string }) {
  return (
    <View style={s.head}>
      <View>
        <Text style={s.company}>{cfg.company_name}</Text>
        {cfg.legal_form ? <Text style={s.muted}>{cfg.legal_form}</Text> : null}
        {cfg.address ? <Text>{cfg.address}</Text> : null}
        {cfg.siren ? <Text style={s.muted}>SIREN {cfg.siren}</Text> : null}
        {cfg.vat_number ? <Text style={s.muted}>TVA {cfg.vat_number}</Text> : null}
      </View>
      <View>
        <Text style={s.title}>{title}</Text>
        <Text style={s.meta}>N° {invoice.number}</Text>
        <Text style={s.meta}>Date : {date(invoice.issue_date)}</Text>
        {invoice.due_date && invoice.kind === "invoice" ? <Text style={s.meta}>Échéance : {date(invoice.due_date)}</Text> : null}
      </View>
    </View>
  );
}

function Parties({ tenant }: { tenant: VTenant | null }) {
  return (
    <View style={s.parties}>
      <View style={s.party} />
      <View style={s.party}>
        <Text style={s.partyLabel}>Destinataire</Text>
        <Text style={{ fontWeight: 700 }}>{tenant?.name ?? ""}</Text>
        {tenant?.address ? <Text>{tenant.address}</Text> : null}
        {tenant?.siren ? <Text style={s.muted}>SIREN {tenant.siren}</Text> : null}
      </View>
    </View>
  );
}

function Footer({ cfg }: { cfg: VSettings }) {
  const parts = [cfg.company_name, cfg.legal_form, cfg.siren ? `SIREN ${cfg.siren}` : null, cfg.vat_number ? `TVA ${cfg.vat_number}` : null].filter(Boolean);
  return <Text style={s.footer} fixed>{parts.join(" · ")}</Text>;
}

function InvoiceDoc({ cfg, tenant, invoice }: { cfg: VSettings; tenant: VTenant | null; invoice: VInvoice }) {
  const vatLines = invoice.lines.filter((l: InvoiceLine) => num(l.vat) > 0);
  const vatRate = vatLines.length ? vatLines[0].vat_rate : 0;
  const periodText = invoice.period_start && invoice.period_end ? `Période : du ${date(invoice.period_start)} au ${date(invoice.period_end)}` : "";
  const legal = [cfg.legal_form ? `${cfg.company_name} ${cfg.legal_form}` : cfg.company_name, cfg.siren ? `SIREN ${cfg.siren}` : null, cfg.vat_number ? `N°TVA ${cfg.vat_number}` : null].filter(Boolean).join(" - ");
  const COLS = { n: "7%", label: "41%", q: "11%", u: "11%", pu: "15%", tot: "15%" };
  return (
    <Document title={`Facture ${invoice.number}`}>
      <Page size="A4" style={s.page}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 14 }}>
          <View>
            <Text style={s.fBrand}>{cfg.company_name}</Text>
            {cfg.legal_form ? <Text style={[s.muted, { marginTop: 2 }]}>{cfg.legal_form}</Text> : null}
          </View>
          <Text style={s.fTitle}>FACTURE</Text>
        </View>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
          <View style={{ width: "46%", fontSize: 11, lineHeight: 1.4 }}>
            {(cfg.address ?? "").split(",").map((part, i) => (
              <Text key={i}>{part.trim()}</Text>
            ))}
            <Text>France</Text>
            {cfg.phone ? <Text>{cfg.phone}</Text> : null}
            {cfg.email ? <Text>{cfg.email}</Text> : null}
          </View>
          <View style={{ width: "50%" }}>
            <View style={s.fBox}>
              <Text style={{ fontWeight: 700, fontSize: 11 }}>{tenant?.name ?? ""}</Text>
              {tenant?.address ? <Text style={{ fontSize: 11 }}>{tenant.address}</Text> : null}
            </View>
            {tenant?.siren ? <Text style={{ textAlign: "right", marginTop: 8, fontSize: 11 }}>SIREN {tenant.siren}</Text> : null}
          </View>
        </View>

        <View style={{ marginTop: 18, marginBottom: 14, fontSize: 11 }}>
          <View style={{ flexDirection: "row" }}>
            <Text style={{ width: 110 }}>N° Facture :</Text>
            <Text>{invoice.number}</Text>
          </View>
          <View style={{ flexDirection: "row" }}>
            <Text style={{ width: 110 }}>Date d&apos;écriture :</Text>
            <Text>{date(invoice.issue_date)}</Text>
          </View>
        </View>
        {periodText ? <Text style={{ marginBottom: 12, fontSize: 11 }}>{periodText}</Text> : null}

        <View style={s.fTh}>
          <Text style={[s.fCell, { width: COLS.n }]}>N°</Text>
          <Text style={[s.fCell, { width: COLS.label, textAlign: "center" }]}>Désignation</Text>
          <Text style={[s.fCell, { width: COLS.q, textAlign: "center" }]}>Quantité</Text>
          <Text style={[s.fCell, { width: COLS.u, textAlign: "center" }]}>Unité</Text>
          <Text style={[s.fCell, { width: COLS.pu, textAlign: "right" }]}>P.U HT</Text>
          <Text style={[s.fCell, { width: COLS.tot, textAlign: "right" }]}>Total HT</Text>
        </View>
        {invoice.lines.map((l: InvoiceLine, i: number) => (
          <View key={i} style={s.fTr} wrap={false}>
            <Text style={[s.fCell, { width: COLS.n }]}>1.{i + 1}</Text>
            <Text style={[s.fCell, { width: COLS.label }]}>{l.label}</Text>
            <Text style={[s.fCell, { width: COLS.q, textAlign: "right" }]}>1,00</Text>
            <Text style={[s.fCell, { width: COLS.u }]}>mois</Text>
            <Text style={[s.fCell, { width: COLS.pu, textAlign: "right" }]}>{eur(l.amount_ht)}</Text>
            <Text style={[s.fCell, { width: COLS.tot, textAlign: "right" }]}>{eur(l.amount_ht)}</Text>
          </View>
        ))}
        <Text style={{ textAlign: "right", paddingVertical: 6, paddingHorizontal: 8, fontSize: 10.5 }}>Sous-total HT : {eur(invoice.total_ht)}</Text>

        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginTop: 4 }}>
          <View style={s.fRib}>
            <Text style={[s.muted, { textAlign: "center", marginBottom: 4 }]}>RIB {cfg.company_name}</Text>
            {cfg.iban ? <Text style={[s.muted, { fontSize: 9 }]}>IBAN : {cfg.iban}</Text> : null}
            {cfg.bic ? <Text style={[s.muted, { fontSize: 9 }]}>BIC/SWIFT : {cfg.bic}</Text> : null}
          </View>
          <View style={{ width: "48%" }}>
            <View style={s.fTot}>
              <Text style={{ fontWeight: 700 }}>Total € HT</Text>
              <Text>{eur(invoice.total_ht)}</Text>
            </View>
            {num(invoice.vat_amount) > 0 ? (
              <View style={s.fTot}>
                <Text>TVA {vatRate} %</Text>
                <Text>{eur(invoice.vat_amount)}</Text>
              </View>
            ) : null}
            <View style={s.fTotBlue}>
              <Text>Total TTC</Text>
              <Text>{eur(invoice.total_ttc)}</Text>
            </View>
          </View>
        </View>

        <View style={{ marginTop: 26, alignItems: "center" }}>
          {invoice.notes ? <Text style={{ fontSize: 11, marginBottom: 6 }}>{invoice.notes}</Text> : null}
          <Text style={{ fontSize: 11 }}>{cfg.payment_terms}</Text>
        </View>
        <Text style={{ marginTop: 22, fontSize: 8.5, color: MUTED, lineHeight: 1.4 }}>{cfg.late_penalty}</Text>

        <View style={{ position: "absolute", bottom: 30, left: 52, right: 52, alignItems: "center" }} fixed>
          <Text style={{ fontSize: 8, color: MUTED, textAlign: "center" }}>{legal}</Text>
          <Text style={{ fontSize: 8, color: MUTED, textAlign: "center" }}>
            {cfg.address ?? ""}{cfg.phone ? ` - Tél. ${cfg.phone}` : ""}{cfg.email ? ` - ${cfg.email}` : ""}
          </Text>
          <Text style={{ fontSize: 7.5, color: MUTED, alignSelf: "flex-end", marginTop: 6 }}>{invoice.number} - 1/1</Text>
        </View>
      </Page>
    </Document>
  );
}

function ReceiptDoc({ cfg, tenant, invoice }: { cfg: VSettings; tenant: VTenant | null; invoice: VInvoice }) {
  const period = invoice.period_start && invoice.period_end ? `du ${date(invoice.period_start)} au ${date(invoice.period_end)}` : "";
  return (
    <Document title={`Quittance ${invoice.number}`}>
      <Page size="A4" style={s.page}>
        <Header cfg={cfg} invoice={invoice} title="QUITTANCE DE LOYER" />
        <Parties tenant={tenant} />
        <Text style={s.para}>
          Je soussigné, {cfg.company_name}, déclare avoir reçu de {tenant?.name ?? "-"} la somme de {eur(invoice.total_ttc)}
          {period ? `, au titre du loyer et des charges de la période ${period}` : ""}, et lui en donne quittance, sous réserve de tous mes droits.
        </Text>
        <View style={s.th}>
          <Text style={[s.cLabel, { fontWeight: 700 }]}>Détail</Text>
          <Text style={[s.cNum, { fontWeight: 700 }]}>Montant HT</Text>
          <Text style={[s.cVat, { fontWeight: 700 }]}>TVA</Text>
          <Text style={[s.cNum, { fontWeight: 700 }]}>Total TTC</Text>
        </View>
        {invoice.lines.map((l: InvoiceLine, i: number) => (
          <View key={i} style={s.tr} wrap={false}>
            <Text style={s.cLabel}>{l.label}</Text>
            <Text style={s.cNum}>{eur(l.amount_ht)}</Text>
            <Text style={s.cVat}>{l.vat_rate ? `${l.vat_rate} % · ${eur(l.vat)}` : "-"}</Text>
            <Text style={s.cNum}>{eur(l.amount_ttc)}</Text>
          </View>
        ))}
        <View style={s.totals}>
          <View style={s.totBig}><Text>Total reçu</Text><Text>{eur(invoice.total_ttc)}</Text></View>
        </View>
        {invoice.notes ? <Text style={s.small}>{invoice.notes}</Text> : null}
        <View style={s.sign} wrap={false}>
          <Text>Fait à Baziège, le {date(invoice.issue_date)}</Text>
          <Text style={{ fontWeight: 700, marginTop: 4 }}>{cfg.company_name}</Text>
        </View>
        <Footer cfg={cfg} />
      </Page>
    </Document>
  );
}

function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on("data", (c) => chunks.push(c as Buffer));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);
  });
}

export async function renderInvoicePdf(cfg: VSettings, tenant: VTenant | null, invoice: VInvoice): Promise<Buffer> {
  const doc = invoice.kind === "receipt" ? <ReceiptDoc cfg={cfg} tenant={tenant} invoice={invoice} /> : <InvoiceDoc cfg={cfg} tenant={tenant} invoice={invoice} />;
  return streamToBuffer(await pdf(doc).toBuffer());
}
