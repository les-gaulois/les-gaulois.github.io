/**
 * La carte officielle. Sa taille vient de la documentation d'OpenFront.
 *
 * Son terrain est « Giant World Map », une carte du dépôt public du jeu sous CC BY-SA 4.0,
 * avec l'attribution « OpenFront ». Sa surface de terre vient du manifeste de cette carte,
 * et le fond `data/clanmap/terrain.webp` en est une version réduite et assombrie. Depuis le
 * 13 novembre 2026, sa mer reprend au build la couleur du jeu (`merDuJeu`) : seule la terre reste assombrie.
 * Voir docs/API_AUDIT.md, section 8.
 *
 * Les couleurs de la mer sont reprises d'OpenFront (https://github.com/openfrontio/OpenFrontIO, commit a0abccc,
 * src/client/render/gl/utils/ColorUtils.ts et les réglages de rendu par défaut), modifiées le 13/11/2026 :
 * seules la couleur de l'océan et la formule du littoral sont gardées, sans l'assombrissement du large.
 * © OpenFront and Contributors, AGPL-3.0 : voir NOTICE.md.
 */
export const OFFICIAL_MAP = { width: 4108, height: 1948, land: 2_335_403 };

/** Le fichier du terrain, fixé à un commit. Chaque case vaut un octet : bit 7 = terre, bits 0 à 4 = relief. */
export const TERRAIN_ORIGIN = "https://raw.githubusercontent.com";
export const TERRAIN_PATH = "/openfrontio/OpenFrontIO/641e462b0b980b9cad8faff2e9f89d8caac44c4f/resources/maps/giantworldmap/map.bin";

export const LAND = 128;
/** Bit 6 : littoral. Pour une case d'eau, elle touche la terre. */
export const SHORE = 64;

export type Rgb = readonly [number, number, number];

/** L'océan du jeu, `#4785b5` : la couleur moyenne de la mer du site. */
export const OCEAN: Rgb = [0x47, 0x85, 0xb5];
/** L'eau au bord de la terre : comme dans le jeu, 70 % de l'océan et 30 % de blanc, arrondi. */
export const OCEAN_SHORE: Rgb = [126, 170, 203];
/**
 * Choix du site, pour distinguer les mers du grand large : près des côtes, l'océan du jeu un peu éclairci ; au large, un
 * peu assombri. Le jeu n'assombrit que sur dix cases autour des côtes, ce qui ne sépare pas une mer d'un océan.
 */
export const SEA_NEAR: Rgb = [80, 145, 192];
export const SEA_FAR: Rgb = [62, 122, 172];
/** Le large, en CSS : autour du monde quand la carte ne remplit pas son cadre. */
export const SEA_FAR_CSS = "#3e7aac";
/** En cases : jusqu'ici de la côte, la mer reste claire ; à partir de là, c'est le large. */
export const NEAR_TILES = 6;
export const FAR_TILES = 60;
/** La mer de `data/clanmap/terrain.webp`, assombrie comme sa terre. */
export const DARK_SEA: Rgb = [9, 20, 37];

/**
 * La distance de chaque case à la terre la plus proche, en cases : 0 sur la terre. Distance de chanfrein 3-4 en deux
 * passages, à moins de 6 % de la vraie distance en ligne droite. Sans aucune terre, toutes les cases sont au plus loin.
 */
export function distanceToLand(terrain: Uint8Array, width: number, height: number): Float32Array {
  const INF = 0xffff;
  const d = new Uint16Array(width * height);
  for (let i = 0; i < d.length; i++) d[i] = terrain[i]! & LAND ? 0 : INF;
  const relax = (i: number, j: number, cost: number) => {
    const v = d[j]! + cost;
    if (v < d[i]!) d[i] = v;
  };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (x > 0) relax(i, i - 1, 3);
      if (y > 0) {
        relax(i, i - width, 3);
        if (x > 0) relax(i, i - width - 1, 4);
        if (x < width - 1) relax(i, i - width + 1, 4);
      }
    }
  }
  for (let y = height - 1; y >= 0; y--) {
    for (let x = width - 1; x >= 0; x--) {
      const i = y * width + x;
      if (x < width - 1) relax(i, i + 1, 3);
      if (y < height - 1) {
        relax(i, i + width, 3);
        if (x < width - 1) relax(i, i + width + 1, 4);
        if (x > 0) relax(i, i + width - 1, 4);
      }
    }
  }
  const out = new Float32Array(d.length);
  for (let i = 0; i < d.length; i++) out[i] = d[i] === INF ? Infinity : d[i]! / 3;
  return out;
}

/** Où en est une case d'eau entre la mer claire des côtes (0) et le large (1), en douceur. */
export function largeur(distance: number): number {
  const t = Math.min(1, Math.max(0, (distance - NEAR_TILES) / (FAR_TILES - NEAR_TILES)));
  return t * t * (3 - 2 * t);
}

/** La couleur d'une case d'eau : celle du littoral si elle touche la terre, sinon de la mer claire au large. */
export function seaColor(tile: number, distance: number): Rgb {
  if (tile & SHORE) return OCEAN_SHORE;
  const t = largeur(distance);
  return [0, 1, 2].map((k) => SEA_NEAR[k]! + (SEA_FAR[k]! - SEA_NEAR[k]!) * t) as unknown as Rgb;
}

export interface MerDuJeu {
  /** Le fond, sa mer à la couleur du jeu, trois octets par pixel. */
  image: Uint8Array;
  /** Où les vagues se voient, un octet par pixel : 0 sur la terre, plus fort au large qu'au bord. */
  vagues: Uint8Array;
}

/**
 * Rend à la mer du fond la couleur du jeu. Le fond a deux fois moins de pixels que le terrain n'a de cases, dans chaque
 * sens : chaque pixel couvre 2 × 2 cases. Chacune de ses cases d'eau remplace un quart de mer sombre par sa couleur
 * (`seaColor`). Sa part de terre ne change pas : la côte garde le dessin du fond. Renvoie `null` si les tailles ne vont
 * pas ensemble.
 */
export function merDuJeu(background: Uint8Array, width: number, height: number, terrain: Uint8Array): MerDuJeu | null {
  const tw = width * 2;
  const th = height * 2;
  if (background.length !== width * height * 3 || terrain.length !== tw * th) return null;
  const distance = distanceToLand(terrain, tw, th);
  const image = new Uint8Array(background.length);
  const vagues = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = y * width + x;
      const add = [0, 0, 0];
      let houle = 0;
      for (const t of [2 * y * tw + 2 * x, 2 * y * tw + 2 * x + 1, (2 * y + 1) * tw + 2 * x, (2 * y + 1) * tw + 2 * x + 1]) {
        const tile = terrain[t]!;
        if (tile & LAND) continue;
        const sea = seaColor(tile, distance[t]!);
        for (let k = 0; k < 3; k++) add[k]! += (sea[k]! - DARK_SEA[k]!) / 4;
        houle += (0.35 + 0.65 * largeur(distance[t]!)) / 4;
      }
      for (let k = 0; k < 3; k++) image[p * 3 + k] = Math.min(255, Math.max(0, Math.round(background[p * 3 + k]! + add[k]!)));
      vagues[p] = Math.round(houle * 255);
    }
  }
  return { image, vagues };
}

export function countLand(terrain: Uint8Array): number {
  let land = 0;
  for (let i = 0; i < terrain.length; i++) if (terrain[i]! & LAND) land++;
  return land;
}

/** Pose les territoires sur le fond : même mélange que le lecteur du film. */
export function blendOwners(
  background: Uint8Array,
  owners: Uint16Array,
  colors: readonly ([number, number, number] | null)[],
): Uint8Array {
  const out = new Uint8Array(background);
  for (let c = 0; c < owners.length; c++) {
    const rgb = colors[owners[c]!];
    if (!rgb) continue;
    const o = c * 3;
    out[o] = rgb[0] * 0.85 + background[o]! * 0.15;
    out[o + 1] = rgb[1] * 0.85 + background[o + 1]! * 0.15;
    out[o + 2] = rgb[2] * 0.85 + background[o + 2]! * 0.15;
  }
  return out;
}
