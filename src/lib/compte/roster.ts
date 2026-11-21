/**
 * Relit la liste officielle des membres et la donne au serveur, avec la clé secrète de Supabase.
 * C'est grâce à elle qu'une demande de validation est comparée à la liste, et que l'encadrement noté
 * à l'avance reçoit son rôle : voir docs/DIRECTION.md. Lancé par la GitHub Action.
 * Depuis le 21 novembre 2026, la même lecture donne aussi au serveur les victoires sous le tag de chaque membre qui a des
 * stats (`stats.team.wins`), sous la même empreinte : le serveur offre un booster surprise à chaque palier de victoires
 * franchi par un compte validé (`noter_paliers_victoires`, « Les paliers de victoires » de docs/DIRECTION.md). Il ne garde
 * que les comptes ; le reste n'est pas écrit. Une panne de cette seconde étape n'empêche jamais la liste d'être relue.
 */
import { createHash } from "node:crypto";
import { ApiMembersPage } from "../schemas";

const API = "https://api.openfront.io/public";
const PAGE_SIZE = 50;
const USER_AGENT = "GAL-clan-site/1.0";
/** La liste ne se relit qu'une fois par jour : l'Action tourne toutes les heures. */
const DAILY_MS = 20 * 3_600_000;

export type RpcResult = { ok?: boolean; error?: string } & Record<string, unknown>;

export interface RosterDeps {
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<RpcResult>;
  fetch: typeof fetch;
  sleep: (ms: number) => Promise<void>;
  now: () => Date;
  log: (message: string) => void;
  tag: string;
  delayMs: number;
}

export const hashPublicId = (id: string): string => createHash("sha256").update(id, "utf8").digest("hex");

/** Les victoires sous le tag d'un membre qui a des stats, sous l'empreinte de son identifiant public. */
export interface VictoiresDuMembre {
  hash: string;
  victoires: number;
}

/**
 * Lit toute la liste officielle. Le publicId est aussitôt remplacé par son empreinte. `victoires` : les membres dont l'API
 * donne des stats ; sans stats, un membre n'y est pas (pas de données n'est pas zéro victoire).
 */
export async function fetchRoster(
  deps: Pick<RosterDeps, "fetch" | "sleep" | "tag" | "delayMs">,
): Promise<{ entries: { hash: string; username: string | null; role: string }[]; total: number; victoires: VictoiresDuMembre[] }> {
  const byHash = new Map<string, { hash: string; username: string | null; role: string }>();
  const victoires = new Map<string, number>();
  let total = 0;
  for (let page = 1; ; page++) {
    await deps.sleep(deps.delayMs);
    const res = await deps.fetch(`${API}/clan/${deps.tag}/members?page=${page}&limit=${PAGE_SIZE}`, { headers: { "User-Agent": USER_AGENT } });
    if (!res.ok) throw new Error(`liste des membres : HTTP ${res.status}`);
    const data = ApiMembersPage.parse(await res.json());
    total = data.total;
    for (const m of data.results) {
      const hash = hashPublicId(m.publicId);
      byHash.set(hash, { hash, username: m.username ?? null, role: m.role });
      if (m.stats) victoires.set(hash, m.stats.team.wins);
    }
    if (data.results.length === 0 || byHash.size >= total) break;
  }
  // Une liste incomplète ne remplace jamais la dernière liste valide.
  if (total === 0 || byHash.size < total) throw new Error(`liste incomplète : ${byHash.size} reçus pour ${total} annoncés`);
  return { entries: [...byHash.values()], total, victoires: [...victoires].map(([hash, wins]) => ({ hash, victoires: wins })) };
}

/** Relit la liste si la dernière lecture a plus de 20 heures. Lève une erreur si le serveur ou l'API refuse. */
export async function refreshRoster(deps: RosterDeps): Promise<void> {
  const call = async (fn: string, args?: Record<string, unknown>) => {
    const result = await deps.rpc(fn, args);
    if (result.ok === false) throw new Error(`${fn} : ${result.error}`);
    return result;
  };
  const marks = await call("get_job_marks");
  const readAt = marks["roster_read_at"];
  if (typeof readAt === "string" && deps.now().getTime() - Date.parse(readAt) <= DAILY_MS) {
    deps.log("Liste des membres déjà relue aujourd'hui.");
    return;
  }
  const { entries, total, victoires } = await fetchRoster(deps);
  await call("sync_clan_roster", { p_entries: entries, p_total: total });
  deps.log(`Liste des membres relue : ${total}.`);
  // Les paliers de victoires des comptes, à part : un serveur sans la migration du 21 novembre 2026, ou une panne, ne
  // retient pas la liste, déjà relue. La lecture suivante, le lendemain, recommence.
  try {
    const paliers = await call("noter_paliers_victoires", { p_entries: victoires });
    deps.log(`Paliers de victoires : ${String(paliers["comptes"] ?? 0)} comptes relus, ${String(paliers["boosters"] ?? 0)} boosters offerts.`);
  } catch (e) {
    deps.log(`::warning::Paliers de victoires : ${e instanceof Error ? e.message : String(e)}`);
  }
}
