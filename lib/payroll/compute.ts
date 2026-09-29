/**
 * Ports the net→brut reverse payroll calculation from VLADIS_с_итогом.xlsx
 * ("Расчёт ЗП" sheet). `netSouhaite` is a fixed target the accountant will
 * not adjust — every other line item is derived from it, in a waterfall:
 * base pay (days actually worked this month × the employee's own daily
 * rate) is subtracted first, then jours repas fills whatever gap is left
 * (capped by both the plan's max and by days worked — can't claim more meal
 * days than days present), then overtime at +25%, then +50%, then whatever
 * still isn't covered becomes prime exceptionnelle.
 *
 * Base pay falls back to the old fixed full-month calculation
 * (heuresNormalesMois × tauxHoraireBase) when either `joursTravailles` or
 * `salaireBaseNet` isn't provided for a line — this keeps rows computing
 * exactly as before until both new fields are actually filled in for them,
 * instead of silently collapsing to zero on rollout.
 *
 * Jours fériés worked are tracked in the Paie view (count only) but don't
 * feed this calculation — the accountant handles their pay separately.
 *
 * This produces the INPUT table handed to the accountant; it does not
 * generate an actual bulletin de paie.
 */

export type PayrollParams = {
  tauxHoraireBase: number;
  heuresNormalesMois: number;
  joursOuvresMoisStandard: number;
  /** Current net monthly SMIC, per the accountant — not derived from anything else, since no formula produces this correctly; update it directly whenever it changes. */
  smicNetMensuel: number;
  majorationHs25: number;
  majorationHs50: number;
  tauxRetenues: number;
  exonerationHsFixe: number;
  tarifRepasJour: number;
  maxJoursRepas: number;
  maxHs25Heures: number;
  maxHs50Heures: number;
};

export type PayrollInput = {
  netSouhaite: number;
  joursTravailles: number;
  /** The employee's own reference monthly net salary — null/0 until set on their profile. */
  salaireBaseNet: number | null;
};

export type PayrollResult = {
  /** The base pay portion actually used this run — day-based (joursTravailles × salaireBaseNet ÷ joursOuvresMoisStandard) once both inputs are filled, otherwise the old fixed full-month fallback. */
  baseNet: number;
  joursRepas: number;
  hs25Heures: number;
  hs50Heures: number;
  primeExceptionnelle: number;
};

export function computePayrollLine(input: PayrollInput, params: PayrollParams): PayrollResult {
  const netSouhaite = input.netSouhaite || 0;
  const joursTravailles = input.joursTravailles || 0;
  const salaireBaseNet = input.salaireBaseNet || 0;

  const {
    tauxHoraireBase: rate,
    heuresNormalesMois: normalHours,
    joursOuvresMoisStandard: joursOuvresStandard,
    majorationHs25: maj25,
    majorationHs50: maj50,
    tauxRetenues: retenues,
    exonerationHsFixe: exoneration,
    tarifRepasJour: tarifRepas,
    maxJoursRepas,
    maxHs25Heures: maxHs25,
    maxHs50Heures: maxHs50,
  } = params;

  const netUnit = 1 - retenues;

  const useJoursTravailles = joursTravailles > 0 && salaireBaseNet > 0;
  const baseNet = useJoursTravailles
    ? joursTravailles * (salaireBaseNet / joursOuvresStandard)
    : normalHours * rate * netUnit;
  const repasCap = useJoursTravailles ? Math.min(maxJoursRepas, joursTravailles) : maxJoursRepas;

  const remainderAfterBase = netSouhaite - baseNet - exoneration;
  const joursRepas = Math.min(
    repasCap,
    Math.max(0, Math.ceil(Math.max(0, remainderAfterBase) / tarifRepas))
  );
  const repasNet = joursRepas * tarifRepas;

  const remainderAfterRepas = remainderAfterBase - repasNet;
  const hs25Heures = Math.min(
    maxHs25,
    Math.max(0, Math.ceil(Math.max(0, remainderAfterRepas) / netUnit / (rate * (1 + maj25))))
  );

  const hs25Brut = hs25Heures * rate * (1 + maj25);
  const remainderAfterHs25 = remainderAfterRepas - hs25Brut * netUnit;
  const hs50Heures = Math.min(
    maxHs50,
    Math.max(0, Math.ceil(Math.max(0, remainderAfterHs25) / netUnit / (rate * (1 + maj50))))
  );

  const hs50Brut = hs50Heures * rate * (1 + maj50);
  const netUsedSoFar = baseNet + exoneration + repasNet + hs25Brut * netUnit + hs50Brut * netUnit;
  const primeExceptionnelle = Math.max(0, Math.round((netSouhaite - netUsedSoFar) * 100) / 100);

  return { baseNet, joursRepas, hs25Heures, hs50Heures, primeExceptionnelle };
}

export const DEFAULT_PAYROLL_PARAMS: PayrollParams = {
  tauxHoraireBase: 12.31,
  heuresNormalesMois: 151.67,
  joursOuvresMoisStandard: 21.67,
  smicNetMensuel: 1477.93,
  majorationHs25: 0.25,
  majorationHs50: 0.5,
  tauxRetenues: 0.2197,
  exonerationHsFixe: 72.4,
  tarifRepasJour: 30,
  maxJoursRepas: 22,
  maxHs25Heures: 32,
  maxHs50Heures: 8,
};

/**
 * Nuit — Convention Collective Nationale de la Métallurgie (IDCC 3248),
 * avenant SMH au 1er janvier 2026. Travail de nuit (21h-6h) : +15% du SMH
 * (salaire minimum hiérarchique du groupe), pas du salaire personnel — payé
 * en plus des heures normales, cumulable avec les HS.
 *
 * Chaque lettre de groupe couvre en réalité 2 classes (SMH annuel/mensuel/
 * horaire à 151,67h) ; `employees.classification` ne stocke que la lettre,
 * donc on prend la classe la BASSE des deux (plancher, jamais un montant
 * inventé) :
 *   A 1-2: SMIC (1 867,02 €/mois, le SMH conventionnel du groupe A étant
 *          sous le SMIC) → 12,31 €/h · B3: 22 710 €/an → 12,48 €/h
 *   C5: 24 510 €/an → 13,46 €/h · D7: 26 680 €/an → 14,66 €/h
 *   E9: 30 760 €/an → 16,91 €/h · F11: 35 200 €/an → 19,34 €/h
 *   G13: 40 350 €/an → 22,17 €/h · H15: 47 380 €/an → 26,04 €/h
 *   I17: 59 720 €/an → 32,81 €/h
 * Seul le groupe A a été confirmé avec l'utilisatrice pour l'usage réel
 * actuel (postes chantier) — les autres sont là pour ne pas planter si le
 * champ contient une autre lettre, à re-vérifier avant tout usage réel.
 *
 * Sources : ressources.convention.fr/ressources-juridiques/
 * temps-de-travail-convention-metallurgie ; skello.io/blog/
 * convention-collective-metallurgie — à reconfirmer avec le comptable
 * avant tout usage contentieux, ce ne sont pas des sources officielles
 * (Légifrance/Bulletin officiel de la convention).
 */
export const NIGHT_PREMIUM_RATE = 0.15;

export const SMH_HOURLY_BY_GROUP: Record<string, number> = {
  A: 12.31,
  B: 12.48,
  C: 13.46,
  D: 14.66,
  E: 16.91,
  F: 19.34,
  G: 22.17,
  H: 26.04,
  I: 32.81,
};

export type NightPremiumResult = {
  group: string;
  hourlyRateSmh: number;
  hourlyPremium: number;
  heuresNuit: number;
  amount: number;
};

/** heuresNuit × 15% du SMH horaire du groupe conventionnel de l'employé — voir la note ci-dessus. */
export function computeNightPremium(heuresNuit: number, classification: string | null): NightPremiumResult {
  const group = (classification ?? "A").trim().toUpperCase().charAt(0) || "A";
  const hourlyRateSmh = SMH_HOURLY_BY_GROUP[group] ?? SMH_HOURLY_BY_GROUP.A;
  const hourlyPremium = Math.round(hourlyRateSmh * NIGHT_PREMIUM_RATE * 100) / 100;
  const amount = Math.round(hourlyPremium * heuresNuit * 100) / 100;
  return { group, hourlyRateSmh, hourlyPremium, heuresNuit, amount };
}

/**
 * Port de "часы работы.numbers" — logique reconfirmée sur septembre 2026
 * (août avait masqué deux points : vacance_taux_journalier et le dépôt en
 * banque ci-dessous, tous deux invisibles quand ils valent 0/vide), puis
 * simplifiée le 29/09/2026 : Congés payés et Vacance jours sont redescendus
 * en simples compteurs de jours saisis à la main depuis le bulletin de paie
 * (la RH ne calcule ni ne verse ces montants — le comptable s'en charge à
 * part) ; Km/Péage ont été retirés (pas utilisés) ; Contrôle 1/2/3 ont été
 * fusionnés dans le seul champ Штраф.
 *
 * DEUX banques distinctes, à ne pas confondre :
 *   1. Le БАНК (plafond 3000) ci-dessous — propre à CHAQUE salarié d'équipe,
 *      alimenté par SON PROPRE BONUS équipe (30 % déposé, voir plus bas).
 *   2. Le "Банк качества" de l'ENTREPRISE (plafond 10000, company_quality_bank,
 *      computeControllerSplit / rankQualityBankWinners plus bas) — alimenté
 *      par 75 % de chaque pénalité déduite du БАНК #1 d'un salarié d'équipe ;
 *      les 25 % restants vont directement dans la paie du mois du contrôleur
 *      désigné (CIOBANU Valeriu pour l'instant, un seul pour toute
 *      l'entreprise). Quand ce second banque atteint 10000, les 5 salariés
 *      ayant le MOINS de pénalités et le PLUS de BONUS cumulés depuis le
 *      dernier partage se répartissent la totalité : 30/25/20/15/10 %, puis
 *      le compteur repart de zéro. Un seul pool pour toute l'entreprise, pas
 *      un par équipe — confirmé avec l'utilisatrice.
 *
 * Штраф контроль — UN SEUL champ, dont le sens dépend de faitPartieEquipe
 * (confirmé avec l'utilisatrice, 29/09/2026 : "для команд это будет так, а
 * для не команд вообще нет системы этой, бонусы это просто бонусы в зп") :
 *   - équipe chantier (faitPartieEquipe = true) : Штраф контроль est la
 *     pénalité du contrôleur qualité. Une valeur NÉGATIVE est déduite du
 *     БАНК 3000 (jamais de la paie directement — le salarié ne "paie" qu'une
 *     fois, via le БАНК) ; une valeur POSITIVE (rare, ajustement) s'ajoute
 *     directement à la paie, comme avant, sans jamais alimenter le БАНК
 *     (jamais de pénalité "positive" implicite).
 *   - hors équipe (Bureau / Contrôle & Formation / sans équipe) : pas de
 *     système БАНК du tout. Штраф контроль est un simple ajustement signé de
 *     paie, ajouté tel quel (positif ou négatif), sans aucun lien avec le
 *     БАНК ni avec le contrôleur/Банк качества.
 *
 * Штраф direct (nouveau, 29/09/2026, confirmé avec l'utilisatrice — distinct
 * du Штраф контроль ci-dessus : "штрафы от контролера и штрафы просто за
 * превышение скорости или допустим за поломку инструментов это разное")
 * — pour les pénalités SANS rapport avec le contrôle qualité chantier
 * (excès de vitesse, casse de matériel, etc.). Toujours un ajustement signé
 * direct sur la paie, pour TOUT employé (équipe ou non) — ne touche JAMAIS
 * le БАНК 3000 ni le contrôleur/Банк качества.
 *
 *   Ставка за дни = Jours × Ставка + (ajustement direct du Штраф контроль, voir ci-dessus) + Штраф direct
 *   Dépôt banque = équipe chantier uniquement (Bureau / Contrôle & Formation
 *     / sans équipe : toujours 0, tout le BONUS est payé directement) :
 *     MIN(MAX(0, BONUS équipe × 30 %), MAX(0, 3000 − БАНК début))
 *     — une partie du BONUS d'équipe (jusqu'à 30 %, plafonnée pour que le
 *     БАНК ne dépasse jamais 3000) part dans le БАНК qualité au lieu d'être
 *     payée directement ce mois-ci.
 *   Bonus équipe payé = BONUS équipe − Dépôt banque
 *   БАНК qualité (fin de mois) = MAX(0, MIN(3000, БАНК début + Dépôt banque) − pénalité contrôleur)
 *     — le "début" reprend automatiquement la fin du mois précédent pour ce
 *     même employé (jamais retapé à la main), sauf ajustement manuel exprès.
 *   Bonus qualité = БАНК qualité (fin) × 80 %
 *   À payer (cette table) = Ставка_за_дни + Bonus équipe payé + Bonus qualité
 *     + part contrôleur + prime Банк качества
 *     — Congés payés et Vacance jours sont de simples compteurs de jours,
 *     affichés à titre indicatif, jamais inclus dans ce total (le montant
 *     réel est calculé et versé par la comptabilité, pas ici).
 *
 * Le BONUS d'équipe lui-même (avant dépôt banque) est calculé ailleurs
 * (plusieurs facteurs, pas une formule de cette feuille) — saisi ici tel
 * quel, jamais recalculé.
 */
export const BANQUE_QUALITE_RATE = 0.8;
export const BANQUE_QUALITE_PLAFOND = 3000;
export const BANQUE_DEPOT_TAUX = 0.3;

export type PayrollExtrasInput = {
  jours: number;
  tauxJournalier: number;
  bonusEquipe: number;
  /** Montant signé. Équipe chantier : négatif = pénalité contrôleur (déduite du БАНК, jamais de la paie) ; positif = ajustement direct de paie. Hors équipe : ajustement direct de paie, signé, sans aucun lien БАНК. Voir la note en tête de fichier. */
  penaliteMontant: number;
  /** Montant signé, ajusté directement sur la paie pour TOUT employé — excès de vitesse, casse de matériel, etc. Jamais lié au БАНК 3000 ni au contrôleur/Банк качества, contrairement à penaliteMontant. Voir la note en tête de fichier. */
  penaliteDirecte: number;
  /** Fin de БАНК qualité du mois précédent pour ce même employé, ou null s'il n'y en a pas (premier mois). */
  banqueQualitePrecedente: number | null;
  /** Renseigné seulement pour corriger/amorcer manuellement le solde de départ — sinon laisser null. */
  banqueAjustementManuel: number | null;
  /** Le dépôt en БАНК et la pénalité contrôleur ne concernent que les équipes chantier — Bureau, Contrôle & Formation et "sans équipe" n'ont pas de БАНК du tout, tout passe directement dans la paie du mois. */
  faitPartieEquipe: boolean;
  /** Part du contrôleur ce mois-ci (25 % du total des pénalités de tous les autres salariés d'équipe) — 0 pour tout le monde sauf le contrôleur désigné. Calculé ailleurs (nécessite le total tous salariés confondus), jamais recalculé ici. */
  controleBonusRecu: number;
  /** Prime reçue lors d'une distribution du БАНК qualité (compagnie) à 10000 — 0 la plupart des mois. Calculée ailleurs, jamais recalculée ici. */
  banqueQualitePrime: number;
};

export type PayrollExtrasResult = {
  salaireJours: number;
  penalitesControle: number;
  banqueQualiteDebut: number;
  banqueDepot: number;
  bonusEquipePaye: number;
  banqueQualiteFin: number;
  bonusQualite: number;
  controleBonusRecu: number;
  banqueQualitePrime: number;
  aPayer: number;
};

export function computePayrollExtras(input: PayrollExtrasInput): PayrollExtrasResult {
  // Équipe : négatif → БАНК uniquement (jamais la paie) ; positif → paie uniquement (jamais le БАНК).
  // Hors équipe : pas de БАНК du tout, le montant signé va tel quel dans la paie.
  const penalitesControle = input.faitPartieEquipe ? Math.max(0, -input.penaliteMontant) : 0;
  const ajustementDirect = input.faitPartieEquipe ? Math.max(0, input.penaliteMontant) : input.penaliteMontant;
  const salaireJours = input.jours * input.tauxJournalier + ajustementDirect + input.penaliteDirecte;
  const banqueQualiteDebut = input.banqueAjustementManuel ?? input.banqueQualitePrecedente ?? 0;
  const banqueDepot = input.faitPartieEquipe
    ? Math.min(Math.max(0, input.bonusEquipe * BANQUE_DEPOT_TAUX), Math.max(0, BANQUE_QUALITE_PLAFOND - banqueQualiteDebut))
    : 0;
  const bonusEquipePaye = input.bonusEquipe - banqueDepot;
  const banqueQualiteFin = Math.max(
    0,
    Math.min(BANQUE_QUALITE_PLAFOND, banqueQualiteDebut + banqueDepot) - penalitesControle
  );
  const bonusQualite = Math.round(banqueQualiteFin * BANQUE_QUALITE_RATE * 100) / 100;
  const controleBonusRecu = Math.round((input.controleBonusRecu || 0) * 100) / 100;
  const banqueQualitePrime = Math.round((input.banqueQualitePrime || 0) * 100) / 100;
  const aPayer =
    Math.round((salaireJours + bonusEquipePaye + bonusQualite + controleBonusRecu + banqueQualitePrime) * 100) / 100;

  return {
    salaireJours: Math.round(salaireJours * 100) / 100,
    penalitesControle,
    banqueQualiteDebut,
    banqueDepot: Math.round(banqueDepot * 100) / 100,
    bonusEquipePaye: Math.round(bonusEquipePaye * 100) / 100,
    banqueQualiteFin,
    bonusQualite,
    controleBonusRecu,
    banqueQualitePrime,
    aPayer,
  };
}

/**
 * 25/75 sur le total des pénalités contrôleur (Штраф négatif, équipe chantier
 * uniquement) de TOUS les salariés d'un mois donné, tous ensemble — pas ligne
 * par ligne. 25 % file directement dans la paie du contrôleur ce même mois
 * (controleBonusRecu), 75 % rejoint le Банк качества commun à toute
 * l'entreprise.
 */
export const CONTROLEUR_SHARE_RATE = 0.25;
export const QUALITY_BANK_SHARE_RATE = 0.75;

export function computeControllerSplit(totalPenalitesTousSalaries: number): {
  controllerShare: number;
  bankShare: number;
} {
  const total = Math.max(0, totalPenalitesTousSalaries);
  return {
    controllerShare: Math.round(total * CONTROLEUR_SHARE_RATE * 100) / 100,
    bankShare: Math.round(total * QUALITY_BANK_SHARE_RATE * 100) / 100,
  };
}

/**
 * Quand le Банк качества (commun à l'entreprise) atteint QUALITY_BANK_TARGET
 * (10000), les 5 salariés avec le MOINS de pénalités cumulées et — à
 * pénalités égales — le PLUS de BONUS équipe cumulé depuis le dernier
 * partage se répartissent la totalité du pool : 30/25/20/15/10 %. Le tri se
 * fait ici ; l'appelant fournit déjà les totaux cumulés par salarié (somme
 * sur payroll_extras depuis period_start) et récupère qui gagne combien.
 */
export const QUALITY_BANK_TARGET = 10000;
export const QUALITY_BANK_PAYOUT_SHARES = [0.3, 0.25, 0.2, 0.15, 0.1];

export type QualityBankCandidate = {
  employeeId: string;
  totalPenalites: number;
  totalBonus: number;
};

export type QualityBankWinner = QualityBankCandidate & { rank: number; sharePct: number; amount: number };

export function rankQualityBankWinners(
  candidates: QualityBankCandidate[],
  poolTotal: number
): QualityBankWinner[] {
  const sorted = [...candidates].sort((a, b) => {
    if (a.totalPenalites !== b.totalPenalites) return a.totalPenalites - b.totalPenalites; // moins de pénalités d'abord
    return b.totalBonus - a.totalBonus; // à égalité, plus de bonus d'abord
  });
  return sorted.slice(0, QUALITY_BANK_PAYOUT_SHARES.length).map((c, i) => ({
    ...c,
    rank: i + 1,
    sharePct: QUALITY_BANK_PAYOUT_SHARES[i] * 100,
    amount: Math.round(poolTotal * QUALITY_BANK_PAYOUT_SHARES[i] * 100) / 100,
  }));
}
