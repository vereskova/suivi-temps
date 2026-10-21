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
  return (
    <Document title={`Facture ${invoice.number}`}>
      <Page size="A4" style={s.page}>
        <Header cfg={cfg} invoice={invoice} title="FACTURE" />
        <Parties tenant={tenant} />
        {invoice.period_start && invoice.period_end ? (
          <Text style={{ marginBottom: 10, color: MUTED }}>Période : du {date(invoice.period_start)} au {date(invoice.period_end)}</Text>
        ) : null}
        <View style={s.th}>
          <Text style={[s.cLabel, { fontWeight: 700 }]}>Désignation</Text>
          <Text style={[s.cNum, { fontWeight: 700 }]}>Montant HT</Text>
          <Text style={[s.cVat, { fontWeight: 700 }]}>TVA</Text>
          <Text style={[s.cNum, { fontWeight: 700 }]}>Total TTC</Text>
        </View>
        {invoice.lines.map((l: InvoiceLine, i: number) => (
          <View key={i} style={s.tr} wrap={false}>
            <Text style={s.cLabel}>{l.label}</Text>
            <Text style={s.cNum}>{eur(l.amount_ht)}</Text>
            <Text style={s.cVat}>{l.vat_rate ? `${l.vat_rate} % · ${eur(l.vat)}` : "—"}</Text>
            <Text style={s.cNum}>{eur(l.amount_ttc)}</Text>
          </View>
        ))}
        <View style={s.totals}>
          <View style={s.totRow}><Text style={s.muted}>Total HT</Text><Text>{eur(invoice.total_ht)}</Text></View>
          <View style={s.totRow}><Text style={s.muted}>TVA</Text><Text>{eur(invoice.vat_amount)}</Text></View>
          <View style={s.totBig}><Text>Total à payer</Text><Text>{eur(invoice.total_ttc)}</Text></View>
        </View>
        <View style={s.box} wrap={false}>
          <Text style={{ fontWeight: 700, marginBottom: 4 }}>Règlement</Text>
          <Text>{cfg.payment_terms}</Text>
          {cfg.iban ? <Text>IBAN : {cfg.iban}{cfg.bic ? `   ·   BIC : ${cfg.bic}` : ""}</Text> : null}
          <Text style={s.small}>{cfg.late_penalty}</Text>
        </View>
        <Footer cfg={cfg} />
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
          Je soussigné, {cfg.company_name}, déclare avoir reçu de {tenant?.name ?? "—"} la somme de {eur(invoice.total_ttc)}
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
            <Text style={s.cVat}>{l.vat_rate ? `${l.vat_rate} % · ${eur(l.vat)}` : "—"}</Text>
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
