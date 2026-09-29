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
 * banque ci-dessous, tous deux invisibles quand ils valent 0/vide) :
 *
 *   Ставка за дни = Jours × Ставка + Штраф        (Штраф est un montant
 *     signé — positif = ajustement, négatif = pénalité, comme dans la
 *     feuille d'origine ; jamais une pénalité "positive" implicite)
 *   Congés payés  = Jours × 9,9 %
 *   Vacance pay   = jours de vacances × taux de vacance PROPRE au salarié
 *     (55 à 120 €/jour selon la personne dans la feuille d'origine — pas un
 *     taux unique, exactement comme le taux journalier)
 *   Km cost       = km × 0,30 € + péage
 *   Штрафы от контроля = Контроль 1 + 2 + 3
 *   Dépôt banque = MIN(MAX(0, BONUS équipe × 30 %), MAX(0, 3000 − БАНК début))
 *     — une partie du BONUS d'équipe (jusqu'à 30 %, plafonnée pour que le
 *     БАНК ne dépasse jamais 3000) part dans le БАНК qualité au lieu d'être
 *     payée directement ce mois-ci.
 *   Bonus équipe payé = BONUS équipe − Dépôt banque
 *   БАНК qualité (fin de mois) = MAX(0, MIN(3000, БАНК début + Dépôt banque) − Штрафы от контроля)
 *     — le "début" reprend automatiquement la fin du mois précédent pour ce
 *     même employé (jamais retapé à la main), sauf ajustement manuel exprès.
 *   Bonus qualité = БАНК qualité (fin) × 80 %
 *   À payer (cette table) = Ставка_за_дни + Bonus équipe payé + Congés payés +
 *     Vacance pay + Km cost + Bonus qualité
 *
 * Le BONUS d'équipe lui-même (avant dépôt banque) est calculé ailleurs
 * (plusieurs facteurs, pas une formule de cette feuille) — saisi ici tel
 * quel, jamais recalculé.
 */
export const CONGES_PAYES_RATE = 0.099;
export const KM_RATE = 0.3;
export const BANQUE_QUALITE_RATE = 0.8;
export const BANQUE_QUALITE_PLAFOND = 3000;
export const BANQUE_DEPOT_TAUX = 0.3;

export type PayrollExtrasInput = {
  jours: number;
  tauxJournalier: number;
  bonusEquipe: number;
  penaliteMontant: number;
  vacanceJours: number;
  /** Propre à chaque salarié, comme tauxJournalier — pas un taux global (55 à 120 €/jour selon la personne). */
  vacanceTauxJournalier: number;
  km: number;
  peage: number;
  controle1: number;
  controle2: number;
  controle3: number;
  /** Fin de БАНК qualité du mois précédent pour ce même employé, ou null s'il n'y en a pas (premier mois). */
  banqueQualitePrecedente: number | null;
  /** Renseigné seulement pour corriger/amorcer manuellement le solde de départ — sinon laisser null. */
  banqueAjustementManuel: number | null;
};

export type PayrollExtrasResult = {
  salaireJours: number;
  congesPayes: number;
  vacancePay: number;
  kmCost: number;
  penalitesControle: number;
  banqueQualiteDebut: number;
  banqueDepot: number;
  bonusEquipePaye: number;
  banqueQualiteFin: number;
  bonusQualite: number;
  aPayer: number;
};

export function computePayrollExtras(input: PayrollExtrasInput): PayrollExtrasResult {
  const salaireJours = input.jours * input.tauxJournalier + input.penaliteMontant;
  const congesPayes = Math.round(input.jours * CONGES_PAYES_RATE * 100) / 100;
  const vacancePay = Math.round(input.vacanceJours * input.vacanceTauxJournalier * 100) / 100;
  const kmCost = Math.round((input.km * KM_RATE + input.peage) * 100) / 100;
  const penalitesControle = input.controle1 + input.controle2 + input.controle3;
  const banqueQualiteDebut = input.banqueAjustementManuel ?? input.banqueQualitePrecedente ?? 0;
  const banqueDepot = Math.min(
    Math.max(0, input.bonusEquipe * BANQUE_DEPOT_TAUX),
    Math.max(0, BANQUE_QUALITE_PLAFOND - banqueQualiteDebut)
  );
  const bonusEquipePaye = input.bonusEquipe - banqueDepot;
  const banqueQualiteFin = Math.max(
    0,
    Math.min(BANQUE_QUALITE_PLAFOND, banqueQualiteDebut + banqueDepot) - penalitesControle
  );
  const bonusQualite = Math.round(banqueQualiteFin * BANQUE_QUALITE_RATE * 100) / 100;
  const aPayer =
    Math.round((salaireJours + bonusEquipePaye + congesPayes + vacancePay + kmCost + bonusQualite) * 100) / 100;

  return {
    salaireJours: Math.round(salaireJours * 100) / 100,
    congesPayes,
    vacancePay,
    kmCost,
    penalitesControle,
    banqueQualiteDebut,
    banqueDepot: Math.round(banqueDepot * 100) / 100,
    bonusEquipePaye: Math.round(bonusEquipePaye * 100) / 100,
    banqueQualiteFin,
    bonusQualite,
    aPayer,
  };
}
