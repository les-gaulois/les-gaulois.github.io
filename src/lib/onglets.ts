/**
 * Les onglets des espaces de travail (le QG et la Direction) : une partie à la fois à l'écran, les autres à un clic.
 * Ici, seulement les règles : quel onglet ouvrir d'après l'adresse, où va le focus au clavier, de quel côté arrive
 * la partie choisie. L'affichage est dans `src/components/compte/Onglets.tsx`.
 */

export interface TabRule {
  id: string;
  /** Le rang minimal pour voir l'onglet : sans rang, tout compte qui voit l'espace (1 pour un membre validé) ; 2 l'encadrement, 3 les admins. Pour l'affichage seulement : le serveur revérifie chaque action. */
  rank?: number;
}

/** Les onglets que ce rang voit, dans l'ordre donné. */
export function tabsFor<T extends TabRule>(tabs: readonly T[], rank: number): T[] {
  return tabs.filter((tab) => rank >= (tab.rank ?? 0));
}

/** L'onglet nommé par l'adresse (`#demandes`), s'il existe pour ce compte. `null` : l'adresse n'en nomme aucun. */
export function tabOfHash(hash: string, ids: readonly string[]): string | null {
  let id = hash.replace(/^#/, "");
  try {
    id = decodeURIComponent(id);
  } catch {
    // Adresse mal formée : on la lit telle quelle.
  }
  return ids.includes(id) ? id : null;
}

/**
 * Où va le focus avec une touche, comme dans tout groupe d'onglets : flèches gauche et droite, en boucle ; Début et Fin.
 * `null` : la touche ne concerne pas les onglets.
 */
export function tabKeyTarget(key: string, index: number, count: number): number | null {
  if (count < 1) return null;
  if (key === "ArrowRight") return (index + 1) % count;
  if (key === "ArrowLeft") return (index - 1 + count) % count;
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  return null;
}

export type Slide = "droite" | "gauche";

/** Le côté d'où glisse la partie choisie : de la droite pour un onglet placé plus loin, de la gauche sinon. `null` : rien ne bouge. */
export function slideFrom(previous: number, next: number): Slide | null {
  if (previous < 0 || next < 0 || previous === next) return null;
  return next > previous ? "droite" : "gauche";
}
