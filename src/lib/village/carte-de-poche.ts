/**
 * La carte de poche (22 novembre 2026, demande du pilote : « le même affichage pour la boutique et les vestiaires : des
 * véritables cartes avec les infos dessus » ; dessin de Claude Fable 5.2) : la carte d'une chose en petit, dans les grilles
 * de la boutique et du vestiaire, avec les effets du duel écrits dessus. Écran : `src/components/village/CarteDePoche.tsx`.
 *
 * Ici, ce qui se calcule sans navigateur : l'ordre des lignes écrites sur la carte. Les lignes viennent du moteur du duel
 * (`ficheDe`, par `effets-des-cartes.ts`) : rien n'est inventé ni recalculé.
 */

/** Ce qu'une ligne de la fiche du duel porte, pour la ranger : son ton, son icône et sa taille d'icône (15 : un rôle). */
interface LigneRangee {
  ton: string | null;
  icone: string | null;
  cases: number;
}

/**
 * Les lignes écrites sur la carte, dans l'ordre du dessin : l'effet unique d'abord, puis les mots-clés avec leur phrase,
 * puis la phrase du rôle ; la panoplie à part, pour le pied (son nom seul ; sa phrase est au dos). Les lignes d'état du duel
 * (« au repos », « pas assez d'énergie ») ne s'écrivent pas sur une carte de la boutique.
 */
export function lignesDePoche<L extends LigneRangee>(lignes: readonly L[]): { ecrites: L[]; panoplie: L | null } {
  const estRole = (l: L): boolean => l.ton === null && l.icone !== null && l.cases === 15;
  const unique = lignes.filter((l) => l.ton === "unique");
  const mots = lignes.filter((l) => l.ton === null && !estRole(l));
  const roles = lignes.filter(estRole);
  return { ecrites: [...unique, ...mots, ...roles], panoplie: lignes.find((l) => l.ton === "panoplie") ?? null };
}
