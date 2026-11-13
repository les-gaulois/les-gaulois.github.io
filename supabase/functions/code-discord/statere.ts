/**
 * Le statère, la pièce du village des Gaulois (docs/DIRECTION.md, « Le village des Gaulois »), en pixels : un seul dessin
 * pour le site (prix de la boutique, solde) et pour les images du robot.
 *
 * BOUCHON : un disque doré provisoire, posé pour que l'écran de la boutique et les images puissent se construire en même
 * temps. Le vrai dessin le remplace sans changer la signature de `casesDuStatere`.
 */

/** Les tailles dessinées, en cases de côté : la petite pour un prix dans une ligne, la grande pour un solde ou une image. */
export const TAILLES_STATERE = [12, 16, 24] as const;
export type TailleStatere = (typeof TAILLES_STATERE)[number];

/** La pièce case par case, rangée par rangée : `taille` × `taille` couleurs « #rrggbb », `null` pour une case vide. */
export function casesDuStatere(taille: TailleStatere): (string | null)[] {
  const cases: (string | null)[] = new Array<string | null>(taille * taille).fill(null);
  const rayon = taille / 2;
  for (let y = 0; y < taille; y++) {
    for (let x = 0; x < taille; x++) {
      const d = Math.hypot(x + 0.5 - rayon, y + 0.5 - rayon);
      if (d > rayon) continue;
      cases[y * taille + x] = d > rayon - 1 ? "#a86d0c" : x + y < taille ? "#fff1a8" : "#f2b632";
    }
  }
  return cases;
}
