import { Block, CompanyDoc, EmployeeDoc, DocContent, para, p, t, b } from "../types";
import { formatDateShort, formatEuros } from "../helpers";

export type ContratChantierParams = {
  startDate: string; // ISO
  trialDays: number; // default 60
  signingDate: string; // ISO
  signingCity: string;
};

export function contratChantier(
  employee: EmployeeDoc,
  company: CompanyDoc,
  params: ContratChantierParams
): DocContent {
  const fullName = `${employee.lastName.toUpperCase()} ${employee.firstName}`;
  const weeklyHours = employee.weeklyHours ?? 35;

  const blocks: Block[] = [
    { type: "title", text: "CONTRAT DE TRAVAIL À DURÉE INDÉTERMINÉE" },
    { type: "spacer" },
    para("Entre les soussignés :"),
    { type: "spacer" },
    p(b(`${company.name}, ${company.legalForm}`)),
    para(`Siège social : ${company.address}`),
    para(`SIRET : ${company.siret}`),
    p(t("Représenté par "), b(company.representativeName)),
    para(`En sa qualité de ${company.representativeTitle}`),
    { type: "spacer" },
    p(b("Monsieur/Madame "), b(fullName)),
    para(`Né(e) le ${formatDateShort(employee.dateOfBirth)}${employee.birthPlace ? ` à ${employee.birthPlace}` : ""}`),
    para(`Nationalité : ${employee.nationality ?? "____________"}`),
    para(`Adresse : ${employee.address ?? "____________"}`),
    para(`Sécurité sociale : ${employee.socialSecurity ?? "-"}`),
    { type: "spacer" },
    para("Il est convenu ce qui suit :"),
    { type: "spacer" },

    { type: "heading", text: "ARTICLE 1 - ENGAGEMENT - EMPLOI" },
    para(
      `${fullName} est engagé(e) à compter du ${formatDateShort(params.startDate)}, en qualité de ${employee.jobTitle ?? "____________"}, sous réserve, en application de la réglementation en vigueur, des résultats de la visite médicale d'information et de prévention.`
    ),
    para(
      `${fullName} se déclare être libre de tout engagement, n'être tenu(e) par aucune clause de non-concurrence, n'être frappé(e) d'aucune incapacité ni d'aucune inaptitude physique à l'exercice de son activité.`
    ),
    para(
      `Le présent contrat est régi par les dispositions légales et réglementaires en vigueur, par les dispositions de la convention collective actuellement applicable à l'entreprise à savoir la ${company.conventionCollective} ainsi que par les dispositions particulières ci-après.`
    ),

    { type: "heading", text: "ARTICLE 2 - DURÉE DU CONTRAT - PÉRIODE D'ESSAI" },
    para(
      `Le contrat de travail est conclu pour une durée indéterminée. Il prendra cours le ${formatDateShort(params.startDate)}.`
    ),
    para(
      `Le présent contrat ne deviendra toutefois définitif qu'à l'issue d'une période d'essai de ${params.trialDays} jours maximum à compter du ${formatDateShort(params.startDate)}. Dans le cas d'une rupture de cette période d'essai à l'initiative de ${company.name}, il sera adressé à ${fullName} une lettre pendant le délai de prévenance en vigueur. En cas de renouvellement de la période d'essai de ${fullName}, une lettre lui sera adressée au cours du délai de prévenance en vigueur.`
    ),

    { type: "heading", text: "ARTICLE 3 - DURÉE ET HORAIRES DE TRAVAIL" },
    para(
      `Le présent contrat de travail porte sur un travail à ${weeklyHours} heures en moyenne par semaine, réparties conformément au planning et aux horaires de travail affichés.`
    ),
    para(
      `L'horaire de travail de ${fullName} sera susceptible de modifications et ce, en fonction des nécessités de service.`
    ),
    para(
      `Par ailleurs, il est expressément convenu que ${fullName} pourra être amené(e) à effectuer des heures de travail au-delà des ${weeklyHours} heures susmentionnées sous réserve du respect des dispositions légales, réglementaires et conventionnelles en vigueur concernant la durée du travail.`
    ),
    para(
      "Toute heure supplémentaire devra faire l'objet de l'accord préalable et exprès du supérieur hiérarchique."
    ),

    { type: "heading", text: "ARTICLE 4 - RÉMUNÉRATION" },
    para(
      `En contrepartie de son travail, ${fullName} percevra une rémunération mensuelle brute de base de ${formatEuros(employee.monthlyGrossSalary)} plus les frais de déplacement.`
    ),

    { type: "heading", text: "ARTICLE 5 - LIEU DE TRAVAIL" },
    para(
      `${fullName} exercera sa prestation de travail dans l'établissement situé à l'adresse ci-dessus et sur les différents chantiers de l'entreprise.`
    ),
    para(
      `${fullName} s'engage à effectuer tout déplacement professionnel rendu nécessaire pour la bonne exécution de ses missions.`
    ),

    { type: "heading", text: "ARTICLE 6 - OBLIGATIONS PROFESSIONNELLES" },
    para(
      `${fullName} s'engage à observer toutes les instructions et consignes particulières de travail qui lui seront données et, plus particulièrement, les consignes relatives à l'hygiène et à la sécurité en vigueur dans l'entreprise.`
    ),
    para(
      "Il/Elle s'engage également à respecter une stricte obligation de discrétion sur tout ce qui concerne l'activité de l'entreprise ainsi que sur toutes les informations concernant sa clientèle."
    ),
    para(
      `${fullName} devra faire connaître à l'entreprise, sans délai, toute modification postérieure à son engagement qui pourrait intervenir dans son état civil, sa situation de famille, son adresse.`
    ),
    para(
      "Dès la cessation de ses fonctions au sein de l'entreprise, il/elle devra restituer les documents et autres matériels qui lui ont été confiés ou établis par ses soins pour l'exercice de sa fonction."
    ),

    { type: "heading", text: "ARTICLE 7 - ABSENCES DIVERSES" },
    para(
      "Toute absence, quelle que soit sa durée, doit faire l'objet d'une justification auprès de la société sans délai."
    ),
    { type: "list", items: [
      "À informer immédiatement la société de tout empêchement d'exercer ses fonctions, en indiquant les motifs et la durée prévisible de cette absence ;",
      "Et à produire un justificatif dans les 48 heures.",
    ]},

    { type: "heading", text: "ARTICLE 8 - TRAITEMENT DES DONNÉES PERSONNELLES" },
    para(
      `${fullName}, exerçant les fonctions de ${employee.jobTitle ?? "____________"} au sein de la société, étant à ce titre amené(e) à accéder à des données à caractère personnel, déclare reconnaître la confidentialité desdites données.`
    ),
    para(
      "Conformément aux articles 34 et 35 de la loi du 6 janvier 1978 modifiée relative à l'informatique, aux fichiers et aux libertés ainsi qu'aux articles 32 à 35 du Règlement général sur la protection des données du 27 avril 2016, il/elle s'engage à prendre toutes précautions conformes aux usages afin de protéger la confidentialité des informations auxquelles il/elle a accès."
    ),
    para(
      "Cet engagement de confidentialité, en vigueur pendant toute la durée de ses fonctions, demeurera effectif, sans limitation de durée après la cessation de ses fonctions, quelle qu'en soit la cause, dès lors que cet engagement concerne l'utilisation et la communication de données à caractère personnel."
    ),

    { type: "heading", text: "ARTICLE 9 - ENTRETIEN PROFESSIONNEL" },
    para(
      `${fullName} est informé(e) qu'il/elle bénéficie tous les deux ans d'un entretien professionnel avec son employeur consacré à ses perspectives d'évolution professionnelle, notamment en termes de qualifications et d'emploi, conformément aux dispositions L.6315-1 du code du travail.`
    ),

    { type: "spacer" },
    para(`Fait en double exemplaire à ${params.signingCity} le ${formatDateShort(params.signingDate)}`),
    { type: "spacer" },
    p(b(`L'employeur ${company.name}`)),
    para(company.representativeName),
    { type: "spacer" },
    p(b("Le/La salarié(e)")),
    para(fullName),
    para('Signature précédée de la mention manuscrite « Lu et approuvé - Bon pour accord »'),
  ];

  return { title: `Contrat de travail — ${fullName}`, blocks };
}
