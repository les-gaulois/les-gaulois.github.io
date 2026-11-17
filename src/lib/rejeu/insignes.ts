/**
 * Ce que le fil « Entre Gaulois » de « Revoir une partie » montre après le nom d'un membre au pseudo public (demande du
 * pilote, 17 novembre 2026 : « le strike flamme du joueur et son logo prestige avec son niveau et la couleur en fonction de
 * son prestige ») : le niveau et le prestige de son compte, « tout le jeu », tels que la liste du clan les donne
 * aujourd'hui (la seule exception à `stats.team`, CLAUDE.md), et sa série en cours quand sa flamme est allumée (5 victoires
 * d'affilée et plus sous le tag, `serie-en-cours.ts`). Ce sont ceux d'aujourd'hui, pas ceux du jour de la partie : l'écran
 * le dit.
 *
 * Le journal nomme un membre par son pseudo public (`journal.ts`) : les insignes sont donc rangés par pseudo. Un pseudo
 * porté par deux membres ne désigne personne : ni l'un ni l'autre n'a d'insigne.
 */
import type { AccountLevel } from "../schemas";
import { flammeAllumee, type RecordPersonnel, type SerieEnCours } from "../serie-en-cours";

export interface Insignes {
  compte: AccountLevel | null;
  flamme: { victoires: number; auMoins: boolean; doree: boolean } | null;
}

/** Le pseudo tel que le journal l'écrit (`nomsPubliables`, film-brut.ts) : sur une ligne, 40 caractères au plus. */
export const pseudoDuJournal = (pseudo: string): string => pseudo.replace(/\s+/g, " ").trim().slice(0, 40);

/** Les identifiants publics des membres, par pseudo du journal : plusieurs pour un pseudo porté par plusieurs membres. */
export function porteursDesPseudos(membres: readonly { username?: string | null; publicId?: string | null }[]): Map<string, string[]> {
  const porteurs = new Map<string, string[]>();
  for (const m of membres) if (m.username && m.publicId) porteurs.set(pseudoDuJournal(m.username), [...(porteurs.get(pseudoDuJournal(m.username)) ?? []), m.publicId]);
  return porteurs;
}

/** Les insignes des membres au pseudo public, par pseudo. Un membre sans niveau visible ni flamme allumée n'y est pas. */
export function insignesParPseudo(
  membres: readonly { username?: string | null; publicId?: string | null; account?: AccountLevel | null }[],
  series: ReadonlyMap<string, SerieEnCours>,
  records: ReadonlyMap<string, RecordPersonnel>,
): Record<string, Insignes> {
  const comptes = new Map(membres.flatMap((m) => (m.publicId ? [[m.publicId, m.account ?? null] as const] : [])));
  const insignes: Record<string, Insignes> = {};
  for (const [pseudo, ids] of porteursDesPseudos(membres)) {
    if (ids.length !== 1) continue;
    const id = ids[0]!;
    const serie = series.get(id) ?? null;
    const compte = comptes.get(id) ?? null;
    const flamme = flammeAllumee(serie) ? { victoires: serie.victoires, auMoins: serie.auMoins, doree: records.get(id)?.doree ?? false } : null;
    if (compte || flamme) insignes[pseudo] = { compte, flamme };
  }
  return insignes;
}
