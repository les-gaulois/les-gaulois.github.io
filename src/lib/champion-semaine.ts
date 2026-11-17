/**
 * Le champion de la semaine (demande du pilote, 17 novembre 2026 : « une finition prêtée au champion de la semaine ») :
 * le premier du podium « Le plus de victoires » de la dernière gazette, le même que celui des cartes de l'accueil. Sa
 * carte porte une couronne d'or tant que ce podium est affiché, sur l'accueil comme sur sa fiche. Rien n'est calculé
 * ici : la place vient de la gazette. Deux premiers à égalité sont tous deux champions. Rien ne s'achète, aucun statère.
 */
import { clan } from "../../config/clan";
import { loadHistory, loadMemberWeeks, loadMembers, loadMeta, loadSessions, loadTerritoryReadings } from "./data";
import { gazetteEditions } from "./gazette";

/** Les premiers d'un podium : les joueurs de la place 1. */
export function premiersDuPodium(players: readonly { id: string; place: number }[] | null | undefined): Set<string> {
  return new Set((players ?? []).filter((p) => p.place === 1).map((p) => p.id));
}

let lus: ReadonlySet<string> | null = null;

/** Les identifiants publics des champions de la semaine, lus une fois par construction. Vide sans podium. */
export function championsDeLaSemaine(): ReadonlySet<string> {
  if (lus) return lus;
  const meta = loadMeta();
  const gazette = gazetteEditions({ sessions: loadSessions(), history: loadHistory(), territory: loadTerritoryReadings(), weekTops: loadMemberWeeks().tops, members: loadMembers(), archiveStart: clan.archiveStart, completeThrough: meta.sessions.completeThrough })[0];
  lus = premiersDuPodium(gazette?.players);
  return lus;
}
