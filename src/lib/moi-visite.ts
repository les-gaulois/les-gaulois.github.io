/**
 * « Depuis votre dernière visite », pour le membre qui a retenu son pseudo : ce qui a changé pour lui.
 * Même mécanique que le résumé du clan (`visite.ts`) : le navigateur garde ses chiffres de la visite précédente, rien ne quitte l'appareil.
 * Ses chiffres sont ceux de la page Membres (`stats.team`), jamais autre chose.
 */
import { fmtCount, fmtInt, fmtRank } from "./format";
import { tierOf } from "./paliers";
import { VISIT_GAP_MS } from "./visite";

export const ME_VISIT_KEY = "gal-moi-visite";

export interface MeSnapshot {
  /** L'identifiant public du membre retenu : un autre pseudo repart de zéro. */
  id: string;
  /** Date de la liste des membres que montre la page. */
  at: string;
  wins: number;
  losses: number;
  /** Place aux victoires sous le tag, et nombre de membres départagés. */
  rank: number;
  ranked: number;
}

export interface MeVisitState {
  baseline: MeSnapshot;
  latest: MeSnapshot;
  /** La date de la visite précédente, celle que le résumé annonce. */
  since: string;
  seenAt: string;
}

function isSnapshot(value: unknown): value is MeSnapshot {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  const isCount = (x: unknown) => typeof x === "number" && Number.isInteger(x) && x >= 0;
  return typeof v["id"] === "string" && v["id"] !== "" && typeof v["at"] === "string" && !Number.isNaN(Date.parse(v["at"])) && isCount(v["wins"]) && isCount(v["losses"]) && isCount(v["rank"]) && isCount(v["ranked"]);
}

/** Ce que le navigateur a gardé. Illisible ou d'un ancien format : comme une première visite. */
export function readMeVisitState(raw: string | null): MeVisitState | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<MeVisitState>;
    const isDate = (v: unknown): v is string => typeof v === "string" && !Number.isNaN(Date.parse(v));
    if (!isSnapshot(value.baseline) || !isSnapshot(value.latest) || !isDate(value.since) || !isDate(value.seenAt)) return null;
    return { baseline: value.baseline, latest: value.latest, since: value.since, seenAt: value.seenAt };
  } catch {
    return null;
  }
}

/** L'état à garder après cet affichage. Un autre membre retenu, ou une première visite : ses chiffres du jour servent de départ. */
export function nextMeVisitState(stored: MeVisitState | null, current: MeSnapshot, now: Date): MeVisitState {
  const seenAt = now.toISOString();
  if (!stored || stored.latest.id !== current.id) return { baseline: current, latest: current, since: seenAt, seenAt };
  const newVisit = now.getTime() - Date.parse(stored.seenAt) >= VISIT_GAP_MS;
  const latest = current.at >= stored.latest.at ? current : stored.latest;
  return newVisit ? { baseline: stored.latest, latest, since: stored.seenAt, seenAt } : { baseline: stored.baseline, latest, since: stored.since, seenAt };
}

/** Les phrases du résumé personnel, sans commentaire. Vide : rien n'a changé pour ce membre. */
export function meVisitLines(baseline: MeSnapshot, current: MeSnapshot): string[] {
  if (current.id !== baseline.id || current.at < baseline.at) return [];
  const lines: string[] = [];
  const games = current.wins + current.losses - (baseline.wins + baseline.losses);
  const wins = current.wins - baseline.wins;
  if (games > 0) lines.push(`${fmtCount(games, "partie")} sous le tag de plus, dont ${fmtCount(Math.max(0, wins), "victoire")}.`);
  if (baseline.rank !== current.rank) lines.push(`Place aux victoires : ${fmtRank(baseline.rank)} à votre dernière visite, ${fmtRank(current.rank)} au dernier relevé, sur ${fmtInt(current.ranked)} membres.`);
  const before = tierOf(baseline.wins);
  const after = tierOf(current.wins);
  if (after !== null && (before === null || after > before)) lines.push(`Palier des ${fmtInt(after)} victoires franchi.`);
  return lines;
}
