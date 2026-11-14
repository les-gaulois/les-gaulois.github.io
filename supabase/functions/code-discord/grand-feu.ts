/**
 * Le grand feu de la place du village (idée « le grand feu », 14 novembre 2026) : sa hauteur suit les points rapportés au
 * clan sur les 7 derniers jours, de 0 (des braises) à 4 (un feu de joie), `SEUILS_DU_FEU` de `src/lib/village/chantier-liste.ts`.
 * Ici parce que la fonction `code-discord` ne lit que son dossier : /feu le dessine aussi. Le site l'importe d'ici.
 * Flammes lentes, sans étincelle ni éclair (le pilote trouve agressifs les effets rapides).
 * PROVISOIRE (base commune du 14 novembre 2026) : à dessiner. Design : Claude Fable 5.2.
 */

export interface DessinDuFeu {
  largeur: number;
  hauteur: number;
  cases: (string | null)[];
}

/** La toile commune à tous les niveaux, en cases, à l'échelle des Gaulois (48 × 64) : les pierres du foyer reposent sur la dernière rangée. */
export const GRAND_FEU_LARGEUR = 72;
export const GRAND_FEU_HAUTEUR = 96;
/** Les images du mouvement de la flamme ; l'image 0 est celle qui reste quand tout est figé. */
export const IMAGES_DU_FEU = 4;

/** Le feu à ce niveau (0 à 4), image `image` (0 à IMAGES_DU_FEU − 1). Le feu éclaire : ses couleurs ne changent pas avec l'heure. */
export function imageDuGrandFeu(niveau: 0 | 1 | 2 | 3 | 4, image: number): DessinDuFeu {
  const L = GRAND_FEU_LARGEUR;
  const H = GRAND_FEU_HAUTEUR;
  const cases: (string | null)[] = new Array<string | null>(L * H).fill(null);
  const haut = 8 + niveau * 18 + (image % 2);
  for (let y = H - haut; y < H; y++) {
    const demi = Math.round(((y - (H - haut)) / haut) * (10 + niveau * 5));
    for (let x = L / 2 - demi; x < L / 2 + demi; x++) cases[y * L + x] = y > H - 6 ? "#6b6f78" : "#f08a2a";
  }
  return { largeur: L, hauteur: H, cases };
}
