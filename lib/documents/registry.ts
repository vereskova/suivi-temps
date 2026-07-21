import { CompanyDoc, DocContent, EmployeeDoc } from "./types";
import { todayIso } from "./helpers";
import { contratChantier } from "./templates/contratChantier";
import { contratBureau } from "./templates/contratBureau";
import { nda } from "./templates/nda";
import { attestationConges } from "./templates/attestationConges";
import { accuseDemission } from "./templates/accuseDemission";
import { lettreDemission } from "./templates/lettreDemission";
import { convocationEntretien } from "./templates/convocationEntretien";
import { lettreLicenciement } from "./templates/lettreLicenciement";
import { convocationRC } from "./templates/convocationRC";

export type FieldType = "date" | "text" | "textarea" | "number" | "boolean" | "select";

export type FieldSchema = {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  /**
   * "employee" fields are merged onto the employee record before generation (they fill in
   * gaps in the employee's profile — address, nationality, salary, etc.). "params" (default)
   * are passed straight through as document-specific parameters. See splitParams().
   */
  target?: "employee" | "params";
  defaultValue?: (employee: EmployeeDoc, company: CompanyDoc) => string | number | boolean | null;
  help?: string;
  /** Options for type "select". */
  options?: { value: string; label: string }[];
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

/** Field that fills a gap on the employee's profile rather than a document-specific parameter. */
function employeeField(
  key: keyof EmployeeDoc,
  label: string,
  type: FieldType,
  help?: string,
  options?: { value: string; label: string }[]
): FieldSchema {
  return {
    key,
    label,
    type,
    target: "employee",
    help,
    options,
    defaultValue: (employee) => {
      const value = employee[key];
      if (value === null || value === undefined) return type === "boolean" ? false : "";
      return value as string | number | boolean;
    },
  };
}

const IDENTITY_FIELDS: FieldSchema[] = [
  employeeField("dateOfBirth", "Date de naissance", "date"),
  employeeField("birthPlace", "Lieu de naissance", "text"),
  employeeField("nationality", "Nationalité", "text"),
  employeeField("address", "Adresse du salarié", "text"),
  employeeField("socialSecurity", "N° Sécurité sociale", "text"),
];

const SEX_FIELD = employeeField("sex", "Civilité", "select", undefined, [
  { value: "M", label: "Homme" },
  { value: "F", label: "Femme" },
]);
const JOB_TITLE_FIELD = employeeField("jobTitle", "Intitulé du poste", "text");
const CLASSIFICATION_FIELD = employeeField(
  "classification",
  "Classification / groupe d'emploi (A–I)",
  "text",
  "Détermine la durée légale du préavis — laissez vide pour utiliser la valeur par défaut (1 mois)."
);
const CLASSE_FIELD = employeeField(
  "classe",
  "Classe (coefficient conventionnel)",
  "text",
  "Positionnement dans la grille de classification, ex. \"1\" — voir le bulletin de paie."
);
const WEEKLY_HOURS_FIELD = employeeField("weeklyHours", "Heures hebdomadaires", "number");
const SALARY_FIELD = employeeField("monthlyGrossSalary", "Salaire mensuel brut (€)", "number");

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
      SEX_FIELD,
      ...IDENTITY_FIELDS,
      JOB_TITLE_FIELD,
      CLASSIFICATION_FIELD,
      CLASSE_FIELD,
      WEEKLY_HOURS_FIELD,
      SALARY_FIELD,
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
      {
        key: "trialMonths",
        label: "Période d'essai (mois)",
        type: "number",
        required: true,
        defaultValue: () => 2,
        help: "2 mois pour employés/ETAM, 3 pour agents de maîtrise selon la convention — à vérifier.",
      },
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
        key: "weeklyEffectiveHours",
        label: "Heures hebdomadaires effectives",
        type: "number",
        required: true,
        defaultValue: (e) => e.weeklyHours ?? 35,
      },
      {
        key: "hasStructuralOvertime",
        label: "Heures supplémentaires structurelles",
        type: "boolean",
        defaultValue: () => false,
        help: "À cocher si les heures effectives dépassent 35h/semaine de façon contractuelle.",
      },
      {
        key: "overtimeMajorationPercent",
        label: "Majoration heures sup. (%)",
        type: "number",
        defaultValue: () => 25,
      },
      {
        key: "mobiliteZone",
        label: "Zone de mobilité",
        type: "text",
        required: true,
        defaultValue: () => "un rayon de 50 km autour du siège social",
      },
      {
        key: "travelDescription",
        label: "Déplacements professionnels",
        type: "text",
        help: "Description libre (ex. \"des déplacements ponctuels sur les chantiers de l'entreprise\") — laisser vide pour omettre la clause.",
      },
      { key: "dealsWithClients", label: "Poste en contact avec la clientèle", type: "boolean", defaultValue: () => false },
      {
        key: "classificationStatut",
        label: "Statut (classification générale)",
        type: "text",
        required: true,
        defaultValue: () => "Technicien / Agent de maîtrise (ETAM)",
      },
      {
        key: "classificationReferenceCode",
        label: "Référence repère-emploi (optionnel)",
        type: "text",
        help: "Ex. \"M110.01.001\" — laisser vide si non vérifié, pour ne rien inventer.",
      },
      { key: "smgAnnualAmount", label: "SMG conventionnel annuel (€)", type: "number" },
      { key: "smgMonthlyAmount", label: "SMG conventionnel mensuel (€)", type: "number" },
      { key: "smicMonthlyAmount", label: "SMIC mensuel en vigueur (€)", type: "number" },
      { key: "smicHourlyRate", label: "SMIC horaire en vigueur (€)", type: "number" },
      SEX_FIELD,
      ...IDENTITY_FIELDS,
      JOB_TITLE_FIELD,
      CLASSIFICATION_FIELD,
      CLASSE_FIELD,
      SALARY_FIELD,
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
      SEX_FIELD,
      employeeField("dateOfBirth", "Date de naissance", "date"),
      employeeField("birthPlace", "Lieu de naissance", "text"),
      employeeField("address", "Adresse du salarié", "text"),
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
    code: "lettre_demission",
    label: "Lettre de démission (rédigée pour le salarié)",
    category: "rupture",
    legalRisk: true,
    fields: [
      { key: "resignationDate", label: "Date de la lettre", type: "date", required: true, defaultValue: () => todayIso() },
      { key: "ancienneteYears", label: "Ancienneté (années)", type: "number", required: true },
      { key: "ageYears", label: "Âge du salarié (années)", type: "number" },
      {
        key: "signingCity",
        label: "Ville de signature",
        type: "text",
        required: true,
        defaultValue: (_e, c) => c.signingCity,
      },
      SEX_FIELD,
      JOB_TITLE_FIELD,
      CLASSIFICATION_FIELD,
      employeeField("hireDate", "Date d'embauche", "date"),
      employeeField("address", "Adresse du salarié", "text"),
    ],
    generate: lettreDemission,
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
      SEX_FIELD,
      JOB_TITLE_FIELD,
      CLASSIFICATION_FIELD,
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
      SEX_FIELD,
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
      SEX_FIELD,
      CLASSIFICATION_FIELD,
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
      SEX_FIELD,
    ],
    generate: convocationRC,
  },
];

export function getDocumentType(code: string): DocumentTypeDefinition | undefined {
  return DOCUMENT_TYPES.find((d) => d.code === code);
}

/**
 * Splits raw form values into employee-profile overrides (merged onto the employee record)
 * and document-specific params, per each field's `target`. Blank overrides are dropped so an
 * empty form field never erases a value already on file.
 */
export function splitParams(
  definition: DocumentTypeDefinition,
  employee: EmployeeDoc,
  values: Record<string, unknown>
): { employee: EmployeeDoc; params: Record<string, unknown> } {
  const overrides: Partial<Record<keyof EmployeeDoc, unknown>> = {};
  const params: Record<string, unknown> = {};

  definition.fields.forEach((f) => {
    const value = values[f.key];
    if (f.target === "employee") {
      if (value !== undefined && value !== "") {
        overrides[f.key as keyof EmployeeDoc] = value;
      }
    } else {
      params[f.key] = value;
    }
  });

  return { employee: { ...employee, ...overrides } as EmployeeDoc, params };
}
