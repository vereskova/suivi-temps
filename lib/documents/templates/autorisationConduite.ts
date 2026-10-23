import { Block, CompanyDoc, EmployeeDoc, DocContent, para, p, b, rule, closing } from "../types";
import { formatDateFr, formatDateShort } from "../helpers";
import { agr } from "../gender";

export type AutorisationConduiteParams = {
  equipment: string;
  sites: string;
  medicalDate: string;
  cacesRef?: string;
  cacesDate?: string;
  cacesExpiry?: string;
  siteBriefingDate?: string;
  validUntil?: string;
  issueDate: string;
};

/**
 * Autorisation de conduite (art. R. 4323-56 C. trav.). Le texte n'a pas de modèle officiel : l'employeur
 * la rédige librement, mais elle doit refléter les éléments de l'évaluation (arrêté du 26/09/2025, art. 3) -
 * attestation médicale, contrôle des connaissances et du savoir-faire (CACES), connaissance des lieux.
 */
export function autorisationConduite(
  employee: EmployeeDoc,
  company: CompanyDoc,
  params: AutorisationConduiteParams
): DocContent {
  const fullName = `${employee.lastName.toUpperCase()} ${employee.firstName}`;
  const born = employee.dateOfBirth
    ? `${agr(employee.sex, "né")} le ${formatDateShort(employee.dateOfBirth)}${employee.birthPlace ? ` à ${employee.birthPlace}` : ""}`
    : null;
  const job = employee.jobTitle ? `, ${employee.jobTitle}` : "";

  const cacesFr = params.cacesRef
    ? `${params.cacesRef}${params.cacesDate ? `, passé le ${formatDateShort(params.cacesDate)}` : ""}${
        params.cacesExpiry ? `, valable jusqu'au ${formatDateShort(params.cacesExpiry)}` : ""
      }`
    : "résultat de l'évaluation interne des connaissances et du savoir-faire";
  const briefingFr = params.siteBriefingDate ? ` (instructions remises le ${formatDateShort(params.siteBriefingDate)})` : "";

  const blocks: Block[] = [
    { type: "title", text: "AUTORISATION DE CONDUITE" },
    { type: "subtitle", text: "(art. R. 4323-55 et R. 4323-56 du Code du travail)" },
    rule(),
    para("Je soussigné,"),
    para(`${company.representativeName}, ${company.representativeTitle},`),
    para(`représentant la société ${company.name}, dont le siège social est situé ${company.address},`),
    { type: "spacer" },
    p(b("autorise "), b(fullName), { text: `${job}${born ? `, ${born}` : ""},` }),
    para("à conduire l'équipement de travail suivant :"),
    p(b(params.equipment)),
    { type: "spacer" },
    para(`Site(s) d'utilisation : ${params.sites}.`),
    { type: "spacer" },
    para(
      "Cette autorisation est délivrée au terme d'une évaluation effectuée par l'employeur, qui a vérifié que le salarié a reçu une formation adéquate à la conduite en sécurité de cet équipement et qui a pris en compte :"
    ),
    {
      type: "list",
      items: [
        `l'attestation d'absence de contre-indication médicale à la conduite, conforme au modèle fixé par arrêté, établie par le médecin du travail le ${formatDateShort(params.medicalDate)} ;`,
        `le contrôle des connaissances et du savoir-faire pour la conduite en sécurité : ${cacesFr} ;`,
        `la connaissance des lieux et des instructions à respecter sur le(s) site(s) d'utilisation${briefingFr}.`,
      ],
    },
    { type: "spacer" },
    para(
      "L'autorisation n'est valable que tant que ces conditions restent remplies. Elle est réexaminée en cas de changement d'équipement ou de site, de problème de santé, ou d'expiration de l'attestation médicale ou du CACES. Le salarié s'interdit de conduire tout équipement non mentionné ci-dessus."
    ),
    params.validUntil
      ? para(`Validité : jusqu'au ${formatDateFr(params.validUntil)}, sous réserve de ce qui précède.`)
      : para("Validité : tant que les conditions ci-dessus restent remplies."),
    para("Cette autorisation est tenue à la disposition de l'inspection du travail et des agents de prévention des organismes de sécurité sociale."),
    { type: "spacer" },
    closing(
      `Fait à ${company.signingCity}, le ${formatDateFr(params.issueDate)}`,
      { label: "L'employeur", lines: [company.representativeName, company.representativeTitle, "Signature et cachet :"] },
      { label: "Le salarié", lines: [fullName, "« Lu et approuvé » - signature :"] }
    ),

  ];

  return { title: `Autorisation de conduite - ${fullName}`, blocks };
}
