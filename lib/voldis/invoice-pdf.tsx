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

const NAVY = "#1e3a64";
const GREY = "#8a8f98";
/** NIC de l'établissement VOLDIS (SIRET 944 722 735 00015, voir les baux) : la fiche société ne stocke que le SIREN. */
const VOLDIS_NIC = "00015";
const spaced = (v: string | null | undefined, group: number) => (v ?? "").replace(/\s+/g, "").replace(new RegExp(`(.{${group}})`, "g"), "$1 ").trim();
const sirenFmt = (v: string | null | undefined) => (v ?? "").replace(/\s+/g, "").replace(/(\d{3})(\d{3})(\d{3})/, "$1 $2 $3");
const pct = (n: number) => `${num(n).toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;

const lab = { fontSize: 7, color: GREY, letterSpacing: 0.6, fontWeight: 700 } as const;

function InvoiceDoc({ cfg, tenant, invoice }: { cfg: VSettings; tenant: VTenant | null; invoice: VInvoice }) {
  const addrParts = (cfg.address ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  const siret = cfg.siren ? `${sirenFmt(cfg.siren)} ${VOLDIS_NIC}` : "";
  const dueText = !invoice.due_date || invoice.due_date === invoice.issue_date ? "À réception" : date(invoice.due_date);
  const period = invoice.period_start && invoice.period_end ? `du ${date(invoice.period_start)} au ${date(invoice.period_end)}` : date(invoice.issue_date);
  const C = { label: "34%", q: "6%", pu: "14%", tva: "9%", ht: "13%", mtva: "12%", ttc: "12%" };
  const blanks = Math.max(0, 5 - invoice.lines.length);
  const isDeposit = invoice.lines.length > 0 && invoice.lines.every((l: InvoiceLine) => /^dépôt de garantie/i.test(l.label));
  return (
    <Document title={`Facture ${invoice.number}`}>
      <Page size="A4" style={[s.page, { paddingTop: 50, paddingHorizontal: 44, fontSize: 8.5 }]}>
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <View style={{ width: "55%" }}>
            <Text style={{ fontSize: 20, lineHeight: 1.2, fontWeight: 700, color: NAVY, marginBottom: 8 }}>{cfg.company_name}</Text>
            {cfg.legal_form ? <Text style={{ color: GREY, fontSize: 8.5, lineHeight: 1.45 }}>{cfg.legal_form} au capital de 1 000 €</Text> : null}
            {addrParts.map((x, i) => (
              <Text key={i} style={{ color: GREY, fontSize: 8.5, lineHeight: 1.45 }}>{x}</Text>
            ))}
            {siret ? <Text style={{ color: GREY, fontSize: 8.5, lineHeight: 1.45 }}>SIRET {siret} · RCS Toulouse</Text> : null}
            <Text style={{ color: GREY, fontSize: 8.5, lineHeight: 1.45 }}>N° TVA intracom. : {cfg.vat_number ?? "Pas de n° TVA valide"}</Text>
          </View>
          <View style={{ width: "42%" }}>
            <Text style={{ fontSize: 22, lineHeight: 1.2, fontWeight: 700, color: NAVY, textAlign: "right", marginBottom: 8 }}>FACTURE</Text>
            {[
              ["N°", invoice.number],
              ["Date d\u2019émission", date(invoice.issue_date)],
              ["Date d\u2019échéance", dueText],
            ].map(([k, v]) => (
              <View key={k} style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 3 }}>
                <Text style={{ color: GREY, width: "55%", textAlign: "right", fontSize: 8.5 }}>{k}</Text>
                <Text style={{ fontWeight: 700, width: "45%", textAlign: "right", fontSize: 8.5 }}>{v}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 34, marginBottom: 26 }}>
          <View style={{ width: "50%" }}>
            <Text style={lab}>DESTINATAIRE</Text>
            <Text style={{ fontSize: 10, fontWeight: 700, marginTop: 4 }}>{tenant?.name ?? ""}</Text>
            {(tenant?.address ?? "").split(",").map((x, i) => (
              <Text key={i} style={{ color: GREY, fontSize: 8.5, lineHeight: 1.45 }}>{x.trim()}</Text>
            ))}
            {tenant?.siren ? <Text style={{ color: GREY, fontSize: 8.5, lineHeight: 1.45 }}>SIREN {sirenFmt(tenant.siren)}</Text> : null}
          </View>
          <View style={{ width: "46%", alignItems: "flex-end" }}>
            <Text style={lab}>PÉRIODE / DATE DE LA PRESTATION</Text>
            <Text style={{ marginTop: 4, fontSize: 9 }}>{period}</Text>
            <Text style={[lab, { marginTop: 8 }]}>NATURE DE L&apos;OPÉRATION</Text>
            <Text style={{ marginTop: 4, fontSize: 9 }}>{isDeposit ? "Dépôt de garantie (bail de location de locaux)" : "Prestation de services (location de locaux)"}</Text>
          </View>
        </View>

        <View style={{ flexDirection: "row", backgroundColor: NAVY, color: "#ffffff", fontWeight: 700, paddingVertical: 6 }}>
          <Text style={{ fontSize: 8.5, width: C.label, paddingLeft: 6 }}>Désignation</Text>
          <Text style={{ fontSize: 8.5, width: C.q, textAlign: "right" }}>Qté</Text>
          <Text style={{ fontSize: 8.5, width: C.pu, textAlign: "right" }}>P.U. HT</Text>
          <Text style={{ fontSize: 8.5, width: C.tva, textAlign: "right" }}>TVA</Text>
          <Text style={{ fontSize: 8.5, width: C.ht, textAlign: "right" }}>Montant HT</Text>
          <Text style={{ fontSize: 8.5, width: C.mtva, textAlign: "right" }}>Montant TVA</Text>
          <Text style={{ fontSize: 8.5, width: C.ttc, paddingRight: 6, textAlign: "right" }}>Total TTC</Text>
        </View>
        {invoice.lines.map((l: InvoiceLine, i: number) => (
          <View key={i} style={{ flexDirection: "row", paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: "#e6e8ec" }} wrap={false}>
            <Text style={{ fontSize: 8.5, width: C.label, paddingLeft: 6 }}>{l.label}</Text>
            <Text style={{ fontSize: 8.5, width: C.q, textAlign: "right" }}>1</Text>
            <Text style={{ fontSize: 8.5, width: C.pu, textAlign: "right" }}>{eur(l.amount_ht)}</Text>
            <Text style={{ fontSize: 8.5, width: C.tva, textAlign: "right" }}>{pct(l.vat_rate)}</Text>
            <Text style={{ fontSize: 8.5, width: C.ht, textAlign: "right" }}>{eur(l.amount_ht)}</Text>
            <Text style={{ fontSize: 8.5, width: C.mtva, textAlign: "right" }}>{eur(l.vat)}</Text>
            <Text style={{ fontSize: 8.5, width: C.ttc, paddingRight: 6, textAlign: "right" }}>{eur(l.amount_ttc)}</Text>
          </View>
        ))}
        {Array.from({ length: blanks }).map((_, i) => (
          <View key={`b${i}`} style={{ height: 20, borderBottomWidth: 1, borderBottomColor: "#e6e8ec" }} />
        ))}

        <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 22 }} wrap={false}>
          <View style={{ width: "55%" }}>
            <Text style={lab}>RÈGLEMENT</Text>
            <Text style={{ marginTop: 5, fontSize: 9 }}>{cfg.payment_terms}</Text>
            {invoice.notes ? <Text style={{ marginTop: 3, fontSize: 9 }}>{invoice.notes}</Text> : null}
            {cfg.iban ? <Text style={{ marginTop: 6, fontWeight: 700, fontSize: 9 }}>IBAN : {spaced(cfg.iban, 4)}</Text> : null}
            {cfg.bic ? <Text style={{ color: GREY }}>BIC : {cfg.bic}</Text> : null}
            <Text style={{ color: GREY, marginTop: 3 }}>Titulaire du compte : {cfg.company_name}</Text>
          </View>
          <View style={{ width: "40%" }}>
            {[
              ["Total HT", eur(invoice.total_ht)],
              ["Total TVA", eur(invoice.vat_amount)],
              ["Total TTC", eur(invoice.total_ttc)],
            ].map(([k, v]) => (
              <View key={k} style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
                <Text style={{ color: GREY, width: "55%", textAlign: "right", fontSize: 8.5 }}>{k}</Text>
                <Text style={{ width: "45%", textAlign: "right", fontSize: 8.5 }}>{v}</Text>
              </View>
            ))}
            <View style={{ flexDirection: "row", justifyContent: "space-between", backgroundColor: NAVY, color: "#ffffff", fontWeight: 700, paddingVertical: 7, paddingHorizontal: 10, marginTop: 8 }}>
              <Text>NET À PAYER</Text>
              <Text style={{ fontSize: 10 }}>{eur(invoice.total_ttc)}</Text>
            </View>
          </View>
        </View>

        <Text style={{ marginTop: 14, fontSize: 7, color: GREY, lineHeight: 1.5 }}>
          {cfg.late_penalty.replace(/\.\s*$/, "")} (art. L441-10 du Code de commerce). Pas d&apos;escompte pour paiement anticipé.
        </Text>

        <View style={{ position: "absolute", bottom: 40, left: 44, right: 44, borderTopWidth: 1, borderTopColor: "#e6e8ec", paddingTop: 6, alignItems: "center" }} fixed>
          <Text style={{ fontSize: 7, color: GREY }}>
            {cfg.company_name} · {cfg.legal_form ?? ""} · SIREN {sirenFmt(cfg.siren)} · {cfg.address ?? ""}
          </Text>
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
