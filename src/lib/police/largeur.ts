/**
 * La largeur d'un texte écrit dans l'onciale de cases, calculée au build à partir des dessins (onciale.ts) : un titre de
 * page prend la taille qui laisse son plus long mot sur une ligne (PageHeader.astro, « L'onciale de cases » dans
 * global.css). Code du site, sous l'AGPL comme lui : seuls les dessins d'onciale.ts sont sous la licence de la police.
 * Calcul pur, testé dans tests/unit/police.test.ts.
 */
import { CASE, ESPACE, ESPACE_FINE, ESPACE_INSECABLE, caracteresDe, chasse, glyphesOnciale } from "./onciale";

/**
 * Chasse d'un caractère qu'elle n'a pas, en em : Outfit le dessine, ou la police de l'appareil pour ce qu'Outfit n'a pas
 * non plus (le cyrillique), à peu près aussi large qu'une lettre de l'onciale.
 */
const CHASSE_INCONNUE = 0.8;

let chasses: Map<string, number> | null = null;

/** Largeur d'un texte écrit dans l'onciale, en em (une em = la taille de la police), espaces compris. */
export function largeurTexte(texte: string): number {
  if (!chasses) {
    chasses = new Map([
      [" ", ESPACE],
      [String.fromCharCode(0xa0), ESPACE_INSECABLE],
      [String.fromCharCode(0x2009), ESPACE_FINE],
      [String.fromCharCode(0x202f), ESPACE_FINE],
    ]);
    for (const [ch, d] of glyphesOnciale()) for (const c of caracteresDe(ch)) chasses.set(c, chasse(d));
  }
  let cases = 0;
  let inconnues = 0;
  for (const c of texte) {
    const n = chasses.get(c);
    if (n === undefined) inconnues++;
    else cases += n;
  }
  return (cases * CASE) / 1000 + inconnues * CHASSE_INCONNUE;
}

/**
 * Largeur, en em, du plus long mot d'un titre : un titre de page prend la taille qui le laisse tenir sur une ligne
 * (PageHeader.astro). Les espaces insécables lient leurs voisins (« 21 h ») : seules les espaces ordinaires séparent.
 */
export function motLePlusLong(texte: string): number {
  return Math.max(0, ...texte.split(/[ \t\r\n]+/).map(largeurTexte));
}
