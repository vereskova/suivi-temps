import { Block, CompanyDoc, EmployeeDoc, DocContent, para, p, b, rule, signatureBlock } from "../types";
import { formatDateFr, formatEuros } from "../helpers";
import { agr, civility, pronoun, salarieLabel } from "../gender";

export type ContratBureauParams = {
  startDate: string;
  trialMonths: number; // période d'essai, in months (ETAM/Agent de maîtrise: 2 or 3 per L.1221-19)
  signingDate: string;
  signingCity: string;
  isPartTime: boolean;
  weeklyEffectiveHours: number; // actual contracted weekly hours
  hasStructuralOvertime: boolean; // true if weeklyEffectiveHours > 35 with built-in overtime
  overtimeMajorationPercent: number; // e.g. 25 — only used if hasStructuralOvertime
  mobiliteZone: string;
  travelDescription: string; // free text, e.g. "des déplacements ponctuels sur les chantiers..." — leave blank to omit
  dealsWithClients: boolean;
  classificationStatut: string; // e.g. "Technicien / Agent de maîtrise (ETAM)"
  classificationReferenceCode: string; // optional repère-emploi code, e.g. "M110.01.001" — leave blank to omit
  // Statutory minimums for the comparison paragraph in Article "Rémunération" — leave any blank to omit
  // the whole paragraph rather than guess (these change periodically and must be RH-verified).
  smgAnnualAmount: number | null;
  smgMonthlyAmount: number | null;
  smicMonthlyAmount: number | null;
  smicHourlyRate: number | null;
};

export function contratBureau(
  employee: EmployeeDoc,
  company: CompanyDoc,
  params: ContratBureauParams
): DocContent {
  const sex = employee.sex;
  const civ = civility(sex);
  const name = `${civ} ${employee.firstName} ${employee.lastName.toUpperCase()}`;
  const fullNameUpper = `${employee.lastName.toUpperCase()} ${employee.firstName}`;
  const salarie = salarieLabel(sex);
  const monthlyHoursNumber = params.isPartTime
    ? Math.round(((params.weeklyEffectiveHours * 52) / 12) * 100) / 100
    : 151.67;
  const monthlyHours = monthlyHoursNumber.toLocaleString("fr-FR", { maximumFractionDigits: 2 });

  let articleNum = 0;
  function article(title: string): Block {
    articleNum += 1;
    return { type: "heading", text: `ARTICLE ${articleNum} – ${title}` };
  }
  // Article 1 cross-references the "Visite d'information et de prévention" article by number.
  // Its position is fixed by the order of article() calls below (currently the 9th) — update
  // this constant if that ordering ever changes.
  const VISITE_ARTICLE_NUMBER = 9;

  const classificationLine =
    employee.classification || employee.classe
      ? para(
          `Conformément à la grille de classification de la ${company.conventionCollective}, Titre V, articles 59 à 64, fondée sur l'évaluation des critères classants (autonomie, responsabilité, complexité, connaissances/formation-expérience), ${name} est ${agr(
            sex,
            "classé"
          )} au Groupe ${employee.classification ?? "____________"}${
            employee.classe ? `, Classe ${employee.classe}` : ""
          }${params.classificationReferenceCode ? ` (référence ${params.classificationReferenceCode})` : ""}.`
        )
      : null;

  const remunerationMinimumLine =
    params.smgAnnualAmount && params.smgMonthlyAmount && params.smicMonthlyAmount && params.smicHourlyRate
      ? [
          para(
            `Le salaire minimum garanti (SMG) conventionnel applicable au Groupe ${employee.classification ?? "____________"}${
              employee.classe ? `, Classe ${employee.classe}` : ""
            } retenu à l'article 1 s'élève à ${formatEuros(params.smgAnnualAmount)} bruts annuels, soit ${formatEuros(
              params.smgMonthlyAmount
            )} bruts mensuels pour ${monthlyHours} heures.`
          ),
          para(
            `Le SMIC en vigueur, fixé à ${formatEuros(params.smicMonthlyAmount)} bruts mensuels pour ${monthlyHours} heures, soit un taux horaire de ${formatEuros(
              params.smicHourlyRate
            )}, ${
              params.smicMonthlyAmount >= params.smgMonthlyAmount
                ? "étant supérieur ou égal au SMG conventionnel, il"
                : "le SMG conventionnel étant supérieur, celui-ci"
            } constitue le minimum de rémunération applicable.`
          ),
        ]
      : [];

  const overtimeLine = params.hasStructuralOvertime
    ? [
        para(
          `Les ${(params.weeklyEffectiveHours - 35).toString().replace(".", ",")} heures effectuées chaque semaine au-delà de la durée légale de 35 heures constituent des heures supplémentaires structurelles, intégrées à l'horaire contractuel. Elles seront rémunérées avec une majoration de salaire d'au moins ${params.overtimeMajorationPercent} %, conformément aux dispositions légales et conventionnelles applicables. Le détail de cette majoration figurera distinctement sur chaque bulletin de paie.`
        ),
      ]
    : [];

  const blocks: Block[] = [
    {
      type: "title",
      text: `CONTRAT DE TRAVAIL À DURÉE INDÉTERMINÉE${params.isPartTime ? " À TEMPS PARTIEL" : ""}`,
    },
    rule(),
    para("Entre les soussignés :"),
    { type: "spacer" },
    p(b(`${company.name}, ${company.legalForm}`)),
    para(`Siège social : ${company.address}`),
    para(`SIRET : ${company.siret}`),
    para(`Représentée par ${civility(company.representativeSex ?? "M")} ${company.representativeName}`),
    para(`En sa qualité de ${company.representativeTitle}`),
    para('Ci-après dénommée « la Société » ou « l\'employeur »'),
    { type: "spacer" },
    p(b(name)),
    para(
      `${agr(sex, "Né", "e")} le ${formatDateFr(employee.dateOfBirth)}${
        employee.birthPlace ? ` à ${employee.birthPlace}` : ""
      }`
    ),
    para(`N° de sécurité sociale : ${employee.socialSecurity ?? "____________"}`),
    para(`Demeurant : ${employee.address ?? "____________"}`),
    para(`Nationalité : ${employee.nationality ?? "____________"}`),
    para(`Ci-après ${agr(sex, "dénommé")} « ${sex === "F" ? "la salariée" : "le salarié"} »`),
    { type: "spacer" },
    para("Il est convenu ce qui suit :"),
    { type: "spacer" },

    article("ENGAGEMENT – EMPLOI"),
    para(
      `${name} est ${agr(sex, "engagé")} à compter du ${formatDateFr(params.startDate)} en qualité de ${
        employee.jobTitle ?? "____________"
      }, sous réserve, en application de la réglementation en vigueur, des résultats de la visite d'information et de prévention prévue à l'article ${VISITE_ARTICLE_NUMBER} du présent contrat.`
    ),
    para(`Statut : ${params.classificationStatut}.`),
    ...(classificationLine ? [classificationLine] : []),
    para(
      `${name} déclare être libre de tout engagement, n'être ${agr(
        sex,
        "tenu"
      )} par aucune clause de non-concurrence, n'être ${agr(
        sex,
        "frappé"
      )} d'aucune incapacité ni d'aucune inaptitude physique à l'exercice de son activité.`
    ),
    para(
      `Le présent contrat est régi par les dispositions légales et réglementaires en vigueur, par les dispositions de la convention collective actuellement applicable à l'entreprise, à savoir la ${company.conventionCollective}, ainsi que par les dispositions particulières ci-après.`
    ),

    article("CONVENTION COLLECTIVE"),
    para(
      `Le présent contrat est régi par la ${company.conventionCollective}, ainsi que par tout accord de branche ou d'entreprise qui viendrait s'y substituer ou la compléter. Cette convention est tenue à la disposition du personnel auprès de la direction, conformément à l'article R.2262-3 du Code du travail.`
    ),

    article("PÉRIODE D'ESSAI"),
    para(
      `Le contrat de travail est conclu pour une durée indéterminée. Il prend cours le ${formatDateFr(params.startDate)}.`
    ),
    para(
      `Le présent contrat ne deviendra définitif qu'à l'issue d'une période d'essai de ${params.trialMonths} mois maximum à compter du ${formatDateFr(
        params.startDate
      )}, conformément à l'article L.1221-19 du Code du travail applicable aux employés, techniciens et agents de maîtrise.`
    ),
    para(
      `Pendant la période d'essai, chacune des parties peut rompre librement le contrat, sous réserve du respect du délai de prévenance légal ou conventionnel en vigueur. En cas de rupture à l'initiative de la Société, une lettre sera adressée à ${name} respectant ce délai de prévenance.`
    ),
    para(
      `La période d'essai ne pourra être renouvelée qu'une seule fois, pour une durée maximale égale à la première, et à la double condition que ce renouvellement soit expressément prévu par la convention collective applicable et qu'il recueille l'accord exprès et écrit de ${name}, donné avant le terme de la période d'essai initiale, conformément à l'article L.1221-23 du Code du travail. À défaut d'un tel accord écrit, la période d'essai ne pourra pas être renouvelée.`
    ),

    article("DURÉE DU TRAVAIL"),
    para(
      `La durée légale du travail applicable est de 35 heures hebdomadaires.${
        params.isPartTime
          ? ` La durée hebdomadaire de travail contractuelle de ${name} est fixée à ${params.weeklyEffectiveHours} heures.`
          : ` La durée hebdomadaire de travail effectif de ${name} est fixée à ${params.weeklyEffectiveHours} heures.`
      }`
    ),
    ...overtimeLine,
    para(
      `L'horaire de travail de ${name} est réparti selon les modalités en vigueur au sein de l'entreprise, affichées sur le lieu de travail, et pourra être modifié en fonction des nécessités de service, dans le respect des dispositions légales, réglementaires et conventionnelles applicables.`
    ),
    para(
      `Toute heure supplémentaire${params.hasStructuralOvertime ? " effectuée au-delà de l'horaire contractuel" : ""} devra faire l'objet de l'accord préalable et exprès du supérieur hiérarchique de ${name}.`
    ),

    article("RÉMUNÉRATION"),
    para(
      params.isPartTime
        ? `En contrepartie de son travail, ${name} percevra une rémunération mensuelle brute de base de ${formatEuros(
            employee.monthlyGrossSalary
          )} pour un horaire mensuel de ${monthlyHours} heures.`
        : `En contrepartie de son travail, ${name} percevra une rémunération mensuelle brute de base de ${formatEuros(
            employee.monthlyGrossSalary
          )} pour un horaire mensuel de ${monthlyHours} heures (équivalent à ${params.weeklyEffectiveHours} heures hebdomadaires).`
    ),
    ...remunerationMinimumLine,

    article("LIEU DE TRAVAIL ET MOBILITÉ"),
    para(`Le lieu d'exécution habituel du contrat de travail est fixé au ${company.address}.`),
    ...(params.travelDescription
      ? [
          para(
            `Compte tenu de la nature de ses fonctions et de l'activité de la Société, ${name} pourra être ${agr(
              sex,
              "amené"
            )} à effectuer ${params.travelDescription}, dans le respect des dispositions légales et conventionnelles applicables en matière de durée du travail et de repos.`
          ),
        ]
      : []),
    para(
      `Par ailleurs, une clause de mobilité est convenue entre les parties : ${name} pourra être ${agr(
        sex,
        "affecté"
      )}, en fonction des nécessités de service, dans les limites géographiques suivantes : ${params.mobiliteZone}. Toute extension de ce périmètre fera l'objet d'un accord écrit préalable des parties.`
    ),

    article("OBLIGATIONS PROFESSIONNELLES"),
    para(
      `${name} s'engage à observer toutes les instructions et consignes particulières de travail qui lui seront données et, plus particulièrement, les consignes relatives à l'hygiène et à la sécurité en vigueur dans l'entreprise.`
    ),
    para(
      `${civ === "Monsieur" ? "Il" : "Elle"} s'engage également à respecter une stricte obligation de discrétion sur tout ce qui concerne l'activité de l'entreprise${
        params.dealsWithClients ? " ainsi que sur toutes les informations concernant sa clientèle" : ""
      }.`
    ),
    ...(params.dealsWithClients
      ? [
          para(
            `Pouvant être en contact avec la clientèle, ${name} devra veiller à lui réserver un accueil aimable et ce, en toutes circonstances, et devra avoir une tenue vestimentaire correcte et compatible avec ses fonctions.`
          ),
        ]
      : []),
    para(
      `${name} devra faire connaître à l'entreprise, sans délai, toute modification postérieure à son engagement qui pourrait intervenir dans son état civil, sa situation de famille ou son adresse.`
    ),
    para(
      `Dès la cessation de ses fonctions au sein de l'entreprise, ${name} devra restituer les documents et autres matériels qui lui ont été confiés ou établis par ses soins pour l'exercice de sa fonction.`
    ),

    article("ABSENCES DIVERSES"),
    para(
      `Toute absence, quelle que soit sa durée, doit faire l'objet d'une justification auprès de la Société sans délai et selon tout moyen à la convenance de ${name}.`
    ),
    para(`${name} s'engage donc :`),
    {
      type: "list",
      items: [
        "à informer immédiatement la Société de tout empêchement d'exercer ses fonctions, en indiquant les motifs et la durée prévisible de cette absence ;",
        "et à produire un justificatif dans les 48 heures.",
      ],
    },

    article("VISITE D'INFORMATION ET DE PRÉVENTION"),
    para(
      `${name} bénéficiera d'une visite d'information et de prévention, qui devra intervenir dans un délai maximal de trois mois à compter de sa prise effective de fonctions, conformément aux articles R.4624-10 et suivants du Code du travail, sauf régime particulier de suivi renforcé applicable le cas échéant.`
    ),

    article("GARANTIES SOCIALES – MUTUELLE, PRÉVOYANCE ET RETRAITE"),
    para(
      `La Société a souscrit, au bénéfice de l'ensemble de ses salariés, un régime collectif et obligatoire de complémentaire santé et de prévoyance auprès de ${company.mutuelleProvider}.`
    ),
    para(
      `${name} sera ${agr(
        sex,
        "affilié"
      )} à ce régime dès son entrée en fonction, dans les conditions et selon les modalités de participation de l'employeur en vigueur au sein de la Société, sous réserve des cas de dispense d'adhésion prévus par la réglementation applicable. Une notice d'information détaillée lui sera remise par l'employeur.`
    ),
    para(
      `${name} sera par ailleurs ${agr(
        sex,
        "affilié"
      )}, dès son entrée en fonction, aux caisses de retraite complémentaire (AGIRC-ARRCO) dont relève l'entreprise, dans les conditions prévues par les dispositions légales et conventionnelles en vigueur.`
    ),

    article("CONGÉS PAYÉS"),
    para(
      `${name} bénéficiera des congés payés institués en faveur des salariés de l'entreprise, soit 2,0833 jours ouvrés de congés payés par mois de travail effectif, soit 25 jours ouvrés pour une période de référence calculée du 1er juin de l'année précédente au 31 mai de l'année en cours, conformément aux articles L.3141-3 et suivants du Code du travail.`
    ),

    article("TRAITEMENT DES DONNÉES PERSONNELLES"),
    para(
      `${name}, exerçant les fonctions de ${employee.jobTitle ?? "____________"} au sein de la Société, étant à ce titre ${agr(
        sex,
        "amené"
      )} à accéder à des données à caractère personnel, déclare reconnaître la confidentialité desdites données.`
    ),
    para(
      `${name} s'engage par conséquent, conformément à la loi n° 78-17 du 6 janvier 1978 modifiée relative à l'informatique, aux fichiers et aux libertés, ainsi qu'au Règlement général sur la protection des données (RGPD) du 27 avril 2016, à prendre toutes précautions conformes aux usages et à l'état de l'art dans le cadre de ses attributions afin de protéger la confidentialité des informations auxquelles ${pronoun(
        sex
      )} a accès, et en particulier d'empêcher qu'elles ne soient modifiées, endommagées ou communiquées à des personnes non expressément autorisées à recevoir ces informations.`
    ),
    para(`${name} s'engage en particulier à :`),
    {
      type: "list",
      items: [
        `ne pas utiliser les données auxquelles ${pronoun(sex)} peut accéder à des fins autres que celles prévues par ses attributions ;`,
        "ne divulguer ces données qu'aux personnes dûment autorisées, en raison de leurs fonctions, à en recevoir communication, qu'il s'agisse de personnes privées, publiques, physiques ou morales ;",
        "ne faire aucune copie de ces données sauf si cela est nécessaire à l'exécution de ses fonctions ;",
        "prendre toutes les mesures conformes aux usages et à l'état de l'art dans le cadre de ses attributions afin d'éviter l'utilisation détournée ou frauduleuse de ces données ;",
        "prendre toutes précautions conformes aux usages et à l'état de l'art pour préserver la sécurité de ces données ;",
        "s'assurer, dans la limite de ses attributions, que seuls des moyens de communication sécurisés seront utilisés pour transférer ces données ;",
        "en cas de cessation de ses fonctions, restituer intégralement les données, fichiers informatiques et tout support d'information relatif à ces données.",
      ],
    },
    para(
      "Cet engagement de confidentialité, en vigueur pendant toute la durée de ses fonctions, demeurera effectif, sans limitation de durée après la cessation de ses fonctions, quelle qu'en soit la cause, dès lors que cet engagement concerne l'utilisation et la communication de données à caractère personnel."
    ),
    para(
      `${name} reconnaît avoir été ${agr(
        sex,
        "informé"
      )} que toute violation du présent engagement l'expose notamment à des actions et sanctions disciplinaires et pénales conformément aux dispositions légales en vigueur.`
    ),

    article("CONFIDENTIALITÉ"),
    para(
      `${name} s'engage à respecter une stricte obligation de discrétion et de confidentialité sur tout ce qui concerne l'activité de l'entreprise, ses procédés, son savoir-faire et ses informations commerciales ou financières. Cette obligation se prolongera après la cessation du contrat de travail, quelle qu'en soit la cause.`
    ),

    article("FORMATION PROFESSIONNELLE"),
    para(
      `${name} bénéficie du droit à la formation professionnelle continue tout au long de sa carrière, notamment par la mobilisation de son compte personnel de formation (CPF) dans les conditions prévues aux articles L.6323-1 et suivants du Code du travail, ainsi que, le cas échéant, du plan de développement des compétences mis en œuvre par l'entreprise.`
    ),

    article("ENTRETIEN PROFESSIONNEL"),
    para(
      `${name} est ${agr(
        sex,
        "informé"
      )} qu'${pronoun(sex)} bénéficie, tous les deux ans, d'un entretien professionnel avec son employeur consacré à ses perspectives d'évolution professionnelle, notamment en termes de qualifications et d'emploi, conformément aux dispositions de l'article L.6315-1 du Code du travail.`
    ),

    article("PRÉAVIS"),
    para(
      "En cas de rupture du contrat de travail à l'initiative de l'une ou l'autre des parties, un préavis devra être respecté, dont la durée est fixée par les dispositions légales et conventionnelles en vigueur en fonction de l'ancienneté acquise au moment du départ."
    ),

    article("CONDITIONS D'EXÉCUTION DU CONTRAT"),
    para(
      `${name} s'engage à observer toutes les instructions et consignes particulières de travail qui lui seront données, et à faire connaître à l'entreprise sans délai toute modification postérieure à son engagement (état civil, situation de famille, adresse, etc.).`
    ),

    article("MENTIONS FINALES"),
    para(
      `${name} reconnaît avoir pris connaissance du présent contrat, en accepte toutes les modalités et s'engage expressément à les respecter.`
    ),
    para("Le présent contrat est établi en deux exemplaires originaux dont l'un est remis à chaque partie."),

    { type: "spacer" },
    para(`Fait en double exemplaire à ${params.signingCity}, le ${formatDateFr(params.signingDate)}.`),
    signatureBlock(
      {
        label: "L'employeur",
        lines: [`${company.name}, ${company.legalForm}`, company.representativeName, company.representativeTitle],
      },
      { label: salarie, lines: [name, "(signature précédée de la mention « Lu et approuvé »)"] }
    ),
  ];

  return { title: `Contrat de travail — ${fullNameUpper}`, blocks };
}
