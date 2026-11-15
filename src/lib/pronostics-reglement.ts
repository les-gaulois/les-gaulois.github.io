/**
 * Le règlement des pronostics avec mise (migration 20261115000400_pronostics_avec_mise.sql, demande du pilote du 15 novembre
 * 2026). Chaque heure, après la collecte, `scripts/regler-pronostics.ts` envoie au serveur le nombre de victoires de chaque
 * semaine entièrement relevée, celui que le QG affiche (`clanWeeks`, `/semaine-du-clan.json`) : le serveur verse alors la
 * cagnotte aux mises les plus proches (`settle_predictions`). Une semaine ne se règle qu'une fois : les envois suivants ne
 * changent rien. Une semaine relevée en partie n'est jamais envoyée : son total peut encore monter.
 */
import type { RpcResult } from "./compte/roster";
import type { ClanWeek } from "./semaine-du-clan";

/** Une mise d'une semaine, comme le serveur la garde (`internal.predictions`). */
export interface StakeToShare {
  /** L'identifiant du compte (uuid) : le dernier départage, comme `user_id` au serveur. */
  id: string;
  wins: number;
  /** 0 : pour l'honneur. */
  stake: number;
  /** L'heure de la pose, en millisecondes : le premier posé passe avant à reste égal. */
  placedAt: number;
}

/**
 * Le partage de la cagnotte d'une semaine, le même que `settle_predictions` (migration 20261115000400), écrit ici pour être
 * testé et comparé au serveur : la cagnotte (la somme des mises) va entière aux mises les plus proches du résultat, tous
 * à égalité d'écart, au prorata de la mise ; la part entière d'abord, puis les statères qui restent, un par un, aux plus
 * grands restes, puis au premier posé, puis au plus petit identifiant. Rend ce que reçoit chaque compte qui a misé (0 pour
 * une mise perdue) ; un pronostic pour l'honneur n'y est pas. La somme rendue est exactement la cagnotte.
 */
export function partageDeLaCagnotte(stakes: readonly StakeToShare[], result: number): Map<string, number> {
  const staked = stakes.filter((item) => item.stake > 0);
  const gains = new Map<string, number>(staked.map((item) => [item.id, 0]));
  if (staked.length === 0) return gains;
  const pot = staked.reduce((sum, item) => sum + item.stake, 0);
  const best = Math.min(...staked.map((item) => Math.abs(item.wins - result)));
  const winners = staked.filter((item) => Math.abs(item.wins - result) === best);
  const winning = winners.reduce((sum, item) => sum + item.stake, 0);
  const shares = winners.map((item) => ({ item, share: Math.floor((pot * item.stake) / winning), rest: (pot * item.stake) % winning }));
  let left = pot - shares.reduce((sum, entry) => sum + entry.share, 0);
  shares.sort((a, b) => b.rest - a.rest || a.item.placedAt - b.item.placedAt || (a.item.id < b.item.id ? -1 : a.item.id > b.item.id ? 1 : 0));
  for (const entry of shares) {
    gains.set(entry.item.id, entry.share + (left > 0 ? 1 : 0));
    left--;
  }
  return gains;
}

export interface WeekToSettle {
  /** Le lundi, AAAA-MM-JJ, à Paris. */
  week: string;
  wins: number;
}

/** Les semaines à envoyer : entièrement relevées, la plus ancienne d'abord. */
export function weeksToSettle(weeks: readonly ClanWeek[]): WeekToSettle[] {
  return weeks
    .filter((week) => week.complete)
    .map((week) => ({ week: week.from, wins: week.wins }))
    .sort((a, b) => a.week.localeCompare(b.week));
}

export interface SettlePassDeps {
  rpc: (fn: string, args: Record<string, unknown>) => Promise<RpcResult>;
  weeks: readonly ClanWeek[];
  log: (line: string) => void;
}

const asCount = (value: unknown): number | null => (typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null);

/**
 * Un passage : chaque semaine complète part au serveur, l'une après l'autre. Une réponse « déjà réglée » qui donne un autre
 * total que celui d'aujourd'hui est signalée (collecte refaite depuis ?), sans rien changer : le règlement est définitif.
 * Rend le nombre de semaines réglées à ce passage et d'envois refusés ou en échec.
 */
export async function settlePass({ rpc, weeks, log }: SettlePassDeps): Promise<{ settled: number; failed: number }> {
  let settled = 0;
  let failed = 0;
  for (const { week, wins } of weeksToSettle(weeks)) {
    let answer: RpcResult;
    try {
      answer = await rpc("settle_predictions", { p_week: week, p_wins: wins });
    } catch (e) {
      failed++;
      log(`::warning::Pronostics du ${week} : ${e instanceof Error ? e.message : String(e)}`);
      continue;
    }
    if (answer.ok !== true) {
      failed++;
      log(`::warning::Pronostics du ${week} : refusé (${answer.error ?? "réponse illisible"}).`);
      continue;
    }
    const pot = asCount(answer["pot"]) ?? 0;
    if (answer["already"] === true) {
      if (answer["outcome"] === "regle" && answer["wins"] !== wins) {
        log(`::notice::Pronostics du ${week} : réglés sur ${String(answer["wins"])} victoires, le relevé dit aujourd'hui ${wins}. Rien ne change.`);
      }
      continue;
    }
    settled++;
    const winners = asCount(answer["winners"]) ?? 0;
    log(pot > 0 ? `Pronostics du ${week} : réglés sur ${wins} victoires, cagnotte de ${pot} statères versée à ${winners} mise(s).` : `Pronostics du ${week} : réglés sur ${wins} victoires, sans mise.`);
  }
  return { settled, failed };
}
