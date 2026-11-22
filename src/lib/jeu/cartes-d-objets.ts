/**
 * Les cartes des cosmétiques (22 novembre 2026). Demande du pilote : « que tous les cosmétiques ressemblent à des cartes
 * pixel art super stylées », avec les effets du cosmétique dessus, « utilisé pour les boosters, boutiques, vestiaires » ;
 * puis, sur les modèles : du pixel art holographique pour le mystique, le légendaire et le divin, un entre-deux pour
 * l'épique, et pour le reste des cartes « jolies mais pas en pixel art et non holographiques ». Modèles dessinés par Claude
 * Fable 5.2 et acceptés par le pilote (« Oui, sur le site ») ; ses dessins sont portés ici sur les planches du kit.
 *
 * Trois façons de faire une carte (`styleDeCarte`) :
 * - « lisse » (de base, commun, peu commun) : un cadre net aux coins arrondis, tout en CSS (`24-cartes.css`), sans reflet ;
 * - « entre » (épique) : le même cadre, ses quatre coins en cases (`coinEpique`) et un reflet doux qui suit le pointeur ;
 * - « pixel » (mystique, légendaire, légendaire de saison, divin) : un cadre en cases posé en neuf parts (`cadreEnNeufParts`,
 *   `border-image`), son écusson en haut et en bas (`ecussonDeCarte`), et une feuille holographique masquée par le motif de
 *   sa rareté (`motifDeFeuille`).
 *
 * Sans navigateur : chaque dessin est une `Planche`, que l'écran change en image (`urlDeLaPlanche`). Une case du dessin vaut
 * toujours un nombre entier de pixels à l'écran (`--co-p`).
 */
import { NOMS_EMPLACEMENTS, type Emplacement } from "../gaulois";
import { Planche, R, grille } from "./planche";

export type StyleDeCarte = "lisse" | "entre" | "pixel";

/** Les raretés aux cartes en pixel art et holographiques. */
export const RARETES_EN_PIXELS = ["mystique", "legendaire", "saison", "divin"] as const;
export type RareteEnPixels = (typeof RARETES_EN_PIXELS)[number];
export const estEnPixels = (r: unknown): r is RareteEnPixels => typeof r === "string" && (RARETES_EN_PIXELS as readonly string[]).includes(r);

/**
 * La mise en page d'une carte (22 novembre 2026, choix du pilote) : « pleine » (la scène sur toute la carte, des bandeaux
 * fins) pour le légendaire, le légendaire de saison et le divin ; « deborde » (l'objet sort par le haut, le nom devant) pour
 * le mystique ; « simple » (la fenêtre d'image au milieu) pour les autres.
 */
export type FaconDeCarte = "simple" | "deborde" | "pleine";
export function faconDeLaCarte(rarete: string | null | undefined): FaconDeCarte {
  if (rarete === "mystique") return "deborde";
  return rarete === "legendaire" || rarete === "saison" || rarete === "divin" ? "pleine" : "simple";
}

/** La façon de faire la carte d'une rareté ; sans rareté (un objet gratuit, « de base ») : lisse. */
export function styleDeCarte(rarete: string | null | undefined): StyleDeCarte {
  if (estEnPixels(rarete)) return "pixel";
  return rarete === "epique" ? "entre" : "lisse";
}

/** Les couleurs d'un cadre en cases : l'encre, l'ombre, le milieu, la lumière, l'éclat, les gemmes. */
export interface TonsDuCadre {
  encre: string;
  ombre: string;
  milieu: string;
  lumiere: string;
  eclat: string;
  gemme: string;
  gemmeClaire: string;
  /** Le saison : ses feuilles. Le divin : son prisme. */
  feuille?: readonly [string, string];
  prisme?: readonly string[];
}

/** Les cadres de la maquette (Claude Fable 5.2) : ne pas en changer les couleurs sans la demande du pilote. */
export const TONS_DES_CADRES: Readonly<Record<RareteEnPixels, TonsDuCadre>> = {
  mystique: { encre: "#4a0a16", ombre: "#b8122a", milieu: "#ff2e4a", lumiere: "#ff8a8f", eclat: "#ffe3e6", gemme: "#8b5cf6", gemmeClaire: "#d8c9ff" },
  legendaire: { encre: "#3a2606", ombre: "#9c6a0c", milieu: "#d9a21b", lumiere: "#ffd84a", eclat: "#fffbe6", gemme: "#e0263a", gemmeClaire: "#ff8a8f" },
  saison: { encre: "#3a2606", ombre: "#9c6a0c", milieu: "#d9a21b", lumiere: "#ffd84a", eclat: "#fffbe6", gemme: "#f5760f", gemmeClaire: "#fff1a8", feuille: ["#1f8a47", "#3fce6a"] },
  divin: { encre: "#0b3f5a", ombre: "#0b7f77", milieu: "#19d3c5", lumiere: "#aef0ea", eclat: "#ffffff", gemme: "#ffd84a", gemmeClaire: "#fffbe6", prisme: ["#ff8a8f", "#ffd84a", "#c4f9cb", "#9cc2ff", "#d8c9ff"] },
};

/** Le côté d'un coin du cadre, en cases : son bossage à gemme. */
export const COIN_DU_CADRE = 6;
/** L'épaisseur de la bande du cadre, en cases : le contenu de la carte commence après elle. */
export const BANDE_DU_CADRE = 4;
/** La longueur du motif qui se répète le long d'une bande, en cases, par rareté. */
export const PERIODE_DU_CADRE: Readonly<Record<RareteEnPixels, number>> = { mystique: 8, legendaire: 8, saison: 8, divin: 10 };

/** La couleur d'une case de la bande : `d` sa distance au bord (0 à 3), `t` sa place le long de la bande. */
function caseDeLaBande(r: RareteEnPixels, d: number, t: number): string {
  const k = TONS_DES_CADRES[r];
  if (d === 0 || d === 3) return k.encre;
  if (r === "mystique") return d === 1 ? (t % 8 === 3 ? k.eclat : k.lumiere) : (t >> 1) % 2 ? k.ombre : k.milieu;
  if (r === "legendaire") return d === 1 ? (t % 4 === 0 ? k.eclat : k.lumiere) : t % 4 === 2 ? k.ombre : k.milieu;
  if (r === "saison") {
    const u = t % 8;
    const [f, F] = k.feuille!;
    return d === 1 ? (u === 1 || u === 2 ? F : u === 5 ? k.eclat : k.lumiere) : u === 2 || u === 3 ? f : u === 6 ? k.ombre : k.milieu;
  }
  return d === 1 ? (t % 6 === 0 ? k.eclat : k.lumiere) : k.prisme![Math.floor(t / 2) % k.prisme!.length]!;
}

/** Le bossage d'un coin, à gemme, en `T` sur `T` cases ; `sx`, `sy` : le sens vers l'intérieur de la carte. */
function bossage(g: Planche, r: RareteEnPixels, ox: number, oy: number, sx: 1 | -1, sy: 1 | -1): void {
  const k = TONS_DES_CADRES[r];
  const T = COIN_DU_CADRE;
  for (let b = 0; b < T; b++)
    for (let a = 0; a < T; a++) {
      let coul: string;
      if (a === 0 || b === 0 || a === T - 1 || b === T - 1) coul = k.encre;
      else if (a >= 2 && a <= 3 && b >= 2 && b <= 3) coul = a === 2 && b === 2 ? k.gemmeClaire : k.gemme;
      else if (a >= 2 && a <= 4 && b >= 2 && b <= 4) coul = (a + b) % 2 ? k.gemme : k.encre;
      else coul = a + b <= 5 ? k.lumiere : k.milieu;
      if (a === 1 && b === 1) coul = k.eclat;
      R(g, ox + sx * a, oy + sy * b, 1, 1, coul);
    }
  g.clearRect(ox, oy, 1, 1);
}

/**
 * Le cadre d'une rareté en pixels, en neuf parts pour `border-image` : un coin de `COIN_DU_CADRE` cases à chaque angle, et
 * entre eux la bande sur une période de son motif. Les coins dépassent la bande vers l'intérieur : la feuille de style donne
 * au cadre `COIN_DU_CADRE` cases de large et au bord de la carte `BANDE_DU_CADRE`, si bien que le bossage mord le papier.
 */
export function cadreEnNeufParts(r: RareteEnPixels): Planche {
  const C = COIN_DU_CADRE;
  const P = PERIODE_DU_CADRE[r];
  const W = 2 * C + P;
  const g = new Planche(W, W);
  for (let y = 0; y < W; y++)
    for (let x = 0; x < W; x++) {
      const coin = (x < C || x >= C + P) && (y < C || y >= C + P);
      if (coin) continue;
      const horizontal = x >= C && x < C + P;
      const d = horizontal ? Math.min(y, W - 1 - y) : Math.min(x, W - 1 - x);
      if (d > BANDE_DU_CADRE - 1) continue;
      const t = horizontal ? x - C : y - C;
      R(g, x, y, 1, 1, caseDeLaBande(r, d, t));
    }
  bossage(g, r, 0, 0, 1, 1);
  bossage(g, r, W - 1, 0, -1, 1);
  bossage(g, r, 0, W - 1, 1, -1);
  bossage(g, r, W - 1, W - 1, -1, -1);
  return g;
}

/** La largeur de l'écusson, en cases ; sa hauteur est de quatre cases. */
export const ECUSSON_LARGEUR = 20;
export const ECUSSON_HAUTEUR = 4;

/** L'écusson posé au milieu du haut (et du bas) du cadre, ses gemmes au centre ; `bas` : retourné, pour le bas de la carte. */
export function ecussonDeCarte(r: RareteEnPixels, bas = false): Planche {
  const k = TONS_DES_CADRES[r];
  const L = ECUSSON_LARGEUR;
  const g = new Planche(L, ECUSSON_HAUTEUR);
  const m = L / 2;
  const l = 9;
  const rangee = (j: number): number => (bas ? ECUSSON_HAUTEUR - 1 - j : j);
  for (let a = -l; a < l; a++) {
    const x = m + a;
    const centre = Math.abs(a + 0.5) < 2;
    R(g, x, rangee(0), 1, 1, k.encre);
    R(g, x, rangee(1), 1, 1, centre ? k.gemmeClaire : k.eclat);
    R(g, x, rangee(2), 1, 1, centre ? k.gemme : k.lumiere);
    R(g, x, rangee(3), 1, 1, k.encre);
  }
  for (const j of [1, 2]) {
    R(g, m - l - 1, rangee(j), 1, 1, k.encre);
    R(g, m + l, rangee(j), 1, 1, k.encre);
    R(g, m - 3, rangee(j), 1, 1, k.encre);
    R(g, m + 2, rangee(j), 1, 1, k.encre);
  }
  for (const a of [-7, -6, 5, 6]) R(g, m + a, rangee(2), 1, 1, r === "saison" ? k.feuille![1] : r === "divin" ? k.prisme![(a + 9) % k.prisme!.length]! : k.milieu);
  return g;
}

/** Une petite étoile de cinq cases de large, et une croix de trois. */
function etoile(g: Planche, x: number, y: number): void {
  R(g, x - 2, y, 5, 1, "#ffffff");
  R(g, x, y - 2, 1, 5, "#ffffff");
  R(g, x - 1, y - 1, 3, 3, "#ffffff");
  for (const [dx, dy] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ] as const)
    g.clearRect(x + dx, y + dy, 1, 1);
}
function croix(g: Planche, x: number, y: number): void {
  R(g, x - 1, y, 3, 1, "#ffffff");
  R(g, x, y - 1, 1, 3, "#ffffff");
}

/**
 * Le motif de la feuille holographique d'une rareté, en blanc sur vide, qui se répète : il masque la feuille
 * (`mask-image`). Mystique : des rayures en biais ; légendaire : des paillettes ; saison : une trame et deux étoiles ; divin :
 * des étoiles et des croix.
 */
export function motifDeFeuille(r: RareteEnPixels): Planche {
  const n = r === "mystique" ? 8 : 16;
  const g = new Planche(n, n);
  if (r === "mystique") {
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if ((x + y) % 8 < 3) R(g, x, y, 1, 1, "#ffffff");
  } else if (r === "legendaire") {
    croix(g, 2, 2);
    croix(g, 10, 6);
    croix(g, 5, 12);
    for (const [x, y] of [
      [13, 1],
      [7, 4],
      [1, 8],
      [13, 11],
      [9, 14],
      [3, 6],
    ] as const)
      R(g, x, y, 1, 1, "#ffffff");
    R(g, 14, 14, 2, 2, "#ffffff");
    R(g, 6, 9, 2, 2, "#ffffff");
  } else if (r === "saison") {
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if ((x + y) % 4 === 0 || (x % 8 === 3 && y % 8 === 5)) R(g, x, y, 1, 1, "#ffffff");
    etoile(g, 4, 4);
    etoile(g, 12, 12);
  } else {
    etoile(g, 3, 3);
    etoile(g, 11, 10);
    croix(g, 12, 3);
    croix(g, 4, 12);
    for (const [x, y] of [
      [8, 7],
      [0, 8],
      [8, 15],
      [15, 0],
    ] as const)
      R(g, x, y, 1, 1, "#ffffff");
    R(g, 7, 0, 2, 2, "#ffffff");
    R(g, 15, 7, 1, 2, "#ffffff");
  }
  return g;
}

/** Le papier étoilé du divin : quelques étoiles blanches et dorées sur vide, sur 24 cases qui se répètent. */
export function etoilesDuDivin(): Planche {
  const n = 24;
  const g = new Planche(n, n);
  let s = 7 * 9301 + 49297;
  const hasard = (): number => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
  for (let i = 0; i < 9; i++) {
    const x = 1 + Math.floor(hasard() * (n - 2));
    const y = 1 + Math.floor(hasard() * (n - 2));
    const coul = hasard() < 0.3 ? "#ffd84a" : "#ffffff";
    R(g, x, y, 1, 1, coul);
    if (hasard() < 0.3) {
      R(g, x - 1, y, 3, 1, coul);
      R(g, x, y - 1, 1, 3, coul);
    }
  }
  return g;
}

/** Le coin en cases de l'épique (11 sur 11), celui de la maquette ; les trois autres coins en sont le miroir. */
const COIN_EPIQUE = ["..kkkkkkkkk", ".kLLLLLLLmk", "kLwLmmmmmk.", "kLLGgkkkk..", "kLmgGk.....", "kLmkk......", "kLmk.......", "kLmk.......", "kLmk.......", "kmk........", "kk........."] as const;
export const COTE_DU_COIN_EPIQUE = 11;
export function coinEpique(): Planche {
  return grille(COIN_EPIQUE, { k: "#3d0f8a", L: "#dcc6ff", m: "#9b4dff", w: "#ffffff", G: "#ffd84a", g: "#d9a21b" });
}

/* ---------- La pleine image (légendaire, saison, divin) et le débordement (mystique), 22 novembre 2026 ---------- */
/* Choix du pilote sur les modèles de Claude Fable 5.2 : « pour les mystiques Par le haut, le nom devant ; et divin et
   légendaire Les bandeaux fins », en grand à la sortie des boosters comme en petit dans les cases (« B et 1 »). */

/** L'épaisseur du liseré de la pleine image, en cases : encre, couleur, encre. */
export const BANDE_DU_LISERE = 3;

/**
 * Le liseré d'une carte pleine image, en neuf parts pour `border-image` : trois cases (encre, couleur, encre) le long des
 * bords, un coin à gemme de `COIN_DU_CADRE` cases à chaque angle. La couleur alterne la lumière et le milieu de la rareté ;
 * le divin y fait passer son prisme.
 */
export function lisereEnNeufParts(r: RareteEnPixels): Planche {
  const C = COIN_DU_CADRE;
  const P = PERIODE_DU_CADRE[r];
  const W = 2 * C + P;
  const g = new Planche(W, W);
  const k = TONS_DES_CADRES[r];
  for (let y = 0; y < W; y++)
    for (let x = 0; x < W; x++) {
      if ((x < C || x >= C + P) && (y < C || y >= C + P)) continue;
      const horizontal = x >= C && x < C + P;
      const d = horizontal ? Math.min(y, W - 1 - y) : Math.min(x, W - 1 - x);
      if (d > BANDE_DU_LISERE - 1) continue;
      const t = horizontal ? x - C : y - C;
      R(g, x, y, 1, 1, d === 1 ? caseDeLaBande(r, r === "divin" ? 2 : t % 2 ? 1 : 2, t) : k.encre);
    }
  bossage(g, r, 0, 0, 1, 1);
  bossage(g, r, W - 1, 0, -1, 1);
  bossage(g, r, 0, W - 1, 1, -1);
  bossage(g, r, W - 1, W - 1, -1, -1);
  return g;
}

/** Le joyau posé au milieu d'un bord du liseré (divin, saison) : six cases sur trois, couché, ou debout (`vertical`). */
export function joyauDuLisere(r: RareteEnPixels, vertical = false): Planche {
  const k = TONS_DES_CADRES[r];
  const rangee = [k.encre, k.gemme, k.gemmeClaire, k.gemme, k.gemme, k.encre];
  const g = new Planche(vertical ? 3 : 6, vertical ? 6 : 3);
  for (let a = 0; a < 6; a++)
    for (let b = 0; b < 3; b++) {
      const coul = b === 1 ? rangee[a]! : k.encre;
      R(g, vertical ? b : a, vertical ? a : b, 1, 1, coul);
    }
  return g;
}

/** Une image en cases (une couleur par case, `null` pour vide). */
export interface ImageEnCases {
  largeur: number;
  hauteur: number;
  cases: readonly (string | null)[];
}

const BAYER_4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5] as const;

/**
 * Une scène posée dans une carte de `W` sur `H` cases, décalée de (`ox`, `oy`), jamais déformée : ce qui dépasse à gauche ou
 * à droite reprend sa colonne du bord ; en haut et en bas, sa première ou sa dernière rangée, fondue en trame vers la
 * couleur moyenne de cette rangée (le ciel, le sol). Dessin de Claude Fable 5.2 pour la pleine image.
 */
export function prolongerLaScene(img: ImageEnCases, W: number, H: number, ox: number, oy: number): ImageEnCases {
  const hex = (c: string | null): [number, number, number] => (c && /^#[0-9a-f]{6}/i.test(c) ? [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)] : [255, 255, 255]);
  const enHex = (v: readonly number[]): string => "#" + v.map((n) => Math.round(n).toString(16).padStart(2, "0")).join("");
  const moyenne = (y: number): string => {
    const m = [0, 0, 0];
    for (let i = 0; i < img.largeur; i++) {
      const c = hex(img.cases[y * img.largeur + i] ?? null);
      for (let k = 0; k < 3; k++) m[k]! += c[k]!;
    }
    return enHex(m.map((v) => v / img.largeur));
  };
  const haut = moyenne(0);
  const bas = moyenne(img.hauteur - 1);
  const cases: (string | null)[] = [];
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const sx = Math.min(img.largeur - 1, Math.max(0, x - ox));
      const sy = y - oy;
      const seuil = (BAYER_4[(y & 3) * 4 + (x & 3)]! + 0.5) / 16;
      let c: string | null;
      if (sy < 0) c = Math.min(1, -sy / 12) > seuil ? haut : (img.cases[sx] ?? haut);
      else if (sy >= img.hauteur) c = Math.min(1, (sy - img.hauteur + 1) / 12) > seuil ? bas : (img.cases[(img.hauteur - 1) * img.largeur + sx] ?? bas);
      else c = img.cases[sy * img.largeur + sx] ?? null;
      cases.push(c);
    }
  return { largeur: W, hauteur: H, cases };
}

/**
 * La plus grande échelle, parmi `echelles` (dans l'ordre), où une chose de `l` sur `h` cases tient dans `maxL` sur `maxH`
 * cases ; 1 sinon. Une case de la chose vaut alors `echelle` cases de la carte (un nombre entier de pixels à l'écran).
 */
export function echelleDeLaChose(l: number, h: number, maxL: number, maxH: number, echelles: readonly number[] = [3, 2, 1.5, 1]): number {
  for (const e of echelles) if (l * e <= maxL && h * e <= maxH) return e;
  return 1;
}

/** Le mot de l'emplacement d'une chose, d'après sa clé de fond (`objet/<emplacement>/<id>`, `familier/…`, `modele/…`). */
export function motDeLaChose(cle: string): string {
  const [sorte, e] = cle.split("/");
  if (sorte === "objet" && e && Object.hasOwn(NOMS_EMPLACEMENTS, e)) return NOMS_EMPLACEMENTS[e as Emplacement];
  if (sorte === "familier") return "Familier";
  if (sorte === "modele") return "Gaulois unique";
  return "";
}

/**
 * Où poser la chose dans sa carte : au milieu (un objet), les pieds au sol un peu au-dessus du bas (un familier, un Gaulois
 * unique en entier), ou contre le bas (un buste, coupé à la poitrine). Les mots de `PoseDeLaChose` des fonds d'objets.
 */
export type PoseDansLaCarte = "centre" | "sol" | "bas";

/** La chose posée : `e` pixels la case de la chose, sa place et sa taille en pixels, depuis le haut et la gauche de sa place. */
export interface PlaceDeLaChose {
  e: number;
  gauche: number;
  haut: number;
  largeur: number;
  hauteur: number;
}

/** Les pixels d'une case de la chose : l'échelle choisie, arrondie vers le bas, pour que la chose tienne toujours. */
const pixelsDeLaCase = (p: number, s: number): number => Math.max(1, Math.floor(p * s));

/** La marge sous les pieds, en cases : 8 % de la hauteur, une case au moins, comme `imageSurFond`. */
export const margeDuSol = (hauteur: number): number => Math.max(1, Math.round(hauteur * 0.08));

/**
 * La chose dans la zone de la pleine image, entre ses deux bandeaux (`zl` sur `zh` pixels, à `p` pixels la case) : la plus
 * grande échelle où elle tient, deux cases d'air de chaque côté ; au milieu de la zone, au sol, ou contre le bandeau du bas.
 */
export function placerDansLaZone(chose: Pick<ImageEnCases, "largeur" | "hauteur">, zl: number, zh: number, p: number, pose: PoseDansLaCarte, echelles: readonly number[]): PlaceDeLaChose {
  const hi = Math.floor(zh / p);
  const marge = pose === "sol" ? margeDuSol(hi) : 0;
  const s = echelleDeLaChose(chose.largeur, chose.hauteur, Math.floor(zl / p) - 4, hi - (pose === "centre" ? 2 : 1 + marge), echelles);
  const e = pixelsDeLaCase(p, s);
  const largeur = chose.largeur * e;
  const hauteur = chose.hauteur * e;
  const haut = pose === "centre" ? Math.round((zh - hauteur) / 2) : Math.max(0, zh - marge * p - hauteur);
  return { e, gauche: Math.round((zl - largeur) / 2), haut, largeur, hauteur };
}

/**
 * La chose qui déborde de sa fenêtre par le haut (le mystique, « Par le haut, le nom devant », d'après la maquette de Claude
 * Fable 5.2) : la plus grande échelle où elle tient, le pied dans la fenêtre, le haut dehors. `li`, `hi` : la largeur et la
 * hauteur de la fenêtre, en cases ; `yi` : sa place depuis le haut de la carte ; `dessus` : combien la chose peut sortir de
 * la carte. Un objet a trois cases d'air sous lui ; un familier pose ses pieds au sol de la scène, un buste sa coupe sur le
 * bord du bas. Places en pixels, depuis le haut et la gauche de la fenêtre.
 */
export function placerQuiDeborde(chose: Pick<ImageEnCases, "largeur" | "hauteur">, li: number, hi: number, yi: number, p: number, dessus: number, pose: PoseDansLaCarte, echelles: readonly number[]): PlaceDeLaChose {
  const pied = yi + hi - (pose === "bas" ? 0 : pose === "sol" ? margeDuSol(hi) : 3);
  const s = echelleDeLaChose(chose.largeur, chose.hauteur, li - 2, pied + dessus, echelles);
  const e = pixelsDeLaCase(p, s);
  const l = (chose.largeur * e) / p;
  const h = (chose.hauteur * e) / p;
  const hautDansLaCarte = pose === "centre" ? Math.max(-dessus, Math.min(pied - h, yi - h * (h > hi * 0.6 ? 0.2 : 0.3))) : Math.max(-dessus, pied - h);
  return { e, gauche: Math.round(((li - l) / 2) * p), haut: Math.round((hautDansLaCarte - yi) * p), largeur: chose.largeur * e, hauteur: chose.hauteur * e };
}

/**
 * La place de la chose dans sa scène, en cases, et la rangée de son sol, pour que la scène garde cette place calme et pose son
 * sol sous elle, comme sur la face des boosters. `dx`, `dy` : où la place de la chose commence dans la scène, en pixels ; `W`
 * et `H` : la taille de la scène, en cases. Ce qui sort de la scène est rogné.
 */
export function zoneDansLaScene(place: PlaceDeLaChose, dx: number, dy: number, p: number, W: number, H: number, pose: PoseDansLaCarte): { zone: { x: number; y: number; largeur: number; hauteur: number }; sol: number } {
  const x0 = Math.round((dx + place.gauche) / p);
  const y0 = Math.round((dy + place.haut) / p);
  const x1 = Math.round((dx + place.gauche + place.largeur) / p);
  const y1 = Math.round((dy + place.haut + place.hauteur) / p);
  const x = Math.max(0, Math.min(W - 1, x0));
  const y = Math.max(0, Math.min(H - 1, y0));
  const zone = { x, y, largeur: Math.max(1, Math.min(W, x1) - x), hauteur: Math.max(1, Math.min(H, y1) - y) };
  return { zone, sol: Math.max(0, Math.min(H - 1, y1 + (pose === "centre" ? 1 : 0))) };
}

/** La grande carte de la sortie des boosters, en cases. */
export const CARTE_DE_SORTIE = { largeur: 70, hauteur: 116 } as const;

/**
 * Ce qui entoure la grande carte dans la fenêtre du booster (le haut de la fenêtre, les marges du ciel, la bourse, les
 * boutons), en pixels, mesuré à l'écran : la carte prend le reste de la hauteur.
 */
export const AUTOUR_DE_LA_SORTIE = 300;

/**
 * Les pixels d'une case d'une grande carte de `cases` cases de haut (la carte de sortie, la carte des statères), pour
 * qu'elle tienne dans l'écran avec la bourse et les boutons : quatre, trois sur un petit écran (360 pixels de large au
 * plus) ou un écran bas, deux sur un écran très bas.
 */
export function caseQuiTient(largeur: number, hauteur: number, cases: number): 2 | 3 | 4 {
  const p = largeur <= 360 ? 3 : 4;
  if (p === 4 && cases * 4 + AUTOUR_DE_LA_SORTIE <= hauteur) return 4;
  return cases * 3 + AUTOUR_DE_LA_SORTIE <= hauteur ? 3 : 2;
}
/** La case de la grande carte de sortie (116 cases de haut). */
export const caseDeLaSortie = (largeur: number, hauteur: number): 2 | 3 | 4 => caseQuiTient(largeur, hauteur, CARTE_DE_SORTIE.hauteur);

/** Copie une case d'une planche sur une autre, si elle est pleine. */
function copier(src: Planche, sx: number, sy: number, g: Planche, x: number, y: number): void {
  const c = src.couleur(sx, sy);
  if (c && c[3] > 0) g.poser(x, y, c);
}

/**
 * Habille une planche en carte (la face d'une carte qui sort d'un booster, 68 × 88 cases) : pour une rareté en pixels, son
 * cadre en neuf parts (les coins, la bande répétée le long des bords) et ses deux écussons ; pour l'épique, ses quatre coins
 * en cases. Une carte lisse ne change pas. Posé par-dessus la face : la bande borde l'image et le texte.
 */
export function habillerUnePlanche(g: Planche, rarete: string | null | undefined): void {
  const W = g.width;
  const H = g.height;
  if (estEnPixels(rarete)) {
    const n = cadreEnNeufParts(rarete);
    const C = COIN_DU_CADRE;
    const P = PERIODE_DU_CADRE[rarete];
    const N = n.width;
    for (let x = C; x < W - C; x++) {
      const sx = C + ((x - C) % P);
      for (let j = 0; j < C; j++) {
        copier(n, sx, j, g, x, j);
        copier(n, sx, N - 1 - j, g, x, H - 1 - j);
      }
    }
    for (let y = C; y < H - C; y++) {
      const sy = C + ((y - C) % P);
      for (let i = 0; i < C; i++) {
        copier(n, i, sy, g, i, y);
        copier(n, N - 1 - i, sy, g, W - 1 - i, y);
      }
    }
    for (let b = 0; b < C; b++)
      for (let a = 0; a < C; a++) {
        g.clearRect(a, b, 1, 1);
        g.clearRect(W - 1 - a, b, 1, 1);
        g.clearRect(a, H - 1 - b, 1, 1);
        g.clearRect(W - 1 - a, H - 1 - b, 1, 1);
        copier(n, a, b, g, a, b);
        copier(n, N - 1 - a, b, g, W - 1 - a, b);
        copier(n, a, N - 1 - b, g, a, H - 1 - b);
        copier(n, N - 1 - a, N - 1 - b, g, W - 1 - a, H - 1 - b);
      }
    const x0 = Math.round(W / 2 - ECUSSON_LARGEUR / 2);
    g.drawImage(ecussonDeCarte(rarete), x0, 0);
    g.drawImage(ecussonDeCarte(rarete, true), x0, H - ECUSSON_HAUTEUR);
  } else if (rarete === "epique") {
    const k = coinEpique();
    const L = COTE_DU_COIN_EPIQUE;
    for (let b = 0; b < L; b++)
      for (let a = 0; a < L; a++) {
        copier(k, a, b, g, a, b);
        copier(k, a, b, g, W - 1 - a, b);
        copier(k, a, b, g, a, H - 1 - b);
        copier(k, a, b, g, W - 1 - a, H - 1 - b);
      }
  }
}

/**
 * Les couleurs d'une carte, par rareté : le haut et le bas de son papier, son bord et son encre (le texte de sa rareté),
 * celles des cartes du duel (`TONS` de `dessins-des-cartes.ts`) ; l'encre, plus sombre, se lit sur le papier clair (AA).
 * Les cartes restent claires dans les deux thèmes (choix du pilote : pas de cartes sombres).
 */
export interface TonsDeCarte {
  haut: string;
  bas: string;
  bord: string;
  encre: string;
}
export const TONS_DES_CARTES: Readonly<Record<string, TonsDeCarte>> = {
  base: { haut: "#f7f8fb", bas: "#e2e6f0", bord: "#8a96b8", encre: "#3d4770" },
  commun: { haut: "#eef6ff", bas: "#cfe6ff", bord: "#4aa3ff", encre: "#14509c" },
  "peu-commun": { haut: "#eceeff", bas: "#c9cffb", bord: "#3a4fe8", encre: "#2a37b8" },
  epique: { haut: "#f4eaff", bas: "#dcc6ff", bord: "#9b4dff", encre: "#5a1bb5" },
  mystique: { haut: "#fff3f4", bas: "#ffd0d6", bord: "#ff2e4a", encre: "#9c0f24" },
  legendaire: { haut: "#fffbe6", bas: "#ffe59a", bord: "#f2b632", encre: "#6e4700" },
  saison: { haut: "#fffbe6", bas: "#ffd9b0", bord: "#f2b632", encre: "#6e4700" },
  divin: { haut: "#f6fffe", bas: "#cdeffb", bord: "#19d3c5", encre: "#075e58" },
};
/** Les tons d'une rareté ; ceux de la carte de base sans rareté connue. */
export const tonsDeLaCarte = (rarete: string | null | undefined): TonsDeCarte => TONS_DES_CARTES[rarete ?? "base"] ?? TONS_DES_CARTES["base"]!;
