/**
 * La date de mise à jour d'une page, écrite une seule fois dans son en-tête (`DataStatus.astro`). Depuis le 14 novembre
 * 2026, une page dont les blocs viennent de plusieurs sources ne répète plus la date sous chaque bloc : l'en-tête les dit
 * en une ligne, chacune avec son nom. Les sources relevées à la même minute (la date écrite) ne font qu'une date.
 */
import type { Meta } from "./schemas";

/** Les jeux de données de `data/meta.json` qu'une page peut dater. */
export type SourceKey = Exclude<keyof Meta, "lastRunAt">;

/** Le nom de chaque source, avec sa préposition : il suit « Dernière mise à jour » et « La dernière collecte ». */
export const SOURCE_LABELS: Record<SourceKey, string> = {
  leaderboard: "du classement",
  members: "de la liste des membres",
  sessions: "des parties",
  clanmap: "de la carte des clans",
  ranked: "du classé",
  games: "du détail des parties",
  memberGames: "des dernières parties",
  memberResults: "des podiums",
};

export interface UpdateSource {
  label: string;
  lastSuccessAt: string | null;
}

export interface UpdateGroup {
  /** Les noms des sources relevées à cette date, dans l'ordre de la page. */
  labels: string[];
  /** La date écrite. */
  at: string;
}

/** « a », « a et b », « a, b et c ». */
export function joinLabels(labels: string[]): string {
  if (labels.length <= 1) return labels[0] ?? "";
  return `${labels.slice(0, -1).join(", ")} et ${labels.at(-1)}`;
}

/** Les sources rangées par date écrite, dans l'ordre de leur première apparition ; celles sans collecte à part. */
export function updateGroups(sources: UpdateSource[], fmt: (iso: string) => string): { groups: UpdateGroup[]; missing: string[] } {
  const groups: UpdateGroup[] = [];
  const missing: string[] = [];
  for (const source of sources) {
    if (!source.lastSuccessAt) {
      missing.push(source.label);
      continue;
    }
    const at = fmt(source.lastSuccessAt);
    const group = groups.find((g) => g.at === at);
    if (group) group.labels.push(source.label);
    else groups.push({ labels: [source.label], at });
  }
  return { groups, missing };
}

/**
 * La ligne de l'en-tête, sans la date de la donnée (« Classement arrêté au… »), que le composant pose devant. Une seule
 * date quand toutes les sources l'ont ; sinon chacune sous son nom, pour qu'aucune date distincte ne se perde.
 * `null` : aucune source n'a encore été collectée.
 */
export function updateLine(sources: UpdateSource[], fmt: (iso: string) => string): string | null {
  const { groups, missing } = updateGroups(sources, fmt);
  if (groups.length === 0) return null;
  const named = groups.length > 1 || missing.length > 0;
  if (!named) return `Dernière mise à jour : ${groups[0]?.at}, heure de Paris.`;
  const parts = groups.map((g, i) => `${i === 0 ? "Dernière mise à jour " : ""}${joinLabels(g.labels)} : ${g.at}`);
  const none = missing.length > 0 ? ` Aucune donnée ${joinLabels(missing)} collectée pour le moment.` : "";
  return `${parts.join(" · ")}, heure de Paris.${none}`;
}
