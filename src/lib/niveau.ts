/*
 * Couleurs des prestiges (PRESTIGE_COLORS, LEGEND_COLOR, PRISM_COLORS, plus bas) : valeurs reprises d'OpenFront
 * (https://github.com/openfrontio/OpenFrontIO), © OpenFront and Contributors, AGPL-3.0 : `TIER_COLORS` et `LEGEND_COLOR`
 * de src/client/Progression.ts, `PRISM` de src/client/components/LevelBadge.ts, commit 2f0252d du 13 novembre 2026.
 * Modifiées le 13 novembre 2026 : seules les couleurs sont gardées, rangées par prestige ; l'emblème qui les porte est
 * redessiné par le site sur le modèle du badge du jeu, sans en reprendre le code (src/components/NiveauEmblem.tsx).
 * Dans le jeu, chaque prestige a son rang (fer, bronze, argent, or, platine, émeraude, diamant, maître, grand maître, champion) ;
 * le site n'en écrit pas le nom, que le jeu n'affiche pas. Voir NOTICE.md.
 */
import type { AccountLevel } from "./schemas";

/**
 * Le niveau du compte OpenFront d'un membre : de 1 à 100, puis le joueur peut repartir au niveau 1 en gagnant un prestige, jusqu'à 10.
 * Au niveau 100 du dernier prestige, il devient « Légende ». C'est tout le jeu confondu, pas seulement les parties sous le tag :
 * seule exception à `stats.team`, voulue par le pilote le 13 novembre 2026. Il n'est jamais mêlé aux stats du clan.
 * Lu tel quel dans `/public/clan/GAL/members` : rien n'est calculé, sauf l'ordre du tri.
 */

/** Les crans de la jauge autour de l'emblème : un par prestige, comme dans le jeu. */
export const PRESTIGE_STEPS = 10;

/** Index 0 : pas encore de prestige (ardoise). Puis du prestige 1 (fer) au prestige 10 (champion, dont la teinte de lueur). */
export const PRESTIGE_COLORS = [
  "#64748b",
  "#6b7280",
  "#c27c3e",
  "#c3cbd6",
  "#f2c230",
  "#9fe3dc",
  "#2fd28f",
  "#a5e7ff",
  "#c48cff",
  "#ff6b81",
  "#f472b6",
] as const;
/** L'or de la Légende. */
export const LEGEND_COLOR = "#facc15";
/** Le prestige 10 a une jauge aux couleurs du prisme. */
export const PRISM_COLORS = ["#ff5fa8", "#ffa53b", "#ffe45c", "#47e0a0", "#46b4ff", "#a46bff"] as const;

/** La couleur du prestige : celle de son rang, l'or pour une Légende, celle du prestige 10 au-delà. */
export function prestigeColor(a: AccountLevel): string {
  if (a.legend) return LEGEND_COLOR;
  return PRESTIGE_COLORS[Math.min(PRESTIGE_STEPS, Math.max(0, a.prestige))] ?? PRESTIGE_COLORS[0];
}

/** La couleur de chaque cran allumé : celle du prestige, ou le prisme, d'un bout à l'autre de la jauge, au prestige 10. */
export function segmentColors(a: AccountLevel): string[] {
  const lit = prestigeLit(a);
  const prism = !a.legend && a.prestige >= PRESTIGE_STEPS;
  return Array.from({ length: lit }, (_, i) =>
    prism ? (PRISM_COLORS[Math.floor((i * PRISM_COLORS.length) / PRESTIGE_STEPS)] ?? PRISM_COLORS[0]) : prestigeColor(a),
  );
}

/** « Prestige 1 · Niveau 62 », « Niveau 94 » sans prestige, « Légende » au sommet. */
export function accountLabel(a: AccountLevel): string {
  if (a.legend) return "Légende";
  return a.prestige > 0 ? `Prestige ${a.prestige} · Niveau ${a.level}` : `Niveau ${a.level}`;
}

/** Pour le tableau, où la place manque : « 62 », puis « prestige 1 » à côté. */
export function accountShort(a: AccountLevel): { level: string; prestige: string | null } {
  if (a.legend) return { level: "Légende", prestige: null };
  return { level: String(a.level), prestige: a.prestige > 0 ? `prestige ${a.prestige}` : null };
}

/** Les crans allumés de la jauge : un par prestige, tous pour une Légende. */
export function prestigeLit(a: AccountLevel): number {
  return a.legend ? PRESTIGE_STEPS : Math.min(PRESTIGE_STEPS, Math.max(0, a.prestige));
}

/**
 * La clé des couleurs, sous la liste des membres : un emblème par prestige, de « Sans prestige » à « Légende ».
 * Le niveau n'y est pas écrit : le petit emblème ne montre que le prestige.
 */
export function prestigeKey(): { label: string; account: AccountLevel }[] {
  return [
    ...Array.from({ length: PRESTIGE_STEPS + 1 }, (_, p) => ({ label: p === 0 ? "Sans prestige" : `Prestige ${p}`, account: { level: 1, prestige: p, legend: false } })),
    { label: "Légende", account: { level: 100, prestige: PRESTIGE_STEPS, legend: true } },
  ];
}

/** L'ordre du tri : le prestige d'abord, puis le niveau ; une Légende tout en haut. */
export function accountRank(a: AccountLevel): number {
  return (a.legend ? 1 : 0) * 100_000 + a.prestige * 1_000 + a.level;
}
