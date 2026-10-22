import { Block, CompanyDoc, EmployeeDoc, DocContent, para, p, b, rule, closing } from "../types";
import { formatDateFr, formatEuros, addDaysIso, daysBetweenIso } from "../helpers";
import { agr, civility, pronoun, salarieLabel } from "../gender";

export type ContratCDDParams = {
  startDate: string; // ISO - premier jour
  endDate: string; // ISO - dernier jour (terme précis du contrat, mention obligatoire L.1242-12)
  /** Période d'essai en jours calendaires : 1 jour par semaine de contrat, 2 semaines max pour un CDD ≤ 6 mois (L.1242-10). */
  trialDays: number;
  /** Motif précis du recours au CDD (L.1242-12) - texte libre, modifiable dans le formulaire. */
  motif: string;
  /** Description des tâches / poste de travail, une phrase. */
  tasks: string;
  /** Jour du mois suivant auquel le salaire est versé (« au plus tard le … »). */
  paymentDay: number;
  /** Prévoit la possibilité de renouveler une fois (dans la limite de 18 mois au total). */
  renewable: boolean;
  signingDate: string;
  signingCity: string;
};

/** Période d'essai maximale d'un CDD ≤ 6 mois : 1 jour par semaine, plafonnée à 14 jours (L.1242-10). */
export function maxTrialDaysCDD(startIso: string, endIso: string): number {
  const days = daysBetweenIso(startIso, endIso) + 1;
  return Math.max(0, Math.min(14, Math.floor(days / 7)));
}

export function contratCDD(employee: EmployeeDoc, company: CompanyDoc, params: ContratCDDParams): DocContent {
  const sex = employee.sex;
  const civ = civility(sex);
  const name = `${civ} ${employee.firstName} ${employee.lastName.toUpperCase()}`;
  const fullNameUpper = `${employee.lastName.toUpperCase()} ${employee.firstName}`;
  const salarie = salarieLabel(sex);
  const weeklyHours = employee.weeklyHours ?? 35;
  const monthlyHours = weeklyHours === 35 ? "151,67" : (Math.round(((weeklyHours * 52) / 12) * 100) / 100).toLocaleString("fr-FR");
  const durationDays = daysBetweenIso(params.startDate, params.endDate) + 1;
  const durationMonths = Math.round((durationDays / 30.4) * 10) / 10;
  const job = employee.jobTitle?.trim() || "Ouvrier";
  const trialDays = Math.min(Math.max(0, Math.floor(params.trialDays)), maxTrialDaysCDD(params.startDate, params.endDate));
  const payDay = params.paymentDay || 10;

  let articleNum = 0;
  function article(title: string): Block {
    articleNum += 1;
    return { type: "heading", text: `ARTICLE ${articleNum} - ${title}` };
  }

  const blocks: Block[] = [
    { type: "title", text: "CONTRAT DE TRAVAIL À DURÉE DÉTERMINÉE" },
    rule(),
    para("Entre les soussignés :"),
    { type: "spacer" },
    p(b(`${company.name}, ${company.legalForm}`)),
    para(`Siège social : ${company.address}`),
    para(`SIRET : ${company.siret}`),
    para(`Représentée par ${civility(company.representativeSex ?? "M")} ${company.representativeName}`),
    para(`En sa qualité de ${company.representativeTitle}`),
    para("Ci-après dénommée « la Société » ou « l'employeur »"),
    { type: "spacer" },
    p(b(name)),
    para(`${agr(sex, "Né", "e")} le ${formatDateFr(employee.dateOfBirth)}${employee.birthPlace ? ` à ${employee.birthPlace}` : ""}`),
    para(`N° de sécurité sociale : ${employee.socialSecurity ?? "____________"}`),
    para(`Demeurant : ${employee.address ?? "____________"}`),
    para(`Nationalité : ${employee.nationality ?? "____________"}`),
    para(`Ci-après ${agr(sex, "dénommé")} « ${sex === "F" ? "la salariée" : "le salarié"} »`),
    { type: "spacer" },
    para("Il est convenu ce qui suit :"),
    { type: "spacer" },

    article("MOTIF DU RECOURS AU CONTRAT À DURÉE DÉTERMINÉE"),
    para(params.motif.trim() || "____________________________________________"),
    para(
      `Le présent contrat n'a ni pour objet ni pour effet de pourvoir durablement un emploi lié à l'activité normale et permanente de la Société (article L.1242-1 du Code du travail).`
    ),

    article("ENGAGEMENT - POSTE DE TRAVAIL"),
    para(
      `${name} est ${agr(sex, "engagé")} à compter du ${formatDateFr(params.startDate)} en qualité ${/^[aeiouhéèAEIOUH]/.test(job) ? "d'" : "de "}${job}, ${params.tasks.trim() || "affecté aux travaux de réparation des locaux de la Société"}, sous réserve, en application de la réglementation en vigueur, des résultats de la visite d'information et de prévention.`
    ),
    para(
      "Le poste de travail ne figure pas sur la liste des postes présentant des risques particuliers pour la santé ou la sécurité des salariés mentionnée à l'article L.4154-2 du Code du travail."
    ),
    para(
      `${name} déclare être libre de tout engagement, n'être ${agr(sex, "tenu")} par aucune clause de non-concurrence, n'être ${agr(
        sex,
        "frappé"
      )} d'aucune incapacité ni d'aucune inaptitude physique à l'exercice de son activité.`
    ),
    para(
      `Le présent contrat est régi par les dispositions légales et réglementaires en vigueur, par la ${company.conventionCollective} applicable à l'entreprise, ainsi que par les dispositions particulières ci-après. Cette convention est tenue à la disposition du personnel auprès de la direction.`
    ),
    ...(employee.classification || employee.classe
      ? [
          para(
            `${name} est ${agr(sex, "classé")} au Groupe ${employee.classification ?? "____________"}${employee.classe ? `, Classe ${employee.classe}` : ""} de la grille de classification de la convention collective.`
          ),
        ]
      : []),

    article("DURÉE DU CONTRAT"),
    para(
      `Le présent contrat est conclu pour une durée déterminée de ${durationMonths.toLocaleString("fr-FR")} mois. Il prend effet le ${formatDateFr(params.startDate)} et prendra fin le ${formatDateFr(params.endDate)} au soir, terme précis du contrat (durée minimale : ${durationDays} jours calendaires), sans qu'aucune formalité ne soit nécessaire.`
    ),
    ...(params.renewable
      ? [
          para(
            `Le contrat pourra être renouvelé une fois, par avenant écrit signé avant le terme initial, pour une durée telle que la durée totale du contrat, renouvellement compris, n'excède pas dix-huit mois (articles L.1243-13 et L.1242-8 du Code du travail).`
          ),
        ]
      : []),
    para(
      `Si la relation de travail se poursuit après le terme du contrat sans que les parties aient conclu un nouveau contrat, le contrat devient à durée indéterminée (article L.1243-11 du Code du travail).`
    ),

    article("PÉRIODE D'ESSAI"),
    para(
      trialDays > 0
        ? `Le contrat comporte une période d'essai de ${trialDays} jours calendaires à compter du ${formatDateFr(params.startDate)}, calculée à raison d'un jour par semaine de contrat, dans la limite de deux semaines (article L.1242-10 du Code du travail). Pendant cette période, chacune des parties peut rompre le contrat dans le respect du délai de prévenance légal.`
        : "Le contrat ne comporte pas de période d'essai."
    ),

    article("DURÉE DU TRAVAIL"),
    para(
      `La durée du travail de ${name} est fixée à ${weeklyHours} heures par semaine, soit ${monthlyHours} heures par mois, réparties selon le planning de travail communiqué par la Société. L'horaire pourra être modifié selon les nécessités de service, dans le respect des dispositions légales et conventionnelles.`
    ),
    para(
      "Toute heure supplémentaire devra faire l'objet de l'accord préalable et exprès du supérieur hiérarchique et sera rémunérée ou compensée dans les conditions légales et conventionnelles."
    ),

    article("RÉMUNÉRATION"),
    para(
      `En contrepartie de son travail, ${name} percevra une rémunération mensuelle brute de base de ${formatEuros(employee.monthlyGrossSalary)} pour un horaire mensuel de ${monthlyHours} heures, sous réserve du respect des minima légaux et conventionnels.`
    ),
    para(
      `Le salaire est versé mensuellement, par virement bancaire, au plus tard le ${payDay} du mois suivant le mois travaillé. Lorsque cette date tombe un samedi, un dimanche ou un jour férié, le paiement est effectué le dernier jour ouvré précédent.`
    ),
    para(
      `À l'issue du contrat, ${name} percevra une indemnité de fin de contrat égale à 10 % de la rémunération totale brute versée pendant la durée du contrat, sauf dans les cas où cette indemnité n'est pas due (notamment poursuite de la relation de travail par un contrat à durée indéterminée, article L.1243-10 du Code du travail).`
    ),
    para(
      `Les congés payés acquis et non pris à la fin du contrat donneront lieu au versement d'une indemnité compensatrice de congés payés, égale à au moins 10 % de la rémunération totale brute perçue (article L.3141-26 du Code du travail).`
    ),

    article("LIEU DE TRAVAIL"),
    para(`Le lieu d'exécution du contrat de travail est fixé au ${company.address}.`),

    article("OBLIGATIONS PROFESSIONNELLES"),
    para(
      `${name} s'engage à observer toutes les instructions et consignes particulières de travail qui lui seront données et, plus particulièrement, les consignes relatives à l'hygiène et à la sécurité en vigueur dans l'entreprise, ainsi qu'à porter les équipements de protection individuelle mis à sa disposition.`
    ),
    para(
      `${civ === "Monsieur" ? "Il" : "Elle"} s'engage à respecter une stricte obligation de discrétion sur tout ce qui concerne l'activité de l'entreprise, y compris après la fin du contrat.`
    ),
    para(
      `${name} devra faire connaître à l'entreprise, sans délai, toute modification postérieure à son engagement qui pourrait intervenir dans son état civil, sa situation de famille ou son adresse.`
    ),
    para(
      `Dès la cessation de ses fonctions, ${pronoun(sex)} devra restituer les documents, clés et matériels qui lui ont été confiés.`
    ),

    article("ABSENCES"),
    para(
      "Toute absence, quelle que soit sa durée, doit être signalée immédiatement à la Société, avec indication du motif et de la durée prévisible, et justifiée dans les 48 heures."
    ),

    article("VISITE D'INFORMATION ET DE PRÉVENTION"),
    para(
      `${name} bénéficiera d'une visite d'information et de prévention dans le délai prévu par les articles R.4624-10 et suivants du Code du travail pour les salariés en contrat à durée déterminée.`
    ),

    article("GARANTIES SOCIALES"),
    para(
      `${name} sera ${agr(sex, "affilié")} dès son entrée en fonction au régime collectif et obligatoire de complémentaire santé et de prévoyance souscrit par la Société auprès de ${company.mutuelleProvider}, sous réserve des cas de dispense d'adhésion prévus par la réglementation, ainsi qu'aux caisses de retraite complémentaire (AGIRC-ARRCO) dont relève l'entreprise.`
    ),

    article("RUPTURE ANTICIPÉE"),
    para(
      "Sauf accord des parties, faute grave, force majeure, ou inaptitude constatée par le médecin du travail, le présent contrat ne peut être rompu avant son terme (article L.1243-1 du Code du travail)."
    ),

    article("TRAITEMENT DES DONNÉES PERSONNELLES ET CONFIDENTIALITÉ"),
    para(
      `${name} s'engage, conformément à la loi n° 78-17 du 6 janvier 1978 modifiée et au Règlement général sur la protection des données (RGPD), à ne pas utiliser, copier ni divulguer les données à caractère personnel auxquelles ${pronoun(sex)} pourrait avoir accès à des fins autres que celles de ses attributions. Cet engagement demeure après la cessation du contrat.`
    ),

    article("MENTIONS FINALES"),
    para(
      `${name} reconnaît avoir pris connaissance du présent contrat, en accepte toutes les modalités et s'engage expressément à les respecter. Le contrat est établi par écrit en deux exemplaires originaux, dont l'un est remis ${sex === "F" ? "à la salariée" : "au salarié"} au plus tard dans les deux jours ouvrables suivant l'embauche (article L.1242-13 du Code du travail).`
    ),

    { type: "spacer" },
    closing(
      `Fait en double exemplaire à ${params.signingCity}, le ${formatDateFr(params.signingDate)}.`,
      {
        label: "L'employeur",
        lines: [`${company.name}, ${company.legalForm}`, company.representativeName, company.representativeTitle],
      },
      { label: salarie, lines: [name, "(signature précédée de la mention « Lu et approuvé »)"] }
    ),
  ];

  return { title: `Contrat CDD - ${fullNameUpper}`, blocks };
}

/** Date de fin par défaut pour un CDD de N mois : le jour avant le même quantième N mois plus tard. */
export function defaultCddEndDate(startIso: string, months = 3): string {
  const d = new Date(startIso + "T00:00:00Z");
  d.setUTCMonth(d.getUTCMonth() + months);
  return addDaysIso(d.toISOString().split("T")[0], -1);
}
