import { Block, CompanyDoc, EmployeeDoc, DocContent, para, p, t, b, rule, signatureBlock } from "../types";
import { formatDateShort, formatEuros } from "../helpers";
import { agr, pronoun, salarieDu, salarieLabel, salarieLabelLower } from "../gender";

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
  const sex = employee.sex;
  const salarie = salarieLabel(sex);
  const salarieLower = salarieLabelLower(sex);

  let articleNum = 0;
  function article(title: string): Block {
    articleNum += 1;
    return { type: "heading", text: `Article ${articleNum}. ${title}` };
  }

  const classificationSentence =
    employee.classification || employee.classe
      ? para(
          `Cette fonction correspond, au sein de la grille de classification de la convention collective applicable, au groupe ${
            employee.classification ?? "____________"
          }${employee.classe ? `, classe ${employee.classe}` : ""}.`
        )
      : null;

  const blocks: Block[] = [
    {
      type: "title",
      text: `CONTRAT DE TRAVAIL À DURÉE INDÉTERMINÉE${
        params.isPartTime ? " À TEMPS PARTIEL" : ""
      }`,
    },
    rule(),
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
    para(
      `${agr(sex, "Né", "e")} le ${formatDateShort(employee.dateOfBirth)}${
        employee.birthPlace ? `, à ${employee.birthPlace}` : ""
      }`
    ),
    para(`De nationalité ${employee.nationality ?? "____________"}`),
    para(`N° Sécurité Sociale : ${employee.socialSecurity ?? "____________"}`),
    para(`Demeurant ${employee.address ?? "____________"}`),
    para(`Ci-après ${agr(sex, "dénommé")} « ${salarie} »`),
    para("D'AUTRE PART,"),
    { type: "spacer" },
    para("IL A ÉTÉ CONVENU CE QUI SUIT :"),
    { type: "spacer" },

    article("Conditions d'engagement"),
    para(
      `${salarie}, qui se déclare libre de tout engagement, est ${agr(sex, "embauché")} pour une durée indéterminée${
        params.isPartTime ? " à temps partiel" : " à temps plein"
      }, à compter du ${formatDateShort(params.startDate)} sous réserve des résultats de la visite médicale d'embauche.`
    ),
    para(`La déclaration préalable d'embauche a été faite auprès de l'URSSAF le ${formatDateShort(params.startDate)}.`),

    article("Convention collective"),
    para(
      `Sous réserve d'une évolution de l'activité de l'entreprise, le présent contrat est régi par les dispositions de la ${company.conventionCollective}.`
    ),

    article("Fonctions et classification"),
    para(`${salarie} est ${agr(sex, "engagé")} en qualité de ${employee.jobTitle ?? "____________"}.`),
    ...(classificationSentence ? [classificationSentence] : []),

    article("Période d'essai"),
    para(
      `Le présent contrat est conclu pour une durée indéterminée, il ne deviendra définitif qu'à l'issue de la période d'essai fixée à ${params.trialDays} jours, renouvelable une fois si un accord de branche le prévoit et pour une durée maximum égale à la première. En cas de renouvellement de la période d'essai, un accord écrit devra être établi.`
    ),
    para(
      "Durant cette période d'essai, le contrat pourra être rompu par l'une ou l'autre des parties, à tout moment, sous réserve du respect du délai de prévenance prévu aux articles L.1221-25 ou L.1221-26 du Code du travail."
    ),
    para(
      "Au terme de la période d'essai, si elle s'est avérée satisfaisante, le présent contrat deviendra définitif et se poursuivra pour une période indéterminée."
    ),

    article("Lieu de travail"),
    para(`${salarie} est ${agr(sex, "rattaché")} initialement au siège social de l'entreprise.`),
    para(
      `Cette mobilité pourra s'exercer dans les limites géographiques suivantes : ${params.mobiliteZone}.`
    ),

    article("Rémunération"),
    para(
      params.isPartTime
        ? `En contrepartie de son travail, ${salarie} percevra une rémunération mensuelle brute de ${formatEuros(employee.monthlyGrossSalary)} pour ${params.weeklyHours}h par semaine.`
        : `En contrepartie de son travail, ${salarie} percevra une rémunération mensuelle brute de ${formatEuros(employee.monthlyGrossSalary)}.`
    ),

    article("Durée du travail"),
    para(
      params.isPartTime
        ? `${salarie} est ${agr(sex, "engagé")} à temps partiel, pour un horaire hebdomadaire de ${params.weeklyHours}h par semaine. Cette durée sera répartie de façon à convenir entre les parties selon les besoins de l'entreprise.`
        : `${salarie} est ${agr(sex, "engagé")} à temps plein, pour un horaire hebdomadaire de ${params.weeklyHours}h par semaine.`
    ),

    ...(params.isPartTime
      ? ([
          article("Modification de la répartition horaire & Heures complémentaires"),
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

    article("Heures d'absences"),
    para(
      "Les heures d'absences pour convenance personnelle devront avoir obligatoirement l'accord de l'employeur, faute de quoi ces absences seront considérées comme injustifiées."
    ),
    para(
      `En cas d'absence pour maladie, ${salarieLower} devra prévenir de son absence dans les plus brefs délais et justifier dans les 48 heures par la production d'un certificat médical.`
    ),

    article("Retraite et Prévoyance"),
    para(`Dès son entrée dans l'entreprise, ${salarieLower} sera ${agr(sex, "affilié")} aux caisses de retraite et de prévoyance de l'entreprise.`),

    article("Congés payés"),
    para(
      `${salarie} bénéficiera des congés payés institués en faveur des salariés de l'entreprise, soit 2,0833 jours ouvrés de congés payés par mois de travail effectif, soit 25 jours ouvrés pour une période de travail calculée du 1er juin de l'année précédente au 31 mai de l'année en cours.`
    ),

    article("Ancienneté"),
    para(
      `L'ancienneté ${salarieDu(sex)}, pour la détermination des droits qui y sont liés, sera calculée selon des modalités identiques à celles applicables aux salariés à temps complet.`
    ),

    article("Égalité de traitement"),
    para(
      `${salarie} bénéficiera de tous les droits et avantages reconnus aux salariés à temps plein travaillant dans l'entreprise, au prorata de son temps de travail le cas échéant.`
    ),

    article("Cumul d'emplois"),
    para(
      `${salarie} pourra exercer, en parallèle, une autre activité professionnelle, sous réserve qu'elle ne porte pas préjudice aux intérêts légitimes de l'entreprise et dans le respect des durées maximales légales de travail.`
    ),

    article("Confidentialité"),
    para(
      `${salarie} s'engage à respecter une stricte obligation de discrétion et de confidentialité sur tout ce qui concerne l'activité de l'entreprise. Cette obligation se prolongera après la cessation du contrat de travail, quelle qu'en soit la cause.`
    ),

    article("Traitement des données personnelles"),
    para(
      `${salarie}, étant à ce titre ${agr(sex, "amené")} à accéder à des données à caractère personnel dans l'exercice de ses fonctions, déclare reconnaître la confidentialité desdites données.`
    ),
    para(
      `Conformément aux articles 34 et 35 de la loi du 6 janvier 1978 modifiée relative à l'informatique, aux fichiers et aux libertés ainsi qu'aux articles 32 à 35 du Règlement général sur la protection des données du 27 avril 2016, ${pronoun(sex)} s'engage à prendre toutes précautions conformes aux usages afin de protéger la confidentialité des informations auxquelles ${pronoun(sex)} a accès.`
    ),
    para(
      "Cet engagement de confidentialité, en vigueur pendant toute la durée de ses fonctions, demeurera effectif, sans limitation de durée après la cessation de ses fonctions, quelle qu'en soit la cause, dès lors que cet engagement concerne l'utilisation et la communication de données à caractère personnel."
    ),

    article("Formation professionnelle"),
    para(
      `${salarie} bénéficie du droit à la formation professionnelle tout au long de la vie, notamment au titre du compte personnel de formation (CPF) et du plan de développement des compétences de l'entreprise.`
    ),
    para(
      `${salarie} est ${agr(sex, "informé")} qu'${pronoun(sex)} bénéficie tous les deux ans d'un entretien professionnel avec son employeur consacré à ses perspectives d'évolution professionnelle, notamment en termes de qualifications et d'emploi, conformément aux dispositions de l'article L.6315-1 du Code du travail.`
    ),

    article("Préavis"),
    para(
      "En cas de rupture du contrat de travail à l'initiative de l'une ou l'autre des parties, un préavis devra être respecté, dont la durée est fixée par les dispositions légales et conventionnelles en vigueur en fonction de l'ancienneté acquise au moment du départ."
    ),

    article("Conditions d'exécution du contrat"),
    para(
      `${salarie} s'engage à observer toutes les instructions et consignes particulières de travail qui lui seront données, et à faire connaître à l'entreprise sans délai toute modification postérieure à son engagement (état civil, situation de famille, adresse, etc.).`
    ),

    article("Engagement"),
    para(
      `${salarie} reconnaît avoir pris connaissance du présent contrat, en accepte toutes les modalités et s'engage expressément à les respecter.`
    ),
    para(
      "Le présent contrat est établi en deux exemplaires originaux dont l'un devra être retourné signé à l'entreprise dans les plus brefs délais."
    ),

    { type: "spacer" },
    para(`Fait à ${params.signingCity}, le ${formatDateShort(params.signingDate)}`),
    signatureBlock(
      { label: "L'Employeur", lines: [company.representativeName, company.representativeTitle] },
      { label: salarie, lines: [fullName, "« Lu et approuvé »"] }
    ),
  ];

  return { title: `Contrat de travail — ${fullName}`, blocks };
}
