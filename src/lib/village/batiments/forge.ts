/**
 * La forge du village, là où l'on grave une vraie partie sur un objet (idée « la forge aux souvenirs », 14 novembre 2026).
 * Elle est au village dès le départ : elle ne se bâtit pas. Et la petite plaque dorée d'un objet gravé.
 * PROVISOIRE (base commune du 14 novembre 2026) : à dessiner. Design : Claude Fable 5.2.
 */
import type { Decor } from "../decor";
import { type Lumiere, couleurDuDehors } from "../lumiere";
import type { DessinDeBatiment } from "./type";

const L = 120;
const H = 110;

export const FORGE: DessinDeBatiment = {
  largeur: L,
  hauteur: H,
  images: 1,
  dessiner(lumiere: Lumiere): Decor {
    const mur = couleurDuDehors("#8d6a4a", "#4a3a2c", lumiere);
    const cases: (string | null)[] = new Array<string | null>(L * H).fill(null);
    for (let y = 30; y < H; y++) for (let x = 4; x < L - 4; x++) cases[y * L + x] = mur;
    return { largeur: L, hauteur: H, cases };
  },
};

/** La plaque d'un objet gravé, en petit : à poser près de l'objet dans le vestiaire et sur la place. */
export const PLAQUE: Decor = { largeur: 8, hauteur: 4, cases: new Array<string | null>(32).fill("#e2b23c") };
