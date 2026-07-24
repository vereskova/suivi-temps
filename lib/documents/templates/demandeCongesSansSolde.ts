import { Block, CompanyDoc, EmployeeDoc, DocContent, para, p, b, rightAligned } from "../types";
import { formatDateFr } from "../helpers";
import { civility, agr } from "../gender";

export type DemandeCongesSansSoldeParams = {
  startDate: string;
  endDate: string;
  reason: string;
  signingCity: string;
  issueDate: string;
};

/** The unpaid-leave request letter itself, drafted on behalf of the employee to sign —
 *  addressed to the employer, not the other way around. */
export function demandeCongesSansSolde(
  employee: EmployeeDoc,
  company: CompanyDoc,
  params: DemandeCongesSansSoldeParams
): DocContent {
  const fullName = `${employee.lastName.toUpperCase()} ${employee.firstName}`;
  const employerCivility = civility(company.representativeSex);

  const blocks: Block[] = [
    para(fullName),
    para(employee.address ?? "____________"),
    { type: "spacer" },
    rightAligned("À l'attention de"),
    rightAligned(`${employerCivility} ${company.representativeName}`),
    rightAligned(`En sa qualité de ${company.representativeTitle}`),
    rightAligned(company.name),
    rightAligned(company.address),
    { type: "spacer" },
    rightAligned(`À ${params.signingCity}, le ${formatDateFr(params.issueDate)}`),
    { type: "spacer" },
    p(b("Objet : Demande de congé sans solde")),
    { type: "spacer" },
    para(`${employerCivility},`),
    { type: "spacer" },
    para(
      `Par la présente, je sollicite l'autorisation de bénéficier d'un congé sans solde pour la période allant du ${formatDateFr(
        params.startDate
      )} au ${formatDateFr(params.endDate)} inclus.`
    ),
    para(`Ce congé est sollicité pour ${params.reason}.`),
    para(
      `Je suis ${agr(
        employee.sex,
        "conscient"
      )} que cette période de congé ne donnera pas lieu au versement de ma rémunération et qu'elle est soumise à votre accord.`
    ),
    para(
      "Afin d'assurer la continuité du service, je veillerai, avant mon départ, à transmettre les informations nécessaires concernant les dossiers dont j'ai la charge et à organiser, dans la mesure du possible, leur suivi pendant mon absence."
    ),
    para(
      "Je vous remercie par avance de l'attention portée à ma demande et reste à votre disposition pour tout renseignement complémentaire."
    ),
    { type: "spacer" },
    para(
      `Dans l'attente de votre réponse, je vous prie d'agréer, ${employerCivility}, l'expression de mes salutations distinguées.`
    ),
    { type: "spacer" },
    rightAligned("Signature"),
    para(fullName),
  ];

  return { title: `Demande de congé sans solde — ${fullName}`, blocks };
}
