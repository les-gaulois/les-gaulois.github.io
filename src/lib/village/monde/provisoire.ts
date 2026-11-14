/**
 * PROVISOIRE — l'état d'essai du monde du village, le temps que le vrai calcul existe (`chantier.ts` et `monde-site.ts`,
 * écrits par le développeur du chantier). À l'intégration, `src/pages/village.astro` passe à l'écran le vrai `EtatDuMonde`
 * et ce fichier est supprimé : rien de ce qu'il contient ne doit être publié.
 *
 * Seuls chiffres mesurés (consigne du 14 novembre 2026) : 1 064 points rapportés au clan depuis le 1er novembre, 523 sur les
 * 7 derniers jours, relevé du 14 novembre 2026 à 13 h. Les dates où chaque bâtiment a été fini ne sont PAS mesurées : elles
 * ne sont là que pour essayer l'écran, et le vrai calcul les remplace.
 */
import { BATIMENTS, type BatimentId, DEBUT_DU_CHANTIER, FEU_JOURS } from "../chantier-liste";
import type { EtatDuBatiment, EtatDuMonde } from "../monde-etat";

const POINTS = 1064;
const RELEVE = "2026-11-14T12:00:00.000Z";
/** Dates d'essai, non mesurées (voir l'en-tête). */
const FINIS_D_ESSAI = ["2026-11-02T20:14:00.000Z", "2026-11-04T21:02:00.000Z", "2026-11-07T19:40:00.000Z", "2026-11-10T22:11:00.000Z", "2026-11-13T21:27:00.000Z"];

export function etatDEssai(): EtatDuMonde {
  let reste = POINTS;
  let enCours: BatimentId | null = null;
  const batiments: EtatDuBatiment[] = BATIMENTS.map((b, i) => {
    const poses = Math.min(b.cout, reste);
    reste -= poses;
    const fini = poses >= b.cout;
    if (!fini && enCours === null) enCours = b.id;
    return { id: b.id, nom: b.nom, titre: b.titre, cout: b.cout, poses, fini_le: fini ? (FINIS_D_ESSAI[i] ?? RELEVE) : null };
  });
  return {
    releve: RELEVE,
    chantier: { depuis: DEBUT_DU_CHANTIER, points: POINTS, batiments, en_cours: enCours },
    feu: { niveau: 4, points: 523, jours: FEU_JOURS },
  };
}
