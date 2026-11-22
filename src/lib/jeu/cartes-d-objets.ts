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
import { Planche, R, grille } from "./planche";

export type StyleDeCarte = "lisse" | "entre" | "pixel";

/** Les raretés aux cartes en pixel art et holographiques. */
export const RARETES_EN_PIXELS = ["mystique", "legendaire", "saison", "divin"] as const;
export type RareteEnPixels = (typeof RARETES_EN_PIXELS)[number];
export const estEnPixels = (r: unknown): r is RareteEnPixels => typeof r === "string" && (RARETES_EN_PIXELS as readonly string[]).includes(r);

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
