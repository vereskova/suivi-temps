import { Block, CompanyDoc, EmployeeDoc, DocContent, para, rightAligned, rule, closing } from "../types";
import { formatDateFr, daysBetweenIso } from "../helpers";
import { computeDelaiPrevenanceEssai } from "../preavis";
import { civility, salarieLabel } from "../gender";

export type RuptureEssaiEmployeurParams = {
  letterDate: string; // ISO — date of the letter / remise
  deliveryMethod: "recommande" | "main_propre";
  recommandeNumber?: string;
  signingCity: string;
};

/** Employer-initiated end of the période d'essai — the délai de prévenance
 *  (24h / 48h / 2 semaines / 1 mois) is computed automatically from the
 *  employee's tenure, per Code du travail art. L1221-25. */
export function ruptureEssaiEmployeur(
  employee: EmployeeDoc,
  company: CompanyDoc,
  params: RuptureEssaiEmployeurParams
): DocContent {
  const fullName = `${employee.lastName.toUpperCase()} ${employee.firstName}`;
  const sex = employee.sex;

  const joursPresence = employee.hireDate ? daysBetweenIso(employee.hireDate, params.letterDate) : 0;
  const delai = computeDelaiPrevenanceEssai(joursPresence);
  const endDate = delai.endDateFromIso(params.letterDate);

  const deliveryLine =
    params.deliveryMethod === "main_propre"
      ? "Courrier remis en main propre contre décharge"
      : `Lettre recommandée avec accusé de réception${
          params.recommandeNumber ? ` n° ${params.recommandeNumber}` : ""
        }`;

  const blocks: Block[] = [
    { type: "title", text: "RUPTURE DE LA PÉRIODE D'ESSAI" },
    rule(),
    para(company.name),
    para(company.address),
    { type: "spacer" },
    rightAligned(fullName),
    rightAligned(employee.address ?? "____________"),
    { type: "spacer" },
    para(deliveryLine),
    rightAligned(`À ${params.signingCity}, le ${formatDateFr(params.letterDate)}`),
    { type: "spacer" },
    para("Objet : Rupture de la période d'essai"),
    { type: "spacer" },
    para(`${civility(sex)},`),
    { type: "spacer" },
    para(
      "Nous sommes au regret de vous informer que nous mettons fin à votre période d'essai. En conséquence, vous cesserez de faire partie de nos effectifs à la date du " +
        `${formatDateFr(endDate)} au soir, cette date prenant en compte le délai de prévenance conformément à la législation en vigueur.`
    ),
    para(
      `Pour information, compte tenu de votre présence de ${joursPresence} jour${
        joursPresence > 1 ? "s" : ""
      } dans l'entreprise, le délai de prévenance applicable est de ${delai.label}, sous réserve de dispositions conventionnelles ou contractuelles plus favorables.`
    ),
    { type: "spacer" },
    para("Nous vous remettrons les documents suivants :"),
    {
      type: "list",
      items: [
        "Votre dernier bulletin de salaire et son règlement",
        "Votre certificat de travail",
        "Votre reçu pour solde de tout compte",
        "L'attestation France Travail",
      ],
    },
    { type: "spacer" },
    para(`Veuillez agréer, ${civility(sex)}, l'expression de notre considération distinguée.`),
    { type: "spacer" },
  ];

  if (params.deliveryMethod === "main_propre") {
    blocks.push(
      closing(
        `Fait en deux exemplaires à ${params.signingCity} le ${formatDateFr(params.letterDate)}`,
        { label: "L'employeur", lines: [company.representativeName, company.representativeTitle] },
        { label: salarieLabel(sex), lines: [fullName] }
      )
    );
  } else {
    blocks.push(rightAligned("Signature"), para(company.representativeName), para(company.representativeTitle));
  }

  return { title: `Rupture de la période d'essai — ${fullName}`, blocks };
}
