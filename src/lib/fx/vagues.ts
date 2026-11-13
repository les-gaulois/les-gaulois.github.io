/**
 * Les vagues de la carte : de petits traits clairs qui dérivent lentement sur la mer et s'y forment puis s'effacent, en
 * deux nappes qui se relaient. Décoratives, elles ne disent rien de la partie. Dessin dans `src/scripts/film.ts`, seulement
 * quand les animations sont permises (bouton pause, « réduire les animations ») ; où la mer les montre, et plus au large
 * qu'au bord : `vagues.webp`, fait au build par `merDuJeu` (`src/lib/clanmap/terrain.ts`).
 */

export interface Vaguelette {
  /** Le milieu du trait, dans un carreau de `taille` pixels de côté, qui se répète sur toute la mer. */
  x: number;
  y: number;
  /** La longueur du trait et la hauteur de sa courbe, en pixels. */
  longueur: number;
  creux: number;
}

/** Un tirage pseudo-aléatoire fixé par sa graine : les mêmes vagues à chaque visite. */
function tirage(graine: number): () => number {
  let a = graine >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/** `n` vaguelettes posées au hasard dans un carreau, toujours les mêmes pour une même graine. */
export function vaguelettes(n: number, taille: number, graine: number): Vaguelette[] {
  const r = tirage(graine);
  return Array.from({ length: n }, () => {
    const longueur = 5 + r() * 7;
    return { x: r() * taille, y: r() * taille, longueur, creux: longueur * (0.18 + r() * 0.12) };
  });
}

/** Où en est une nappe qui dérive à `vitesse` pixels par seconde, ramenée dans son carreau. */
export function decalage(ms: number, vitesse: number, taille: number): number {
  const d = ((ms / 1000) * vitesse) % taille;
  return d < 0 ? d + taille : d;
}

/** Un trait à dessiner, en pixels du calque des vagues, avec sa force de 0 à 1. */
export interface Trait extends Vaguelette {
  force: number;
}

/**
 * En dessous, un trait toucherait la côte : il n'est pas dessiné. Un pixel tout en eau au bord de la terre vaut 0,35
 * (`merDuJeu`) ; un pixel qui mêle terre et eau, moins de 0,27.
 */
export const FORCE_MIN = 0.3;

/**
 * Les traits d'une nappe décalée de (`dx`, `dy`), dans la partie visible du calque (`x0` à `x1`, `y0` à `y1`). Le carreau
 * se répète sur tout le calque. Un trait n'est gardé que si cinq points de sa courbe sont en pleine mer : ses deux bouts,
 * son sommet et les deux points à mi-chemin ; sa force est la plus faible des cinq (`poids` : un octet par pixel, 0 sur
 * la terre, 255 au large).
 */
export function traitsVisibles(
  poids: Uint8Array,
  width: number,
  height: number,
  nappe: readonly Vaguelette[],
  taille: number,
  dx: number,
  dy: number,
  vue: { x0: number; y0: number; x1: number; y1: number },
): Trait[] {
  const at = (x: number, y: number) => {
    const px = Math.floor(x);
    const py = Math.floor(y);
    return px < 0 || py < 0 || px >= width || py >= height ? 0 : poids[py * width + px]!;
  };
  const out: Trait[] = [];
  const x0 = Math.max(0, vue.x0);
  const y0 = Math.max(0, vue.y0);
  const x1 = Math.min(width, vue.x1);
  const y1 = Math.min(height, vue.y1);
  for (let ty = Math.floor(y0 / taille) * taille - taille; ty < y1; ty += taille) {
    for (let tx = Math.floor(x0 / taille) * taille - taille; tx < x1; tx += taille) {
      for (const v of nappe) {
        const x = tx + ((v.x + dx) % taille);
        const y = ty + ((v.y + dy) % taille);
        const demi = v.longueur / 2;
        if (x + demi < x0 || x - demi > x1 || y < y0 || y - v.creux > y1) continue;
        // Le trait est une courbe du second degré : son sommet monte de la moitié du creux, ses quarts des trois huitièmes.
        const force =
          Math.min(at(x - demi, y), at(x + demi, y), at(x, y - v.creux / 2), at(x - demi / 2, y - (3 * v.creux) / 8), at(x + demi / 2, y - (3 * v.creux) / 8)) / 255;
        if (force >= FORCE_MIN) out.push({ x, y, longueur: v.longueur, creux: v.creux, force });
      }
    }
  }
  return out;
}

/** De 0 à 1 et retour, en douceur, une fois par `periodeMs` : une nappe se forme pendant que l'autre s'efface. */
export function respiration(ms: number, periodeMs: number): number {
  return 0.5 - 0.5 * Math.cos(((ms % periodeMs) / periodeMs) * 2 * Math.PI);
}
