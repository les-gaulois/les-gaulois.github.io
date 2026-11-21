/**
 * Les quatorze paliers de victoires sous le tag et leurs insignes (décision du pilote, 20 novembre 2026 : « 10, 25, 50, 100,
 * 200, 350, 500, 700, 900, 1000, 1500, 2000, 2500, 3000, chacun avec son insigne »). Un seul module pour la liste : l'écran
 * « Ma carte » s'en sert, et l'échelle du site (`WIN_TIERS` de `src/lib/paliers.ts`, liste des membres et annonces Discord),
 * encore à 8 paliers le 21 novembre 2026, doit la reprendre quand elle passe aux quatorze, sans la recopier
 * (tests/unit/jeu-kit.test.ts n'accepte que l'ancienne échelle ou celle-ci).
 *
 * Un palier compte des victoires sous le tag (`stats.team`) : il ne dit pas qui joue le mieux. Chaque insigne a sa matière,
 * sa forme et son emblème (fiche de projet « Mon Gaulois », table « Les quatorze paliers de victoires ») ; les dessins sont
 * ceux de la maquette validée par le pilote (planche de Claude Fable 5.2, 20-21 novembre 2026). Rien n'y rappelle Astérix.
 */
import { PAL } from "./palette";
import { Planche, R, cerne, etoile5, grille, lig, poly, volume } from "./planche";

/** Les quatorze paliers, du premier au dernier. */
export const PALIERS_DE_VICTOIRES = [10, 25, 50, 100, 200, 350, 500, 700, 900, 1000, 1500, 2000, 2500, 3000] as const;

/** La matière et l'emblème de chaque insigne, dans l'ordre des paliers : ce qu'un lecteur d'écran en entend. */
export const NOMS_DES_INSIGNES = [
  "bouclier rond de bois",
  "lance de pierre",
  "hache de fer",
  "épée de bronze",
  "épées croisées d'argent",
  "torque d'or",
  "feuille de chêne d'émeraude",
  "étoile de saphir",
  "casque à crête de rubis",
  "couronne d'améthyste",
  "flamme d'obsidienne",
  "soleil de diamant",
  "étoile de prisme",
  "étoile couronnée tricolore",
] as const;

/** Le rang (0 à 13) du plus haut palier atteint avec `victoires`, ou `null` sous le premier. */
export function rangDuPalier(victoires: number): number | null {
  let rang: number | null = null;
  PALIERS_DE_VICTOIRES.forEach((p, i) => {
    if (victoires >= p) rang = i;
  });
  return rang;
}

/**
 * Où en est un joueur : le palier atteint (rang et seuil, `null` sous le premier), le suivant (`null` au dernier) et la part
 * du chemin faite entre les deux, de 0 à 1 (1 au dernier palier).
 */
export function cheminDesPaliers(victoires: number): { atteint: { rang: number; seuil: number } | null; suivant: { rang: number; seuil: number } | null; part: number } {
  const rang = rangDuPalier(victoires);
  const de = rang === null ? 0 : PALIERS_DE_VICTOIRES[rang]!;
  const iSuivant = rang === null ? 0 : rang + 1;
  const vers = PALIERS_DE_VICTOIRES[iSuivant];
  return {
    atteint: rang === null ? null : { rang, seuil: de },
    suivant: vers === undefined ? null : { rang: iSuivant, seuil: vers },
    part: vers === undefined ? 1 : Math.max(0, Math.min(1, (victoires - de) / (vers - de))),
  };
}

const cercle = (r: number): [number, number][] => Array.from({ length: 28 }, (_, i) => [12 + Math.cos((i * Math.PI) / 14) * r, 12 + Math.sin((i * Math.PI) / 14) * r]);
const rayonnante = (r1: number, r2: number, n: number): [number, number][] =>
  Array.from({ length: n * 2 }, (_, i) => {
    const a = -Math.PI / 2 + (i * Math.PI) / n;
    const r = i % 2 ? r2 : r1;
    return [12 + Math.cos(a) * r, 12 + Math.sin(a) * r];
  });
const FORMES: Readonly<Record<string, [number, number][]>> = {
  disque: cercle(10.7),
  hexa: [[12, 1.2], [21.4, 6.6], [21.4, 17.4], [12, 22.8], [2.6, 17.4], [2.6, 6.6]],
  ecu: [[2.6, 2], [21.4, 2], [21.4, 12], [12, 22.8], [2.6, 12]],
  losange: [[12, 1], [23, 12], [12, 23], [1, 12]],
  astre: rayonnante(11.2, 8.4, 8),
};
const reduit = (pts: readonly [number, number][], k: number, dy = 0): [number, number][] => pts.map(([x, y]) => [12 + (x - 12) * k, 12 + (y - 12) * k + dy]);
const EMBLEMES: Readonly<Record<string, string[]>> = {
  umbo: ["..###..", ".#+++#.", "#++++##", "#+++###", "#++####", ".#####.", "..###.."],
  lance: ["....#....", "...###...", "...###...", "..#####..", "..#####..", "...###...", "....#....", "....+....", "....+....", "....+...."],
  hache: ["..###..+.", ".#####.+.", "######++.", "######.+.", ".#####.+.", "..###..+.", ".......+.", ".......+.", ".......+."],
  epee: ["....#....", "...###...", "...###...", "...###...", "...###...", "...###...", ".+++++++.", "....+....", "....+....", "...+++..."],
  croisees: ["#.........#", ".#.......#.", "..#.....#..", "...#...#...", "....#.#....", ".....#.....", "....#.#....", ".+.#...#.+.", "..+.....+..", ".+.+...+.+."],
  torque: [".##.....##.", "#+#.....#+#", ".#.......#.", ".#.......#.", ".##.....##.", "..###.###..", "....###...."],
  chene: ["....#....", "...###...", "..##+##..", ".###+###.", ".###+###.", "..##+##..", "...#+#...", "....+....", "....+...."],
  etoile: ["....#....", "....#....", "...###...", "..#####..", "#########", "..#####..", "...###...", "....#....", "....#...."],
  casque: ["....+....", "...+++...", "..+###+..", "..#####..", ".#######.", ".#######.", ".##...##.", ".##...##."],
  couronne: ["#...#...#", "##.###.##", "#########", "#+##+##+#", "#########"],
  flamme: ["...#...", "..###..", "..#+#.#", ".##++##", ".#++++#", ".#++++#", "..#++#."],
  soleil: ["...#.#...", ".#.....#.", "...###...", "#.#+++#.#", "..#+++#..", "#.#+++#.#", "...###...", ".#.....#.", "...#.#..."],
};
const LAURIER = ["...#.", "..##.", ".##..", ".#.#.", "##.#.", "#.##.", "#.#..", ".##..", "..##."];
const OR: readonly [string, string, string] = ["#fffbe6", "#ffd84a", "#b97a0c"];

interface Specification {
  forme: string;
  bord: readonly [string, string, string];
  matiere: readonly [string, string, string] | "tricolore" | "prisme";
  embleme: string | null;
  teintes?: readonly [string, string];
  rayons?: boolean;
  lauriers?: boolean;
  couronne?: boolean;
}

const SPECIFICATIONS: readonly Specification[] = [
  { forme: "disque", bord: ["#a8682f", "#6b3f1c", "#3f240f"], matiere: ["#e8b877", "#c98a4b", "#8f5727"], embleme: "umbo", teintes: ["#3a2606", "#d9a21b"] },
  { forme: "hexa", bord: ["#8a96b8", "#5a6590", "#3b4468"], matiere: ["#dfe5f5", "#aab4d2", "#7783a8"], embleme: "lance", teintes: ["#2a3150", "#6b3f1c"] },
  { forme: "ecu", bord: ["#6f7ba3", "#4a5578", "#2f3856"], matiere: ["#9aa6c8", "#6f7ba3", "#4a5578"], embleme: "hache", teintes: ["#f6f1e3", "#3f240f"] },
  { forme: "disque", bord: ["#c47a3a", "#8a4a1c", "#5a2c0c"], matiere: ["#f6c08a", "#d98f4a", "#a8602a"], embleme: "epee", teintes: ["#fff7e6", "#4a2408"] },
  { forme: "ecu", bord: ["#aab4d2", "#6f7ba3", "#4a5578"], matiere: ["#ffffff", "#dde3f2", "#aab4d2"], embleme: "croisees", teintes: ["#2a3150", "#9c6a0c"] },
  { forme: "disque", bord: ["#d9981b", "#9c6a0c", "#6b4504"], matiere: ["#fffbe6", "#ffd84a", "#e8aa14"], embleme: "torque", teintes: ["#4a2c04", "#e0263a"] },
  { forme: "hexa", bord: OR, matiere: ["#c4f9cb", "#3fce6a", "#1f8a47"], embleme: "chene", teintes: ["#f6f1e3", "#0f5a2c"] },
  { forme: "losange", bord: OR, matiere: ["#9cc2ff", "#2f6bff", "#0b3fc4"], embleme: "etoile", teintes: ["#f6f1e3", "#f6f1e3"] },
  { forme: "ecu", bord: OR, matiere: ["#ff8a8f", "#e0263a", "#a8101f"], embleme: "casque", teintes: ["#ffd84a", "#f6f1e3"] },
  { forme: "astre", bord: OR, matiere: ["#d8c9ff", "#8b5cf6", "#5a2fc2"], embleme: "couronne", teintes: ["#ffd84a", "#e0263a"] },
  { forme: "hexa", bord: OR, matiere: ["#5a6590", "#232a4a", "#0d1230"], embleme: "flamme", teintes: ["#f5760f", "#ffd84a"] },
  { forme: "losange", bord: OR, matiere: ["#ffffff", "#bff3ff", "#5fd0e6"], embleme: "soleil", teintes: ["#b97a0c", "#ffd84a"], rayons: true },
  { forme: "astre", bord: ["#ffffff", "#fff2a8", "#d9981b"], matiere: "prisme", embleme: null },
  { forme: "disque", bord: OR, matiere: "tricolore", embleme: null, lauriers: true, couronne: true },
];

const DEJA = new Map<number, Planche>();

/** L'insigne d'un palier (rang 0 à 13), sur 24 cases. Dessiné une fois. */
export function insigne(rang: number): Planche {
  const deja = DEJA.get(rang);
  if (deja) return deja;
  const s = SPECIFICATIONS[rang];
  if (!s) throw new Error(`insigne : pas de palier au rang ${rang}`);
  const c = new Planche(24, 24);
  const k = s.lauriers ? 0.8 : s.rayons ? 0.84 : 1;
  const dy = s.couronne ? 2 : s.lauriers ? 1 : 0;
  const pts = reduit(FORMES[s.forme]!, k, dy);
  const ton =
    (t: readonly [string, string, string]) =>
    (x: number, y: number): string =>
      x + y < 21 ? t[0] : x + y > 27 ? t[2] : t[1];
  if (s.rayons)
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4 + Math.PI / 8;
      lig(c, Math.round(12 + Math.cos(a) * 7), Math.round(12 + dy + Math.sin(a) * 7), Math.round(11.5 + Math.cos(a) * 10.4), Math.round(11.5 + dy + Math.sin(a) * 10.4), i % 2 ? "#ffd84a" : "#fffbe6");
    }
  if (s.lauriers) {
    c.drawImage(grille(LAURIER, { "#": "#3fce6a" }), 1, 11 + dy);
    c.drawImage(grille(LAURIER.map((r) => [...r].reverse().join("")), { "#": "#1f8a47" }), 18, 11 + dy);
  }
  poly(c, pts, ton(s.bord));
  const dedans = reduit(pts, 0.72).map(([x, y]): [number, number] => [x, y + dy * 0.28]);
  if (s.matiere === "tricolore") poly(c, dedans, (x, y) => (x < 10 ? (y > 14 + dy ? "#0b3fc4" : "#2f6bff") : x < 14 ? (y > 14 + dy ? "#cfc9b8" : "#f6f1e3") : y > 14 + dy ? "#a8101f" : "#e0263a"));
  else if (s.matiere === "prisme") poly(c, dedans, (x, y) => `hsl(${Math.round((Math.atan2(y - 12 - dy, x - 12) * 180) / Math.PI + 200)} 88% ${x + y < 22 ? 72 : 58}%)`);
  else poly(c, dedans, ton(s.matiere));
  if (s.embleme && s.teintes) {
    const e = grille(EMBLEMES[s.embleme]!, { "#": s.teintes[0], "+": s.teintes[1] });
    c.drawImage(e, Math.round(12 - e.width / 2), Math.round(12 + dy - e.height / 2));
  } else {
    poly(c, etoile5(12, 12.4 + dy, 6.4, 2.9), PAL.k);
    poly(c, etoile5(12, 12.4 + dy, 4.9, 2.1), s.matiere === "prisme" ? "#ffffff" : "#ffd84a");
    R(c, 11, 10 + dy, 1, 2, "#ffffff");
  }
  if (s.couronne) c.drawImage(grille(["y.y.y.y", "yyyyyyy", "yOyRyOy", "ooooooo"], PAL), 9, 1);
  const fini = volume(cerne(c));
  DEJA.set(rang, fini);
  return fini;
}
