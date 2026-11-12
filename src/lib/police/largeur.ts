/**
 * La largeur d'un texte écrit dans l'onciale de cases, calculée au build à partir des dessins (onciale.ts) : un titre de
 * page prend la taille qui laisse son plus long mot sur une ligne (PageHeader.astro, « L'onciale de cases » dans
 * global.css). Code du site, sous l'AGPL comme lui : seuls les dessins d'onciale.ts sont sous la licence de la police.
 * Calcul pur, testé dans tests/unit/police.test.ts.
 */
import { CASE, ESPACE, ESPACE_FINE, ESPACE_INSECABLE, chasse, glyphesOnciale } from "./onciale";

/**
 * La lettrine d'un titre de page : sa première lettre, agrandie de ce facteur et en rouge. La même valeur est écrite dans
 * global.css (`main h1::first-letter`), et un test les compare.
 */
export const LETTRINE_TITRE = 1.45;

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
    for (const [ch, d] of glyphesOnciale()) chasses.set(ch, chasse(d));
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
 * Ce que le navigateur agrandit en lettrine au début d'un mot (`::first-letter`) : sa première lettre ou son premier
 * chiffre, avec la ponctuation qui la touche avant et après (« L' » dans « L'encadrement », « [G » dans « [GAL] »).
 */
export function lettrineDe(mot: string): string {
  return mot.match(/^\p{P}*[^\p{P}]\p{P}*/u)?.[0] ?? mot;
}

/**
 * Largeur, en em, du plus long mot d'un titre : un titre de page prend la taille qui le laisse tenir sur une ligne
 * (PageHeader.astro). Les espaces insécables lient leurs voisins (« 21 h ») : seules les espaces ordinaires séparent.
 * `lettrine` : le facteur dont la première lettre du titre est agrandie (1 sans lettrine) ; son premier mot s'élargit d'autant.
 */
export function motLePlusLong(texte: string, lettrine = 1): number {
  const mots = texte.split(/[ \t\r\n]+/).filter((mot) => mot.length > 0);
  return Math.max(0, ...mots.map((mot, i) => largeurTexte(mot) + (i === 0 ? (lettrine - 1) * largeurTexte(lettrineDe(mot)) : 0)));
}
