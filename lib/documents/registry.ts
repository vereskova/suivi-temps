import { CompanyDoc, DocContent, EmployeeDoc } from "./types";
import { todayIso } from "./helpers";
import { contratChantier } from "./templates/contratChantier";
import { contratBureau } from "./templates/contratBureau";
import { nda } from "./templates/nda";
import { attestationConges } from "./templates/attestationConges";
import { accuseDemission } from "./templates/accuseDemission";
import { convocationEntretien } from "./templates/convocationEntretien";
import { lettreLicenciement } from "./templates/lettreLicenciement";
import { convocationRC } from "./templates/convocationRC";

export type FieldType = "date" | "text" | "textarea" | "number" | "boolean";

export type FieldSchema = {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  defaultValue?: (employee: EmployeeDoc, company: CompanyDoc) => string | number | boolean | null;
  help?: string;
};

export type DocumentCategory = "contrat" | "confidentialite" | "conges" | "rupture";

export type DocumentTypeDefinition = {
  code: string;
  label: string;
  category: DocumentCategory;
  legalRisk: boolean; // surfaced in the UI as "brouillon — à vérifier avant envoi"
  fields: FieldSchema[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  generate: (employee: EmployeeDoc, company: CompanyDoc, params: any) => DocContent;
};

export const DOCUMENT_TYPES: DocumentTypeDefinition[] = [
  {
    code: "contrat_chantier",
    label: "Contrat CDI — Chantier",
    category: "contrat",
    legalRisk: true,
    fields: [
      { key: "startDate", label: "Date de début", type: "date", required: true, defaultValue: () => todayIso() },
      { key: "trialDays", label: "Période d'essai (jours)", type: "number", required: true, defaultValue: () => 60 },
      { key: "signingDate", label: "Date de signature", type: "date", required: true, defaultValue: () => todayIso() },
      {
        key: "signingCity",
        label: "Ville de signature",
        type: "text",
        required: true,
        defaultValue: (_e, c) => c.signingCity,
      },
    ],
    generate: contratChantier,
  },
  {
    code: "contrat_bureau",
    label: "Contrat CDI — Bureau",
    category: "contrat",
    legalRisk: true,
    fields: [
      { key: "startDate", label: "Date de début", type: "date", required: true, defaultValue: () => todayIso() },
      { key: "trialDays", label: "Période d'essai (jours)", type: "number", required: true, defaultValue: () => 90 },
      { key: "signingDate", label: "Date de signature", type: "date", required: true, defaultValue: () => todayIso() },
      {
        key: "signingCity",
        label: "Ville de signature",
        type: "text",
        required: true,
        defaultValue: (_e, c) => c.signingCity,
      },
      { key: "isPartTime", label: "Temps partiel", type: "boolean", defaultValue: () => false },
      {
        key: "weeklyHours",
        label: "Heures hebdomadaires",
        type: "number",
        required: true,
        defaultValue: (e) => e.weeklyHours ?? 35,
      },
      {
        key: "mobiliteZone",
        label: "Zone de mobilité",
        type: "text",
        required: true,
        defaultValue: () => "un rayon de 50 km autour du siège social",
      },
    ],
    generate: contratBureau,
  },
  {
    code: "nda",
    label: "Accord de confidentialité (NDA)",
    category: "confidentialite",
    legalRisk: false,
    fields: [
      { key: "signingDate", label: "Date de signature", type: "date", required: true, defaultValue: () => todayIso() },
      {
        key: "signingCity",
        label: "Ville de signature",
        type: "text",
        required: true,
        defaultValue: (_e, c) => c.signingCity,
      },
    ],
    generate: nda,
  },
  {
    code: "attestation_conges",
    label: "Attestation de congés payés",
    category: "conges",
    legalRisk: false,
    fields: [
      { key: "startDate", label: "Début du congé", type: "date", required: true },
      { key: "endDate", label: "Fin du congé", type: "date", required: true },
      { key: "issueDate", label: "Date de délivrance", type: "date", required: true, defaultValue: () => todayIso() },
    ],
    generate: attestationConges,
  },
  {
    code: "accuse_demission",
    label: "Accusé de réception de démission",
    category: "rupture",
    legalRisk: true,
    fields: [
      { key: "resignationDate", label: "Date de la lettre de démission", type: "date", required: true },
      { key: "ancienneteYears", label: "Ancienneté (années)", type: "number", required: true },
      { key: "ageYears", label: "Âge du salarié (années)", type: "number" },
      { key: "dispensePreavis", label: "Dispense de préavis", type: "boolean", defaultValue: () => false },
      { key: "issueDate", label: "Date du courrier", type: "date", required: true, defaultValue: () => todayIso() },
    ],
    generate: accuseDemission,
  },
  {
    code: "convocation_entretien",
    label: "Convocation à entretien préalable (licenciement)",
    category: "rupture",
    legalRisk: true,
    fields: [
      { key: "interviewDate", label: "Date de l'entretien", type: "date", required: true },
      { key: "interviewTime", label: "Heure de l'entretien", type: "text", required: true, defaultValue: () => "9h00" },
      {
        key: "interviewLocation",
        label: "Lieu de l'entretien",
        type: "text",
        required: true,
        defaultValue: (_e, c) => c.address,
      },
      { key: "hasCse", label: "L'entreprise dispose d'un CSE", type: "boolean", defaultValue: () => false },
      { key: "issueDate", label: "Date du courrier", type: "date", required: true, defaultValue: () => todayIso() },
    ],
    generate: convocationEntretien,
  },
  {
    code: "lettre_licenciement",
    label: "Lettre de licenciement",
    category: "rupture",
    legalRisk: true,
    fields: [
      { key: "interviewDate", label: "Date de l'entretien préalable", type: "date", required: true },
      {
        key: "motifText",
        label: "Motifs détaillés du licenciement",
        type: "textarea",
        required: true,
        help: "Obligatoire — à rédiger avec précision, ce texte engage juridiquement l'entreprise.",
      },
      { key: "dispensePreavis", label: "Dispense de préavis", type: "boolean", defaultValue: () => false },
      { key: "ancienneteYears", label: "Ancienneté (années)", type: "number", required: true },
      { key: "ageYears", label: "Âge du salarié (années)", type: "number" },
      { key: "issueDate", label: "Date du courrier", type: "date", required: true, defaultValue: () => todayIso() },
    ],
    generate: lettreLicenciement,
  },
  {
    code: "convocation_rc",
    label: "Convocation — Rupture conventionnelle",
    category: "rupture",
    legalRisk: true,
    fields: [
      { key: "meetingDate", label: "Date de l'entretien", type: "date", required: true },
      { key: "meetingTime", label: "Heure de l'entretien", type: "text", required: true, defaultValue: () => "9h00" },
      {
        key: "meetingLocation",
        label: "Lieu de l'entretien",
        type: "text",
        required: true,
        defaultValue: (_e, c) => c.address,
      },
      { key: "hasCse", label: "L'entreprise dispose d'un CSE", type: "boolean", defaultValue: () => false },
      { key: "issueDate", label: "Date du courrier", type: "date", required: true, defaultValue: () => todayIso() },
    ],
    generate: convocationRC,
  },
];

export function getDocumentType(code: string): DocumentTypeDefinition | undefined {
  return DOCUMENT_TYPES.find((d) => d.code === code);
}
