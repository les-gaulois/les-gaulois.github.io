import { urlDeLaPlanche } from "../../lib/jeu/dans-la-page";
import type { Planche } from "../../lib/jeu/planche";

/**
 * Les dessins en cases du pass et de la forge de « Mon Gaulois » (21 novembre 2026, dessins de Claude Fable 5.2 dans
 * `src/lib/jeu/pass-forge.ts`), devenus images dans la page : chaque planche est peinte une fois, gardée en mémoire sous sa
 * clé, puis posée en fond d'un élément à un nombre entier de pixels par case (jamais d'échelle à virgule). La feuille
 * `20-jeu-pass-forge.css` lit `--i` (l'image), `--w` et `--h` (sa taille en cases) et `--e` (pixels par case).
 */

const TAILLES = new Map<string, { largeur: number; hauteur: number }>();

/** L'adresse d'une planche et sa taille en cases ; la planche n'est dessinée qu'une fois par clé. */
export function imageEnCases(cle: string, dessin: () => Planche): { url: string; largeur: number; hauteur: number } {
  const connue = TAILLES.get(cle);
  if (connue) return { url: urlDeLaPlanche(cle, dessin), ...connue };
  const p = dessin();
  const taille = { largeur: p.width, hauteur: p.height };
  TAILLES.set(cle, taille);
  return { url: urlDeLaPlanche(cle, () => p), ...taille };
}

/** Une image en cases, décorative : ce qu'elle montre est toujours écrit à côté. `echelle` : pixels CSS par case. */
export function ImageEnCases({ cle, dessin, echelle = 1, classe = "" }: { cle: string; dessin: () => Planche; echelle?: number; classe?: string }) {
  const { url, largeur, hauteur } = imageEnCases(cle, dessin);
  return <i class={`pf-img ${classe}`} style={`--i:${url};--w:${largeur};--h:${hauteur};--e:${echelle}`} aria-hidden="true" />;
}
