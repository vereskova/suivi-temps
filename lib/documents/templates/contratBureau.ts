import { Block, CompanyDoc, EmployeeDoc, DocContent, para, p, t, b } from "../types";
import { formatDateShort, formatEuros } from "../helpers";

export type ContratBureauParams = {
  startDate: string;
  trialDays: number;
  signingDate: string;
  signingCity: string;
  isPartTime: boolean;
  weeklyHours: number;
  mobiliteZone: string;
};

export function contratBureau(
  employee: EmployeeDoc,
  company: CompanyDoc,
  params: ContratBureauParams
): DocContent {
  const fullName = `${employee.lastName.toUpperCase()} ${employee.firstName}`;
  const civility = "La Salariée / Le Salarié";

  const blocks: Block[] = [
    {
      type: "title",
      text: `CONTRAT DE TRAVAIL À DURÉE INDÉTERMINÉE${
        params.isPartTime ? " À TEMPS PARTIEL" : ""
      }`,
    },
    { type: "spacer" },
    para("ENTRE LES SOUSSIGNÉS :"),
    { type: "spacer" },
    p(b(`La société ${company.name}`)),
    para(`SIRET : ${company.siret}`),
    para(`Code NAF : ${company.nafCode}`),
    para(`Dont le siège social est situé ${company.address}`),
    p(t("Représentée par "), b(company.representativeName)),
    para(`Agissant en qualité de ${company.representativeTitle}`),
    para("Ci-après dénommé « L'Employeur »"),
    para("D'UNE PART,"),
    { type: "spacer" },
    para("ET"),
    { type: "spacer" },
    p(b(fullName)),
    para(`Né(e) le ${formatDateShort(employee.dateOfBirth)}${employee.birthPlace ? `, à ${employee.birthPlace}` : ""}`),
    para(`De nationalité ${employee.nationality ?? "____________"}`),
    para(`N° Sécurité Sociale : ${employee.socialSecurity ?? "____________"}`),
    para(`Demeurant ${employee.address ?? "____________"}`),
    para(`Ci-après dénommé(e) « ${civility} »`),
    para("D'AUTRE PART,"),
    { type: "spacer" },
    para("IL A ÉTÉ CONVENU CE QUI SUIT :"),
    { type: "spacer" },

    { type: "heading", text: "Article 1. Conditions d'engagement" },
    para(
      `${civility}, qui se déclare libre de tout engagement, est embauché(e) pour une durée indéterminée${
        params.isPartTime ? " à temps partiel" : " à temps plein"
      }, à compter du ${formatDateShort(params.startDate)} sous réserve des résultats de la visite médicale d'embauche.`
    ),
    para(`La déclaration préalable d'embauche a été faite auprès de l'URSSAF le ${formatDateShort(params.startDate)}.`),

    { type: "heading", text: "Article 2. Convention collective" },
    para(
      `Sous réserve d'une évolution de l'activité de l'entreprise, le présent contrat est régi par les dispositions de la ${company.conventionCollective}.`
    ),

    { type: "heading", text: "Article 3. Fonctions" },
    para(`${civility} est engagé(e) en qualité de ${employee.jobTitle ?? "____________"}.`),

    { type: "heading", text: "Article 4. Période d'essai" },
    para(
      `Le présent contrat est conclu pour une durée indéterminée, il ne deviendra définitif qu'à l'issue de la période d'essai fixée à ${params.trialDays} jours, renouvelable une fois si un accord de branche le prévoit et pour une durée maximum égale à la première. En cas de renouvellement de la période d'essai, un accord écrit devra être établi.`
    ),
    para(
      "Durant cette période d'essai, le contrat pourra être rompu par l'une ou l'autre des parties, à tout moment, sous réserve du respect du délai de prévenance prévu aux articles L.1221-25 ou L.1221-26 du Code du travail."
    ),
    para(
      "Au terme de la période d'essai, si elle s'est avérée satisfaisante, le présent contrat deviendra définitif et se poursuivra pour une période indéterminée."
    ),

    { type: "heading", text: "Article 5. Lieu de travail" },
    para(`${civility} est rattaché(e) initialement au siège social de l'entreprise.`),
    para(
      `Cette mobilité pourra s'exercer dans les limites géographiques suivantes : ${params.mobiliteZone}.`
    ),

    { type: "heading", text: "Article 6. Rémunération" },
    para(
      params.isPartTime
        ? `En contrepartie de son travail, ${civility} percevra une rémunération mensuelle brute de ${formatEuros(employee.monthlyGrossSalary)} pour ${params.weeklyHours}h par semaine.`
        : `En contrepartie de son travail, ${civility} percevra une rémunération mensuelle brute de ${formatEuros(employee.monthlyGrossSalary)}.`
    ),

    { type: "heading", text: "Article 7. Durée du travail" },
    para(
      params.isPartTime
        ? `${civility} est engagé(e) à temps partiel, pour un horaire hebdomadaire de ${params.weeklyHours}h par semaine. Cette durée sera répartie de façon à convenir entre les parties selon les besoins de l'entreprise.`
        : `${civility} est engagé(e) à temps plein, pour un horaire hebdomadaire de ${params.weeklyHours}h par semaine.`
    ),

    ...(params.isPartTime
      ? ([
          {
            type: "heading",
            text: "Article 8. Modification de la répartition horaire & Heures complémentaires",
          },
          para(
            "La répartition de la durée de travail pourra être modifiée dans les cas suivants : changements des heures d'ouverture, remplacement d'un salarié absent, accroissement de l'activité, accord entre les parties, réorganisation du planning de travail."
          ),
          para(
            "Cette modification sera notifiée au salarié au moins 7 jours avant son entrée en vigueur par lettre recommandée avec demande d'avis de réception."
          ),
          para(
            "Conformément aux articles L.3123-14 et L.3123-17 du Code du travail, des heures complémentaires pourront être effectuées dans la limite d'1/5ᵉ des heures."
          ),
        ] as Block[])
      : []),

    { type: "heading", text: "Article 9. Heures d'absences" },
    para(
      "Les heures d'absences pour convenance personnelle devront avoir obligatoirement l'accord de l'employeur, faute de quoi ces absences seront considérées comme injustifiées."
    ),
    para(
      "En cas d'absence pour maladie, le salarié devra prévenir de son absence dans les plus brefs délais et justifier dans les 48 heures par la production d'un certificat médical."
    ),

    { type: "heading", text: "Article 10. Retraite et Prévoyance" },
    para("Dès son entrée dans l'entreprise, le/la salarié(e) sera affilié(e) aux caisses de retraite et de prévoyance de l'entreprise."),

    { type: "heading", text: "Article 11. Congés payés" },
    para(
      "Le/la salarié(e) bénéficiera des congés payés institués en faveur des salariés de l'entreprise, soit 2,0833 jours ouvrés de congés payés par mois de travail effectif, soit 25 jours ouvrés pour une période de travail calculée du 1er juin de l'année précédente au 31 mai de l'année en cours."
    ),

    { type: "heading", text: "Article 12. Ancienneté" },
    para(
      "L'ancienneté du/de la salarié(e), pour la détermination des droits qui y sont liés, sera calculée selon des modalités identiques à celles applicables aux salariés à temps complet."
    ),

    { type: "heading", text: "Article 13. Égalité de traitement" },
    para(
      "Le/la salarié(e) bénéficiera de tous les droits et avantages reconnus aux salariés à temps plein travaillant dans l'entreprise, au prorata de son temps de travail le cas échéant."
    ),

    { type: "heading", text: "Article 14. Cumul d'emplois" },
    para(
      "Le/la salarié(e) pourra exercer, en parallèle, une autre activité professionnelle, sous réserve qu'elle ne porte pas préjudice aux intérêts légitimes de l'entreprise et dans le respect des durées maximales légales de travail."
    ),

    { type: "heading", text: "Article 15. Confidentialité" },
    para(
      "Le/la salarié(e) s'engage à respecter une stricte obligation de discrétion et de confidentialité sur tout ce qui concerne l'activité de l'entreprise. Cette obligation se prolongera après la cessation du contrat de travail, quelle qu'en soit la cause."
    ),

    { type: "heading", text: "Article 16. Préavis" },
    para(
      "Le/la salarié(e) et la société peuvent l'une et l'autre rompre à tout moment le contrat de travail en respectant les dispositions légales et conventionnelles en vigueur, en fonction de l'ancienneté acquise au moment du départ."
    ),

    { type: "heading", text: "Article 17. Conditions d'exécution du contrat" },
    para(
      "Le/la salarié(e) s'engage à observer toutes les instructions et consignes particulières de travail qui lui seront données, et à faire connaître à l'entreprise sans délai toute modification postérieure à son engagement (état civil, situation de famille, adresse, etc.)."
    ),

    { type: "heading", text: "Article 18. Engagement" },
    para(
      "Le/la salarié(e) reconnaît avoir pris connaissance du présent contrat, en accepte toutes les modalités et s'engage expressément à les respecter."
    ),
    para(
      "Le présent contrat est établi en deux exemplaires originaux dont l'un devra être retourné signé à l'entreprise dans les plus brefs délais."
    ),

    { type: "spacer" },
    para(`Fait à ${params.signingCity}`),
    para(`Le ${formatDateShort(params.signingDate)}`),
    para('Signatures précédées de la mention manuscrite « Lu et approuvé ».'),
    { type: "spacer" },
    p(b(civility)),
    para(fullName),
    { type: "spacer" },
    p(b("L'Employeur")),
    para(company.representativeName),
  ];

  return { title: `Contrat de travail — ${fullName}`, blocks };
}
