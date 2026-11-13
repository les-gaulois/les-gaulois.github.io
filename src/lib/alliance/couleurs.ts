import { clanRgb } from "../clanmap/codec";

/**
 * Les couleurs des alliances sur la carte : huit teintes bien distinctes, lisibles sur le fond sombre de la carte, au choix
 * de l'encadrement. Le serveur garde la valeur 0xRRGGBB ; une valeur hors de cette liste reste affichée telle quelle.
 */
export const COULEURS_ALLIANCE = [
  { nom: "Bleu ciel", valeur: 0x38bdf8 },
  { nom: "Or", valeur: 0xfacc15 },
  { nom: "Vert", valeur: 0x4ade80 },
  { nom: "Orange", valeur: 0xfb923c },
  { nom: "Rose", valeur: 0xf472b6 },
  { nom: "Violet", valeur: 0xa78bfa },
  { nom: "Rouge", valeur: 0xf87171 },
  { nom: "Blanc", valeur: 0xe5e7eb },
] as const;

export const rgbDe = (valeur: number): [number, number, number] => [(valeur >> 16) & 0xff, (valeur >> 8) & 0xff, valeur & 0xff];

export const cssDe = (valeur: number): string => `#${(valeur & 0xffffff).toString(16).padStart(6, "0")}`;

export const nomDeCouleur = (valeur: number): string => COULEURS_ALLIANCE.find((c) => c.valeur === valeur)?.nom ?? cssDe(valeur);

/** La première couleur qu'aucune alliance ne porte encore, pour une nouvelle alliance. */
export function couleurLibre(prises: readonly number[]): number {
  return (COULEURS_ALLIANCE.find((c) => !prises.includes(c.valeur)) ?? COULEURS_ALLIANCE[0]).valeur;
}

/**
 * Les couleurs des clans de notre alliance, choisies par le site (demande du pilote, 13 novembre 2026 : « des couleurs
 * choisies automatiquement pour chaque clan », pour voir au premier coup d'œil quel clan fait quoi). Sept teintes que l'œil
 * sépare sans hésiter (un écart CIEDE2000 d'au moins 20 deux à deux, testé), vives sur le fond sombre de la carte et lisibles
 * sous un texte sombre ; ni gris (la terre neutre et les autres clans), ni blanc (une zone de toute l'alliance). Le turquoise,
 * le citron et le beige essayés d'abord se confondaient avec le vert et l'orange.
 */
export const PALETTE_CLANS = [0x38bdf8, 0xfb923c, 0x4ade80, 0xf472b6, 0xfacc15, 0xa78bfa, 0xef4444] as const;

/** Une zone que prend toute l'alliance, et non un clan. */
export const COULEUR_TOUTE_L_ALLIANCE = 0xf1f5f9;
/** Un clan sorti de notre alliance depuis le dessin de sa zone. */
export const COULEUR_HORS_ALLIANCE = 0x94a3b8;

/** Un nombre tiré du tag (FNV-1a sur 32 bits) : toujours le même pour le même tag, d'un jour et d'un navigateur à l'autre. */
export function empreinteDuTag(tag: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < tag.length; i++) {
    h ^= tag.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

/**
 * La couleur de chaque clan. GAL a toujours la première ; chacun des autres, la teinte que donne son tag (`empreinteDuTag`),
 * ou la suivante libre si un autre clan l'a déjà. Ainsi un clan garde sa couleur quand un autre rejoint l'alliance, sauf
 * si le nouveau venu tombe sur la même teinte. Jusqu'à sept clans, GAL compris, chacun a la sienne ; au-delà, des teintes
 * reviennent : les zones portent le tag de leur clan écrit dessus, les territoires non.
 */
export function couleursDesClans(tags: Iterable<string>): Map<string, number> {
  const n = PALETTE_CLANS.length;
  const tries = [...new Set(tags)].sort((a, b) => (a === "GAL" ? -1 : b === "GAL" ? 1 : a.localeCompare(b)));
  const prises = new Set<number>([0]);
  const couleurs = new Map<string, number>();
  for (const tag of tries) {
    if (tag === "GAL") {
      couleurs.set(tag, PALETTE_CLANS[0]);
      continue;
    }
    let i = 1 + (empreinteDuTag(tag) % (n - 1));
    if (prises.size < n) while (prises.has(i)) i = i === n - 1 ? 1 : i + 1;
    prises.add(i);
    couleurs.set(tag, PALETTE_CLANS[i]!);
  }
  return couleurs;
}

/**
 * La légende du mode « Tout » (chaque clan dans sa couleur du jeu, clans neutres compris) : les plus grands clans au dernier
 * relevé, du plus grand au plus petit, chacun dans la couleur que la carte officielle lui donne. Un tag porté par deux
 * clans n'apparaît qu'une fois, avec la couleur du plus grand des deux. `standings` : le classement du film, déjà trié ou
 * non ; un clan sans pixel n'est pas nommé.
 */
export function legendeDeTout(standings: readonly { tag: string | null; color: number | null; pixels: number }[], limite = 8): { couleur: number; nom: string }[] {
  const grands = standings.filter((s): s is { tag: string; color: number | null; pixels: number } => s.tag !== null && s.pixels > 0).sort((a, b) => b.pixels - a.pixels || a.tag.localeCompare(b.tag));
  const out: { couleur: number; nom: string }[] = [];
  for (const s of grands) {
    if (out.length === limite) break;
    if (out.some((e) => e.nom === s.tag)) continue;
    const [r, g, b] = clanRgb(s.color);
    out.push({ couleur: (r << 16) | (g << 8) | b, nom: s.tag });
  }
  return out;
}

/** La couleur d'une zone : celle du clan qui la prend, blanc pour toute l'alliance. */
export function couleurDeZone(tag: string | null, couleurs: ReadonlyMap<string, number>): number {
  if (tag === null) return COULEUR_TOUTE_L_ALLIANCE;
  return couleurs.get(tag) ?? COULEUR_HORS_ALLIANCE;
}
