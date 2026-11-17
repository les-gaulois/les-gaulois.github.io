/**
 * Le décor que donne une bannière : sa toile sans son cadre, pour la poser derrière un Gaulois. Le sentier l'étire derrière
 * sa piste (16 novembre 2026) ; le cadre du Gaulois de « Mon Gaulois » et de la boutique la montre derrière lui (17 novembre
 * 2026, demande du pilote : que les autres onglets reprennent ce que fait le sentier). Rien n'est dessiné ici : la toile
 * vient de `vignetteDeLaBanniere`.
 */

/** Un dessin en cases, rangée par rangée. */
export interface DecorDeBanniere {
  largeur: number;
  hauteur: number;
  cases: string[];
}

/** Le cadre d'une bannière (celui de sa rareté, ou celui de la pochette) tient dans ses trois cases de bord. */
export const CADRE_DE_BANNIERE = 3;

/** La bannière sans son cadre : il n'en reste que la toile. `null` si elle est trop petite pour en avoir une. */
export function sansCadre(scene: { largeur: number; hauteur: number; cases: readonly string[] }): DecorDeBanniere | null {
  const largeur = scene.largeur - 2 * CADRE_DE_BANNIERE;
  const hauteur = scene.hauteur - 2 * CADRE_DE_BANNIERE;
  if (largeur <= 0 || hauteur <= 0 || scene.cases.length < scene.largeur * scene.hauteur) return null;
  const cases: string[] = [];
  for (let y = 0; y < hauteur; y++) {
    const debut = (y + CADRE_DE_BANNIERE) * scene.largeur + CADRE_DE_BANNIERE;
    cases.push(...scene.cases.slice(debut, debut + largeur));
  }
  return { largeur, hauteur, cases };
}
