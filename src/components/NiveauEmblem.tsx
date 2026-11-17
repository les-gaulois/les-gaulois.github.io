import { EMBLEME_CRANS, EMBLEME_HEXAGONE, prestigeColor, segmentColors } from "../lib/niveau";
import type { AccountLevel } from "../lib/schemas";

/**
 * L'emblème du niveau du compte, redessiné par le site sur le modèle du badge du jeu, sans en reprendre le code :
 * une case hexagonale, comme un territoire, et dix crans autour, un allumé par prestige, aux couleurs que le jeu donne à chaque prestige (src/lib/niveau.ts). Le chiffre reste blanc,
 * lisible sur toutes les couleurs. Décoratif : le texte à côté dit le niveau, l'emblème n'en est que l'image.
 * Rendu au build sur les fiches, dans le navigateur pour la liste des membres.
 */

export function NiveauEmblem({ account, size = "sm" }: { account: AccountLevel; size?: "xs" | "sm" | "lg" }) {
  const lit = segmentColors(account);
  const color = prestigeColor(account);
  // « xs » : à côté d'un nom, dans une ligne du fil « Entre Gaulois » de « Revoir une partie ».
  const px = size === "lg" ? 96 : size === "xs" ? 18 : 28;
  return (
    <svg viewBox="0 0 100 100" width={px} height={px} aria-hidden="true" focusable="false" class="shrink-0 text-white">
      <polygon points={EMBLEME_HEXAGONE} fill="var(--color-surface-2)" stroke={color} stroke-width="4" stroke-linejoin="round" />
      {EMBLEME_CRANS.map((d, i) => (
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
