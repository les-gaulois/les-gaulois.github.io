/**
 * La relecture des parties du clan qui n'ont pas rapporté de points, pour les missions du sentier des Gaulois
 * (docs/DIRECTION.md, « Le sentier des Gaulois »), lancée toutes les 5 minutes par le workflow des victoires
 * (`scripts/noter-parties-sentier.ts`), après les statères et à part d'eux.
 *
 * - Les parties qui ont rapporté des points sont déjà au serveur, avec leurs Gaulois, par la relecture des statères
 *   (`stateres-releve.ts`). Celle-ci ajoute les autres parties jouées sous le tag du clan contre des joueurs, perdues ou sans
 *   point, commencées depuis hier à minuit, à Paris : le serveur valide une mission pour aujourd'hui et pour hier.
 * - Pour chacune, le détail public de la partie donne les Gaulois présents, comme pour les statères ; leur `publicID` est
 *   aussitôt remplacé par son empreinte SHA-256. Aucun identifiant n'est écrit ni affiché.
 * - Au plus `MAX_PARTIES` détails par passage, des plus récents aux plus anciens, et au plus `MAX_LECTURE_MS` de lecture.
 *   Un détail illisible attend le passage suivant ; un refus de l'API (403) ne se contourne pas et arrête la lecture.
 * - Même sans partie à noter, le serveur est appelé une fois : il ouvre le jour (missions, défi, étal) et efface l'ancien.
 */
import type { ApiVictoryGame, StoredSession } from "./schemas";
import type { RpcResult } from "./compte/roster";
import { empreintesDesGaulois } from "./stateres-releve";
import { addDays, parisParts, parisStartOf } from "./time";
import { isVictory } from "./victoires";

/** Détails de parties relus au plus par passage. */
export const MAX_PARTIES = 60;
/** Parties envoyées au serveur par appel : le serveur en refuse plus de 50. */
export const PAR_ENVOI = 25;
/** Au-delà de tant de détails illisibles, le passage s'arrête de lire. */
export const MAX_ECHECS = 5;
/** Le temps de lecture d'un passage : aucun détail n'est demandé après. L'étape du workflow a 3 minutes. */
export const MAX_LECTURE_MS = 90_000;

/** Une partie telle que le serveur la reçoit. */
export interface PartieDuSentier {
  partie: string;
  debut: string;
  /** Les empreintes des Gaulois présents, chacune une fois, triées. */
  empreintes: string[];
}

/** Depuis quand les parties comptent : hier à minuit, à Paris. */
export const fenetreDuSentier = (now: Date): string => parisStartOf(addDays(parisParts(now).date, -1));

/**
 * Les parties à relire : jouées sous le tag du clan contre des joueurs, sans point rapporté (celles qui en rapportent
 * passent par les statères), commencées depuis `depuis`, pas encore notées, des plus récentes aux plus anciennes.
 */
export function partiesARelire(sessions: readonly StoredSession[], depuis: string, notees: ReadonlySet<string>): StoredSession[] {
  const parPartie = new Map<string, StoredSession>();
  for (const s of sessions) {
    if (s.clanPlayerCount < 1 || s.totalPlayerCount < 2 || (isVictory(s) && s.score > 0)) continue;
    if (Date.parse(s.gameStart) < Date.parse(depuis) || notees.has(s.gameId)) continue;
    parPartie.set(s.gameId, s);
  }
  return [...parPartie.values()].sort((a, b) => b.gameStart.localeCompare(a.gameStart) || a.gameId.localeCompare(b.gameId));
}

export interface ReleveDuSentierDeps {
  rpc: (fn: string, args: Record<string, unknown>) => Promise<RpcResult>;
  /** Les sessions du clan, collectées et lues à l'instant. `null` : illisibles, seul le serveur est relancé. */
  sessions: readonly StoredSession[] | null;
  readGame: (gameId: string) => Promise<ApiVictoryGame>;
  now: Date;
  tag: string;
  log: (line: string) => void;
  /** L'horloge du temps de lecture, en millisecondes. Par défaut `Date.now`. */
  horloge?: () => number;
}

/** Un passage. Lève une erreur si le serveur refuse : le workflow le note, le reste du passage est déjà fait. */
export async function releveDuSentier({ rpc, sessions, readGame, now, tag, log, horloge = Date.now }: ReleveDuSentierDeps): Promise<{ notees: number; restantes: number }> {
  const call = async (fn: string, args: Record<string, unknown>) => {
    const result = await rpc(fn, args);
    if (result.ok !== true) throw new Error(`${fn} : ${typeof result.error === "string" ? result.error : "réponse inattendue"}`);
    return result;
  };
  const depuis = fenetreDuSentier(now);
  const deja = await call("sentier_parties_notees", { p_depuis: depuis });
  const notees = new Set(Array.isArray(deja["parties"]) ? deja["parties"].filter((p): p is string => typeof p === "string") : []);
  if (!sessions) log("::warning::Sentier : aucune session lisible, aucune partie relue.");
  const aRelire = sessions ? partiesARelire(sessions, depuis, notees) : [];
  const lues: PartieDuSentier[] = [];
  let echecs = 0;
  const debutLecture = horloge();
  for (const session of aRelire.slice(0, MAX_PARTIES)) {
    if (horloge() - debutLecture >= MAX_LECTURE_MS) {
      log("Sentier : temps de lecture du passage écoulé, la suite au prochain passage.");
      break;
    }
    try {
      const game = await readGame(session.gameId);
      lues.push({ partie: session.gameId, debut: new Date(session.gameStart).toISOString(), empreintes: empreintesDesGaulois(game, tag) });
    } catch (e) {
      echecs++;
      const raison = e instanceof Error ? e.message : String(e);
      // Un refus de l'API ne se contourne pas : plus aucun détail demandé de ce passage.
      if (/^HTTP 403\b/.test(raison)) {
        log("::warning::Sentier : l'API d'OpenFront refuse la lecture des parties (403). Aucune autre demande à ce passage.");
        break;
      }
      log(`Sentier : le détail de la partie ${session.gameId} ne se lit pas (${raison}). Nouvel essai au prochain passage.`);
      if (echecs >= MAX_ECHECS) break;
    }
  }
  let nouvelles = 0;
  for (let i = 0; i === 0 || i < lues.length; i += PAR_ENVOI) {
    const r = await call("noter_parties_sentier", { p_parties: lues.slice(i, i + PAR_ENVOI) });
    nouvelles += typeof r["notees"] === "number" ? r["notees"] : 0;
  }
  const restantes = aRelire.length - lues.length;
  log(`Sentier : ${nouvelles} partie(s) sans point notée(s)` + (restantes > 0 ? `, ${restantes} à relire aux passages suivants.` : "."));
  return { notees: nouvelles, restantes };
}
