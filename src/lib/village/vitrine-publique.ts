/**
 * La vitrine que voit un visiteur sur « Mon Gaulois » (revue du site du 18 novembre 2026 : la page ne lui montrait qu'un
 * bouton de connexion, rien de ce qui attend un membre). Les Gaulois déjà créés par les membres au pseudo public, tels que
 * la dernière construction du site les a relevés (src/lib/gaulois-site.ts) : les mêmes images que sur les fiches et à côté
 * des pseudos, rien de plus. Un membre connecté a sa vraie vitrine, dans l'onglet « La vitrine ».
 *
 * L'ordre : le plus de victoires sous le tag d'abord (`stats.team`, la liste officielle), puis le pseudo.
 */
export interface MembreDeLaVitrine {
  publicId: string | null;
  username: string | null;
  team: { wins: number } | null;
}

export interface GauloisDeLaVitrine {
  id: string;
  pseudo: string;
  victoires: number | null;
}

export function vitrinePublique(membres: readonly MembreDeLaVitrine[], aSonGaulois: (id: string) => boolean): GauloisDeLaVitrine[] {
  return membres
    .flatMap((m): GauloisDeLaVitrine[] => (m.publicId && m.username && aSonGaulois(m.publicId) ? [{ id: m.publicId, pseudo: m.username, victoires: m.team?.wins ?? null }] : []))
    .sort((a, b) => (b.victoires ?? -1) - (a.victoires ?? -1) || a.pseudo.localeCompare(b.pseudo, "fr"));
}
