/**
 * Les dessins des bâtiments du chantier du village (`chantier-liste.ts`), réunis : trois lots, un fichier par dessinateur.
 * Un bâtiment pas encore dessiné prend une boîte provisoire, pour que l'écran et le robot marchent avant les dessins.
 */
import { BATIMENTS, type BatimentId } from "../chantier-liste";
import type { Decor } from "../decor";
import { type Lumiere, couleurDuDehors } from "../lumiere";
import { enChantier } from "./chantier";
import { LOT_A } from "./lot-a";
import { LOT_B } from "./lot-b";
import { LOT_C } from "./lot-c";
import type { DessinDeBatiment } from "./type";

export type { DessinDeBatiment } from "./type";
export { FORGE, PLAQUE } from "./forge";

function provisoire(largeur: number, hauteur: number): DessinDeBatiment {
  return {
    largeur,
    hauteur,
    images: 1,
    dessiner(lumiere: Lumiere): Decor {
      const fond = couleurDuDehors("#9c8a70", "#4c4438", lumiere);
      const bord = couleurDuDehors("#6a5a46", "#2f2a22", lumiere);
      const cases: (string | null)[] = [];
      for (let y = 0; y < hauteur; y++) for (let x = 0; x < largeur; x++) cases.push(x === 0 || y === 0 || x === largeur - 1 ? bord : fond);
      return { largeur, hauteur, cases };
    },
  };
}

export const DESSINS_DES_BATIMENTS: Readonly<Record<BatimentId, DessinDeBatiment>> = Object.fromEntries(
  BATIMENTS.map((b) => [b.id, LOT_A[b.id] ?? LOT_B[b.id] ?? LOT_C[b.id] ?? provisoire(80, 90)]),
) as Record<BatimentId, DessinDeBatiment>;

/** Le dessin d'un bâtiment à cette lumière, fini ou en chantier : `avancement` de 0 (rien de posé) à 1 (fini). */
export function dessinDuBatiment(id: BatimentId, lumiere: Lumiere, avancement: number, image = 0): Decor {
  const dessin = DESSINS_DES_BATIMENTS[id];
  const fini = dessin.dessiner(lumiere, Math.min(dessin.images - 1, Math.max(0, image)));
  return enChantier(fini, avancement, lumiere);
}
