import { Block, CompanyDoc, EmployeeDoc, DocContent, para, rightAligned, rule } from "../types";
import { formatDateFr, addMonthsIso, addDaysIso } from "../helpers";
import { computePreavis } from "../preavis";

export type LettreDemissionParams = {
  lastWorkDay: string; // desired/target last day of work — the letter date is computed backwards from this
  ancienneteYears: number;
  ageYears: number | null;
  signingCity: string;
};

/** The resignation letter itself, drafted on behalf of the employee to sign — not the employer's reply. */
export function lettreDemission(
  employee: EmployeeDoc,
  company: CompanyDoc,
  params: LettreDemissionParams
): DocContent {
  const fullName = `${employee.lastName.toUpperCase()} ${employee.firstName}`;
  const preavis = computePreavis(employee.classification, params.ancienneteYears, "demission", params.ageYears);

  // Work backwards from the desired last day of work to the date the letter must be dated
  // (and thus sent) for the préavis to run out exactly then.
  const resignationDate =
    preavis.months !== null
      ? addMonthsIso(params.lastWorkDay, -preavis.months)
      : preavis.weeks !== null
      ? addDaysIso(params.lastWorkDay, -preavis.weeks * 7)
      : params.lastWorkDay;
  const lastDay = params.lastWorkDay;

  const blocks: Block[] = [
    { type: "title", text: "LETTRE DE DÉMISSION DU SALARIÉ" },
    rule(),
    para(fullName),
    para(employee.address ?? "____________"),
    { type: "spacer" },
    rightAligned(`${company.name}, ${company.legalForm}`),
    rightAligned(`Siège social : ${company.address}`),
    { type: "spacer" },
    para("Objet : Démission"),
    { type: "spacer" },
    para("Madame, Monsieur,"),
    { type: "spacer" },
    para(
      `Par la présente, je vous informe de ma décision de démissionner de mon poste de ${
        employee.jobTitle ?? "____________"
      }, que j'occupe au sein de votre entreprise depuis le ${formatDateFr(employee.hireDate)}.`
    ),
    para(
      `Conformément aux dispositions de mon contrat de travail (${
        company.conventionCollective
      }), j'effectuerai un préavis de ${preavis.label}${
        preavis.note ? " — " + preavis.note : ""
      } à compter du ${formatDateFr(resignationDate)}. Mon contrat prendra donc fin le ${formatDateFr(lastDay)}.`
    ),
    para(
      "À l'issue de mon contrat de travail, je vous remercie de bien vouloir me remettre l'ensemble des documents de fin de contrat, à savoir : le reçu pour solde de tout compte, le certificat de travail ainsi que l'attestation destinée à France Travail."
    ),
    { type: "spacer" },
    para("Je vous prie d'agréer, Madame, Monsieur, l'expression de mes salutations distinguées."),
    { type: "spacer" },
    para(`Fait à ${params.signingCity}, le ${formatDateFr(resignationDate)}`),
    { type: "spacer" },
    rightAligned("Signature"),
    para(fullName),
  ];

  return { title: `Lettre de démission — ${fullName}`, blocks };
}
