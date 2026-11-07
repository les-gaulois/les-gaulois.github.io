/**
 * « Depuis votre dernière visite » : ce qui a changé pour le clan, calculé dans le navigateur du visiteur.
 * Les chiffres viennent de la page ; le navigateur garde seulement ceux de la visite précédente. Rien ne quitte l'appareil.
 */
import { fmtCount, fmtInt, fmtRank, fmtScore } from "./format";

export const VISIT_KEY = "gal-visite";
/** Après ce délai sans revenir sur l'accueil, c'est une nouvelle visite. Recharger la page ne doit pas faire perdre le résumé. */
export const VISIT_GAP_MS = 3 * 3_600_000;

export interface VisitSnapshot {
  /** Date de la collecte que montre la page. */
  at: string;
  rank: number | null;
  score: number | null;
  /** Parties et victoires de toute l'archive du clan. */
  games: number;
  wins: number;
  pixels: number | null;
  mapRank: number | null;
  members: number | null;
  /** Le lundi de la dernière gazette. */
  gazette: string | null;
}

export interface VisitState {
  /** Les chiffres de la visite précédente : on compare à ceux-là. */
  baseline: VisitSnapshot;
  /** Les derniers chiffres vus : ils deviendront la référence de la prochaine visite. */
  latest: VisitSnapshot;
  /** La date de la visite précédente, celle que le résumé annonce. Pas celle de la collecte, qui peut être plus ancienne. */
  since: string;
  seenAt: string;
}

const isNumberOrNull = (v: unknown) => v === null || typeof v === "number";

function isSnapshot(value: unknown): value is VisitSnapshot {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v["at"] === "string" &&
    !Number.isNaN(Date.parse(v["at"])) &&
    typeof v["games"] === "number" &&
    typeof v["wins"] === "number" &&
    isNumberOrNull(v["rank"]) &&
    isNumberOrNull(v["score"]) &&
    isNumberOrNull(v["pixels"]) &&
    isNumberOrNull(v["mapRank"]) &&
    isNumberOrNull(v["members"]) &&
    (v["gazette"] === null || typeof v["gazette"] === "string")
  );
}

/** Ce que le navigateur a gardé. Illisible ou d'un ancien format : comme une première visite. */
export function readVisitState(raw: string | null): VisitState | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<VisitState>;
    const isDate = (v: unknown): v is string => typeof v === "string" && !Number.isNaN(Date.parse(v));
    if (!isSnapshot(value.baseline) || !isSnapshot(value.latest) || !isDate(value.since) || !isDate(value.seenAt)) return null;
    return { baseline: value.baseline, latest: value.latest, since: value.since, seenAt: value.seenAt };
  } catch {
    return null;
  }
}

/** L'état à garder après cet affichage. Une nouvelle visite prend pour référence les derniers chiffres vus. */
export function nextVisitState(stored: VisitState | null, current: VisitSnapshot, now: Date): VisitState {
  const seenAt = now.toISOString();
  if (!stored) return { baseline: current, latest: current, since: seenAt, seenAt };
  const newVisit = now.getTime() - Date.parse(stored.seenAt) >= VISIT_GAP_MS;
  // Une page servie par un cache peut être plus ancienne que la dernière vue : elle ne doit pas faire reculer la référence.
  const latest = current.at >= stored.latest.at ? current : stored.latest;
  return newVisit ? { baseline: stored.latest, latest, since: stored.seenAt, seenAt } : { baseline: stored.baseline, latest, since: stored.since, seenAt };
}

const signed = (n: number, format: (v: number) => string) => `${n < 0 ? "−" : "+"}${format(Math.abs(n))}`;
const both = (before: number, after: number, where: string) => (before === after ? `${where} : ${fmtRank(after)}, comme à votre dernière visite.` : `${where} : ${fmtRank(before)} à votre dernière visite, ${fmtRank(after)} au dernier relevé.`);

/** Les phrases du résumé, sans commentaire : deux relevés ne disent rien de ce qui s'est passé entre eux. Vide : rien n'a changé. */
export function visitLines(baseline: VisitSnapshot, current: VisitSnapshot): string[] {
  if (current.at < baseline.at) return [];
  const lines: string[] = [];
  const games = current.games - baseline.games;
  if (games > 0) lines.push(`${fmtCount(games, "partie")} de plus, dont ${fmtCount(Math.max(0, current.wins - baseline.wins), "victoire")}.`);

  if (baseline.rank !== null && current.rank !== null) {
    const score = baseline.score !== null && current.score !== null ? current.score - baseline.score : 0;
    if (baseline.rank !== current.rank || score !== 0) lines.push(`${both(baseline.rank, current.rank, "Classement")}${score !== 0 ? ` Score : ${signed(score, fmtScore)}.` : ""}`);
  }

  if (baseline.pixels !== null && current.pixels !== null && baseline.pixels !== current.pixels) {
    const place = baseline.mapRank !== null && current.mapRank !== null ? ` ${both(baseline.mapRank, current.mapRank, "Place")}` : "";
    const change = current.pixels - baseline.pixels;
    lines.push(`Carte des clans : ${signed(change, fmtInt)} ${Math.abs(change) > 1 ? "pixels" : "pixel"}.${place}`);
  }

  if (baseline.members !== null && current.members !== null && baseline.members !== current.members) {
    const change = current.members - baseline.members;
    lines.push(`Membres dans la liste officielle : ${signed(change, fmtInt)}, ${fmtInt(current.members)} en tout.`);
  }
  return lines;
}

/** Une gazette parue depuis : le résumé y renvoie. */
export const hasNewGazette = (baseline: VisitSnapshot, current: VisitSnapshot) => current.at >= baseline.at && current.gazette !== null && (baseline.gazette === null || current.gazette > baseline.gazette);
