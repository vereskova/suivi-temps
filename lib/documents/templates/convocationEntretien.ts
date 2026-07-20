import { Block, CompanyDoc, EmployeeDoc, DocContent, para, p, t } from "../types";
import { formatDateFr } from "../helpers";

export type ConvocationEntretienParams = {
  interviewDate: string;
  interviewTime: string;
  interviewLocation: string;
  hasCse: boolean; // whether the company has staff representation (CSE)
  issueDate: string;
};

export function convocationEntretien(
  employee: EmployeeDoc,
  company: CompanyDoc,
  params: ConvocationEntretienParams
): DocContent {
  const fullName = `${employee.lastName.toUpperCase()} ${employee.firstName}`;

  const blocks: Block[] = [
    { type: "title", text: "CONVOCATION À UN ENTRETIEN PRÉALABLE" },
    { type: "subtitle", text: "À UNE ÉVENTUELLE MESURE DE LICENCIEMENT" },
    { type: "spacer" },
    para(company.name),
    para(company.address),
    { type: "spacer" },
    para(`${company.signingCity}, le ${formatDateFr(params.issueDate)}`),
    { type: "spacer" },
    p(t("Lettre recommandée avec accusé de réception")),
    { type: "spacer" },
    para(`Madame, Monsieur ${fullName},`),
    { type: "spacer" },
    para(
      "Nous envisageons de prendre à votre encontre une mesure de licenciement et sommes donc conduits à vous convoquer à un entretien préalable, conformément aux articles L.1232-2 à L.1232-4 du Code du travail."
    ),
    para(
      `Cet entretien aura lieu le ${formatDateFr(params.interviewDate)} à ${
        params.interviewTime
      }, dans nos locaux situés ${params.interviewLocation}.`
    ),
    para(
      "Au cours de cet entretien, nous vous exposerons les motifs de la décision envisagée et recueillerons vos explications."
    ),
    { type: "spacer" },
    para(
      params.hasCse
        ? "Vous avez la possibilité de vous faire assister, lors de cet entretien, par une personne de votre choix appartenant obligatoirement au personnel de l'entreprise."
        : "En l'absence d'institution représentative du personnel dans l'entreprise, vous avez la possibilité de vous faire assister, lors de cet entretien, soit par une personne de votre choix appartenant au personnel de l'entreprise, soit par un conseiller du salarié de votre choix inscrit sur la liste dressée par le représentant de l'État dans le département. Cette liste est consultable auprès de la mairie de votre domicile ou de l'inspection du travail."
    ),
    para(
      "En cas d'assistance par un conseiller du salarié, vous voudrez bien noter que ses coordonnées sont disponibles à la mairie de votre domicile ou à la Direction Départementale de l'Emploi, du Travail et des Solidarités (DDETS)."
    ),
    { type: "spacer" },
    para("Nous vous prions d'agréer, Madame, Monsieur, l'expression de nos salutations distinguées."),
    { type: "spacer" },
    para(company.representativeName),
    para(company.representativeTitle),
  ];

  return { title: `Convocation entretien préalable — ${fullName}`, blocks };
}
