/**
 * Les figurants du ciel : ce qui passe au-dessus des toits, de jour (oies, étourneaux, cigognes, corbeaux, mouettes,
 * buse, héron, hirondelles, arc-en-ciel) et de nuit (chouette, chauves-souris, étoile filante). Dessins originaux, case par
 * case, tournés vers la droite. Design : Claude Fable 5.2.
 */
import { type Planche, alea } from "../../decor";
import { type Teintes, type Tons, cerner, figurant, ligne, ovale, poly, trame } from "./figurants-outils";
import type { Figurant } from "./type";

/* ---------- Un oiseau en vol, vu de côté ---------- */

interface Oiseau {
  corps: readonly [rx: number, ry: number];
  dessus: Tons;
  ventre: string;
  /** Le cou : sa longueur, de combien il monte, sa couleur. */
  cou: readonly [longueur: number, monte: number, couleur: string];
  tete: readonly [rayon: number, couleur: string];
  bec: readonly [longueur: number, couleur: string];
  queue: readonly [longueur: number, couleur: string];
  /** `large` : la largeur du bout de l'aile (0 : en pointe). */
  aile: { base: number; haut: number; recul: number; ton: string; bout: string; part: number; large?: number };
  /** Les pattes qui traînent derrière (cigogne, héron). */
  pattes?: readonly [longueur: number, couleur: string];
}

/** Les quatre images du battement : aile haute, à mi-course, basse, puis qui remonte. */
const BATTEMENT = [
  [1, -1],
  [1.6, -0.45],
  [1, 0.8],
  [1.5, 0.1],
] as const;

function oiseauEnVol(pl: Planche, t: Teintes, x: number, y: number, o: Oiseau, phase: number): void {
  const [rx, ry] = o.corps;
  const [mx, my] = BATTEMENT[((phase % 4) + 4) % 4]!;
  const sx = x + rx * 0.25;
  const sy = y - ry * 0.5;
  const bout: readonly [number, number] = [sx - o.aile.recul * mx, sy + o.aile.haut * my];
  const aile = (dx: number, ton: string, pointe: string): void => {
    const longueur = Math.hypot(bout[0] - sx, bout[1] - sy);
    const large = (o.aile.large ?? 0) / 2;
    poly(pl, [[sx + o.aile.base / 2 + dx, sy], [sx - o.aile.base / 2 + dx, sy], [bout[0] + dx - large, bout[1]], [bout[0] + dx + large, bout[1]]], (i, j) => (Math.hypot(i - dx - sx, j - sy) > longueur * (1 - o.aile.part) ? pointe : ton));
  };
  // L'aile du fond, plus sombre, ne se voit que levée.
  if (my < 0) aile(2, o.aile.bout, o.aile.bout);
  poly(pl, [[x - rx + 1, y - 1], [x - rx - o.queue[0], y - 1], [x - rx - o.queue[0], y + 0.6], [x - rx + 1, y + 1]], o.queue[1]);
  if (o.pattes) ligne(pl, x - rx + 1, y + 1, x - rx - o.pattes[0], y + 2, o.pattes[1]);
  const tx = x + rx + o.cou[0];
  const ty = y - o.cou[1];
  ligne(pl, x + rx - 2, y - 1, tx - 1, ty - 1, o.cou[2], 2);
  ovale(pl, x, y, rx, ry, (_i, j) => (j > y + ry * 0.2 ? o.ventre : j < y - ry * 0.45 ? o.dessus[0] : o.dessus[1]));
  ovale(pl, tx, ty, o.tete[0], o.tete[0], o.tete[1]);
  if (o.bec[0] > 0) {
    ligne(pl, Math.round(tx + o.tete[0]), Math.round(ty), Math.round(tx + o.tete[0]) + o.bec[0] - 1, Math.round(ty), o.bec[1]);
    pl.poser(Math.round(tx + o.tete[0] * 0.3), Math.round(ty - o.tete[0] * 0.3), t.trait);
  }
  aile(0, o.aile.ton, o.aile.bout);
}

const oie = (t: Teintes): Oiseau => ({
  corps: [6, 2.6],
  dessus: t.tons("#b09c82", "#8f7c66", "#6e5e4c"),
  ventre: t.c("#e2d8c4"),
  cou: [7, 1, t.c("#6a5a4a")],
  tete: [1.7, t.c("#5c4e40")],
  bec: [2, t.c("#e09a3a")],
  queue: [3, t.c("#efe8d8")],
  aile: { base: 6, haut: 9, recul: 3, ton: t.c("#7d6c58"), bout: t.c("#4c4034"), part: 0.4 },
});

const cigogne = (t: Teintes): Oiseau => ({
  corps: [7, 2.8],
  dessus: t.tons("#f6f1e4", "#ebe4d2", "#cfc7b4"),
  ventre: t.c("#d6cdb8"),
  cou: [9, 1, t.c("#ebe4d2")],
  tete: [1.8, t.c("#f2ecdc")],
  bec: [5, t.c("#d2482e")],
  queue: [3, t.c("#2a2a32")],
  aile: { base: 7, haut: 12, recul: 3, ton: t.c("#efe8d6"), bout: t.c("#2a2a32"), part: 0.5, large: 3 },
  pattes: [9, t.c("#d2482e")],
});

const corbeau = (t: Teintes): Oiseau => ({
  corps: [4.5, 2.2],
  dessus: t.tons("#4a4a5c", "#30303e", "#22222c"),
  ventre: t.c("#22222c", "#1c2040"),
  cou: [1, 0, t.c("#30303e")],
  tete: [2, t.c("#30303e")],
  bec: [2, t.c("#5a5a66")],
  queue: [4, t.c("#22222c", "#1c2040")],
  aile: { base: 5, haut: 7, recul: 2.5, ton: t.c("#3a3a4a"), bout: t.c("#1e1e28", "#1a1e3c"), part: 0.4, large: 3 },
});

const mouette = (t: Teintes): Oiseau => ({
  corps: [4.5, 2],
  dessus: t.tons("#fbf8f0", "#f1ede2", "#d8d4c8"),
  ventre: t.c("#dcd8cc"),
  cou: [1, 0, t.c("#f1ede2")],
  tete: [1.8, t.c("#f6f2e8")],
  bec: [2, t.c("#e2a83c")],
  queue: [3, t.c("#f1ede2")],
  aile: { base: 4, haut: 9, recul: 4, ton: t.c("#aeb8c6"), bout: t.c("#33363f"), part: 0.25 },
});

const heron = (t: Teintes): Oiseau => ({
  corps: [7, 2.6],
  dessus: t.tons("#a9b6c8", "#8795ac", "#6b7890"),
  ventre: t.c("#d9dde2"),
  cou: [3, 1, t.c("#d9dde2")],
  tete: [2, t.c("#e6e8ea")],
  bec: [6, t.c("#e0b040")],
  queue: [2, t.c("#6b7890")],
  aile: { base: 8, haut: 11, recul: 3, ton: t.c("#8795ac"), bout: t.c("#3d4860"), part: 0.45, large: 4 },
  pattes: [11, t.c("#b89a5a")],
});

/* ---------- Les petits oiseaux dessinés en lettres ---------- */

const HIRONDELLE = [
  ["....a.....", "....aa....", "q....aa...", ".qaaaaaab.", "q..wwwwr.."],
  ["q.........", ".qaaaaaab.", "q..wwwwr..", "....aa....", "...aa....."],
] as const;

const CHAUVE_SOURIS = [
  ["m.....e.e.....m", "mm....mmm....mm", "mmm..mmmmm..mmm", ".mmmmmmmmmmmmm.", "..m.mmmmmmm.m..", "......mmm......"],
  ["......e.e......", "......mmm......", "mmmmmmmmmmmmmmm", ".mmmmmmmmmmmmm.", "..m.m.mmm.m.m..", "..............."],
  ["......e.e......", ".....mmmmm.....", "..mmmmmmmmmmm..", ".mmm.mmmmm.mmm.", "mm....mmm....mm", "m.............m"],
] as const;

export const FIGURANTS_DU_CIEL: readonly Figurant[] = [
  figurant(
    {
      id: "vol-d-oies",
      nom: "un vol d'oies en V",
      description: "Sept oies sauvages en V, le cou tendu, les ailes qui battent lentement. Traverse tout le ciel d'un bord à l'autre, haut au-dessus des toits, plutôt à l'aube ou au crépuscule.",
      milieu: "ciel",
      allure: "vol",
      quand: ["aube", "jour", "crepuscule"],
      largeur: 92,
      hauteur: 80,
      images: 4,
    },
    (pl, t, image) => {
      const o = oie(t);
      for (let k = 3; k >= 1; k--) {
        oiseauEnVol(pl, t, 72 - 20 * k, 42 - 10 * k + (k % 2), o, image + k);
        oiseauEnVol(pl, t, 72 - 20 * k - 3, 42 + 10 * k - (k % 2), o, image + k + 2);
      }
      oiseauEnVol(pl, t, 72, 42, o, image);
      cerner(pl, t.trait);
    },
  ),
  figurant(
    {
      id: "nuee-d-etourneaux",
      nom: "une nuée d'étourneaux",
      description: "Plus de cent petits oiseaux sombres en un long ruban qui ondule et change de forme. Passe lentement haut dans le ciel, surtout au crépuscule, parfois à l'aube.",
      milieu: "ciel",
      allure: "lente",
      quand: ["aube", "jour", "crepuscule"],
      largeur: 150,
      hauteur: 80,
      images: 4,
    },
    (pl, t, image) => {
      const sombre = t.c("#2c2832", "#272c50");
      const phi = (image * Math.PI) / 2;
      for (let k = 0; k < 170; k++) {
        const u = alea(k, 7);
        const v = alea(k, 13) + alea(k, 29) - 1;
        const epais = 5 + 24 * Math.sin(Math.PI * u) * (0.62 + 0.38 * Math.sin(u * 9 + phi));
        const x = Math.round(3 + u * 143);
        const y = Math.round(40 + 12 * Math.sin(u * 6.283 + phi) + v * epais);
        const haut = (k + image) % 2 === 0 ? -1 : 0;
        pl.poser(x - 1, y + haut, sombre);
        pl.poser(x, y, sombre);
        pl.poser(x + 1, y + haut, sombre);
      }
    },
  ),
  figurant(
    {
      id: "cigognes-en-vol",
      nom: "deux cigognes en vol",
      description: "Deux cigognes blanches aux ailes bordées de noir, bec et pattes rouges, le cou tendu. Traversent le ciel à grands battements lents, de jour.",
      milieu: "ciel",
      allure: "vol",
      quand: ["aube", "jour", "crepuscule"],
      largeur: 76,
      hauteur: 42,
      images: 4,
    },
    (pl, t, image) => {
      oiseauEnVol(pl, t, 18, 14, cigogne(t), image + 2);
      oiseauEnVol(pl, t, 51, 28, cigogne(t), image);
      cerner(pl, t.trait);
    },
  ),
  figurant(
    {
      id: "corbeaux-en-vol",
      nom: "trois corbeaux en vol",
      description: "Trois corbeaux noirs qui volent ensemble, sans ordre. Passent d'un bois à l'autre au-dessus du village, de jour comme au crépuscule.",
      milieu: "ciel",
      allure: "vol",
      quand: ["aube", "jour", "crepuscule"],
      largeur: 66,
      hauteur: 40,
      images: 4,
    },
    (pl, t, image) => {
      oiseauEnVol(pl, t, 11, 12, corbeau(t), image + 1);
      oiseauEnVol(pl, t, 33, 26, corbeau(t), image + 3);
      oiseauEnVol(pl, t, 55, 13, corbeau(t), image);
      cerner(pl, t.trait);
    },
  ),
  figurant(
    {
      id: "mouettes",
      nom: "quatre mouettes",
      description: "Quatre mouettes blanches aux ailes grises à pointe noire. Viennent de la mer et vont vers le port, ou tournent au-dessus de l'eau.",
      milieu: "ciel",
      allure: "vol",
      quand: ["aube", "jour", "crepuscule"],
      largeur: 84,
      hauteur: 46,
      images: 4,
    },
    (pl, t, image) => {
      oiseauEnVol(pl, t, 10, 30, mouette(t), image + 2);
      oiseauEnVol(pl, t, 31, 13, mouette(t), image + 1);
      oiseauEnVol(pl, t, 52, 33, mouette(t), image + 3);
      oiseauEnVol(pl, t, 74, 17, mouette(t), image);
      cerner(pl, t.trait);
    },
  ),
  figurant(
    {
      id: "buse",
      nom: "une buse qui plane",
      description: "Une buse brune, ailes grandes ouvertes, vue d'en dessous, qui plane sans battre des ailes. Tourne lentement en rond très haut au-dessus des champs, en plein jour.",
      milieu: "ciel",
      allure: "lente",
      quand: ["jour"],
      largeur: 26,
      hauteur: 26,
      images: 2,
    },
    (pl, t, image) => {
      const [clair, brun, sombre] = t.tons("#dcc9a4", "#8a6842", "#5a4028");
      const haut = image === 0 ? 11 : 9;
      const bas = image === 0 ? 8 : 10;
      // Les deux ailes, un peu ramenées vers l'arrière, pâles dessous, bordées de sombre, aux bouts en doigts.
      for (const [sens, longueur] of [[-1, haut], [1, bas]] as const) {
        for (let k = 0; k <= longueur; k++) {
          const y = 12 + sens * (2 + k);
          const recul = Math.round(k * 0.35);
          const large = k > longueur - 2 ? 5 : 7 - Math.round(k * 0.2);
          for (let i = 0; i < large; i++) {
            const x = 16 - recul - i;
            const doigt = k > longueur - 2 && i % 2 === 1;
            if (!doigt) pl.poser(x, y, i === 0 || k > longueur - 3 ? sombre : i === large - 1 ? brun : (i + k) % 3 === 0 ? brun : clair);
          }
        }
      }
      // La queue en éventail, le corps, la tête.
      poly(pl, [[8, 12], [2, 9], [1, 12], [2, 15]], (i) => (i % 2 === 0 ? brun : clair));
      ovale(pl, 13, 12, 6, 2.6, (_i, j) => (j < 12 ? brun : clair));
      ovale(pl, 20, 12, 2.2, 2, brun);
      pl.rect(22, 12, 2, 1, t.c("#e2b04a"));
      pl.poser(20, 11, t.trait);
      cerner(pl, t.trait);
    },
  ),
  figurant(
    {
      id: "heron-en-vol",
      nom: "un héron en vol",
      description: "Un héron gris en vol, le cou replié, les longues pattes tendues derrière lui, à grands battements lents. Longe le ruisseau ou va d'une eau à l'autre, à l'aube ou au crépuscule surtout.",
      milieu: "ciel",
      allure: "vol",
      quand: ["aube", "jour", "crepuscule"],
      largeur: 42,
      hauteur: 26,
      images: 4,
    },
    (pl, t, image) => {
      const o = heron(t);
      oiseauEnVol(pl, t, 21, 14, o, image);
      // Le cou replié en S sous la tête, et l'aigrette noire.
      ovale(pl, 28, 15.5, 2.4, 1.8, o.ventre);
      ligne(pl, 28, 12, 30, 12, t.c("#2a2f3c"));
      cerner(pl, t.trait);
    },
  ),
  figurant(
    {
      id: "hirondelles",
      nom: "cinq hirondelles",
      description: "Cinq hirondelles vives, dos bleu nuit, ventre clair, queue en fourche. Filent bas au-dessus des toits et de la place, de jour et jusqu'au crépuscule.",
      milieu: "ciel",
      allure: "vol",
      quand: ["jour", "crepuscule"],
      largeur: 78,
      hauteur: 36,
      images: 2,
    },
    (pl, t, image) => {
      const couleurs = { a: t.c("#22304e", "#1e2a58"), b: t.c("#1a2238", "#161e44"), q: t.c("#22304e", "#1e2a58"), w: t.c("#efe6d2"), r: t.c("#b0522e") };
      const places = [[2, 20], [18, 4], [34, 26], [50, 10], [66, 22]] as const;
      places.forEach(([x, y], k) => {
        const i = (k + image) % 2;
        pl.lettres(x, y + (i === 0 ? 0 : 2), HIRONDELLE[i]!, couleurs);
      });
    },
  ),
  figurant(
    {
      id: "arc-en-ciel",
      nom: "un arc-en-ciel",
      description: "Un grand arc-en-ciel pâle, à moitié transparent, dont les pieds s'effacent. Immobile dans le ciel derrière le village, en plein jour, juste après une pluie fine.",
      milieu: "ciel",
      allure: "posee",
      quand: ["jour"],
      largeur: 320,
      hauteur: 160,
      images: 1,
    },
    (pl, t) => {
      const bandes = ["#e8857c", "#f0b074", "#f2de8c", "#9fd49c", "#8fbbe6", "#b3a0d8"].map((couleur) => t.c(couleur));
      for (let y = 0; y < 160; y++) {
        for (let x = 0; x < 320; x++) {
          const d = Math.hypot(x - 159.5, y - 160);
          if (d < 140 || d >= 158) continue;
          const densite = 0.6 * Math.min(1, (160 - y) / 70);
          if (densite > trame(x, y)) pl.poser(x, y, bandes[Math.min(5, Math.floor((158 - d) / 3))]!);
        }
      }
    },
  ),
  figurant(
    {
      id: "chouette-en-vol",
      nom: "une chouette en vol",
      description: "Une chouette brune à grosse tête ronde et au masque clair, vue de face, qui vole sans bruit sur ses ailes larges. Traverse le ciel ou passe d'un toit à un arbre, la nuit ou à la tombée du jour.",
      milieu: "ciel",
      allure: "vol",
      quand: ["crepuscule", "nuit"],
      largeur: 38,
      hauteur: 24,
      images: 4,
    },
    (pl, t, image) => {
      // Vue de face, comme elle vient vers nous : les deux ailes larges, la grosse tête ronde, le masque clair.
      const brun = t.tons("#cdae7e", "#a8875a", "#7e6240");
      const clair = t.c("#f0e2c2", "#a8a2ac");
      const bout = [3, 9, 17, 10][image]!;
      for (const sens of [-1, 1]) {
        const x = (d: number): number => 18.5 + sens * d;
        poly(pl, [[x(3), 10], [x(17), bout], [x(17), bout + 4], [x(4), 17]], (i, j) => {
          const loin = Math.abs(i - 18.5);
          return loin > 14 ? brun[2] : (Math.round(loin) + j) % 4 === 0 ? brun[2] : j < 10 + (bout - 10) * (loin / 17) + 2 ? brun[0] : brun[1];
        });
      }
      ovale(pl, 18.5, 15.5, 4.6, 5.4, (i, j) => ((i + j * 2) % 4 === 0 ? brun[1] : clair));
      ovale(pl, 18.5, 8.6, 5.8, 4.8, (_i, j) => (j < 6 ? brun[1] : brun[0]));
      ovale(pl, 16, 9, 2.4, 2.4, clair);
      ovale(pl, 21, 9, 2.4, 2.4, clair);
      pl.rect(15, 8, 2, 2, t.trait);
      pl.rect(20, 8, 2, 2, t.trait);
      pl.rect(18, 10, 1, 2, t.c("#c98a3a"));
      pl.rect(16, 21, 2, 1, t.c("#c98a3a"));
      pl.rect(20, 21, 2, 1, t.c("#c98a3a"));
      cerner(pl, t.trait);
    },
  ),
  figurant(
    {
      id: "chauves-souris",
      nom: "trois chauves-souris",
      description: "Trois petites chauves-souris aux ailes en dents, qui volettent en zigzag. Sortent au crépuscule et la nuit, autour des toits, de la tour ou des arbres.",
      milieu: "ciel",
      allure: "vol",
      quand: ["crepuscule", "nuit"],
      largeur: 60,
      hauteur: 30,
      images: 4,
    },
    (pl, t, image) => {
      const couleurs = { m: t.c("#4a3c52", "#3c3a62"), e: t.c("#4a3c52", "#3c3a62") };
      const places = [[1, 14], [22, 2], [44, 20]] as const;
      const suite = [0, 1, 2, 1] as const;
      places.forEach(([x, y], k) => {
        const i = suite[(k + image) % 4]!;
        pl.lettres(x, y + i, CHAUVE_SOURIS[i]!, couleurs);
      });
    },
  ),
  figurant(
    {
      id: "etoile-filante",
      nom: "une étoile filante",
      description: "Une étoile filante pâle et sa longue traîne qui s'efface. Glisse très lentement dans le haut du ciel, une seule fois, en pleine nuit seulement.",
      milieu: "ciel",
      allure: "lente",
      quand: ["nuit"],
      largeur: 64,
      hauteur: 22,
      images: 1,
    },
    (pl) => {
      // Ce qui éclaire garde sa couleur : un jaune pâle, jamais blanc.
      for (let s = 58; s >= 1; s--) {
        const x = 61 - s;
        const y = 19 - Math.round(s * 0.3);
        if (s < 7) pl.rect(x, y, 1, 2, "#e9dca6");
        else if (s < 18) pl.poser(x, y, "#c4bd9c");
        else if (s < 34) {
          if (s % 2 === 0) pl.poser(x, y, "#8e95ae");
        } else if (s % 3 === 0) pl.poser(x, y, "#5c6890");
      }
      pl.rect(60, 18, 3, 3, "#f3e7b4");
      pl.poser(63, 19, "#e9dca6");
      pl.poser(61, 17, "#e9dca6");
      pl.poser(61, 21, "#e9dca6");
    },
  ),
];
