/**
 * Congés payés calculator — retenue (bulletin) & indemnisation, per the rules
 * given by the cabinet comptable (méthode ouvrés: 1 semaine posée = 5 jours).
 *
 * Deux lignes distinctes apparaissent sur le bulletin :
 *  - "Retenue de congés payés" : toujours la méthode du maintien.
 *  - "Indemnité de congés payés" : la méthode la plus avantageuse entre le
 *    maintien et le dixième.
 * Les deux calculs se font en brut ; le "net estimé" retire un taux de
 * cotisations approximatif (par défaut 21%, donné par le comptable comme un
 * ordre de grandeur — pas une valeur légale exacte).
 */
export type CongesPayesInput = {
  salaireMensuelBrut: number | null; // salaire de base du mois concerné
  nombreJoursConges: number | null; // jours ouvrés posés
  sommeBrutePeriodeReference: number | null; // total brut touché du 1er juin au 31 mai (N-1)
  joursAcquisPeriodeReference: number | null; // jours de CP acquis sur cette même période (25 si année complète)
  tauxCotisationsApprox: number; // ex. 0.21
};

export type CongesPayesResult = {
  methodeMaintien: number;
  methodeDixieme: number | null; // null si la période de référence n'est pas renseignée
  retenueCongesPayes: number; // toujours la méthode du maintien (valeur négative sur le bulletin)
  indemniteCongesPayes: number; // la plus avantageuse des deux méthodes
  methodeRetenue: "maintien" | "dixieme";
  netEstime: number;
};

const JOURS_OUVRES_MENSUELS = 21.67;

export function computeCongesPayes(input: CongesPayesInput): CongesPayesResult | null {
  const { salaireMensuelBrut, nombreJoursConges, sommeBrutePeriodeReference, joursAcquisPeriodeReference, tauxCotisationsApprox } =
    input;
  if (salaireMensuelBrut === null || nombreJoursConges === null) return null;

  const methodeMaintien = (salaireMensuelBrut / JOURS_OUVRES_MENSUELS) * nombreJoursConges;

  const methodeDixieme =
    sommeBrutePeriodeReference !== null && joursAcquisPeriodeReference
      ? (sommeBrutePeriodeReference / joursAcquisPeriodeReference) * 0.1 * nombreJoursConges
      : null;

  const indemniteCongesPayes =
    methodeDixieme !== null ? Math.max(methodeMaintien, methodeDixieme) : methodeMaintien;
  const methodeRetenue: "maintien" | "dixieme" =
    methodeDixieme !== null && methodeDixieme > methodeMaintien ? "dixieme" : "maintien";

  return {
    methodeMaintien,
    methodeDixieme,
    retenueCongesPayes: -methodeMaintien,
    indemniteCongesPayes,
    methodeRetenue,
    netEstime: indemniteCongesPayes * (1 - tauxCotisationsApprox),
  };
}
