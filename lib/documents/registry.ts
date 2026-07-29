import { CompanyDoc, DocContent, EmployeeDoc } from "./types";
import { todayIso } from "./helpers";
import { contratChantier } from "./templates/contratChantier";
import { contratBureau } from "./templates/contratBureau";
import { nda } from "./templates/nda";
import { attestationConges } from "./templates/attestationConges";
import { demandeCongesSansSolde } from "./templates/demandeCongesSansSolde";
import { accuseDemission } from "./templates/accuseDemission";
import { lettreDemission } from "./templates/lettreDemission";
import { convocationEntretien } from "./templates/convocationEntretien";
import { lettreLicenciement } from "./templates/lettreLicenciement";
import { convocationRC } from "./templates/convocationRC";

export type FieldType = "date" | "text" | "textarea" | "number" | "boolean" | "select";

export type FieldSchema = {
  key: string;
  label: string;
  labelRu?: string;
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
  helpRu?: string;
  /** Options for type "select". */
  options?: { value: string; label: string; labelRu?: string }[];
};

export type DocumentCategory = "contrat" | "confidentialite" | "conges" | "rupture";

export type DocumentTypeDefinition = {
  code: string;
  label: string;
  labelRu?: string;
  /** Short plain-Russian explanation of what this document is and when to use it — shown
   *  in the UI so RH (who only reads Russian) understands each option before picking it. */
  descriptionRu?: string;
  category: DocumentCategory;
  legalRisk: boolean; // surfaced in the UI as "brouillon — à vérifier avant envoi"
  fields: FieldSchema[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  generate: (employee: EmployeeDoc, company: CompanyDoc, params: any) => DocContent;
};

/** Whole years between an ISO date and today — null if the date is missing/invalid. */
function yearsSince(iso: string | null): number | null {
  if (!iso) return null;
  const then = new Date(iso + "T00:00:00Z").getTime();
  if (isNaN(then)) return null;
  const years = (Date.now() - then) / (365.25 * 24 * 3600 * 1000);
  return Math.round(years * 10) / 10;
}

/** Field that fills a gap on the employee's profile rather than a document-specific parameter. */
function employeeField(
  key: keyof EmployeeDoc,
  label: string,
  type: FieldType,
  help?: string,
  options?: { value: string; label: string; labelRu?: string }[],
  labelRu?: string,
  helpRu?: string
): FieldSchema {
  return {
    key,
    label,
    labelRu,
    type,
    target: "employee",
    help,
    helpRu,
    options,
    defaultValue: (employee) => {
      const value = employee[key];
      if (value === null || value === undefined) return type === "boolean" ? false : "";
      return value as string | number | boolean;
    },
  };
}

const IDENTITY_FIELDS: FieldSchema[] = [
  employeeField("dateOfBirth", "Date de naissance", "date", undefined, undefined, "Дата рождения"),
  employeeField("birthPlace", "Lieu de naissance", "text", undefined, undefined, "Место рождения"),
  employeeField("nationality", "Nationalité", "text", undefined, undefined, "Гражданство"),
  employeeField("address", "Adresse du salarié", "text", undefined, undefined, "Адрес сотрудника"),
  employeeField("socialSecurity", "N° Sécurité sociale", "text", undefined, undefined, "№ соц. страхования"),
];

const SEX_FIELD = employeeField(
  "sex",
  "Civilité",
  "select",
  undefined,
  [
    { value: "M", label: "Homme", labelRu: "Мужской" },
    { value: "F", label: "Femme", labelRu: "Женский" },
  ],
  "Пол"
);
const JOB_TITLE_FIELD = employeeField("jobTitle", "Intitulé du poste", "text", undefined, undefined, "Должность");
const CLASSIFICATION_FIELD = employeeField(
  "classification",
  "Classification / groupe d'emploi (A–I)",
  "text",
  "Détermine la durée légale du préavis — laissez vide pour utiliser la valeur par défaut (1 mois).",
  undefined,
  "Классификация / группа (A–I)",
  "Определяет официальный срок отработки — оставьте пустым, чтобы использовать значение по умолчанию (1 месяц)."
);
const CLASSE_FIELD = employeeField(
  "classe",
  "Classe (coefficient conventionnel)",
  "text",
  "Positionnement dans la grille de classification, ex. \"1\" — voir le bulletin de paie.",
  undefined,
  "Класс (коэффициент по конвенции)",
  "Положение в сетке классификации, например «1» — см. расчётный листок."
);
const WEEKLY_HOURS_FIELD = employeeField(
  "weeklyHours",
  "Heures hebdomadaires",
  "number",
  undefined,
  undefined,
  "Часов в неделю"
);
const SALARY_FIELD = employeeField(
  "monthlyGrossSalary",
  "Salaire mensuel brut (€)",
  "number",
  undefined,
  undefined,
  "Оклад брутто в месяц (€)"
);

export const DOCUMENT_TYPES: DocumentTypeDefinition[] = [
  {
    code: "contrat_chantier",
    label: "Contrat CDI — Chantier",
    labelRu: "Трудовой договор — стройка",
    descriptionRu:
      "Бессрочный трудовой договор (CDI) для рабочего на стройке. Используется при найме нового сотрудника в бригаду.",
    category: "contrat",
    legalRisk: true,
    fields: [
      {
        key: "startDate",
        label: "Date de début",
        labelRu: "Дата начала работы",
        type: "date",
        required: true,
        defaultValue: () => todayIso(),
      },
      {
        key: "trialDays",
        label: "Période d'essai (jours)",
        labelRu: "Испытательный срок (дней)",
        type: "number",
        required: true,
        defaultValue: () => 60,
      },
      {
        key: "signingDate",
        label: "Date de signature",
        labelRu: "Дата подписания",
        type: "date",
        required: true,
        defaultValue: () => todayIso(),
      },
      {
        key: "signingCity",
        label: "Ville de signature",
        labelRu: "Город подписания",
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
    labelRu: "Трудовой договор — офис",
    descriptionRu:
      "Бессрочный трудовой договор (CDI) для сотрудника офиса, со всеми условиями: испытательный срок, часы, переработки, зона мобильности и т.д.",
    category: "contrat",
    legalRisk: true,
    fields: [
      {
        key: "startDate",
        label: "Date de début",
        labelRu: "Дата начала работы",
        type: "date",
        required: true,
        defaultValue: () => todayIso(),
      },
      {
        key: "trialMonths",
        label: "Période d'essai (mois)",
        labelRu: "Испытательный срок (месяцев)",
        type: "number",
        required: true,
        defaultValue: () => 2,
        help: "2 mois pour employés/ETAM, 3 pour agents de maîtrise selon la convention — à vérifier.",
        helpRu: "2 месяца для служащих/ETAM, 3 месяца для агентов по надзору согласно конвенции — уточнить.",
      },
      {
        key: "signingDate",
        label: "Date de signature",
        labelRu: "Дата подписания",
        type: "date",
        required: true,
        defaultValue: () => todayIso(),
      },
      {
        key: "signingCity",
        label: "Ville de signature",
        labelRu: "Город подписания",
        type: "text",
        required: true,
        defaultValue: (_e, c) => c.signingCity,
      },
      {
        key: "isPartTime",
        label: "Temps partiel",
        labelRu: "Неполный рабочий день",
        type: "boolean",
        defaultValue: () => false,
      },
      {
        key: "weeklyEffectiveHours",
        label: "Heures hebdomadaires effectives",
        labelRu: "Фактические часы в неделю",
        type: "number",
        required: true,
        defaultValue: (e) => e.weeklyHours ?? 35,
      },
      {
        key: "hasStructuralOvertime",
        label: "Heures supplémentaires structurelles",
        labelRu: "Структурные переработки",
        type: "boolean",
        defaultValue: () => false,
        help: "À cocher si les heures effectives dépassent 35h/semaine de façon contractuelle.",
        helpRu: "Отметить, если фактические часы по договору превышают 35 ч/неделю.",
      },
      {
        key: "overtimeMajorationPercent",
        label: "Majoration heures sup. (%)",
        labelRu: "Надбавка за переработки (%)",
        type: "number",
        defaultValue: () => 25,
      },
      {
        key: "mobiliteZone",
        label: "Zone de mobilité",
        labelRu: "Зона мобильности",
        type: "text",
        required: true,
        defaultValue: () => "un rayon de 50 km autour du siège social",
      },
      {
        key: "travelDescription",
        label: "Déplacements professionnels",
        labelRu: "Служебные поездки",
        type: "text",
        help:
          "Description libre (ex. \"des déplacements ponctuels sur les chantiers de l'entreprise\") — laisser vide pour omettre la clause.",
        helpRu:
          "Свободное описание (например, «периодические поездки на объекты компании») — оставьте пустым, чтобы не включать этот пункт.",
      },
      {
        key: "dealsWithClients",
        label: "Poste en contact avec la clientèle",
        labelRu: "Должность подразумевает контакт с клиентами",
        type: "boolean",
        defaultValue: () => false,
      },
      {
        key: "classificationStatut",
        label: "Statut (classification générale)",
        labelRu: "Статус (общая классификация)",
        type: "text",
        required: true,
        defaultValue: () => "Technicien / Agent de maîtrise (ETAM)",
      },
      {
        key: "classificationReferenceCode",
        label: "Référence repère-emploi (optionnel)",
        labelRu: "Код должности по сетке (необязательно)",
        type: "text",
        help: "Ex. \"M110.01.001\" — laisser vide si non vérifié, pour ne rien inventer.",
        helpRu: "Например «M110.01.001» — оставьте пустым, если не проверено, чтобы не придумывать.",
      },
      {
        key: "smgAnnualAmount",
        label: "SMG conventionnel annuel (€)",
        labelRu: "Минимальная зарплата по конвенции в год (€)",
        type: "number",
      },
      {
        key: "smgMonthlyAmount",
        label: "SMG conventionnel mensuel (€)",
        labelRu: "Минимальная зарплата по конвенции в месяц (€)",
        type: "number",
      },
      {
        key: "smicMonthlyAmount",
        label: "SMIC mensuel en vigueur (€)",
        labelRu: "Действующий МРОТ в месяц (€)",
        type: "number",
      },
      {
        key: "smicHourlyRate",
        label: "SMIC horaire en vigueur (€)",
        labelRu: "Действующий МРОТ в час (€)",
        type: "number",
      },
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
    labelRu: "Соглашение о конфиденциальности (NDA)",
    descriptionRu:
      "Документ о неразглашении коммерческой информации — подписывается вместе с трудовым договором или отдельно.",
    category: "confidentialite",
    legalRisk: false,
    fields: [
      {
        key: "signingDate",
        label: "Date de signature",
        labelRu: "Дата подписания",
        type: "date",
        required: true,
        defaultValue: () => todayIso(),
      },
      {
        key: "signingCity",
        label: "Ville de signature",
        labelRu: "Город подписания",
        type: "text",
        required: true,
        defaultValue: (_e, c) => c.signingCity,
      },
      SEX_FIELD,
      employeeField("dateOfBirth", "Date de naissance", "date", undefined, undefined, "Дата рождения"),
      employeeField("birthPlace", "Lieu de naissance", "text", undefined, undefined, "Место рождения"),
      employeeField("address", "Adresse du salarié", "text", undefined, undefined, "Адрес сотрудника"),
    ],
    generate: nda,
  },
  {
    code: "attestation_conges",
    label: "Attestation de congés payés",
    labelRu: "Справка об оплачиваемом отпуске",
    descriptionRu:
      "Подтверждение того, что сотрудник находится или находился в оплачиваемом отпуске в указанный период — например, для визового центра или другой инстанции.",
    category: "conges",
    legalRisk: false,
    fields: [
      { key: "startDate", label: "Début du congé", labelRu: "Начало отпуска", type: "date", required: true },
      { key: "endDate", label: "Fin du congé", labelRu: "Конец отпуска", type: "date", required: true },
      {
        key: "issueDate",
        label: "Date de délivrance",
        labelRu: "Дата выдачи",
        type: "date",
        required: true,
        defaultValue: () => todayIso(),
      },
    ],
    generate: attestationConges,
  },
  {
    code: "demande_conges_sans_solde",
    label: "Demande de congé sans solde (rédigée pour le salarié)",
    labelRu: "Заявление на неоплачиваемый отпуск (от имени сотрудника)",
    descriptionRu:
      "Письмо-заявление, которое сотрудник подаёт работодателю с просьбой о неоплачиваемом отпуске — компания составляет его за сотрудника.",
    category: "conges",
    legalRisk: false,
    fields: [
      { key: "startDate", label: "Début du congé", labelRu: "Начало отпуска", type: "date", required: true },
      { key: "endDate", label: "Fin du congé", labelRu: "Конец отпуска", type: "date", required: true },
      {
        key: "reason",
        label: "Motif",
        labelRu: "Причина",
        type: "text",
        required: true,
        defaultValue: () => "raisons personnelles",
      },
      {
        key: "signingCity",
        label: "Ville de signature",
        labelRu: "Город подписания",
        type: "text",
        required: true,
        defaultValue: (_e, c) => c.signingCity,
      },
      {
        key: "issueDate",
        label: "Date du courrier",
        labelRu: "Дата письма",
        type: "date",
        required: true,
        defaultValue: () => todayIso(),
      },
      SEX_FIELD,
      employeeField("address", "Adresse du salarié", "text", undefined, undefined, "Адрес сотрудника"),
    ],
    generate: demandeCongesSansSolde,
  },
  {
    code: "lettre_demission",
    label: "Lettre de démission (rédigée pour le salarié)",
    labelRu: "Заявление об увольнении по собственному желанию (от имени сотрудника)",
    descriptionRu:
      "Письмо, которым сотрудник уведомляет о своём увольнении по собственному желанию. Дата письма рассчитывается так, чтобы срок отработки (préavis) закончился в нужный день.",
    category: "rupture",
    legalRisk: true,
    fields: [
      {
        key: "lastWorkDay",
        label: "Dernier jour de travail souhaité",
        labelRu: "Желаемый последний рабочий день",
        type: "date",
        required: true,
        help: "La date de la lettre est calculée en amont pour que le préavis se termine exactement ce jour-là.",
        helpRu: "Дата письма рассчитывается заранее так, чтобы срок отработки закончился именно в этот день.",
      },
      {
        key: "ancienneteYears",
        label: "Ancienneté (années)",
        labelRu: "Стаж (лет)",
        type: "number",
        required: true,
        defaultValue: (e) => yearsSince(e.hireDate) ?? "",
        help: "Calculée depuis la date d'embauche du dossier salarié — à ajuster si besoin.",
        helpRu: "Рассчитывается по дате приёма на работу из личного дела — при необходимости скорректируйте.",
      },
      {
        key: "ageYears",
        label: "Âge du salarié (années)",
        labelRu: "Возраст сотрудника (лет)",
        type: "number",
        defaultValue: (e) => (yearsSince(e.dateOfBirth) !== null ? Math.floor(yearsSince(e.dateOfBirth) as number) : ""),
      },
      {
        key: "signingCity",
        label: "Ville de signature",
        labelRu: "Город подписания",
        type: "text",
        required: true,
        defaultValue: (_e, c) => c.signingCity,
      },
      SEX_FIELD,
      JOB_TITLE_FIELD,
      CLASSIFICATION_FIELD,
      employeeField("hireDate", "Date d'embauche", "date", undefined, undefined, "Дата приёма на работу"),
      employeeField("address", "Adresse du salarié", "text", undefined, undefined, "Адрес сотрудника"),
    ],
    generate: lettreDemission,
  },
  {
    code: "accuse_demission",
    label: "Accusé de réception de démission",
    labelRu: "Подтверждение получения заявления об увольнении",
    descriptionRu:
      "Ответ работодателя, подтверждающий, что заявление об увольнении получено, и уточняющий дату окончания срока отработки.",
    category: "rupture",
    legalRisk: true,
    fields: [
      {
        key: "resignationDate",
        label: "Date de la lettre de démission",
        labelRu: "Дата заявления об увольнении",
        type: "date",
        required: true,
      },
      {
        key: "ancienneteYears",
        label: "Ancienneté (années)",
        labelRu: "Стаж (лет)",
        type: "number",
        required: true,
        defaultValue: (e) => yearsSince(e.hireDate) ?? "",
        help: "Calculée depuis la date d'embauche du dossier salarié — à ajuster si besoin.",
        helpRu: "Рассчитывается по дате приёма на работу из личного дела — при необходимости скорректируйте.",
      },
      {
        key: "ageYears",
        label: "Âge du salarié (années)",
        labelRu: "Возраст сотрудника (лет)",
        type: "number",
        defaultValue: (e) => (yearsSince(e.dateOfBirth) !== null ? Math.floor(yearsSince(e.dateOfBirth) as number) : ""),
      },
      {
        key: "dispensePreavis",
        label: "Dispense de préavis",
        labelRu: "Освобождение от отработки",
        type: "boolean",
        defaultValue: () => false,
      },
      {
        key: "issueDate",
        label: "Date du courrier",
        labelRu: "Дата письма",
        type: "date",
        required: true,
        defaultValue: () => todayIso(),
      },
      SEX_FIELD,
      JOB_TITLE_FIELD,
      CLASSIFICATION_FIELD,
    ],
    generate: accuseDemission,
  },
  {
    code: "convocation_entretien",
    label: "Convocation à entretien préalable (licenciement)",
    labelRu: "Приглашение на предварительную беседу (перед увольнением)",
    descriptionRu:
      "Официальное приглашение сотруднику на встречу перед возможным увольнением по инициативе работодателя — обязательный этап по французскому законодательству.",
    category: "rupture",
    legalRisk: true,
    fields: [
      { key: "interviewDate", label: "Date de l'entretien", labelRu: "Дата встречи", type: "date", required: true },
      {
        key: "interviewTime",
        label: "Heure de l'entretien",
        labelRu: "Время встречи",
        type: "text",
        required: true,
        defaultValue: () => "9h00",
      },
      {
        key: "interviewLocation",
        label: "Lieu de l'entretien",
        labelRu: "Место встречи",
        type: "text",
        required: true,
        defaultValue: (_e, c) => c.address,
      },
      {
        key: "hasCse",
        label: "L'entreprise dispose d'un CSE",
        labelRu: "В компании есть CSE (совет предприятия)",
        type: "boolean",
        defaultValue: () => false,
      },
      {
        key: "issueDate",
        label: "Date du courrier",
        labelRu: "Дата письма",
        type: "date",
        required: true,
        defaultValue: () => todayIso(),
      },
      SEX_FIELD,
    ],
    generate: convocationEntretien,
  },
  {
    code: "lettre_licenciement",
    label: "Lettre de licenciement",
    labelRu: "Уведомление об увольнении (по инициативе работодателя)",
    descriptionRu:
      "Официальное письмо об увольнении сотрудника с указанием причины — отправляется после предварительной беседы (entretien préalable).",
    category: "rupture",
    legalRisk: true,
    fields: [
      {
        key: "interviewDate",
        label: "Date de l'entretien préalable",
        labelRu: "Дата предварительной беседы",
        type: "date",
        required: true,
      },
      {
        key: "motifText",
        label: "Motifs détaillés du licenciement",
        labelRu: "Подробные причины увольнения",
        type: "textarea",
        required: true,
        help: "Obligatoire — à rédiger avec précision, ce texte engage juridiquement l'entreprise.",
        helpRu: "Обязательно — пишите точно, этот текст юридически обязывает компанию.",
      },
      {
        key: "dispensePreavis",
        label: "Dispense de préavis",
        labelRu: "Освобождение от отработки",
        type: "boolean",
        defaultValue: () => false,
      },
      {
        key: "ancienneteYears",
        label: "Ancienneté (années)",
        labelRu: "Стаж (лет)",
        type: "number",
        required: true,
        defaultValue: (e) => yearsSince(e.hireDate) ?? "",
        help: "Calculée depuis la date d'embauche du dossier salarié — à ajuster si besoin.",
        helpRu: "Рассчитывается по дате приёма на работу из личного дела — при необходимости скорректируйте.",
      },
      {
        key: "ageYears",
        label: "Âge du salarié (années)",
        labelRu: "Возраст сотрудника (лет)",
        type: "number",
        defaultValue: (e) => (yearsSince(e.dateOfBirth) !== null ? Math.floor(yearsSince(e.dateOfBirth) as number) : ""),
      },
      {
        key: "issueDate",
        label: "Date du courrier",
        labelRu: "Дата письма",
        type: "date",
        required: true,
        defaultValue: () => todayIso(),
      },
      SEX_FIELD,
      CLASSIFICATION_FIELD,
    ],
    generate: lettreLicenciement,
  },
  {
    code: "convocation_rc",
    label: "Convocation — Rupture conventionnelle",
    labelRu: "Приглашение на встречу — расторжение по соглашению сторон",
    descriptionRu:
      "Приглашение на встречу для обсуждения расторжения трудового договора по соглашению сторон (rupture conventionnelle) — не увольнение по инициативе одной стороны, а договорённость.",
    category: "rupture",
    legalRisk: true,
    fields: [
      { key: "meetingDate", label: "Date de l'entretien", labelRu: "Дата встречи", type: "date", required: true },
      {
        key: "meetingTime",
        label: "Heure de l'entretien",
        labelRu: "Время встречи",
        type: "text",
        required: true,
        defaultValue: () => "9h00",
      },
      {
        key: "meetingLocation",
        label: "Lieu de l'entretien",
        labelRu: "Место встречи",
        type: "text",
        required: true,
        defaultValue: (_e, c) => c.address,
      },
      {
        key: "hasCse",
        label: "L'entreprise dispose d'un CSE",
        labelRu: "В компании есть CSE (совет предприятия)",
        type: "boolean",
        defaultValue: () => false,
      },
      {
        key: "issueDate",
        label: "Date du courrier",
        labelRu: "Дата письма",
        type: "date",
        required: true,
        defaultValue: () => todayIso(),
      },
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
