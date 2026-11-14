/**
 * Un bâtiment en chantier : ce qui est bâti, vu monter du bas vers le haut à mesure des points rapportés au clan, et
 * l'échafaudage sur ce qui reste à faire. PROVISOIRE (base commune du 14 novembre 2026) : le dessin de l'échafaudage, des
 * piquets et du cordeau est à faire par le dessinateur du lot A, en gardant la signature de `enChantier`.
 */
import type { Decor } from "../decor";
import { type Lumiere, couleurDuDehors } from "../lumiere";

/**
 * `fini` : le dessin du bâtiment fini ; `avancement` de 0 (rien de posé : seulement le tracé au sol) à 1 (fini, rendu tel
 * quel, sans échafaudage). Le dessin rendu a toujours la taille du bâtiment fini.
 */
export function enChantier(fini: Decor, avancement: number, lumiere: Lumiere): Decor {
  const a = Math.min(1, Math.max(0, avancement));
  if (a >= 1) return fini;
  const { largeur, hauteur } = fini;
  const cases: (string | null)[] = new Array<string | null>(largeur * hauteur).fill(null);
  const bati = Math.round(hauteur * a);
  const bois = couleurDuDehors("#a07d52", "#6b5439", lumiere);
  for (let y = 0; y < hauteur; y++) {
    for (let x = 0; x < largeur; x++) {
      const i = y * largeur + x;
      if (y >= hauteur - bati) cases[i] = fini.cases[i] ?? null;
      else if ((x === 0 || x === largeur - 1 || y % 16 === 0) && fini.cases[i] !== undefined) cases[i] = bois;
    }
  }
  return { largeur, hauteur, cases };
}
