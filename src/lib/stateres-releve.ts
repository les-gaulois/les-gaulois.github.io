/**
 * La relecture des victoires pour les statères (docs/DIRECTION.md, « Le village des Gaulois », lot 2), lancée toutes les 5
 * minutes par le workflow des victoires (`scripts/crediter-stateres.ts`), après l'envoi sur Discord et à part de lui : une
 * panne du serveur ne retient jamais l'image d'une victoire.
 *
 * - Les victoires sont celles du message de Discord (`isVictory`), avec des points (`score` positif), commencées depuis
 *   `fenetreDesVictoires` : tout le mois en cours, à Paris. Celles que le serveur a déjà notées ne sont pas relues.
 * - Pour chacune, le détail de la partie donne les Gaulois présents : le tag du clan et des stats, comme `clanPlayerCount`,
 *   anonymes compris. Leur `publicID` est aussitôt remplacé par son empreinte SHA-256 (`hashPublicId`), la même que celle des
 *   comptes validés (`private_links.openfront_hash`). Aucun identifiant n'est écrit ni affiché, ni dans `data/`, ni au journal.
 * - Le serveur (`noter_victoires_stateres`, clé de service) garde la partie et les empreintes, puis crédite les comptes
 *   validés dont l'empreinte est là et qui ont créé leur Gaulois. Une partie notée deux fois ne compte qu'une fois.
 * - Au plus `MAX_PARTIES` détails relus par passage, des plus récentes aux plus anciennes : le mois déjà joué se rattrape en
 *   quelques passages, sans peser sur l'API. Un détail illisible attend le passage suivant.
 */
import type { ApiVictoryGame, StoredSession } from "./schemas";
import { hashPublicId, type RpcResult } from "./compte/roster";
import { fenetreDesVictoires, stateresDeVictoire } from "./stateres";
import { isVictory } from "./victoires";

/** Détails de parties relus au plus par passage : environ 45 s avec la pause de l'API. */
export const MAX_PARTIES = 80;
/** Parties envoyées au serveur par appel : le serveur en refuse plus de 50. */
export const PAR_ENVOI = 25;
/** Au-delà de tant de détails illisibles, le passage s'arrête de lire : l'API a sans doute un problème. */
export const MAX_ECHECS = 5;

/** Une victoire telle que le serveur la reçoit. */
export interface PartieNotee {
  partie: string;
  debut: string;
  points: number;
  gaulois: number;
  /** Les empreintes des Gaulois présents, chacune une fois, triées. */
  empreintes: string[];
}

/** Les victoires du mois à relire : avec des points, pas encore notées, des plus récentes aux plus anciennes, chacune une fois. */
export function victoiresARelire(sessions: readonly StoredSession[], depuis: string, notees: ReadonlySet<string>): StoredSession[] {
  const parPartie = new Map<string, StoredSession>();
  for (const s of sessions) {
    if (!isVictory(s) || !(s.score > 0) || s.clanPlayerCount < 1 || Date.parse(s.gameStart) < Date.parse(depuis) || notees.has(s.gameId)) continue;
    parPartie.set(s.gameId, s);
  }
  return [...parPartie.values()].sort((a, b) => b.gameStart.localeCompare(a.gameStart) || a.gameId.localeCompare(b.gameId));
}

/** Les empreintes des Gaulois présents : le tag du clan, des stats et un identifiant public. */
export function empreintesDesGaulois(game: ApiVictoryGame, tag: string): string[] {
  const ids = new Set<string>();
  for (const p of game.info.players) if (p.clanTag === tag && p.hasStats && p.publicID) ids.add(p.publicID);
  return [...ids].map(hashPublicId).sort();
}

export const partieNotee = (session: StoredSession, game: ApiVictoryGame, tag: string): PartieNotee => ({
  partie: session.gameId,
  debut: new Date(session.gameStart).toISOString(),
  points: session.score,
  gaulois: session.clanPlayerCount,
  empreintes: empreintesDesGaulois(game, tag),
});

export interface ReleveDeps {
  rpc: (fn: string, args: Record<string, unknown>) => Promise<RpcResult>;
  /** Les sessions du clan, collectées et lues à l'instant. `null` : illisibles, seul le serveur est relancé. */
  sessions: readonly StoredSession[] | null;
  readGame: (gameId: string) => Promise<ApiVictoryGame>;
  now: Date;
  tag: string;
  log: (line: string) => void;
}

/**
 * Un passage. Lève une erreur si le serveur refuse : le workflow le note, l'envoi des victoires est déjà fait. Même sans
 * nouvelle victoire, le serveur est appelé une fois : il note l'heure de la relecture, crédite un Gaulois créé entre-temps et
 * efface ce qui a passé son temps.
 */
export async function releveStateres({ rpc, sessions, readGame, now, tag, log }: ReleveDeps): Promise<{ notees: number; credits: number; restantes: number }> {
  const call = async (fn: string, args: Record<string, unknown>) => {
    const result = await rpc(fn, args);
    if (result.ok !== true) throw new Error(`${fn} : ${typeof result.error === "string" ? result.error : "réponse inattendue"}`);
    return result;
  };
  const depuis = fenetreDesVictoires(now);
  const deja = await call("stateres_parties_notees", { p_depuis: depuis });
  const notees = new Set(Array.isArray(deja["parties"]) ? deja["parties"].filter((p): p is string => typeof p === "string") : []);
  if (!sessions) log("::warning::Statères : aucune session lisible, aucune victoire relue.");
  const aRelire = sessions ? victoiresARelire(sessions, depuis, notees) : [];
  const lues: PartieNotee[] = [];
  let echecs = 0;
  for (const session of aRelire.slice(0, MAX_PARTIES)) {
    try {
      lues.push(partieNotee(session, await readGame(session.gameId), tag));
    } catch (e) {
      echecs++;
      log(`Statères : le détail de la partie ${session.gameId} ne se lit pas (${e instanceof Error ? e.message : String(e)}). Nouvel essai au prochain passage.`);
      if (echecs >= MAX_ECHECS) break;
    }
  }
  let nouvelles = 0;
  let credits = 0;
  for (let i = 0; i === 0 || i < lues.length; i += PAR_ENVOI) {
    const lot = lues.slice(i, i + PAR_ENVOI);
    const r = await call("noter_victoires_stateres", { p_parties: lot });
    nouvelles += typeof r["notees"] === "number" ? r["notees"] : 0;
    credits += typeof r["credits"] === "number" ? r["credits"] : 0;
  }
  const restantes = aRelire.length - lues.length;
  const statere = lues.reduce((n, p) => n + stateresDeVictoire(p.points, p.gaulois), 0);
  log(
    `Statères : ${nouvelles} victoire(s) notée(s)${lues.length > 0 ? ` (${statere} statères par Gaulois présent en tout)` : ""}, ${credits} crédit(s) donné(s)` +
      (restantes > 0 ? `, ${restantes} victoire(s) à relire aux passages suivants.` : "."),
  );
  return { notees: nouvelles, credits, restantes };
}
