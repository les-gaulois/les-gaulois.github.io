/**
 * Un ancien relevé de la liste des membres, lu dans l'historique Git du dépôt par l'API de GitHub.
 *
 * Il ne sert qu'à donner un départ aux joueurs d'une semaine quand le relevé du lundi d'avant manque :
 * ce relevé a été fait par la collecte elle-même, et publié dans `data/members.json` à l'époque.
 * Rien n'est écrit ici : `src/lib/week-players.ts` décide s'il peut servir.
 */
import { z } from "zod";
import { StoredMembers } from "./schemas";

const MEMBERS_PATH = "data/members.json";

const Commits = z.array(z.object({ sha: z.string().regex(/^[0-9a-f]{40}$/) }));

export interface MemberHistoryDeps {
  fetch: typeof fetch;
  /** `propriétaire/dépôt`. */
  repo: string;
  /** Le jeton de l'Action. Il ne sort jamais dans un message. */
  token: string;
}

/**
 * Le plus ancien relevé de la liste fait entre `from` (inclus) et `to` (exclu), ou `null` s'il n'y en a pas.
 * Les dates d'un commit et du relevé peuvent différer de quelques minutes : seule celle du relevé compte.
 */
export async function oldestMembersReading({ fetch: get, repo, token }: MemberHistoryDeps, from: string, to: string): Promise<StoredMembers | null> {
  const headers = { Authorization: `Bearer ${token}`, "User-Agent": "gal-site", "X-GitHub-Api-Version": "2022-11-28" };
  const base = `https://api.github.com/repos/${repo}`;
  const list = await get(`${base}/commits?path=${encodeURIComponent(MEMBERS_PATH)}&since=${from}&until=${to}&per_page=100`, { headers: { ...headers, Accept: "application/vnd.github+json" } });
  if (!list.ok) throw new Error(`historique de la liste : HTTP ${list.status}`);
  // GitHub donne les plus récents d'abord.
  const commits = Commits.parse(await list.json()).reverse();
  for (const { sha } of commits) {
    const file = await get(`${base}/contents/${MEMBERS_PATH}?ref=${sha}`, { headers: { ...headers, Accept: "application/vnd.github.raw+json" } });
    if (!file.ok) throw new Error(`ancien relevé de la liste : HTTP ${file.status}`);
    const reading = StoredMembers.safeParse(await file.json());
    if (!reading.success) continue;
    if (reading.data.fetchedAt >= from && reading.data.fetchedAt < to) return reading.data;
  }
  return null;
}
