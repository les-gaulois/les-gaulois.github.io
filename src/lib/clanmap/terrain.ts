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
 * Choix du site, pour distinguer les mers du grand large : les mers, l'eau que des détroits séparent du grand océan (`enMer`), prennent
 * l'océan du jeu un peu éclairci ; le grand large et les côtes ouvertes, un bleu plus foncé. Le 13 novembre 2026, le pilote
 * a trouvé la première version, plus claire près de toutes les côtes, trop « fondu halo de lumière », et voulait le large
 * plus foncé pour mieux voir les mers.
 */
export const INLAND_SEA: Rgb = [80, 145, 192];
export const OPEN_SEA: Rgb = [52, 106, 152];
/** Le large, en CSS : autour du monde quand la carte ne remplit pas son cadre. */
export const OPEN_SEA_CSS = "#346a98";
/**
 * En cases : un passage dont le milieu est à moins de cette distance des terres est un détroit. L'eau qu'il sépare du
 * grand océan est une mer : au-delà de Gibraltar, du Bosphore, des détroits danois, d'Ormuz ou de Bab-el-Mandeb.
 */
export const STRAIT_TILES = 12;
/** Une étendue d'eau plus petite que cette part de toute l'eau de la carte n'est pas le grand océan. */
export const OCEAN_SHARE = 0.02;
/** En cases : la limite entre mer et large, au sortir d'un détroit, se fond sur cette distance. */
export const SEA_EDGE_TILES = 8;
/** En cases, pour les vagues : jusqu'ici de la côte, elles sont faibles ; à partir de là, à pleine force. */
export const NEAR_TILES = 6;
export const FAR_TILES = 60;
/** La mer de `data/clanmap/terrain.webp`, assombrie comme sa terre. */
export const DARK_SEA: Rgb = [9, 20, 37];

/**
 * La distance de chaque case à la source la plus proche (`sources[i]` non nul), en cases : 0 sur une source. Distance de
 * chanfrein 3-4 en deux passages, à moins de 6 % de la vraie distance en ligne droite. Sans source, tout est au plus loin.
 */
export function chamfer(sources: Uint8Array, width: number, height: number): Float32Array {
  const INF = 0xffff;
  const d = new Uint16Array(width * height);
  for (let i = 0; i < d.length; i++) d[i] = sources[i] ? 0 : INF;
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

/** La distance de chaque case à la terre la plus proche, en cases : 0 sur la terre. */
export function distanceToLand(terrain: Uint8Array, width: number, height: number): Float32Array {
  const land = new Uint8Array(width * height);
  for (let i = 0; i < land.length; i++) land[i] = terrain[i]! & LAND ? 1 : 0;
  return chamfer(land, width, height);
}

const doux = (t: number) => {
  const u = Math.min(1, Math.max(0, t));
  return u * u * (3 - 2 * u);
};

/**
 * Pour chaque case, de 0 (le large) à 1 (une mer). Le grand océan, c'est l'eau à au moins `STRAIT_TILES` cases des terres,
 * d'un seul tenant, et grande (au moins `OCEAN_SHARE` de toute l'eau) ; avec l'eau qui le borde jusqu'aux côtes, c'est
 * le large. Le reste est séparé de lui par un détroit, ou n'est qu'un lac : c'est une mer. Le long d'une côte ouverte,
 * l'eau reste du large jusqu'au bord, sans halo clair autour des continents.
 */
export function enMer(terrain: Uint8Array, distance: Float32Array, width: number, height: number): Float32Array {
  const n = width * height;
  // Les étendues d'eau loin des terres, chacune d'un seul tenant (quatre voisines).
  const groupe = new Int32Array(n).fill(-1);
  const tailles: number[] = [];
  const pile = new Int32Array(n);
  let eau = 0;
  for (let i = 0; i < n; i++) if (!(terrain[i]! & LAND)) eau++;
  for (let i = 0; i < n; i++) {
    if (groupe[i] !== -1 || distance[i]! < STRAIT_TILES) continue;
    const g = tailles.length;
    let taille = 0;
    let haut = 0;
    pile[haut++] = i;
    groupe[i] = g;
    while (haut > 0) {
      const p = pile[--haut]!;
      taille++;
      const x = p % width;
      for (const q of [x > 0 ? p - 1 : -1, x < width - 1 ? p + 1 : -1, p - width, p + width]) {
        if (q < 0 || q >= n || groupe[q] !== -1 || distance[q]! < STRAIT_TILES) continue;
        groupe[q] = g;
        pile[haut++] = q;
      }
    }
    tailles.push(taille);
  }
  const ocean = new Uint8Array(n);
  for (let i = 0; i < n; i++) if (groupe[i]! >= 0 && tailles[groupe[i]!]! >= OCEAN_SHARE * eau) ocean[i] = 1;
  // Le large borde le grand océan jusqu'aux côtes : un peu plus loin que `STRAIT_TILES`, pour l'écart de la distance de
  // chanfrein. La distance au grand océan passe par l'eau seulement (un pas en diagonale peut glisser entre deux coins de
  // terre) : un lac près de la côte reste une mer.
  const debut = STRAIT_TILES * 1.1;
  const limite = Math.ceil((debut + SEA_EDGE_TILES) * 3);
  const INF = 0xffff;
  const tiers = new Uint16Array(n).fill(INF);
  const seaux: number[][] = Array.from({ length: limite + 1 }, () => []);
  const eauHorsOcean = (q: number) => !(terrain[q]! & LAND) && !ocean[q];
  for (let i = 0; i < n; i++) {
    if (!ocean[i]) continue;
    tiers[i] = 0;
    const x = i % width;
    // Seul le bord du grand océan a des voisines à atteindre.
    if ((x > 0 && eauHorsOcean(i - 1)) || (x < width - 1 && eauHorsOcean(i + 1)) || (i >= width && eauHorsOcean(i - width)) || (i + width < n && eauHorsOcean(i + width))) seaux[0]!.push(i);
  }
  for (let c = 0; c <= limite; c++) {
    for (const i of seaux[c]!) {
      if (tiers[i]! < c) continue;
      const x = i % width;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if ((dx === 0 && dy === 0) || (dx < 0 && x === 0) || (dx > 0 && x === width - 1)) continue;
          const q = i + dy * width + dx;
          if (q < 0 || q >= n || terrain[q]! & LAND) continue;
          const nc = c + (dx !== 0 && dy !== 0 ? 4 : 3);
          if (nc > limite || nc >= tiers[q]!) continue;
          tiers[q] = nc;
          seaux[nc]!.push(q);
        }
      }
    }
  }
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = tiers[i] === INF ? 1 : doux((tiers[i]! / 3 - debut) / SEA_EDGE_TILES);
  return out;
}

/** Pour les vagues : où en est une case d'eau entre la côte (0) et le large (1), en douceur. */
export function largeur(distance: number): number {
  return doux((distance - NEAR_TILES) / (FAR_TILES - NEAR_TILES));
}

/** La couleur d'une case d'eau : celle du littoral si elle touche la terre, sinon du large (0) à la mer (1). */
export function seaColor(tile: number, mer: number): Rgb {
  if (tile & SHORE) return OCEAN_SHORE;
  return [0, 1, 2].map((k) => OPEN_SEA[k]! + (INLAND_SEA[k]! - OPEN_SEA[k]!) * mer) as unknown as Rgb;
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
  const mer = enMer(terrain, distance, tw, th);
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
        const sea = seaColor(tile, mer[t]!);
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

/*
 * Le relief sous les couleurs des clans. Depuis le 13 novembre 2026, à la demande du pilote (« les couleurs de la carte
 * légèrement opaques et vives, qu'on voie le relief du terrain derrière la couleur ») : un territoire garde la couleur de
 * son clan, plus sombre dans les plaines basses et plus claire vers les sommets, comme si le terrain se voyait à travers.
 *
 * Le relief vient de la clarté de la terre du fond assombri `data/clanmap/terrain.webp` : mesurée sur tout le fond, elle
 * monte avec le relief du terrain du jeu, de 38 en moyenne au niveau 0 à 79 au niveau 29 (sur 31). La clarté de 36 donne
 * le relief 0, celle de 82 le relief 255 ; la mer du fond, plus sombre, donne 0 : une case de côte, à moitié d'eau,
 * se lit comme une plaine basse.
 */
export const RELIEF_CLARTE_BAS = 36;
export const RELIEF_CLARTE_HAUT = 82;
/** Sous ce relief, la couleur du clan s'assombrit ; au-dessus, elle s'éclaircit. */
export const RELIEF_NEUTRE = 0.5;
/** La couleur garde 70 % de sa clarté dans les plaines les plus basses… */
export const RELIEF_OMBRE = 0.3;
/** … et va pour 30 % vers le blanc sur les plus hauts sommets. */
export const RELIEF_ECLAT = 0.3;
/** Le lecteur du film range le relief en 32 niveaux : un octet de plus par case, une couleur de plus par niveau et par clan. */
export const RELIEF_NIVEAUX = 32;

/** Le relief de chaque pixel d'un fond assombri (trois octets par pixel), de 0 à 255. */
export function reliefDuFond(background: Uint8Array): Uint8Array {
  const out = new Uint8Array(background.length / 3);
  for (let p = 0; p < out.length; p++) {
    const clarte = 0.299 * background[p * 3]! + 0.587 * background[p * 3 + 1]! + 0.114 * background[p * 3 + 2]!;
    const t = (clarte - RELIEF_CLARTE_BAS) / (RELIEF_CLARTE_HAUT - RELIEF_CLARTE_BAS);
    out[p] = Math.round(Math.min(1, Math.max(0, t)) * 255);
  }
  return out;
}

/** La couleur d'un clan sur un relief de 0 à 255 : assombrie dans les plaines, éclaircie vers les sommets, arrondie. */
export function teinteAuRelief(rgb: Rgb, relief: number): Rgb {
  const r = Math.min(1, Math.max(0, relief / 255));
  const k =
    r <= RELIEF_NEUTRE
      ? (c: number) => c * (1 - (RELIEF_OMBRE * (RELIEF_NEUTRE - r)) / RELIEF_NEUTRE)
      : (c: number) => c + ((255 - c) * RELIEF_ECLAT * (r - RELIEF_NEUTRE)) / (1 - RELIEF_NEUTRE);
  return [Math.round(k(rgb[0])), Math.round(k(rgb[1])), Math.round(k(rgb[2]))];
}

/** Le niveau de relief (0 à `RELIEF_NIVEAUX` − 1) d'un relief de 0 à 255, et le relief au milieu de chaque niveau. */
export const niveauDeRelief = (relief: number): number => relief >> 3;
export const reliefDuNiveau = (niveau: number): number => niveau * 8 + 4;

/**
 * Pose les territoires sur le fond : même mélange que le lecteur du film, couleur pleine nuancée par le relief de sa
 * case, au milieu de son niveau. Sans relief, la couleur du clan telle quelle.
 */
export function blendOwners(
  background: Uint8Array,
  owners: Uint16Array,
  colors: readonly (Rgb | null)[],
  relief: Uint8Array | null = null,
): Uint8Array {
  const out = new Uint8Array(background);
  for (let c = 0; c < owners.length; c++) {
    const rgb = colors[owners[c]!];
    if (!rgb) continue;
    const teinte = relief ? teinteAuRelief(rgb, reliefDuNiveau(niveauDeRelief(relief[c]!))) : rgb;
    out.set(teinte, c * 3);
  }
  return out;
}
