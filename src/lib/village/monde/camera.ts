/**
 * La caméra du monde du village : des calculs purs. On se déplace de gauche à droite seulement ; la caméra glisse
 * lentement, démarre et s'arrête en douceur, jamais d'à-coup (goûts du pilote : rien de brusque, pas de zoom).
 */

/** La hauteur, en cases, que l'écran doit toujours montrer : la bande de l'avant et le haut des plus grands bâtiments. */
export const RANGEES_VOULUES = 270;

/** Le côté d'une case, en pixels entiers, pour une scène de cette hauteur : 1 sur un téléphone couché, 2 sur un portable ou un téléphone, 3 ou plus sur un grand écran. */
export function coteDeLaCase(hauteurScene: number, largeurScene: number): number {
  const cote = Math.max(1, Math.floor(hauteurScene / RANGEES_VOULUES));
  // Un écran étroit garde de petites cases : on y voit plus de monde d'un coup.
  return largeurScene < 640 ? Math.min(2, cote) : Math.min(5, cote);
}

/** La colonne de gauche de la vue, bornée au monde. */
export function bornerLaVue(x: number, vue: number, largeurDuMonde: number): number {
  return Math.min(Math.max(0, largeurDuMonde - vue), Math.max(0, x));
}

/** La durée d'un glissement vers un lieu, en millisecondes : d'autant plus long qu'il va loin, jamais pressé. */
export function dureeDuGlissement(cases: number): number {
  return Math.round(Math.min(3600, Math.max(900, 700 + Math.abs(cases) * 1.4)));
}

/** La part du chemin faite à la part `t` du temps (de 0 à 1) : un départ et une arrivée en douceur. */
export function douceur(t: number): number {
  const v = Math.min(1, Math.max(0, t));
  return v * v * v * (v * (v * 6 - 15) + 10);
}
