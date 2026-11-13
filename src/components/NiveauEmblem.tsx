import { PRESTIGE_STEPS, prestigeColor, segmentColors } from "../lib/niveau";
import type { AccountLevel } from "../lib/schemas";

/**
 * L'emblème du niveau du compte, redessiné par le site sur le modèle du badge du jeu, sans en reprendre le code :
 * une case hexagonale, comme un territoire, et dix crans autour, un allumé par prestige, aux couleurs que le jeu donne à chaque prestige (src/lib/niveau.ts). Le chiffre reste blanc,
 * lisible sur toutes les couleurs. Décoratif : le texte à côté dit le niveau, l'emblème n'en est que l'image.
 * Rendu au build sur les fiches, dans le navigateur pour la liste des membres.
 */
const R = 43;
const STEP = 360 / PRESTIGE_STEPS;
const GAP = 9;

const point = (deg: number, r: number) => {
  const rad = (deg * Math.PI) / 180;
  return `${(50 + r * Math.cos(rad)).toFixed(2)} ${(50 + r * Math.sin(rad)).toFixed(2)}`;
};
const SEGMENTS = Array.from({ length: PRESTIGE_STEPS }, (_, i) => {
  const from = -90 + i * STEP + GAP / 2;
  return `M ${point(from, R)} A ${R} ${R} 0 0 1 ${point(from + STEP - GAP, R)}`;
});
const HEXAGON = Array.from({ length: 6 }, (_, i) => point(-90 + i * 60, 32).replace(" ", ",")).join(" ");

export function NiveauEmblem({ account, size = "sm" }: { account: AccountLevel; size?: "sm" | "lg" }) {
  const lit = segmentColors(account);
  const color = prestigeColor(account);
  const px = size === "lg" ? 96 : 28;
  return (
    <svg viewBox="0 0 100 100" width={px} height={px} aria-hidden="true" focusable="false" class="shrink-0 text-white">
      <polygon points={HEXAGON} fill="var(--color-surface-2)" stroke={color} stroke-width="4" stroke-linejoin="round" />
      {SEGMENTS.map((d, i) => (
        <path key={i} d={d} fill="none" stroke={lit[i] ?? "var(--color-line)"} stroke-width="8" />
      ))}
      {size === "lg" && (
        <text x="50" y="52" text-anchor="middle" dominant-baseline="middle" fill="currentColor" font-size={account.level >= 100 ? 26 : 32} font-weight="800" class="font-display">
          {account.level}
        </text>
      )}
    </svg>
  );
}
