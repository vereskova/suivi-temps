import { Block, CompanyDoc, EmployeeDoc, DocContent, para, p, t, rule } from "../types";
import { formatDateFr } from "../helpers";
import { civility } from "../gender";

export type ConvocationRCParams = {
  meetingDate: string;
  meetingTime: string;
  meetingLocation: string;
  hasCse: boolean;
  issueDate: string;
};

export function convocationRC(
  employee: EmployeeDoc,
  company: CompanyDoc,
  params: ConvocationRCParams
): DocContent {
  const fullName = `${employee.lastName.toUpperCase()} ${employee.firstName}`;

  const blocks: Block[] = [
    { type: "title", text: "CONVOCATION À UN ENTRETIEN" },
    { type: "subtitle", text: "EN VUE D'UNE RUPTURE CONVENTIONNELLE" },
    rule(),
    para(company.name),
    para(company.address),
    { type: "spacer" },
    para(`${company.signingCity}, le ${formatDateFr(params.issueDate)}`, "right"),
    { type: "spacer" },
    p(t("Lettre remise en main propre contre décharge / recommandée avec accusé de réception")),
    { type: "spacer" },
    para(`${civility(employee.sex)} ${fullName},`),
    { type: "spacer" },
    para(
      "Faisant suite à nos échanges, nous vous proposons de nous rencontrer afin d'évoquer la possibilité d'une rupture conventionnelle de votre contrat de travail, telle que prévue aux articles L.1237-11 et suivants du Code du travail."
    ),
    para(
      `Cet entretien aura lieu le ${formatDateFr(params.meetingDate)} à ${
        params.meetingTime
      }, dans nos locaux situés ${params.meetingLocation}.`
    ),
    para(
      params.hasCse
        ? "Vous avez la possibilité de vous faire assister lors de cet entretien par une personne de votre choix appartenant au personnel de l'entreprise. Dans ce cas, nous vous informons que nous aurons également la faculté de nous faire assister."
        : "En l'absence d'institution représentative du personnel dans l'entreprise, vous avez la possibilité de vous faire assister lors de cet entretien par un conseiller du salarié de votre choix, inscrit sur la liste dressée par le représentant de l'État dans le département, disponible à la mairie de votre domicile ou à la Direction Départementale de l'Emploi, du Travail et des Solidarités (DDETS). Si vous choisissez de vous faire assister, nous vous informons que nous aurons également la faculté de nous faire assister par une personne de notre choix appartenant au personnel de l'entreprise ou par un représentant de notre organisation professionnelle."
    ),
    { type: "spacer" },
    para(`Nous vous prions d'agréer, ${civility(employee.sex)}, l'expression de nos salutations distinguées.`),
    { type: "spacer" },
    para(company.representativeName),
    para(company.representativeTitle),

    { type: "spacer" },
    { type: "heading", text: "Rappel de la procédure (à titre informatif)" },
    para(
      "Ce document ne constitue qu'une convocation à l'entretien. Si un accord est trouvé, la rupture conventionnelle devra faire l'objet d'une convention signée par les deux parties sur le formulaire Cerfa n°14598 (ou via TéléRC), établie en autant d'exemplaires que de parties, plus un pour l'homologation."
    ),
    {
      type: "list",
      items: [
        "Signature de la convention : point de départ du délai de rétractation.",
        "Délai de rétractation de 15 jours calendaires à compter de la signature — chaque partie peut se rétracter par lettre recommandée avec accusé de réception, sans avoir à se justifier.",
        "À l'issue du délai de rétractation, demande d'homologation auprès de la DREETS (Direction Régionale de l'Économie, de l'Emploi, du Travail et des Solidarités) compétente, par voie électronique (TéléRC) ou par courrier.",
        "La DREETS dispose de 15 jours ouvrables à compter de la réception de la demande pour instruire le dossier ; à défaut de réponse dans ce délai, l'homologation est réputée acquise.",
        "La date de fin du contrat de travail ne peut être fixée avant le lendemain du jour de l'homologation (explicite ou tacite).",
      ],
    },
  ];

  return { title: `Convocation rupture conventionnelle — ${fullName}`, blocks };
}
