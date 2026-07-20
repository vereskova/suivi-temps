import { Block, CompanyDoc, EmployeeDoc, DocContent, para, p, t, rule } from "../types";
import { formatDateFr, addMonthsIso, addDaysIso } from "../helpers";
import { computePreavis } from "../preavis";

export type LettreLicenciementParams = {
  interviewDate: string;
  motifText: string; // detailed grounds for dismissal — must be filled in by the employer, no generic default
  dispensePreavis: boolean;
  ancienneteYears: number;
  ageYears: number | null;
  issueDate: string;
};

export function lettreLicenciement(
  employee: EmployeeDoc,
  company: CompanyDoc,
  params: LettreLicenciementParams
): DocContent {
  const fullName = `${employee.lastName.toUpperCase()} ${employee.firstName}`;
  const preavis = computePreavis(employee.classification, params.ancienneteYears, "licenciement", params.ageYears);

  const lastDay = params.dispensePreavis
    ? params.issueDate
    : preavis.months !== null
    ? addMonthsIso(params.issueDate, preavis.months)
    : preavis.weeks !== null
    ? addDaysIso(params.issueDate, preavis.weeks * 7)
    : params.issueDate;

  const blocks: Block[] = [
    { type: "title", text: "LETTRE DE LICENCIEMENT" },
    { type: "subtitle", text: "POUR CAUSE RÉELLE ET SÉRIEUSE" },
    rule(),
    para(company.name),
    para(company.address),
    { type: "spacer" },
    para(`${company.signingCity}, le ${formatDateFr(params.issueDate)}`, "right"),
    { type: "spacer" },
    p(t("Lettre recommandée avec accusé de réception")),
    { type: "spacer" },
    para(`Madame, Monsieur ${fullName},`),
    { type: "spacer" },
    para(
      `Nous vous avons reçu(e) en entretien préalable le ${formatDateFr(
        params.interviewDate
      )}, au cours duquel nous vous avons exposé les motifs de la mesure de licenciement envisagée à votre encontre et recueilli vos explications.`
    ),
    para(
      "Les éléments portés à notre connaissance, ainsi que vos explications, ne nous ont pas permis de revenir sur notre décision. Nous sommes donc contraints de vous notifier votre licenciement, pour les motifs suivants :"
    ),
    { type: "spacer" },
    para(params.motifText),
    { type: "spacer" },
    para(
      params.dispensePreavis
        ? "Compte tenu des circonstances, nous vous dispensons de l'exécution de votre préavis, qui vous sera néanmoins rémunéré normalement jusqu'à son terme."
        : `Conformément aux dispositions conventionnelles applicables (${company.conventionCollective}), votre préavis, que vous devrez exécuter, est de ${preavis.label}${preavis.note ? " — " + preavis.note : ""}.`
    ),
    para(
      `Votre contrat de travail prendra donc fin le ${formatDateFr(lastDay)}.`
    ),
    para(
      "À l'issue de votre préavis, nous tiendrons à votre disposition votre certificat de travail, votre reçu pour solde de tout compte, ainsi que votre attestation destinée à France Travail."
    ),
    para(
      "Nous vous rappelons également que vous disposez d'un délai de 12 mois à compter de la notification du licenciement pour contester la rupture de votre contrat de travail devant le Conseil de Prud'hommes."
    ),
    { type: "spacer" },
    para("Nous vous prions d'agréer, Madame, Monsieur, l'expression de nos salutations distinguées."),
    { type: "spacer" },
    para(company.representativeName),
    para(company.representativeTitle),
  ];

  return { title: `Lettre de licenciement — ${fullName}`, blocks };
}
