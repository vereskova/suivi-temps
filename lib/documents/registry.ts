import { CompanyDoc, DocContent, EmployeeDoc } from "./types";
import { todayIso, formatDateShort } from "./helpers";
import { letterDateForTrialEnd } from "./preavis";
import { contratChantier } from "./templates/contratChantier";
import { contratBureau } from "./templates/contratBureau";
import { contratCDD, defaultCddEndDate, maxTrialDaysCDD } from "./templates/contratCDD";
import { nda } from "./templates/nda";
import { attestationConges } from "./templates/attestationConges";
import { attestationHebergement } from "./templates/attestationHebergement";
import { demandeCongesSansSolde } from "./templates/demandeCongesSansSolde";
import { lettreDemission } from "./templates/lettreDemission";
import { demandeTempsPartielEtudiant } from "./templates/demandeTempsPartielEtudiant";
import { ruptureEssaiEmployeur } from "./templates/ruptureEssaiEmployeur";

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
  /** Live read-only line shown under the field, computed from the current form values. */
  derived?: (values: Record<string, unknown>, employee: EmployeeDoc) => { fr: string; ru: string } | null;
  /** Options for type "select". */
  options?: { value: string; label: string; labelRu?: string }[];
};

export type DocumentCategory = "contrat" | "confidentialite" | "conges" | "rupture" | "administratif";

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

/** Prochain 15 du mois (aujourd'hui inclus) — date de début par défaut des CDD d'entretien/réparation des locaux. */
function nextFifteenthIso(): string {
  const d = new Date();
  let y = d.getFullYear();
  let m = d.getMonth() + 1;
  if (d.getDate() > 15) {
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return `${y}-${String(m).padStart(2, "0")}-15`;
}

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
    code: "contrat_cdd",
    label: "Contrat CDD (3 mois)",
    labelRu: "Трудовой договор CDD (срочный)",
    descriptionRu:
      "Срочный трудовой договор (CDD) — например на 3 месяца для рабочих, которые ремонтируют офис. Включает основание, точную дату окончания, пробный срок, выплату зарплаты 10 числа, prime de précarité 10 %. Основание договора нужно согласовать с бухгалтером/юристом до подписания.",
    category: "contrat",
    legalRisk: true,
    fields: [
      {
        key: "startDate",
        label: "Date de début",
        labelRu: "Дата начала работы",
        type: "date",
        required: true,
        defaultValue: () => nextFifteenthIso(),
      },
      {
        key: "endDate",
        label: "Date de fin (terme du contrat)",
        labelRu: "Дата окончания (последний день)",
        type: "date",
        required: true,
        defaultValue: () => defaultCddEndDate(nextFifteenthIso(), 3),
        help: "Date précise obligatoire (L.1242-12). Par défaut : 3 mois après le début — à corriger si la date de début change.",
        helpRu: "Точная дата обязательна (L.1242-12). По умолчанию 3 месяца от начала — исправьте, если измените дату начала.",
        derived: (values) => {
          const s = values.startDate as string | undefined;
          const e = values.endDate as string | undefined;
          if (!s || !e) return null;
          return {
            fr: `Essai maximum autorisé : ${maxTrialDaysCDD(s, e)} jours (1 jour par semaine, 14 max).`,
            ru: `Максимальный пробный срок: ${maxTrialDaysCDD(s, e)} дн. (1 день за неделю, максимум 14).`,
          };
        },
      },
      {
        key: "trialDays",
        label: "Période d'essai (jours)",
        labelRu: "Испытательный срок (дней)",
        type: "number",
        required: true,
        defaultValue: () => 13,
        help: "1 jour par semaine de contrat, 2 semaines maximum (L.1242-10). Le contrat réduit automatiquement au maximum autorisé.",
        helpRu: "1 день за неделю контракта, максимум 2 недели (L.1242-10). Договор автоматически ограничит до допустимого максимума.",
      },
      {
        key: "motif",
        label: "Motif du CDD (texte du contrat)",
        labelRu: "Основание CDD (текст в договоре)",
        type: "textarea",
        required: true,
        defaultValue: (_e, c) =>
          `Le présent contrat est conclu pour faire face à un accroissement temporaire d'activité (article L.1242-2, 2° du Code du travail), lié à la réalisation de travaux de réparation et de remise en état des locaux de la société ${c.name} situés au ${c.address}.`,
        help: "Point juridique sensible : le motif doit être précis et réel, sinon requalification en CDI. À faire valider par l'expert-comptable / l'avocat avant signature.",
        helpRu: "Самое чувствительное место: основание должно быть точным и реальным, иначе договор переквалифицируют в CDI. Покажите бухгалтеру/юристу до подписания.",
      },
      {
        key: "tasks",
        label: "Poste de travail / tâches",
        labelRu: "Описание работы (одна фраза)",
        type: "text",
        required: true,
        defaultValue: () =>
          "affecté aux travaux de réparation des locaux de la Société",
      },
      {
        key: "paymentDay",
        label: "Salaire versé au plus tard le … du mois suivant",
        labelRu: "Зарплата выплачивается не позднее … числа следующего месяца",
        type: "number",
        required: true,
        defaultValue: () => 10,
      },
      {
        key: "renewable",
        label: "Renouvelable une fois",
        labelRu: "Можно продлить один раз",
        type: "boolean",
        defaultValue: () => false,
        help: "Ajoute la clause de renouvellement (durée totale ≤ 18 mois). Le renouvellement lui-même se fait par avenant avant le terme.",
        helpRu: "Добавляет пункт о продлении (всего не более 18 месяцев). Само продление оформляется допсоглашением до окончания срока.",
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
      employeeField("jobTitle", "Intitulé du poste", "text", undefined, undefined, "Должность"),
      CLASSIFICATION_FIELD,
      CLASSE_FIELD,
      WEEKLY_HOURS_FIELD,
      SALARY_FIELD,
    ],
    generate: contratCDD,
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
        help: "Art. L.1221-19 : 2 mois pour ouvriers/employés, 3 pour agents de maîtrise/techniciens, 4 pour cadres.",
        helpRu: "Ст. L.1221-19: 2 месяца для рабочих и служащих, 3 для мастеров/техников, 4 для руководителей.",
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
        key: "isStudent",
        label: "Salarié étudiant (< 26 ans) — durée < 24 h à sa demande",
        labelRu: "Работник — студент (до 26 лет): меньше 24 ч по его просьбе",
        type: "boolean",
        defaultValue: () => false,
        help: "Ajoute la clause de demande écrite (art. L.3123-7) — joindre la lettre « Demande de temps partiel (étudiant) ».",
        helpRu: "Добавляет пункт о письменной просьбе работника (ст. L.3123-7) — приложите письмо «Заявление о неполном дне (студент)».",
      },
      {
        key: "hoursIncreaseClause",
        label: "Clause d'augmentation possible des heures (avenant)",
        labelRu: "Пункт о возможности увеличить часы (допсоглашением)",
        type: "boolean",
        defaultValue: () => false,
      },
      {
        key: "partTimeSchedule",
        label: "Répartition des horaires (temps partiel)",
        labelRu: "Распределение часов по дням (неполный день)",
        type: "text",
        help: "Ex. « lundi, mardi, jeudi de 9h à 17h » — mention obligatoire au temps partiel ; vide = espace à compléter à la main.",
        helpRu: "Например «пн, вт, чт с 9:00 до 17:00» — обязательное условие при неполном дне; пусто — оставит пустое место для рукописного заполнения.",
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
        defaultValue: () => "Employé",
        help: "Catégorie du salarié (Employé, Technicien / Agent de maîtrise, Cadre…) — détermine aussi la durée max. de la période d'essai.",
        helpRu: "Категория работника (Employé, Technicien / Agent de maîtrise, Cadre…) — от неё зависит и максимальный испытательный срок.",
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
    code: "attestation_hebergement",
    label: "Attestation d'hébergement",
    labelRu: "Справка о проживании (хозяин жилья)",
    descriptionRu:
      "Подтверждение того, что сотрудник проживает по адресу, предоставленному компанией (нужно, например, для оформления вида на жительство). Хозяин жилья и адрес всегда одни и те же — меняются только данные сотрудника и дата.",
    category: "administratif",
    legalRisk: false,
    fields: [
      employeeField("dateOfBirth", "Date de naissance", "date", undefined, undefined, "Дата рождения"),
      employeeField("birthPlace", "Lieu de naissance", "text", undefined, undefined, "Место рождения"),
      {
        key: "hostingStartDate",
        label: "Hébergé depuis le",
        labelRu: "Проживает с",
        type: "date",
        required: true,
      },
      {
        key: "issueDate",
        label: "Date de délivrance",
        labelRu: "Дата выдачи",
        type: "date",
        required: true,
        defaultValue: () => todayIso(),
      },
    ],
    generate: attestationHebergement,
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
    code: "demande_temps_partiel_etudiant",
    label: "Demande de temps partiel (étudiant, rédigée pour le salarié)",
    labelRu: "Заявление о неполном рабочем дне (студент, от имени сотрудника)",
    descriptionRu:
      "Письменная просьба работника-студента (до 26 лет) установить рабочее время меньше 24 часов в неделю, чтобы совмещать с учёбой. Прикладывается к трудовому договору (ст. L.3123-7).",
    category: "contrat",
    legalRisk: true,
    fields: [
      {
        key: "weeklyHours",
        label: "Heures hebdomadaires demandées",
        labelRu: "Запрашиваемые часы в неделю",
        type: "number",
        required: true,
        defaultValue: () => 16,
      },
      { key: "schoolName", label: "Établissement", labelRu: "Учебное заведение", type: "text" },
      { key: "studyProgram", label: "Formation / diplôme préparé", labelRu: "Программа / диплом", type: "text" },
      { key: "schoolYear", label: "Année scolaire", labelRu: "Учебный год", type: "text", defaultValue: () => "2026-2027" },
      {
        key: "signingDate",
        label: "Date",
        labelRu: "Дата",
        type: "date",
        required: true,
        defaultValue: () => todayIso(),
      },
      {
        key: "signingCity",
        label: "Ville",
        labelRu: "Город",
        type: "text",
        required: true,
        defaultValue: (_e, c) => c.signingCity,
      },
      SEX_FIELD,
      employeeField("dateOfBirth", "Date de naissance", "date", undefined, undefined, "Дата рождения"),
      employeeField("address", "Adresse du salarié", "text", undefined, undefined, "Адрес сотрудника"),
      JOB_TITLE_FIELD,
    ],
    generate: demandeTempsPartielEtudiant,
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
    code: "rupture_essai_employeur",
    label: "Rupture de la période d'essai (employeur)",
    labelRu: "Расторжение на испытательном сроке (по инициативе работодателя)",
    descriptionRu:
      "Письмо о прекращении испытательного срока по инициативе работодателя. Срок уведомления (délai de prévenance) рассчитывается автоматически по стажу сотрудника — 24 часа / 48 часов / 2 недели / 1 месяц, согласно ст. L1221-25 Трудового кодекса.",
    category: "rupture",
    legalRisk: true,
    fields: [
      {
        key: "lastDay",
        label: "Dernier jour de présence (fin de contrat)",
        labelRu: "Последний день работы (дата ухода)",
        type: "date",
        required: true,
        help: "La date de la lettre (date de notification) est calculée automatiquement pour que le délai de prévenance se termine exactement ce jour-là.",
        helpRu: "Дата письма (дата уведомления) рассчитывается автоматически так, чтобы срок уведомления закончился именно в этот день.",
        derived: (values, employee) => {
          const lastDay = String(values.lastDay ?? "");
          if (!lastDay) return null;
          const hire = String(values.hireDate ?? "") || employee.hireDate;
          const r = letterDateForTrialEnd(hire || null, lastDay);
          const when = formatDateShort(r.letterDateIso);
          return {
            fr: `Date de la lettre : ${when} — délai de prévenance ${r.delai.label} (${r.joursPresence} j de présence)${
              r.exact ? "" : " — durée réelle supérieure au minimum (cas limite)"
            }`,
            ru: `Дата письма: ${when} — срок уведомления ${r.delai.label} (${r.joursPresence} дн. стажа)${
              r.exact ? "" : " — фактический срок больше минимального (пограничный случай)"
            }`,
          };
        },
      },
      {
        key: "deliveryMethod",
        label: "Mode de remise",
        labelRu: "Способ вручения",
        type: "select",
        required: true,
        defaultValue: () => "recommande",
        options: [
          { value: "recommande", label: "Lettre recommandée avec AR", labelRu: "Заказное письмо с уведомлением" },
          { value: "main_propre", label: "Remise en main propre", labelRu: "Вручение лично под расписку" },
          { value: "email", label: "Envoi par email", labelRu: "Отправка по электронной почте" },
        ],
      },
      {
        key: "recommandeNumber",
        label: "N° de recommandé (optionnel)",
        labelRu: "Номер заказного письма (необязательно)",
        type: "text",
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
      employeeField("hireDate", "Date d'embauche", "date", undefined, undefined, "Дата приёма на работу"),
      employeeField("address", "Adresse du salarié", "text", undefined, undefined, "Адрес сотрудника"),
    ],
    generate: ruptureEssaiEmployeur,
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
