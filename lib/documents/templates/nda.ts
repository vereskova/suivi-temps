import { Block, CompanyDoc, EmployeeDoc, DocContent, para, p, b, rule, signatureBlock } from "../types";
import { formatDateShort } from "../helpers";
import { agr } from "../gender";

export type NdaParams = {
  signingDate: string;
  signingCity: string;
};

export function nda(employee: EmployeeDoc, company: CompanyDoc, params: NdaParams): DocContent {
  const fullName = `${employee.lastName.toUpperCase()} ${employee.firstName}`;

  const blocks: Block[] = [
    { type: "title", text: "ACCORD DE NON-DIVULGATION" },
    { type: "subtitle", text: "(ACCORD DE CONFIDENTIALITÉ)" },
    rule(),
    para("ENTRE LES SOUSSIGNÉS :"),
    { type: "spacer" },
    p(b(`La société ${company.name}`)),
    para(`N°SIRET : ${company.siret} — Code NAF : ${company.nafCode}`),
    para(`Siège social : ${company.address}`),
    para(`Représentée par ${company.representativeName}, ${company.representativeTitle}`),
    para("Ci-après dénommée « la Société »"),
    { type: "spacer" },
    para("ET"),
    { type: "spacer" },
    p(b(fullName)),
    para(`${agr(employee.sex, "Né")} le ${formatDateShort(employee.dateOfBirth)}${employee.birthPlace ? `, à ${employee.birthPlace}` : ""}`),
    para(`Demeurant : ${employee.address ?? "____________"}`),
    para(`Ci-après ${agr(employee.sex, "dénommé")} « le Signataire »`),
    { type: "spacer" },
    para("IL A ÉTÉ CONVENU CE QUI SUIT :"),
    { type: "spacer" },

    { type: "heading", text: "Article 1. Objet" },
    para(
      "Le présent accord a pour objet de définir les conditions dans lesquelles le Signataire s'engage à maintenir confidentielles les informations qui lui seront communiquées par la Société dans le cadre de sa mission ou de son activité au sein de celle-ci."
    ),

    { type: "heading", text: "Article 2. Définition des informations confidentielles" },
    para(
      "Sont considérées comme informations confidentielles, toutes informations, données, documents, procédés, savoir-faire, méthodes, stratégies commerciales, données financières, listes de clients, données personnelles de tiers, codes d'accès informatiques, et plus généralement toute information à caractère sensible, quelle qu'en soit la forme (orale, écrite, numérique), dont le Signataire pourrait avoir connaissance dans le cadre de sa collaboration avec la Société."
    ),

    { type: "heading", text: "Article 3. Obligations du Signataire" },
    para("Le Signataire s'engage à :"),
    {
      type: "list",
      items: [
        "Garder strictement confidentielles toutes les informations visées à l'article 2 ;",
        "Ne pas divulguer, reproduire, transmettre ou communiquer ces informations à des tiers, sous quelque forme que ce soit, sans l'accord préalable et écrit de la Société ;",
        "N'utiliser les informations confidentielles qu'aux seules fins de l'exécution de sa mission au sein de la Société ;",
        "Prendre toutes les mesures raisonnables pour protéger la confidentialité des informations reçues ;",
        "Signaler immédiatement à la Société toute divulgation non autorisée ou toute violation constatée ou suspectée.",
      ],
    },

    { type: "heading", text: "Article 4. Exceptions" },
    para("Les obligations de confidentialité ne s'appliquent pas aux informations :"),
    {
      type: "list",
      items: [
        "Qui sont ou deviennent publiques sans que cela résulte d'une violation du présent accord ;",
        "Que le Signataire possédait antérieurement à leur communication par la Société ;",
        "Dont la divulgation est imposée par une obligation légale ou une décision judiciaire.",
      ],
    },

    { type: "heading", text: "Article 5. Durée" },
    para(
      "Le présent accord prend effet à la date de sa signature et demeure en vigueur pendant toute la durée de la collaboration entre le Signataire et la Société, ainsi que pendant une période de 5 (cinq) ans après la cessation de cette collaboration, quelle qu'en soit la cause."
    ),

    { type: "heading", text: "Article 6. Restitution des informations" },
    para(
      "À la cessation de la collaboration, ou à toute demande de la Société, le Signataire s'engage à restituer ou détruire, selon les instructions de la Société, tous documents, supports ou données contenant des informations confidentielles, et à en attester par écrit si demandé."
    ),

    { type: "heading", text: "Article 7. Sanctions" },
    para(
      "Tout manquement aux obligations du présent accord pourra engager la responsabilité civile et/ou pénale du Signataire. La Société se réserve le droit de réclamer réparation de tout préjudice subi du fait d'une violation des présentes obligations."
    ),

    { type: "heading", text: "Article 8. Droit applicable et juridiction compétente" },
    para(
      "Le présent accord est soumis au droit français. Tout litige relatif à son interprétation ou à son exécution sera soumis aux tribunaux compétents du ressort du siège social de la Société."
    ),

    { type: "heading", text: "Article 9. Signature" },
    para(
      "Le présent accord est établi en deux exemplaires originaux. Chaque partie reconnaît avoir reçu un exemplaire signé."
    ),

    { type: "spacer" },
    para(`Fait à ${params.signingCity}, le ${formatDateShort(params.signingDate)}`),
    signatureBlock(
      { label: `Pour la Société ${company.name}`, lines: [company.representativeName, company.representativeTitle] },
      { label: "Le Signataire", lines: [fullName, "« Lu et approuvé »"] }
    ),
  ];

  return { title: `NDA — ${fullName}`, blocks };
}
