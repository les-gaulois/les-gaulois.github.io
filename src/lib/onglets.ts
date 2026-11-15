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

/**
 * L'onglet nommé par l'adresse (`#demandes`), s'il existe pour ce compte. `null` : l'adresse n'en nomme aucun.
 * `alias` : d'autres adresses qui ouvrent un onglet, sans être son nom (`#marche` ouvre « La boutique » de /village, où
 * la partie elle-même descend ensuite au marché).
 */
export function tabOfHash(hash: string, ids: readonly string[], alias: Readonly<Record<string, string>> = {}): string | null {
  let id = hash.replace(/^#/, "");
  try {
    id = decodeURIComponent(id);
  } catch {
    // Adresse mal formée : on la lit telle quelle.
  }
  if (ids.includes(id)) return id;
  const vers = Object.hasOwn(alias, id) ? alias[id] : undefined;
  return vers !== undefined && ids.includes(vers) ? vers : null;
}

/**
 * Où va le focus avec une touche, comme dans tout groupe d'onglets : flèches gauche et droite, en boucle ; Début et Fin.
 * `vertical` : des onglets les uns sous les autres (la colonne de la Direction et du QG sur grand écran, une liste de menu),
 * où ce sont les flèches bas et haut. `null` : la touche ne concerne pas les onglets.
 */
export function tabKeyTarget(key: string, index: number, count: number, vertical = false): number | null {
  if (count < 1) return null;
  if (key === (vertical ? "ArrowDown" : "ArrowRight")) return (index + 1) % count;
  if (key === (vertical ? "ArrowUp" : "ArrowLeft")) return (index - 1 + count) % count;
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
