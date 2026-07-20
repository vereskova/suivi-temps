import { Block, CompanyDoc, EmployeeDoc, DocContent, para, p, t, b, rule } from "../types";
import { formatDateFr, addMonthsIso, addDaysIso } from "../helpers";
import { computePreavis } from "../preavis";

export type AccuseDemissionParams = {
  resignationDate: string; // date written on the employee's resignation letter
  ancienneteYears: number;
  ageYears: number | null;
  dispensePreavis: boolean; // employer waives the notice period
  issueDate: string;
};

export function accuseDemission(
  employee: EmployeeDoc,
  company: CompanyDoc,
  params: AccuseDemissionParams
): DocContent {
  const fullName = `${employee.lastName.toUpperCase()} ${employee.firstName}`;
  const preavis = computePreavis(employee.classification, params.ancienneteYears, "demission", params.ageYears);

  const lastDay = params.dispensePreavis
    ? params.resignationDate
    : preavis.months !== null
    ? addMonthsIso(params.resignationDate, preavis.months)
    : preavis.weeks !== null
    ? addDaysIso(params.resignationDate, preavis.weeks * 7)
    : params.resignationDate;

  const blocks: Block[] = [
    { type: "title", text: "ACCUSÉ DE RÉCEPTION DE DÉMISSION" },
    rule(),
    para(company.name),
    para(company.address),
    { type: "spacer" },
    para(`${company.signingCity}, le ${formatDateFr(params.issueDate)}`, "right"),
    { type: "spacer" },
    p(t("Lettre recommandée avec accusé de réception")),
    { type: "spacer" },
    p(t("Objet : "), b("Accusé de réception de votre démission")),
    { type: "spacer" },
    para(`Madame, Monsieur ${fullName},`),
    { type: "spacer" },
    para(
      `Nous accusons réception de votre lettre du ${formatDateFr(
        params.resignationDate
      )} par laquelle vous nous informez de votre décision de démissionner de votre poste de ${employee.jobTitle ?? "____________"} au sein de notre société.`
    ),
    para(
      params.dispensePreavis
        ? "Nous vous confirmons que nous vous dispensons de l'exécution de votre préavis. Cette dispense ne modifie pas la date à laquelle le contrat prend fin d'un point de vue de vos droits, mais vous n'aurez pas à vous présenter à votre poste pendant cette période."
        : `Conformément aux dispositions conventionnelles applicables (${company.conventionCollective}), votre préavis est de ${preavis.label}${preavis.note ? " — " + preavis.note : ""}.`
    ),
    para(
      `En conséquence, sauf accord contraire entre nous, votre contrat de travail prendra fin le ${formatDateFr(
        lastDay
      )}.`
    ),
    para(
      "À l'issue de votre contrat, nous vous remettrons votre certificat de travail, votre reçu pour solde de tout compte ainsi que votre attestation destinée à France Travail."
    ),
    { type: "spacer" },
    para("Nous vous prions d'agréer, Madame, Monsieur, l'expression de nos salutations distinguées."),
    { type: "spacer" },
    para(company.representativeName),
    para(company.representativeTitle),
  ];

  return { title: `Accusé réception démission — ${fullName}`, blocks };
}
