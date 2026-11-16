/**
 * Le livre des bannières de « Mon Gaulois » (16 novembre 2026, demande du pilote : « un livre avec des animations quand
 * on choisit sa bannière », puis « j'aime le 5 », « enlève page précédente et page suivante et fais un truc intuitif ») :
 * un album couché dont les vignettes sont les bannières du compte ; la vignette touchée se décolle, vole et se dresse en
 * décor derrière le Gaulois. Écran : `src/components/village/LivreDesBannieres.tsx`. Ici, des calculs purs : les pages,
 * le geste qui les tourne, le vol de la vignette. Rien ne décide de la bannière montrée : le serveur le fait
 * (`choisir_banniere`, `contrat.ts`).
 */

/** Une case de l'album : une bannière du compte, ou `null` pour « le décor de mon lieu ». */
export type CaseDuLivre = string | null;

/** Vignettes par page : deux rangées de quatre. */
export const CASES_PAR_PAGE = 8;

/** Les cases de l'album : le décor du lieu d'abord, puis les bannières du compte dans l'ordre reçu. */
export const casesDuLivre = (miennes: readonly string[]): CaseDuLivre[] => [null, ...miennes];

/** Les cases rangées en pages ; toujours au moins une page. */
export function pagesDuLivre<T>(cases: readonly T[], parPage: number = CASES_PAR_PAGE): T[][] {
  const pages: T[][] = [];
  for (let i = 0; i < cases.length; i += parPage) pages.push(cases.slice(i, i + parPage));
  return pages.length > 0 ? pages : [[]];
}

/** La page où se trouve une case ; la première si elle n'y est pas. */
export function pageDeLaCase<T>(cases: readonly T[], valeur: T, parPage: number = CASES_PAR_PAGE): number {
  const rang = cases.indexOf(valeur);
  return rang < 0 ? 0 : Math.floor(rang / parPage);
}

/** La page d'après (`sens` 1) ou d'avant (`sens` -1) ; après la dernière vient la première. */
export function pageVoisine(page: number, sens: 1 | -1, total: number): number {
  return total < 1 ? 0 : (((page + sens) % total) + total) % total;
}

/** En deçà de ce déplacement, en pixels, la page glissée revient à sa place. */
export const SEUIL_DU_GESTE = 40;

/** Ce que demande une page glissée de `dx` pixels : vers la gauche, la page suivante ; vers la droite, la précédente ; trop peu, rien. */
export function sensDuGeste(dx: number): 1 | -1 | 0 {
  if (!Number.isFinite(dx) || Math.abs(dx) <= SEUIL_DU_GESTE) return 0;
  return dx < 0 ? 1 : -1;
}

/** La place du décor couché sur le livre, en parts de sa largeur : son bord gauche et sa largeur ; son pied est au pli. */
export const DECOR_GAUCHE = 0.17;
export const DECOR_LARGEUR = 0.66;
/** Une bannière : 124 cases sur 80. */
const HAUTEUR_SUR_LARGEUR = 80 / 124;

/** Le vol d'une vignette jusqu'au décor couché : de combien la déplacer et l'agrandir, depuis son coin haut gauche. */
export interface VolDeVignette {
  dx: number;
  dy: number;
  echelle: number;
}

/**
 * Le vol d'une vignette (son coin haut gauche et sa largeur, dans le livre) jusqu'à la place du décor couché, dont le pied
 * est au pli, au milieu de la hauteur du livre. `null` si une mesure manque (livre pas encore affiché).
 */
export function volVersLeDecor(livre: { largeur: number; hauteur: number }, vignette: { x: number; y: number; largeur: number }): VolDeVignette | null {
  if (!(livre.largeur > 0) || !(livre.hauteur > 0) || !(vignette.largeur > 0)) return null;
  const largeur = livre.largeur * DECOR_LARGEUR;
  return { dx: livre.largeur * DECOR_GAUCHE - vignette.x, dy: livre.hauteur / 2 - largeur * HAUTEUR_SUR_LARGEUR - vignette.y, echelle: largeur / vignette.largeur };
}
