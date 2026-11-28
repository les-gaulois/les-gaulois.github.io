/**
 * La carte d'un cosmétique, modèle unique du site (28 novembre 2026, aperçu « Cartes pleine image » validé par le pilote :
 * « oui construis et importe-le partout sur le site ! je veux qu'un seul modèle de cartes et NON plusieurs ! »). Les calculs
 * de la carte, sans navigateur : sa taille en cases, la place de la chose, sa scène, et les motifs de lumière de chaque
 * rareté (gravure, spirales, cosmos, rouelle, éclats, feuilles d'or, perles d'émail, contour de l'objet). Chaque motif est
 * une `Planche`, que l'écran change en image (`urlDeLaPlanche`) ; le composant est `CarteDeCosmetique.tsx`, la feuille
 * `24-cartes.css`.
 *
 * La forme est celle d'une carte à collectionner, 63 sur 88 : 70 sur 98 cases, coins arrondis, la scène jusqu'au bord sous
 * un rebord léger de deux cases à la couleur claire de la rareté. Trois plans : la scène (et ce que la rareté y pose), la
 * chose, et un devant propre à la rareté.
 */
import { fondSeul, type DessinEnCases } from "../village/fonds-objets";
import { NOMS_EMPLACEMENTS, type Emplacement } from "../gaulois";
import { Planche, R } from "./planche";

/** La carte, en cases : sa taille, et les rangées de sa tête, de la boîte des effets, de son pied et de son image. */
export const CARTE = { largeur: 70, hauteur: 98, haut: [0, 11], effets: [76, 86], bas: [87, 97], zone: [12, 75] } as const;
/**
 * La carte couchée (une bannière, qui est une scène en paysage de 124 sur 80 cases) : la même forme 88 sur 63, à la largeur
 * de la bannière, qui s'y voit entière (124 sur 89 cases).
 */
export const CARTE_COUCHEE = { largeur: 124, hauteur: 89, haut: [0, 11], effets: [67, 77], bas: [78, 88], zone: [12, 66] } as const;
export type FormeDeLaCarte = typeof CARTE | typeof CARTE_COUCHEE;

/** Les raretés de la carte ; « base » : un objet gratuit, sans rareté. */
export type RareteDeLaCarte = "base" | "commun" | "peu-commun" | "epique" | "mystique" | "legendaire" | "saison" | "divin";
const RARETES: readonly RareteDeLaCarte[] = ["base", "commun", "peu-commun", "epique", "mystique", "legendaire", "saison", "divin"];
export const rareteDeLaCarte = (r: string | null | undefined): RareteDeLaCarte => ((RARETES as readonly string[]).includes(r ?? "") ? (r as RareteDeLaCarte) : "base");

/** Le rebord : deux cases claires à la couleur de la rareté (demande du pilote : « rajoute un léger rebord »). */
export const REBORDS: Readonly<Record<RareteDeLaCarte, string>> = {
  base: "#e4e8f2",
  commun: "#cfe6ff",
  "peu-commun": "#cfd5ff",
  epique: "#e2d2ff",
  mystique: "#ffc4cb",
  legendaire: "#ffe9a3",
  saison: "#ffe0bd",
  divin: "#c8f5f0",
};
/** Le contour de l'objet, une case à la couleur de sa rareté (« rendre l'item un peu plus distinctif »). */
export const CONTOURS: Readonly<Record<RareteDeLaCarte, string>> = {
  base: "#8a96b8",
  commun: "#2f8fff",
  "peu-commun": "#3a4fe8",
  epique: "#9b4dff",
  mystique: "#ff2e4a",
  legendaire: "#ff9f1a",
  saison: "#ff9f1a",
  divin: "#0fb8ab",
};

/** Ce qui se pose derrière l'écriture : rien (« plein »), un voile, un bandeau de verre, ou un bandeau plein (sans valeur). */
export type Flottant = "plein" | "voile" | "verre";
const FLOTTANTS: Partial<Record<RareteDeLaCarte, Flottant>> = { divin: "plein", legendaire: "plein", saison: "plein", mystique: "voile", epique: "verre" };
export const flottantDe = (r: RareteDeLaCarte): Flottant | null => FLOTTANTS[r] ?? null;

/** Le premier plan, posé sur la scène, et le devant de chaque rareté ; rien ne brille en commun, peu commun et de base. */
export type Finition = "prisme" | "dorure" | "rouelle" | "gravure" | null;
export type Devant = "etoiles" | "feuilles" | "email" | "eclats" | null;
export function finitionDe(r: RareteDeLaCarte): { finition: Finition; devant: Devant } {
  if (r === "divin") return { finition: "prisme", devant: "etoiles" };
  if (r === "legendaire" || r === "saison") return { finition: "dorure", devant: "feuilles" };
  if (r === "mystique") return { finition: "rouelle", devant: "email" };
  if (r === "epique") return { finition: "gravure", devant: "eclats" };
  return { finition: null, devant: null };
}
/** Commun, peu commun et de base : des bandeaux pleins, qui font le plan de devant ; aucun reflet. */
export const estLisse = (r: RareteDeLaCarte): boolean => finitionDe(r).finition === null;

/** Les tons de la carte : ceux du papier des cartes du site (haut, bas, bord, encre). */
export const tonsDe = (r: RareteDeLaCarte): TonsDeCarte => tonsDeLaCarte(r === "base" ? null : r);

/** Où poser la chose : au milieu (un objet), au sol (un familier), contre le bas (un Gaulois unique, un buste). */
export type Pose = "centre" | "sol" | "bas";

/** La chose posée, en cases : son agrandissement (un nombre entier, de 1 à 3), sa place, sa taille. */
export interface PlaceDeLaChose {
  k: number;
  x: number;
  y: number;
  l: number;
  h: number;
}

/** La rangée du sol de la scène (le divin le pose une rangée plus haut, comme l'aperçu). */
export const solDe = (r: RareteDeLaCarte): number => (r === "divin" ? 74 : 75);

/**
 * La chose seule, en grand (« L'objet seul en grand », choix du pilote) : agrandie de 1 à 3 fois (`auPlus`) pour tenir dans l'image
 * (rangées 12 à 75, cinq cases d'air de chaque côté), centrée ; au sol ou contre le bas, posée sur la dernière rangée de
 * l'image.
 */
export function placerLaChose(l: number, h: number, pose: Pose = "centre", auPlus = 3): PlaceDeLaChose {
  const [z0, z1] = CARTE.zone;
  const zl = CARTE.largeur - 10;
  const zh = z1 - z0 - 6;
  const k = Math.max(1, Math.min(auPlus, Math.floor((zl - 6) / l), Math.floor((zh - 6) / h)));
  const x = Math.round((CARTE.largeur - l * k) / 2);
  const y = pose === "centre" ? Math.round(z0 + 3 + (zh - h * k) / 2) : Math.max(z0 + 1, z1 - h * k);
  return { k, x, y, l: l * k, h: h * k };
}

/**
 * La scène de la carte : celle de la chose (`fondSeul`), dessinée sur 70 × 88 cases puis prolongée à 98 rangées
 * (`prolongerLaScene`), son milieu sur celui de la chose ; la place de la chose y reste calme, son sol sous elle.
 */
export function sceneDeLaCarte(cle: string, rarete: RareteDeLaCarte, accent: string, place: PlaceDeLaChose): ImageEnCases {
  const W = CARTE.largeur;
  const H = CARTE.hauteur;
  const hb = 88;
  const oy = Math.max(0, Math.min(H - hb, Math.round(place.y + place.h / 2 - hb / 2)));
  const sol = solDe(rarete);
  const zone = { x: place.x, y: place.y - oy, largeur: place.l, hauteur: Math.max(1, sol - place.y) };
  const brut = fondSeul(cle, { largeur: W, hauteur: hb, rarete: rarete === "base" ? null : rarete, accent, zone, sol: sol - oy });
  return prolongerLaScene(brut, W, H, 0, oy);
}

/**
 * Une scène donnée (une bannière, le trésor des statères) posée sur toute la carte de `W` sur `H` cases, son milieu au
 * milieu : ce qui manque se prolonge (`prolongerLaScene`), ce qui dépasse est rogné, jamais déformé.
 */
export function sceneQuiCouvre(img: ImageEnCases, W: number, H: number): ImageEnCases {
  const ox = Math.round((W - img.largeur) / 2);
  const oy = Math.round((H - img.hauteur) / 2);
  return prolongerLaScene(img, W, H, ox, oy);
}

/**
 * Les rayons d'or des cartes de statères (« La pièce », choix du pilote, 28 novembre 2026) : 24 rayons qui partent du milieu
 * de l'image, deux ors qui alternent, plus clairs près du cœur.
 */
export function rayonsDOr(): ImageEnCases {
  const W = CARTE.largeur;
  const H = CARTE.hauteur;
  const cx = W / 2;
  const cy = 44;
  const cases: string[] = [];
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const a = Math.atan2(y - cy, x - cx);
      const d = Math.hypot(x - cx, y - cy);
      const raie = Math.floor(((a + Math.PI) / (2 * Math.PI)) * 24) % 2 === 0;
      cases.push(d < 8 ? "#fff4c2" : raie ? (d < 30 ? "#ffd84a" : "#f2b632") : d < 30 ? "#ffe9a3" : "#ffd27a");
    }
  return { largeur: W, hauteur: H, cases };
}

/** Une graine stable par chose (sa clé de fond) : les motifs semés d'une carte ne changent pas d'une visite à l'autre. */
export function graineDe(cle: string): number {
  let g = 1868;
  for (let i = 0; i < cle.length; i++) g = (Math.imul(g, 31) + cle.charCodeAt(i)) | 0;
  return g >>> 0;
}

/** Un tirage pseudo-aléatoire répétable (mulberry32). */
export function hasard(graine: number): () => number {
  let g = graine | 0;
  return () => {
    g = (g + 0x6d2b79f5) | 0;
    let t = Math.imul(g ^ (g >>> 15), 1 | g);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Une planche agrandie `k` fois, case pour case, sans flou : les masques restent nets à toutes les tailles de carte. */
export function agrandir(p: Planche, k: number): Planche {
  if (k === 1) return p;
  const g = new Planche(p.width * k, p.height * k);
  for (let y = 0; y < g.height; y++)
    for (let x = 0; x < g.width; x++) {
      const i = (Math.floor(y / k) * p.width + Math.floor(x / k)) * 4;
      const j = (y * g.width + x) * 4;
      g.data[j] = p.data[i]!;
      g.data[j + 1] = p.data[i + 1]!;
      g.data[j + 2] = p.data[i + 2]!;
      g.data[j + 3] = p.data[i + 3]!;
    }
  return g;
}

/** Le dessin d'une chose, en planche. */
export function plancheDe(d: DessinEnCases): Planche {
  const p = new Planche(d.largeur, d.hauteur);
  d.cases.forEach((c, i) => {
    if (!c) return;
    p.fillStyle = c;
    p.fillRect(i % d.largeur, Math.floor(i / d.largeur), 1, 1);
  });
  return p;
}

/** Le masque de la chose : ses cases pleines, en noir (l'objet s'allume au survol par ce masque). */
export function masqueDe(d: DessinEnCases): Planche {
  const p = new Planche(d.largeur, d.hauteur);
  p.fillStyle = "#000000";
  d.cases.forEach((c, i) => {
    if (c) p.fillRect(i % d.largeur, Math.floor(i / d.largeur), 1, 1);
  });
  return p;
}

/**
 * Le contour de la chose : une case de la couleur de sa rareté tout autour (la planche a une case de plus de chaque côté).
 * Le masque est d'abord fermé (grossi d'une case puis rétréci d'une case) : les petits trous du dessin (un rayon, une
 * grille) se bouchent, le contour ne suit que la silhouette ; une case prise entre deux cases de la chose n'en a pas.
 */
export function contourDe(d: DessinEnCases, couleur: string): Planche {
  const L = d.largeur;
  const Hh = d.hauteur;
  const m0 = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < L && y < Hh && !!d.cases[y * L + x];
  const L2 = L + 4;
  const H2 = Hh + 4;
  const gros = new Uint8Array(L2 * H2);
  const ferme = new Uint8Array(L2 * H2);
  for (let y = -2; y < Hh + 2; y++)
    for (let x = -2; x < L + 2; x++) {
      let ok = 0;
      for (let a = -1; a <= 1 && !ok; a++) for (let b = -1; b <= 1; b++) if (m0(x + a, y + b)) ok = 1;
      gros[(y + 2) * L2 + x + 2] = ok;
    }
  const g = (x: number, y: number): boolean => x >= -2 && y >= -2 && x < L + 2 && y < Hh + 2 && gros[(y + 2) * L2 + x + 2] === 1;
  for (let y = -2; y < Hh + 2; y++)
    for (let x = -2; x < L + 2; x++) {
      let ok = 1;
      for (let a = -1; a <= 1 && ok; a++) for (let b = -1; b <= 1; b++) if (!g(x + a, y + b)) ok = 0;
      ferme[(y + 2) * L2 + x + 2] = ok || m0(x, y) ? 1 : 0;
    }
  const m = (x: number, y: number): boolean => x >= -2 && y >= -2 && x < L + 2 && y < Hh + 2 && ferme[(y + 2) * L2 + x + 2] === 1;
  const p = new Planche(L + 2, Hh + 2);
  p.fillStyle = couleur;
  for (let y = -1; y <= Hh; y++)
    for (let x = -1; x <= L; x++) {
      if (m(x, y) || (m(x - 1, y) && m(x + 1, y)) || (m(x, y - 1) && m(x, y + 1))) continue;
      if (m(x - 1, y) || m(x + 1, y) || m(x, y - 1) || m(x, y + 1)) p.fillRect(x + 1, y + 1, 1, 1);
    }
  return p;
}

/* ---------- Les motifs de lumière ---------- */

/** La gravure de l'épique : une hachure de quatre cases, claire, qui paraît autour de la lumière. */
export function hachures(): Planche {
  const p = new Planche(4, 4);
  p.fillStyle = "#f4ecff";
  for (let i = 0; i < 4; i++) p.fillRect(i, 3 - i, 1, 1);
  return p;
}

/** Les spirales du légendaire : quatre spirales de 12 cases, deux dans chaque sens, en or pâle. */
export function spirales(): Planche {
  const N = 12;
  const p = new Planche(2 * N, 2 * N);
  p.fillStyle = "#fff4c2";
  for (let q = 0; q < 4; q++) {
    const ox = (q % 2) * N;
    const oy = Math.floor(q / 2) * N;
    const sens = q === 0 || q === 3 ? 1 : -1;
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++) {
        const dx = (x - 5.5) * sens;
        const dy = y - 5.5;
        const r = Math.hypot(dx, dy);
        if (r > 5.6) continue;
        const t = (Math.atan2(dy, dx) + 2 * Math.PI) % (2 * Math.PI);
        let on = false;
        for (let tour = 0; tour < 2; tour++) {
          const th = t + tour * 2 * Math.PI;
          if (th < 8.6 && Math.abs(r - (0.7 + 0.56 * th)) < 0.55) on = true;
        }
        if (on) p.fillRect(ox + x, oy + y, 1, 1);
      }
  }
  return p;
}

function disque(p: Planche, cx: number, cy: number, ray: number, anneau: boolean): void {
  for (let y = -ray; y <= ray; y++)
    for (let x = -ray; x <= ray; x++) {
      const d = Math.hypot(x, y);
      if (anneau ? Math.abs(d - ray) < 0.55 : d <= ray + 0.2) p.fillRect(cx + x, cy + y, 1, 1);
    }
}

/** Le cosmos du divin : points, disques et anneaux semés sur la carte, le masque du prisme qui paraît autour de la lumière. */
export function cosmos(graine: number, W: number = CARTE.largeur, H: number = CARTE.hauteur): Planche {
  const p = new Planche(W, H);
  const r = hasard(graine);
  p.fillStyle = "#000000";
  for (let i = 0; i < 110; i++) p.fillRect(Math.floor(r() * W), Math.floor(r() * H), 1, 1);
  for (let i = 0; i < 28; i++) disque(p, Math.floor(r() * W), Math.floor(r() * H), 1 + Math.floor(r() * 2), false);
  for (let i = 0; i < 15; i++) disque(p, Math.floor(r() * W), Math.floor(r() * H), 2 + Math.floor(r() * 3), true);
  return p;
}

/** Le rayon de la rouelle du mystique, en cases. */
export const RAYON_DE_LA_ROUELLE = 25;

/** La rouelle du mystique : une roue gauloise à six rayons, en bronze (`email` faux) ou son émail rouge et or (`email` vrai). */
export function rouelle(email: boolean, R = RAYON_DE_LA_ROUELLE): Planche {
  const T = 2 * R + 1;
  const p = new Planche(T, T);
  for (let y = 0; y < T; y++)
    for (let x = 0; x < T; x++) {
      const dx = x - R;
      const dy = y - R;
      const d = Math.hypot(dx, dy);
      const a = (Math.atan2(dy, dx) + 2 * Math.PI) % (Math.PI / 3);
      const rayon = Math.min(a, Math.PI / 3 - a) * d < 1.1;
      if (d > R + 0.3) continue;
      let c: string | null = null;
      if (d > R - 1.2) c = email ? null : "#7a4a12";
      else if (d > R - 2.4) c = email ? null : "#e0a050";
      else if (d < 3.4) c = email ? null : d < 1.5 ? "#ffd88a" : "#b5651d";
      else if (rayon) c = email ? null : "#c98a3a";
      else if (email) c = d > R - 4.5 ? "#ffc61a" : Math.floor(d) % 5 === 0 ? "#ff8a8f" : "#d81e3c";
      if (c) {
        p.fillStyle = c;
        p.fillRect(x, y, 1, 1);
      }
    }
  return p;
}

/** Le devant d'une rareté, semé une fois, plus grand que la carte de quatre cases tout autour (il glisse avec elle). */
export function devant(sorte: "eclats" | "feuilles" | "email", graine: number, W: number = CARTE.largeur, H: number = CARTE.hauteur): Planche {
  const L = W + 8;
  const Hh = H + 8;
  const p = new Planche(L, Hh);
  const r = hasard(graine);
  if (sorte === "eclats") {
    const E = ["#ffffff", "#dcc6ff", "#9b4dff", "#c9b8ff"];
    for (let i = 0; i < 26; i++) {
      const px = Math.floor(r() * L);
      const py = Math.floor(r() * Hh);
      p.fillStyle = E[i % 4]!;
      if (i % 3 === 0) {
        p.fillRect(px, py - 1, 1, 3);
        p.fillRect(px - 1, py, 3, 1);
      } else if (i % 3 === 1) p.fillRect(px, py, 2, 1);
      else p.fillRect(px, py, 1, 1);
    }
  } else if (sorte === "feuilles") {
    const F = [
      ["#ffd84a", "#9c6a0c", "#fffbe6"],
      ["#d9a21b", "#6e4700", "#ffe59a"],
    ] as const;
    for (let i = 0; i < 16; i++) {
      const px = Math.floor(r() * (L - 4));
      const py = Math.floor(r() * (Hh - 4));
      const t = F[i % 2]!;
      const w = 2 + Math.floor(r() * 3);
      const h = 1 + Math.floor(r() * 2);
      p.fillStyle = t[1];
      p.fillRect(px + 1, py + 1, w, h);
      p.fillStyle = t[0];
      p.fillRect(px, py, w, h);
      p.fillStyle = t[2];
      p.fillRect(px, py, 1, 1);
    }
  } else {
    const M = [
      ["#d81e3c", "#ff8a8f"],
      ["#f5a623", "#ffe3a8"],
      ["#19b8d3", "#bdf3fb"],
    ] as const;
    for (let i = 0; i < 14; i++) {
      const px = 2 + Math.floor(r() * (L - 4));
      const py = 2 + Math.floor(r() * (Hh - 4));
      const m = M[i % 3]!;
      p.fillStyle = m[0];
      disque(p, px, py, i % 4 === 0 ? 2 : 1, false);
      p.fillStyle = m[1];
      p.fillRect(px - 1 + (i % 4 === 0 ? 0 : 1), py - 1, 1, 1);
    }
  }
  return p;
}

/* ---------- Ce que les cartes d'avant partageaient, gardé pour le modèle unique ---------- */

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

/** Le mot de l'emplacement d'une chose, d'après sa clé de fond (`objet/<emplacement>/<id>`, `familier/…`, `modele/…`). */
export function motDeLaChose(cle: string): string {
  const [sorte, e] = cle.split("/");
  if (sorte === "objet" && e && Object.hasOwn(NOMS_EMPLACEMENTS, e)) return NOMS_EMPLACEMENTS[e as Emplacement];
  if (sorte === "familier") return "Familier";
  if (sorte === "modele") return "Gaulois unique";
  return "";
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
