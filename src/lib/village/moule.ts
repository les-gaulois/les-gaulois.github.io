/**
 * Le moule de la forge (choix du pilote, 16 novembre 2026, parmi dix animations d'essai : « j'aime bien le 4, et bien sûr le
 * moule doit correspondre à l'item qui va arriver ») : à la fusion, un moule de pierre montre en creux la forme exacte de
 * l'objet que le serveur vient de tirer. Le métal y monte rangée par rangée, refroidit du haut vers le bas, puis le moule
 * s'ouvre. Ici, les temps et les calculs ; le dessin est dans `src/components/village/Moule.tsx`.
 *
 * Le moule ne décide de rien : le serveur tire d'abord, le moule ne se montre qu'avec sa réponse. L'animation ne change
 * aucune valeur. Elle est lente et ne clignote pas ; animations coupées, la fenêtre passe tout de suite au résultat.
 */

/** La durée de l'animation, de la première goutte au moule ouvert, en millisecondes. */
export const DUREE_DU_MOULE = 6800;
/**
 * La durée de la lueur qui suit, en millisecondes : après, plus rien ne bouge. Moins de cinq secondes, parce qu'à ce moment
 * la fenêtre n'a plus de bouton pour l'arrêter (WCAG 2.2.2).
 */
export const DUREE_DE_LA_LUEUR = 2400;

/** Les moments de l'animation, en parts de sa durée (de 0 à 1). */
export const TEMPS_DU_MOULE = {
  /** Le métal coule et monte dans le creux. */
  coulee: [0.07, 0.56],
  /** Il refroidit, du haut vers le bas : chaque rangée met `fonte` à reprendre ses couleurs. */
  refroidissement: [0.58, 0.8],
  fonte: 0.1,
  /** Les deux moitiés du moule s'écartent et s'effacent. */
  ouverture: [0.84, 1],
} as const;

const borne = (x: number): number => Math.min(1, Math.max(0, x));
/** Une montée douce de 0 à 1 entre `a` et `b`, sans à-coup au départ ni à l'arrivée. */
export function doux(a: number, b: number, x: number): number {
  const t = borne((x - a) / (b - a));
  return t * t * (3 - 2 * t);
}

/** La part du creux déjà remplie, de 0 (vide) à 1 (plein), au temps `u` (de 0 à 1). */
export const remplissage = (u: number): number => doux(TEMPS_DU_MOULE.coulee[0], TEMPS_DU_MOULE.coulee[1], u);

/** Le nombre de rangées pleines, comptées depuis le bas, pour un dessin de `hauteur` rangées. */
export const rangeesPleines = (u: number, hauteur: number): number => Math.round(remplissage(u) * hauteur);

/** La rangée `rangee` (0 en haut) est-elle pleine au temps `u` ? Le métal monte du bas. */
export const rangeePleine = (u: number, rangee: number, hauteur: number): boolean => rangee >= hauteur - rangeesPleines(u, hauteur);

/**
 * Le refroidissement d'une rangée, de 0 (encore du métal en fusion) à 1 (ses vraies couleurs) : celles du haut d'abord, la
 * dernière finit avec la phase.
 */
export function refroidi(u: number, rangee: number, hauteur: number): number {
  const [debut, fin] = TEMPS_DU_MOULE.refroidissement;
  const depart = debut + (fin - debut - TEMPS_DU_MOULE.fonte) * (hauteur > 1 ? rangee / (hauteur - 1) : 0);
  return doux(depart, depart + TEMPS_DU_MOULE.fonte, u);
}

/** L'ouverture du moule, de 0 (fermé) à 1 (écarté et effacé). */
export const ouverture = (u: number): number => doux(TEMPS_DU_MOULE.ouverture[0], TEMPS_DU_MOULE.ouverture[1], u);

/** Le métal coule-t-il encore du haut de la toile ? Du début de la coulée jusqu'au creux plein. */
export const couleEncore = (u: number): boolean => u > TEMPS_DU_MOULE.coulee[0] - 0.03 && remplissage(u) < 1;

/**
 * La taille d'une case du dessin, en pixels entiers, pour que l'objet et son moule tiennent dans une toile de `largeur` sur
 * `hauteur` pixels : l'objet prend au plus la moitié de la largeur et les deux tiers de la hauteur. Au moins 1.
 */
export function caseDuMoule(largeur: number, hauteur: number, dessin: { largeur: number; hauteur: number }): number {
  if (!(dessin.largeur > 0) || !(dessin.hauteur > 0)) return 1;
  return Math.max(1, Math.floor(Math.min((largeur * 0.5) / dessin.largeur, (hauteur * 0.66) / dessin.hauteur)));
}
