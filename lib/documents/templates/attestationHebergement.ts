import { Block, CompanyDoc, DocContent, EmployeeDoc, para, rule } from "../types";
import { formatDateFr, formatDateShort } from "../helpers";

export type AttestationHebergementParams = {
  hostingStartDate: string;
  issueDate: string;
};

// The host is always the same real person hosting workers at his own home
// (confirmed by the user — not derived per-employee), so it's fixed here
// rather than pulled from `company` (which represents the company's own
// legal signatory, a different role) or a per-employee field.
const HOST_NAME = "Yevhenii VORONINSKYI";
const HOST_BIRTH_DATE = "1974-08-02";
const HOST_BIRTH_PLACE = "Russie";
const HOST_ADDRESS_LINES = ["343 Chemin d'Engoudes", "31450 Baziège"];
const HOST_SIGNATURE_IMAGE = "signatures/voroninskyi_yevhenii.png";

export function attestationHebergement(
  employee: EmployeeDoc,
  company: CompanyDoc,
  params: AttestationHebergementParams
): DocContent {
  const fullName = `${employee.firstName} ${employee.lastName.toUpperCase()}`;
  const employeeBirth = employee.dateOfBirth ? formatDateShort(employee.dateOfBirth) : "—";
  const employeeBirthPlace = employee.birthPlace ?? "—";

  const blocks: Block[] = [
    { type: "title", text: "ATTESTATION D'HÉBERGEMENT" },
    rule(),
    { type: "spacer" },
    para(`Je soussigné ${HOST_NAME}, né le ${formatDateShort(HOST_BIRTH_DATE)} à ${HOST_BIRTH_PLACE},`),
    para("déclare sur l'honneur héberger à mon domicile, à titre gratuit,"),
    { type: "spacer" },
    para(`${fullName}, né(e) le ${employeeBirth} à ${employeeBirthPlace},`),
    para(`depuis le ${formatDateShort(params.hostingStartDate)}, à l'adresse suivante :`),
    { type: "spacer" },
    para(HOST_ADDRESS_LINES[0]),
    para(HOST_ADDRESS_LINES[1]),
    { type: "spacer" },
    { type: "spacer" },
    para(`Fait à ${company.signingCity}, le ${formatDateFr(params.issueDate)}`, "right"),
    { type: "spacer" },
    { type: "image", src: HOST_SIGNATURE_IMAGE, width: 130, height: 82, align: "right" },
    para(HOST_NAME, "right"),
  ];

  return { title: `Attestation d'hébergement — ${fullName}`, blocks };
}
