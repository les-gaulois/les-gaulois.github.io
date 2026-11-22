/**
 * Les cartes spéciales statères (22 novembre 2026). Demande du pilote : « j'aimerais que tu me crées des cartes spéciales
 * statères », pour la fin d'un booster qui rend des statères et pour les lots du booster de statères ; dessins de Claude
 * Fable 5.2 (maquette « Cartes des statères »), le pilote ayant laissé Claude choisir les options : toute l'échelle dans l'or,
 * avec les noms proposés pour les lots. Portés ici sur les planches du kit, sans navigateur : chaque dessin est une
 * `Planche`, que l'écran change en image.
 *
 * La richesse monte avec la somme, par la forme et jamais par la seule couleur : plus de pièces, un cadre plus travaillé, des
 * pions pleins pour le rang. Les montants viennent toujours du serveur : ces dessins n'en inventent aucun.
 */
import { casesDuStatere, type TailleStatere } from "../../../supabase/functions/code-discord/statere";
import { nombre } from "../village/ecran-boutique";
import { Planche, R } from "./planche";

/** Le rang d'une carte de statères : 0 pour des statères rendus, 1 à 6 pour les lots du booster de statères. */
export type RangDeStateres = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** Ce que chaque rang montre : son nom, sa façon de carte, l'encre de ses chiffres, la couleur des rayons derrière lui. */
export interface LotDessine {
  nom: string;
  carte: "lisse" | "entre" | "pixel";
  encre: "marine" | "or" | "orVif";
  rayon: string;
}
export const LOTS_DESSINES: Readonly<Record<RangDeStateres, LotDessine>> = {
  0: { nom: "Statères rendus", carte: "lisse", encre: "marine", rayon: "226, 233, 250" },
  1: { nom: "Quelques pièces", carte: "lisse", encre: "marine", rayon: "255, 241, 200" },
  2: { nom: "La petite pile", carte: "lisse", encre: "marine", rayon: "255, 236, 170" },
  3: { nom: "La bourse", carte: "entre", encre: "or", rayon: "255, 228, 130" },
  4: { nom: "Le coffret", carte: "pixel", encre: "orVif", rayon: "255, 222, 100" },
  5: { nom: "Le grand coffre", carte: "pixel", encre: "orVif", rayon: "255, 216, 74" },
  6: { nom: "Le trésor", carte: "pixel", encre: "orVif", rayon: "255, 216, 74" },
};
/** Un rang lu ramené entre 1 et 6 (un lot), ou 0 (un rendu). */
export const rangDeStateres = (rang: number): RangDeStateres => Math.min(6, Math.max(0, Math.round(rang))) as RangDeStateres;

/* ---------- Les outils de dessin ---------- */

const OR = { n: "#fff1a8", y: "#ffdd80", g: "#f2b632", G: "#a86d0c", o: "#6e4406", k: "#3a2606" } as const;
function grilleSur(g: Planche, lignes: readonly string[], tons: Readonly<Record<string, string>>, x0: number, y0: number): void {
  lignes.forEach((ligne, y) => {
    for (let x = 0; x < ligne.length; x++) {
      const c = tons[ligne[x]!];
      if (c) R(g, x0 + x, y0 + y, 1, 1, c);
    }
  });
}
function hasard(graine: number): () => number {
  let s = graine * 9301 + 49297;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}
/** La pièce du site (`casesDuStatere`), de 12, 16 ou 24 cases. */
function piece(g: Planche, taille: TailleStatere, x: number, y: number): void {
  casesDuStatere(taille).forEach((c, i) => {
    if (c) R(g, x + (i % taille), y + Math.floor(i / taille), 1, 1, c);
  });
}
const COTE = [".nnyyyyyyyy.", "nyyggggggggG", "ygGgGgGgGgGG", ".oooooooooo."];
const pieceDeCote = (g: Planche, x: number, y: number): void => grilleSur(g, COTE, OR, x, y);
function pile(g: Planche, x: number, sol: number, n: number, graine = 0): void {
  const pas = [0, 1, 0, -1, 0, 0, 1, -1];
  for (let i = 0; i < n; i++) pieceDeCote(g, x + (i ? pas[(i + graine) % pas.length]! : 0), sol - 4 - 3 * i);
}
function caseDuTas(x: number, y: number): string {
  const bande = Math.floor(y / 3);
  const u = (((x + (bande % 2) * 3) % 6) + 6) % 6;
  const v = ((y % 3) + 3) % 3;
  if (v === 0) return u >= 1 && u <= 4 ? (u <= 2 ? OR.n : OR.y) : OR.G;
  if (v === 1) return u === 0 ? OR.y : u === 5 ? OR.G : OR.g;
  return u >= 1 && u <= 4 ? OR.G : OR.o;
}
function tas(g: Planche, cx: number, sol: number, demi: number, sommet: number, graine = 1): void {
  const h = hasard(graine);
  for (let x = cx - demi; x <= cx + demi; x++) {
    const t = 1 - Math.abs(x - cx) / (demi + 1);
    const haut = Math.max(1, Math.round(sommet * Math.pow(t, 0.7) + (h() < 0.35 ? 1 : 0)));
    for (let y = sol - haut; y < sol; y++) R(g, x, y, 1, 1, y === sol - haut ? OR.n : y === sol - haut + 1 ? OR.y : caseDuTas(x, y));
  }
}
function coffre(g: Planche, x: number, y: number, l: number, h: number, couvercle: number, pieces: number): void {
  const k = OR.k;
  R(g, x + 1, y - couvercle, l - 2, couvercle + 1, k);
  R(g, x + 2, y - couvercle + 1, l - 4, couvercle, "#6b3d14");
  R(g, x + 2, y - couvercle + 1, l - 4, 2, OR.g);
  R(g, x + 2, y - couvercle + 1, l - 4, 1, OR.y);
  R(g, x + 2, y - couvercle + 1, 2, couvercle, OR.g);
  R(g, x + l - 4, y - couvercle + 1, 2, couvercle, OR.G);
  for (let yy = y - couvercle + 5; yy < y; yy += 3) R(g, x + 4, yy, l - 8, 1, "#55300f");
  if (pieces > 0) tas(g, x + Math.floor(l / 2), y + 1, Math.floor(l / 2) - 3, pieces, l);
  R(g, x, y, l, h, k);
  R(g, x + 1, y + 1, l - 2, h - 2, "#b9773a");
  R(g, x + 1, y + 1, l - 2, 1, "#e0a868");
  for (let yy = y + 4; yy < y + h - 2; yy += 3) R(g, x + 1, yy, l - 2, 1, "#8a5a2b");
  for (const bx of [x + 2, x + l - 5]) {
    R(g, bx, y + 1, 3, h - 2, OR.g);
    R(g, bx, y + 1, 1, h - 2, OR.y);
    R(g, bx + 2, y + 1, 1, h - 2, OR.G);
  }
  R(g, x + 1, y + h - 3, l - 2, 2, OR.g);
  R(g, x + 1, y + h - 2, l - 2, 1, OR.G);
  const sx = x + Math.floor(l / 2) - 3;
  R(g, sx, y, 6, 6, k);
  R(g, sx + 1, y + 1, 4, 4, OR.y);
  R(g, sx + 1, y + 3, 4, 2, OR.g);
  R(g, sx + 2, y + 2, 2, 2, OR.o);
}
function bourse(g: Planche, cx: number, sol: number): void {
  const rx = 11;
  const ry = 9;
  const cy = sol - ry;
  const k = OR.k;
  const dedans = (x: number, y: number): boolean => ((x - cx + 0.5) / rx) ** 2 + ((y - cy + 0.5) / ry) ** 2 <= 1;
  for (let y = cy - ry; y < cy + ry; y++)
    for (let x = cx - rx; x < cx + rx; x++) {
      if (!dedans(x, y)) continue;
      const bord = !dedans(x - 1, y) || !dedans(x + 1, y) || !dedans(x, y - 1) || !dedans(x, y + 1);
      const jour = -(x - cx) / rx - (y - cy) / ry;
      R(g, x, y, 1, 1, bord ? k : jour > 0.55 ? "#e0a868" : jour > -0.45 ? "#b9773a" : "#8a5a2b");
    }
  const haut = cy - ry;
  R(g, cx - 5, haut - 3, 10, 5, k);
  R(g, cx - 4, haut - 3, 8, 5, "#b9773a");
  R(g, cx - 4, haut - 3, 2, 5, "#e0a868");
  R(g, cx - 8, haut - 8, 16, 6, k);
  R(g, cx - 7, haut - 7, 14, 5, "#b9773a");
  R(g, cx - 7, haut - 7, 4, 5, "#e0a868");
  R(g, cx + 3, haut - 7, 4, 5, "#8a5a2b");
  for (let x = cx - 7; x < cx + 7; x += 4) R(g, x + 2, haut - 8, 2, 1, "#b9773a");
  R(g, cx - 5, haut - 10, 10, 3, OR.G);
  R(g, cx - 5, haut - 10, 10, 1, OR.n);
  R(g, cx - 5, haut - 9, 10, 1, OR.g);
  R(g, cx - 2, haut - 11, 5, 1, OR.y);
  R(g, cx - 7, haut - 2, 14, 3, k);
  R(g, cx - 6, haut - 1, 12, 1, OR.y);
  R(g, cx + 5, haut, 3, 6, k);
  R(g, cx + 6, haut + 1, 1, 4, OR.g);
  grilleSur(g, [".kk.", "kygk", "kgGk", ".kk."], OR, cx - 2, cy);
}
function table(g: Planche, sol: number): void {
  R(g, 0, sol, 66, 38 - sol, "#c99a5b");
  R(g, 0, sol, 66, 1, "#e6bd82");
  R(g, 0, sol + 3, 66, 1, "#a8763a");
  for (let x = 9; x < 66; x += 17) R(g, x, sol + 1, 1, 2, "#a8763a");
  R(g, 0, sol + 4, 66, 38 - sol - 4, "#8a5a2b");
}
function mur(g: Planche, haut: string, bas: string, sol: number): void {
  R(g, 0, 0, 66, sol, haut);
  R(g, 0, Math.floor(sol * 0.55), 66, sol, bas);
}
function pierres(g: Planche, fond: string, joint: string, clair: string, sol: number): void {
  R(g, 0, 0, 66, sol, fond);
  for (let y = 0, r = 0; y < sol; y += 6, r++) {
    R(g, 0, y + 5, 66, 1, joint);
    for (let x = r % 2 ? 6 : 0; x < 66; x += 12) {
      R(g, x, y, 1, 5, joint);
      R(g, x + 1, y, 10, 1, clair);
    }
  }
}
function dalles(g: Planche, sol: number, a: string, b: string): void {
  R(g, 0, sol, 66, 38 - sol, a);
  R(g, 0, sol, 66, 1, b);
  for (let x = 5; x < 66; x += 14) R(g, x, sol + 2, 6, 1, b);
}
function croix(g: Planche, x: number, y: number, coul = "#ffffff"): void {
  R(g, x - 1, y, 3, 1, coul);
  R(g, x, y - 1, 1, 3, coul);
}
function etoile(g: Planche, x: number, y: number, coul = "#ffffff"): void {
  R(g, x - 2, y, 5, 1, coul);
  R(g, x, y - 2, 1, 5, coul);
  R(g, x - 1, y - 1, 3, 3, coul);
  for (const [a, b] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ] as const)
    g.clearRect(x + a, y + b, 1, 1);
}
const RETOUR = ["...k.......", "..kk.......", ".kkkkkkk...", "kkkkkkkkk..", ".kkkkkkkkk.", "..kk....kk.", "...k....kk.", "........kk.", ".......kkk.", "..kkkkkkk..", "..kkkkkk..."];

/** La largeur et la hauteur de l'image d'une carte de statères, en cases. */
export const SCENE_LARGEUR = 66;
export const SCENE_HAUTEUR = 38;

/**
 * L'image d'une carte de statères, 66 sur 38 cases : le paquet ouvert, la flèche du retour et une pile d'une pièce par
 * dizaine de pour cent rendue (rang 0) ; quelques pièces sur une table (1) ; des piles (2) ; une bourse (3) ; un coffret (4) ;
 * un grand coffre qui déborde (5) ; un trésor sous des rayons (6).
 */
export function sceneDesStateres(rang: RangDeStateres, pourcent = 0): Planche {
  const g = new Planche(SCENE_LARGEUR, SCENE_HAUTEUR);
  if (rang === 0) {
    const n = Math.max(1, Math.round(pourcent / 10));
    mur(g, "#eef2fb", "#e1e8f7", 30);
    R(g, 0, 30, 66, 8, "#b8c2de");
    R(g, 0, 30, 66, 1, "#d7def0");
    R(g, 0, 34, 66, 4, "#9aa7cc");
    const px = 47;
    const py = 9;
    R(g, px, py + 2, 14, 21, "#3d4770");
    R(g, px + 1, py + 3, 12, 19, "#8a96b8");
    R(g, px + 1, py + 3, 3, 19, "#b8c2de");
    R(g, px + 10, py + 3, 3, 19, "#6f7ca6");
    for (let x = 0; x < 14; x += 2) {
      R(g, px + x, py + (x % 4 ? 1 : 0), 2, 3, "#3d4770");
      R(g, px + x, py + (x % 4 ? 2 : 1) + 1, 2, 2, "#8a96b8");
    }
    R(g, px + 1, py + 8, 12, 1, "#3d4770");
    R(g, px + 1, py + 18, 12, 1, "#3d4770");
    grilleSur(g, ["..w..", ".www.", "wwwww", ".www.", "..w.."], { w: "#f7f9fe" }, px + 5, py + 11);
    RETOUR.forEach((ligne, y) => {
      for (let x = 0; x < ligne.length; x++) if (ligne[x] === "k") R(g, 24 + x * 2, 6 + y * 2, 2, 2, "#3d4770");
    });
    R(g, 3, 29, 20, 2, "#3d4770");
    R(g, 4, 29, 18, 1, "#f7f9fe");
    pile(g, 7, 29, n, 2);
  } else if (rang === 1) {
    mur(g, "#f6f1e3", "#efe8d6", 29);
    table(g, 29);
    pile(g, 19, 29, 2, 0);
    piece(g, 12, 34, 17);
  } else if (rang === 2) {
    mur(g, "#f8f1dc", "#f1e7c8", 29);
    table(g, 29);
    pile(g, 9, 29, 5, 1);
    pile(g, 23, 29, 3, 3);
    piece(g, 16, 38, 13);
    pieceDeCote(g, 51, 25);
  } else if (rang === 3) {
    mur(g, "#fbf0cf", "#f5e3ad", 29);
    for (let i = 0; i < 3; i++) for (let y = 0; y < 29; y++) R(g, 40 + i * 9 - Math.floor(y / 2), y, 4, 1, "#fdf6e2");
    table(g, 29);
    pile(g, 3, 29, 4, 1);
    bourse(g, 31, 30);
    pile(g, 46, 29, 6, 2);
    piece(g, 12, 20, 24);
    pieceDeCote(g, 36, 34);
  } else if (rang === 4) {
    pierres(g, "#efe3bd", "#d6c38d", "#f8efd0", 30);
    dalles(g, 30, "#cdb67c", "#e2d09c");
    pile(g, 2, 30, 6, 1);
    pile(g, 51, 30, 8, 2);
    pile(g, 14, 33, 3, 3);
    coffre(g, 20, 19, 27, 14, 10, 6);
    piece(g, 12, 47, 26);
    pieceDeCote(g, 3, 34);
  } else if (rang === 5) {
    pierres(g, "#f5e2a0", "#dcbf62", "#fff1c0", 30);
    dalles(g, 30, "#d9b85a", "#f0d680");
    tas(g, 12, 34, 14, 15, 5);
    tas(g, 58, 34, 10, 9, 8);
    pile(g, 1, 36, 5, 2);
    pile(g, 52, 36, 7, 1);
    coffre(g, 18, 17, 32, 17, 11, 9);
    piece(g, 16, 4, 12);
    piece(g, 12, 44, 27);
    pieceDeCote(g, 27, 35);
    pieceDeCote(g, 39, 34);
    croix(g, 8, 6);
    croix(g, 59, 9);
    croix(g, 46, 3);
    for (const [x, y] of [
      [30, 4],
      [15, 11],
      [54, 17],
    ] as const)
      R(g, x, y, 1, 1, "#ffffff");
  } else {
    for (let y = 0; y < 38; y++)
      for (let x = 0; x < 66; x++) {
        const a = Math.atan2(y - 15, x - 33);
        const d = Math.hypot(x - 33, y - 15);
        const part = Math.floor((a + Math.PI) / (Math.PI / 11)) % 2;
        R(g, x, y, 1, 1, d < 15 ? (part ? "#fffbe6" : "#fff1a8") : part ? "#fff1a8" : "#ffd84a");
      }
    tas(g, 33, 38, 36, 21, 3);
    tas(g, 9, 38, 13, 17, 6);
    tas(g, 57, 38, 13, 16, 9);
    coffre(g, 38, 24, 24, 13, 9, 7);
    pile(g, 3, 38, 6, 1);
    pile(g, 17, 38, 4, 2);
    // La grande pièce, cernée, posée sur le tas.
    const gp = new Planche(26, 26);
    piece(gp, 24, 1, 1);
    for (let y = 0; y < 26; y++)
      for (let x = 0; x < 26; x++) {
        const plein = (xx: number, yy: number): boolean => gp.pleine(xx, yy);
        if (!plein(x, y) && (plein(x - 1, y) || plein(x + 1, y) || plein(x, y - 1) || plein(x, y + 1))) R(g, 20 + x, 1 + y, 1, 1, OR.k);
      }
    piece(g, 24, 21, 2);
    etoile(g, 9, 7);
    etoile(g, 57, 6);
    croix(g, 49, 15);
    croix(g, 15, 17);
    croix(g, 4, 20);
    R(g, 61, 17, 1, 1, "#ffffff");
    R(g, 27, 33, 2, 2, "#ffffff");
    R(g, 44, 4, 1, 1, "#ffffff");
  }
  return g;
}

/* ---------- Les grands chiffres en cases (8 sur 12) ---------- */

const CHIFFRES: Readonly<Record<string, readonly string[]>> = {
  "0": [".######.", "########", "##....##", "##....##", "##....##", "##....##", "##....##", "##....##", "##....##", "##....##", "########", ".######."],
  "1": ["..##..", ".###..", "####..", "####..", "..##..", "..##..", "..##..", "..##..", "..##..", "..##..", "######", "######"],
  "2": [".######.", "########", "##....##", "......##", "......##", ".....###", "...####.", ".####...", "###.....", "##......", "########", "########"],
  "3": [".######.", "########", "##....##", "......##", "......##", "..#####.", "..#####.", "......##", "......##", "##....##", "########", ".######."],
  "4": [".....##.", "....###.", "...####.", "..##.##.", ".##..##.", "##...##.", "##...##.", "########", "########", ".....##.", ".....##.", ".....##."],
  "5": ["########", "########", "##......", "##......", "#######.", "########", "......##", "......##", "......##", "##....##", "########", ".######."],
  "6": ["..#####.", ".######.", "###.....", "##......", "#######.", "########", "##....##", "##....##", "##....##", "##....##", "########", ".######."],
  "7": ["########", "########", "......##", ".....##.", ".....##.", "....##..", "....##..", "...##...", "...##...", "..##....", "..##....", "..##...."],
  "8": [".######.", "########", "##....##", "##....##", "##....##", ".######.", ".######.", "##....##", "##....##", "##....##", "########", ".######."],
  "9": [".######.", "########", "##....##", "##....##", "##....##", "##....##", "########", ".#######", "......##", ".....###", ".######.", ".#####.."],
  "+": ["......", "......", "......", "..##..", "..##..", "######", "######", "..##..", "..##..", "......", "......", "......"],
  "%": ["###...##", "###..##.", "###..##.", "....##..", "....##..", "...##...", "...##...", "..##....", "..##....", ".##..###", ".##..###", "##...###"],
  " ": ["...", "...", "...", "...", "...", "...", "...", "...", "...", "...", "...", "..."],
};
interface Encre {
  rangs: readonly string[];
  cerne: string | null;
  ombre?: true;
}
const ENCRES: Readonly<Record<LotDessine["encre"], Encre>> = {
  marine: { rangs: Array<string>(12).fill("#0a1230"), cerne: null },
  or: { rangs: ["#ffdd80", "#ffdd80", "#ffdd80", "#f2b632", "#f2b632", "#f2b632", "#f2b632", "#f2b632", "#f2b632", "#d9941a", "#d9941a", "#a86d0c"], cerne: "#3a2606" },
  orVif: { rangs: ["#fffbe6", "#fff1a8", "#ffdd80", "#ffd84a", "#f2b632", "#f2b632", "#f2b632", "#f2b632", "#d9941a", "#d9941a", "#a86d0c", "#a86d0c"], cerne: "#3a2606", ombre: true },
};

/**
 * Ce que la carte dit aux lecteurs d'écran, d'un seul nom : « 640 statères rendus, 40 % du prix », ou « La bourse : 400
 * statères, lot 3 sur 6 ». La somme, la part et le nombre de lots sont ceux du serveur.
 */
export function motsDeLaCarteDeStateres(rang: RangDeStateres, gain: number, pourcent: number | null, total: number): string {
  if (rang === 0) return `${nombre(gain)} ${gain > 1 ? "statères rendus" : "statère rendu"}${pourcent !== null ? `, ${pourcent} % du prix` : ""}`;
  return `${LOTS_DESSINES[rang].nom} : ${nombre(gain)} ${gain > 1 ? "statères" : "statère"}, lot ${rang} sur ${total}`;
}

/** Un nombre groupé par milliers, avec une espace ordinaire, que les chiffres en cases savent écrire (« 13 100 »). */
export const nombreEnCases = (n: number): string => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");

/**
 * Un texte en grands chiffres de cases (« +13 100 », « 60 % ») : son image, cernée et ombrée selon l'encre, et la seule
 * matière des chiffres (blanche), pour y masquer une feuille holographique.
 */
export function ecrireEnChiffres(texte: string, encre: LotDessine["encre"]): { image: Planche; plein: Planche } {
  const e = ENCRES[encre];
  const lettres = Array.from(texte).map((c) => CHIFFRES[c] ?? CHIFFRES[" "]!);
  const l = lettres.reduce((s, m) => s + m[0]!.length + 1, -1) + 2;
  const h = 12 + 2 + (e.ombre ? 1 : 0);
  const plein: boolean[][] = Array.from({ length: h }, () => Array<boolean>(l).fill(false));
  let x0 = 1;
  for (const m of lettres) {
    m.forEach((ligne, y) => {
      for (let x = 0; x < ligne.length; x++) if (ligne[x] === "#") plein[y + 1]![x0 + x] = true;
    });
    x0 += m[0]!.length + 1;
  }
  const image = new Planche(l, h);
  const masque = new Planche(l, h);
  const est = (x: number, y: number): boolean => y >= 0 && y < h && x >= 0 && x < l && plein[y]![x]!;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < l; x++) {
      if (est(x, y)) {
        R(image, x, y, 1, 1, e.rangs[y - 1]!);
        R(masque, x, y, 1, 1, "#ffffff");
      } else if (e.cerne && (est(x - 1, y) || est(x + 1, y) || est(x, y - 1) || est(x, y + 1) || (e.ombre && est(x, y - 2)))) R(image, x, y, 1, 1, e.cerne);
    }
  return { image, plein: masque };
}

/* ---------- L'habit des lots en cases (4 à 6), aux tons de l'or ---------- */

interface TonsDOr {
  encre: string;
  ombre: string;
  milieu: string;
  lumiere: string;
  eclat: string;
  gemme: string;
  gemmeClaire: string;
  motif: "raies" | "crans" | "prisme";
  periode: number;
  prisme?: readonly string[];
}
const CADRES: Readonly<Record<4 | 5 | 6, TonsDOr>> = {
  4: { encre: "#3a2606", ombre: "#a8842c", milieu: "#d9c06a", lumiere: "#f6e7a6", eclat: "#fffbe6", gemme: "#f5760f", gemmeClaire: "#fff1a8", motif: "raies", periode: 8 },
  5: { encre: "#3a2606", ombre: "#9c6a0c", milieu: "#d9a21b", lumiere: "#ffd84a", eclat: "#fffbe6", gemme: "#e0263a", gemmeClaire: "#ff8a8f", motif: "crans", periode: 8 },
  6: { encre: "#3a2606", ombre: "#9c6a0c", milieu: "#d9a21b", lumiere: "#ffd84a", eclat: "#ffffff", gemme: "#19b8d3", gemmeClaire: "#e6fffb", motif: "prisme", periode: 10, prisme: ["#ff8a8f", "#ffd84a", "#c4f9cb", "#9cc2ff", "#d8c9ff"] },
};
export const estEnCases = (rang: RangDeStateres): rang is 4 | 5 | 6 => rang >= 4;
/** Le filet de l'image d'un lot en cases : l'encre de son cadre. */
export const FILET_DES_STATERES = "#3a2606";

function caseDeBande(k: TonsDOr, d: number, t: number): string {
  if (d === 0 || d === 3) return k.encre;
  if (k.motif === "raies") return d === 1 ? (t % 8 === 3 ? k.eclat : k.lumiere) : (t >> 1) % 2 ? k.ombre : k.milieu;
  if (k.motif === "crans") return d === 1 ? (t % 4 === 0 ? k.eclat : k.lumiere) : t % 4 === 2 ? k.ombre : k.milieu;
  return d === 1 ? (t % 5 === 0 ? k.eclat : k.lumiere) : k.prisme![Math.floor(t / 2) % k.prisme!.length]!;
}

/** Le cadre d'un lot en cases, en neuf parts (comme `cadreEnNeufParts` des cartes des cosmétiques), aux tons de l'or. */
export function cadreDesStateres(rang: 4 | 5 | 6): Planche {
  const k = CADRES[rang];
  const C = 6;
  const P = k.periode;
  const W = 2 * C + P;
  const g = new Planche(W, W);
  for (let y = 0; y < W; y++)
    for (let x = 0; x < W; x++) {
      if ((x < C || x >= C + P) && (y < C || y >= C + P)) continue;
      const hor = x >= C && x < C + P;
      const d = hor ? Math.min(y, W - 1 - y) : Math.min(x, W - 1 - x);
      if (d > 3) continue;
      R(g, x, y, 1, 1, caseDeBande(k, d, hor ? x - C : y - C));
    }
  const bossage = (ox: number, oy: number, sx: number, sy: number): void => {
    for (let b = 0; b < C; b++)
      for (let a = 0; a < C; a++) {
        let coul: string;
        if (a === 0 || b === 0 || a === C - 1 || b === C - 1) coul = k.encre;
        else if (a >= 2 && a <= 3 && b >= 2 && b <= 3) coul = a === 2 && b === 2 ? k.gemmeClaire : k.gemme;
        else if (a >= 2 && a <= 4 && b >= 2 && b <= 4) coul = (a + b) % 2 ? k.gemme : k.encre;
        else coul = a + b <= 5 ? k.lumiere : k.milieu;
        if (a === 1 && b === 1) coul = k.eclat;
        R(g, ox + sx * a, oy + sy * b, 1, 1, coul);
      }
    g.clearRect(ox, oy, 1, 1);
  };
  bossage(0, 0, 1, 1);
  bossage(W - 1, 0, -1, 1);
  bossage(0, W - 1, 1, -1);
  bossage(W - 1, W - 1, -1, -1);
  return g;
}

/** La largeur de l'écusson d'un lot : celui des cartes (20 cases) au lot 5, plus large au trésor (32 cases, trois gemmes). */
export const largeurDeLEcusson = (rang: 5 | 6): number => (rang === 6 ? 32 : 20);
/** L'écusson d'un lot 5 ou 6, en haut de sa carte (ou en bas, `bas`). */
export function ecussonDesStateres(rang: 5 | 6, bas = false): Planche {
  const k = CADRES[rang];
  const L = largeurDeLEcusson(rang);
  const g = new Planche(L, 4);
  const m = L / 2;
  const l = m - 1;
  const rg = (j: number): number => (bas ? 3 - j : j);
  const gemmes = rang === 6 ? [-8, 0, 8] : [0];
  for (let a = -l; a < l; a++) {
    const centre = gemmes.some((q) => Math.abs(a + 0.5 - q) < 2);
    R(g, m + a, rg(0), 1, 1, k.encre);
    R(g, m + a, rg(1), 1, 1, centre ? k.gemmeClaire : k.eclat);
    R(g, m + a, rg(2), 1, 1, centre ? k.gemme : k.lumiere);
    R(g, m + a, rg(3), 1, 1, k.encre);
  }
  for (const j of [1, 2]) {
    R(g, m - l - 1, rg(j), 1, 1, k.encre);
    R(g, m + l, rg(j), 1, 1, k.encre);
    for (const q of gemmes) {
      R(g, m + q - 3, rg(j), 1, 1, k.encre);
      R(g, m + q + 2, rg(j), 1, 1, k.encre);
    }
  }
  if (rang === 6) [-13, -12, -5, -4, 3, 4, 11, 12].forEach((a, i) => R(g, m + a, rg(2), 1, 1, k.prisme![i % 5]!));
  else for (const a of [-7, -6, 5, 6]) R(g, m + a, rg(2), 1, 1, k.milieu);
  return g;
}

/** Le motif de la feuille d'un lot en cases (blanc sur vide, qui se répète) : raies (4), paillettes (5), étoiles (6). */
export function motifDesStateres(rang: 4 | 5 | 6): Planche {
  const n = rang === 4 ? 8 : 16;
  const g = new Planche(n, n);
  if (rang === 4) {
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if ((x + y) % 8 < 2) R(g, x, y, 1, 1, "#ffffff");
  } else if (rang === 5) {
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

/** Le papier étoilé du trésor : quelques étoiles blanches et dorées sur 24 cases qui se répètent. */
export function etoilesDuTresor(): Planche {
  const n = 24;
  const g = new Planche(n, n);
  const h = hasard(7);
  for (let i = 0; i < 9; i++) {
    const x = 1 + Math.floor(h() * (n - 2));
    const y = 1 + Math.floor(h() * (n - 2));
    const coul = h() < 0.3 ? "#ffd84a" : "#ffffff";
    R(g, x, y, 1, 1, coul);
    if (h() < 0.3) croix(g, x, y, coul);
  }
  return g;
}

/** Le coin en cases de la bourse (lot 3) : celui de l'épique, à l'or. */
export function coinDOr(): Planche {
  const g = new Planche(11, 11);
  grilleSur(g, ["..kkkkkkkkk", ".kLLLLLLLmk", "kLwLmmmmmk.", "kLLGgkkkk..", "kLmgGk.....", "kLmkk......", "kLmk.......", "kLmk.......", "kLmk.......", "kmk........", "kk........."], { k: "#3a2606", L: "#ffdd80", m: "#d9a21b", w: "#ffffff", G: "#fffbe6", g: "#f2b632" }, 0, 0);
  return g;
}

/** Un éclat (étoile de cinq cases) qui s'allume lentement sur l'image des deux plus gros lots. */
export function eclatDOr(): Planche {
  const g = new Planche(5, 5);
  etoile(g, 2, 2);
  return g;
}

/** Les pions d'un lot, un par lot du booster (`total`, la liste du serveur) : autant de pleins que son rang. 7 cases par pion. */
export const largeurDesPions = (total: number): number => Math.max(1, total) * 7 - 2;
export function pionsDuLot(rang: number, total: number): Planche {
  const n = Math.max(1, Math.round(total));
  const g = new Planche(largeurDesPions(n), 5);
  for (let i = 0; i < n; i++) {
    const x = i * 7;
    if (i < rang) grilleSur(g, [".kkk.", "knygk", "kyggk", "kgGGk", ".kkk."], OR, x, 0);
    else grilleSur(g, [".eee.", "e...e", "e...e", "e...e", ".eee."], { e: "#8a7440" }, x, 0);
  }
  return g;
}

/** La jauge d'un rendu : dix crans, un par dizaine de pour cent rendue. 49 sur 5 cases. */
export function jaugeDuRendu(pourcent: number): Planche {
  const g = new Planche(49, 5);
  const n = Math.round(pourcent / 10);
  for (let i = 0; i < 10; i++) {
    const x = i * 5;
    R(g, x, 0, 4, 5, i < n ? "#3a2606" : "#7f8fbd");
    if (i < n) {
      R(g, x + 1, 1, 2, 3, OR.g);
      R(g, x + 1, 1, 2, 1, OR.n);
      R(g, x + 1, 3, 2, 1, OR.G);
    } else R(g, x + 1, 1, 2, 3, "#f7f9fe");
  }
  return g;
}

/** La pièce de 12 cases, seule : à côté du mot « statères ». */
export function petitePiece(): Planche {
  const g = new Planche(12, 12);
  piece(g, 12, 0, 0);
  return g;
}
