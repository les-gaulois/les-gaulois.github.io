/**
 * La caméra du monde du village : des calculs purs. On se déplace dans les deux sens (le monde est une colline, plus haute
 * que l'écran dès qu'on s'approche) ; la caméra glisse lentement, démarre et s'arrête en douceur, jamais d'à-coup. On
 * regarde le monde de plus ou moins près, par niveaux : une case vaut toujours un nombre entier de pixels, et le passage
 * d'un niveau à l'autre est lent et doux (goûts du pilote : rien de brusque, pas de zoom rapide).
 */

/**
 * Les niveaux d'approche : le côté d'une case du premier plan, en pixels. Trois niveaux, 1, 2 et 4 : les terrasses du
 * fond sont dessinées deux fois plus petites, leurs cases valent donc un demi-pixel, 1 et 2 pixels (le rapport reste le
 * même à tous les niveaux). Au niveau 2, un Gaulois de la grand-rue fait 96 pixels sur 128, un Gaulois des terrasses 48
 * sur 64 ; au niveau 1, la vue d'ensemble, moitié moins.
 */
export const NIVEAUX = [1, 2, 4] as const;

/** Le niveau de l'arrivée : le niveau 2 ; sur un écran étroit (un téléphone), la vue d'ensemble, pour voir plus qu'une maison. */
export function niveauDeDepart(largeurScene: number): number {
  return largeurScene < 768 ? 1 : 2;
}

/** Le niveau voisin, plus près (`+1`) ou plus loin (`-1`) ; le même au bout de l'échelle. */
export function niveauVoisin(niveau: number, sens: 1 | -1): number {
  const rang = NIVEAUX.indexOf(niveau as (typeof NIVEAUX)[number]);
  return NIVEAUX[Math.min(NIVEAUX.length - 1, Math.max(0, (rang < 0 ? 0 : rang) + sens))]!;
}

/** La colonne de gauche de la vue, bornée au monde. */
export function bornerLaVue(x: number, vue: number, largeurDuMonde: number): number {
  return Math.min(Math.max(0, largeurDuMonde - vue), Math.max(0, x));
}

/**
 * La rangée du haut de la vue, bornée au monde. Un monde moins haut que l'écran se pose en bas : le ciel remplit le haut
 * (la rangée est alors négative).
 */
export function bornerLaHauteur(y: number, vue: number, hauteurDuMonde: number): number {
  if (hauteurDuMonde <= vue) return hauteurDuMonde - vue;
  return Math.min(hauteurDuMonde - vue, Math.max(0, y));
}

/** La durée d'un glissement vers un lieu, en millisecondes : d'autant plus long qu'il va loin, jamais pressé. */
export function dureeDuGlissement(cases: number): number {
  return Math.round(Math.min(3600, Math.max(900, 700 + Math.abs(cases) * 1.4)));
}

/** La durée du passage d'un niveau d'approche à l'autre, en millisecondes. */
export const DUREE_DE_L_APPROCHE = 1100;

/** La part du chemin faite à la part `t` du temps (de 0 à 1) : un départ et une arrivée en douceur. */
export function douceur(t: number): number {
  const v = Math.min(1, Math.max(0, t));
  return v * v * v * (v * (v * 6 - 15) + 10);
}
