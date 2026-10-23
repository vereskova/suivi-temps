import { Block, CompanyDoc, EmployeeDoc, DocContent, para, p, b, rule, closing } from "../types";
import { formatDateFr, formatDateShort } from "../helpers";
import { agr } from "../gender";

export type AutorisationHauteurParams = {
  works: string;
  epi: string;
  trainingRef: string;
  trainingDate: string;
  trainingExpiry?: string;
  medicalDate: string;
  sites: string;
  validUntil?: string;
  issueDate: string;
};

/**
 * Autorisation de travail en hauteur. Pas d'autorisation obligatoire propre au travail en hauteur dans le Code du
 * travail (contrairement à l'art. R. 4323-56) : c'est une autorisation interne, qui matérialise les obligations de
 * formation et d'information à l'usage des EPI antichute (art. R. 4323-104 à R. 4323-106) et d'aptitude médicale.
 */
export function autorisationHauteur(
  employee: EmployeeDoc,
  company: CompanyDoc,
  params: AutorisationHauteurParams
): DocContent {
  const fullName = `${employee.lastName.toUpperCase()} ${employee.firstName}`;
  const born = employee.dateOfBirth
    ? `${agr(employee.sex, "né")} le ${formatDateShort(employee.dateOfBirth)}${employee.birthPlace ? ` à ${employee.birthPlace}` : ""}`
    : null;
  const job = employee.jobTitle ? `, ${employee.jobTitle}` : "";

  const blocks: Block[] = [
    { type: "title", text: "AUTORISATION DE TRAVAIL EN HAUTEUR" },
    { type: "subtitle", text: "(art. R. 4323-58 à R. 4323-61 et R. 4323-104 à R. 4323-106 du Code du travail)" },
    rule(),
    para("Je soussigné,"),
    para(`${company.representativeName}, ${company.representativeTitle},`),
    para(`représentant la société ${company.name}, dont le siège social est situé ${company.address},`),
    { type: "spacer" },
    p(b("autorise "), b(fullName), { text: `${job}${born ? `, ${born}` : ""},` }),
    para("à effectuer les travaux en hauteur suivants :"),
    p(b(params.works)),
    { type: "spacer" },
    para(`Équipements de protection utilisés : ${params.epi}.`),
    para(`Site(s) d'intervention : ${params.sites}.`),
    { type: "spacer" },
    para("Cette autorisation est délivrée après vérification que le salarié :"),
    {
      type: "list",
      items: [
        `a reçu la formation à la sécurité en hauteur et à l'utilisation des équipements de protection individuelle contre les chutes : ${params.trainingRef}, suivie le ${formatDateShort(params.trainingDate)}${
          params.trainingExpiry ? `, à renouveler avant le ${formatDateShort(params.trainingExpiry)}` : ""
        } ;`,
        `a été reconnu apte à ces travaux par le médecin du travail (visite du ${formatDateShort(params.medicalDate)}) ;`,
        "a reçu la consigne d'utilisation des équipements, les instructions et les règles de sécurité du ou des sites d'intervention, et s'engage à les appliquer, notamment à vérifier son équipement avant chaque utilisation et à signaler tout défaut.",
      ],
    },
    { type: "spacer" },
    para(
      "L'autorisation n'est valable que tant que ces conditions restent remplies. Elle est réexaminée en cas de changement de nature des travaux, d'équipement ou de site, de problème de santé, ou d'échéance de la formation ou de l'aptitude médicale. Le salarié n'effectue aucun travail en hauteur non mentionné ci-dessus."
    ),
    params.validUntil
      ? para(`Validité : jusqu'au ${formatDateFr(params.validUntil)}, sous réserve de ce qui précède.`)
      : para("Validité : tant que les conditions ci-dessus restent remplies."),
    { type: "spacer" },
    closing(
      `Fait à ${company.signingCity}, le ${formatDateFr(params.issueDate)}`,
      { label: "L'employeur", lines: [company.representativeName, company.representativeTitle, "Signature et cachet :"] },
      { label: "Le salarié", lines: [fullName, "« Lu et approuvé » - signature :"] }
    ),
  ];

  return { title: `Autorisation de travail en hauteur - ${fullName}`, blocks };
}
