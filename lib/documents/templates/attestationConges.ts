import { Block, CompanyDoc, EmployeeDoc, DocContent, para } from "../types";
import { formatDateFr, formatDateShort } from "../helpers";

export type AttestationCongesParams = {
  startDate: string;
  endDate: string;
  issueDate: string;
};

export function attestationConges(
  employee: EmployeeDoc,
  company: CompanyDoc,
  params: AttestationCongesParams
): DocContent {
  const fullName = `${employee.lastName.toUpperCase()} ${employee.firstName}`;

  const blocks: Block[] = [
    { type: "title", text: "ATTESTATION DE CONGÉS PAYÉS" },
    { type: "spacer" },
    para("Je soussigné,"),
    para(company.representativeName + ","),
    para(company.representativeTitle + ","),
    { type: "spacer" },
    para(`représentant la société ${company.name},`),
    para("dont le siège social est situé :"),
    para(company.address + ","),
    { type: "spacer" },
    para(
      `atteste par la présente que ${fullName} bénéficie d'un congé payé du ${formatDateShort(
        params.startDate
      )} au ${formatDateShort(params.endDate)} inclus, accordé conformément aux dispositions du Code du travail.`
    ),
    { type: "spacer" },
    para("Cette attestation est délivrée pour servir et valoir ce que de droit."),
    { type: "spacer" },
    para(`Fait à ${company.signingCity},`),
    para(`le ${formatDateFr(params.issueDate)}`),
    { type: "spacer" },
    para("Signature :"),
    para(company.representativeName),
    para(company.representativeTitle),
    { type: "spacer" },
    para("Cachet de l'entreprise"),
  ];

  return { title: `Attestation congés payés — ${fullName}`, blocks };
}
