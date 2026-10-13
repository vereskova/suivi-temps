import { Block, CompanyDoc, EmployeeDoc, DocContent, para, rightAligned } from "../types";
import { formatDateFr } from "../helpers";
import { agr, civility } from "../gender";

export type DemandeTempsPartielEtudiantParams = {
  weeklyHours: number; // durée hebdomadaire demandée (< 24 h)
  schoolName: string; // établissement
  studyProgram: string; // formation / diplôme préparé
  schoolYear: string; // ex. "2026-2027"
  signingDate: string;
  signingCity: string;
};

/** Lettre rédigée pour le salarié : demande écrite d'une durée de travail à temps partiel
 *  inférieure à 24 h hebdomadaires, compatible avec ses études (art. L.3123-7 du Code du travail —
 *  dérogation à la demande du salarié, notamment étudiant de moins de 26 ans). À joindre au contrat. */
export function demandeTempsPartielEtudiant(
  employee: EmployeeDoc,
  company: CompanyDoc,
  params: DemandeTempsPartielEtudiantParams
): DocContent {
  const fullName = `${employee.lastName.toUpperCase()} ${employee.firstName}`;
  const blank = "____________";
  const representative = `${civility(company.representativeSex ?? "M")} ${company.representativeName}`;

  const blocks: Block[] = [
    para(fullName),
    para(employee.address ?? blank),
    para(`${agr(employee.sex, "Né", "e")} le ${formatDateFr(employee.dateOfBirth)}`),
    { type: "spacer" },
    rightAligned(`${company.name}, ${company.legalForm}`),
    rightAligned(`À l'attention de ${representative}, ${company.representativeTitle}`),
    rightAligned(company.address),
    { type: "spacer" },
    rightAligned(`À ${params.signingCity}, le ${formatDateFr(params.signingDate)}`),
    { type: "spacer" },
    para(
      "Objet : Demande d'une durée de travail à temps partiel inférieure à 24 heures hebdomadaires — étudiant"
    ),
    { type: "spacer" },
    para(`${representative},`),
    { type: "spacer" },
    para(
      `Je suis actuellement étudiant${params.studyProgram ? ` en ${params.studyProgram}` : ""} à ${
        params.schoolName || blank
      } pour l'année scolaire ${params.schoolYear || blank}, et je suis âgé de moins de 26 ans.`
    ),
    para(
      `Dans le cadre de mon embauche en qualité de ${
        employee.jobTitle ?? blank
      } au sein de votre société, je vous demande, en application de l'article L.3123-7 du Code du travail, de bien vouloir fixer la durée de mon travail à ${params.weeklyHours} heures par semaine, soit une durée inférieure à la durée minimale légale de 24 heures hebdomadaires.`
    ),
    para(
      "Cette demande est faite librement et a pour seul but de rendre mon emploi du temps compatible avec la poursuite de mes études. Mon certificat de scolarité est joint à la présente."
    ),
    para(
      "Pendant les périodes de vacances scolaires ou lorsque mon emploi du temps universitaire me le permettra, je serai disposé à travailler davantage, par accord écrit entre nous (avenant à mon contrat)."
    ),
    { type: "spacer" },
    para(`Je vous prie d'agréer, ${civility(company.representativeSex ?? "M")}, l'expression de mes salutations distinguées.`),
    { type: "spacer" },
    rightAligned("Signature"),
    para(fullName),
    { type: "spacer" },
    para("Pièce jointe : certificat de scolarité"),
  ];

  return { title: `Demande de temps partiel (étudiant) — ${fullName}`, blocks };
}
