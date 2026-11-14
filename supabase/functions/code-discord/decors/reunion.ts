/**
 * Le décor de /gaulois « reunion » : la salle de réunion du village, où le Gaulois est quand il parle en vocal avec le
 * clan. Un mur de torchis sur un soubassement de pierres, des poteaux et leurs torches, une fenêtre aux volets ouverts
 * qui montre le ciel du moment, une grande carte de territoires tendue au mur (des taches de couleurs, aucun vrai pays,
 * aucun mot), la longue table, son banc et ses bougies, un dallage sous les pieds. Aux quatre moments de la journée :
 * à l'aube la salle est mauve et les feux baissent, le jour tout est éteint et le soleil entre, au crépuscule la salle
 * rougit sous les torches, la nuit elle est bleue autour des feux. Dessin original de Claude Fable 5.2 pour le clan
 * [GAL], 14 novembre 2026 ; rien n'y est emprunté à une œuvre existante.
 */
import type { Moment, Phase } from "../scene.ts";
import { HAUTEUR, HORIZON, LARGEUR, PIEDS, Toile, grain, melanger, type DessinDuLieu } from "./commun.ts";

/* ---------- Les matières, à la lumière du jour ---------- */

const TORCHIS = { fond: "#b89d6e", grain: "#ab9063", ligne: "#a3885d", ombre: "#987f58" } as const;
const PIERRE = { claire: "#7d766a", moyenne: "#6c665c", joint: "#514c44" } as const;
const DALLE = { claire: "#a39478", moyenne: "#998a70", grain: "#8f8068", joint: "#857761", seuil: "#4a443a" } as const;
const BOIS = { clair: "#684627", moyen: "#472d19", sombre: "#2a1a10", poutre: "#3d2616", poutreHaut: "#523419" } as const;
const TABLE = { reflet: "#bd8950", dessus: "#ab7743", veine: "#9b6a3a", chant: "#855630", dessous: "#4f3219", pied: "#6f4827", piedOmbre: "#472d19" } as const;
const FER = "#45454f";
const FLAMME = { o: "#f58a1f", y: "#ffd75a", w: "#fff3b0" } as const;

/* ---------- Les quatre moments ---------- */

interface Ambiance {
  /** La clarté de la pièce (1 : plein jour), puis la teinte de son ombre et sa part. */
  clarte: number;
  teinte: string;
  part: number;
  /** Les feux : la force de leur lumière, le rayon de celle des torches et des bougies (0 : éteintes). */
  feux: number;
  torche: number;
  bougie: number;
  /** La flamme des torches : 0 éteinte, 1 basse, 2 haute. */
  flamme: 0 | 1 | 2;
  /** Le dehors, vu par la fenêtre : les cinq bandes du ciel, les collines, la palissade, une hutte (son chaume, son mur). */
  ciel: readonly [string, string, string, string, string];
  collines: string;
  palissade: string;
  chaume: readonly [string, string];
  mur: string;
  /** La lumière qui entre par la fenêtre et tombe sur le dallage. */
  rayon: string;
  partRayon: number;
}

const AMBIANCES: Readonly<Record<Phase, Ambiance>> = {
  aube: {
    clarte: 0.92,
    teinte: "#6c62a0",
    part: 0.38,
    feux: 0.5,
    torche: 9,
    bougie: 5,
    flamme: 1,
    ciel: ["#4f5c9c", "#8a7ab2", "#d48ea4", "#f2b190", "#fbd9a6"],
    collines: "#9a86ac",
    palissade: "#4c3a58",
    chaume: ["#a98a86", "#7c6274"],
    mur: "#b9a4a8",
    rayon: "#ffd2b4",
    partRayon: 0.36,
  },
  jour: {
    clarte: 0.98,
    teinte: "#8c8678",
    part: 0.1,
    feux: 0,
    torche: 0,
    bougie: 0,
    flamme: 0,
    ciel: ["#3b8ad4", "#4f9bdd", "#68ade6", "#84c0ee", "#a6d4f4"],
    collines: "#93c08c",
    palissade: "#6b4a2a",
    chaume: ["#d0ad5e", "#a8843c"],
    mur: "#d9c8a0",
    rayon: "#fff2c8",
    partRayon: 0.32,
  },
  crepuscule: {
    clarte: 0.8,
    teinte: "#5c2c3a",
    part: 0.42,
    feux: 0.72,
    torche: 15,
    bougie: 6,
    flamme: 2,
    ciel: ["#28285c", "#4b3b7a", "#8c5282", "#d87a62", "#f4b262"],
    collines: "#6c4a78",
    palissade: "#3a2440",
    chaume: ["#8a5258", "#5c3448"],
    mur: "#a8707a",
    rayon: "#ff9c54",
    partRayon: 0.34,
  },
  nuit: {
    clarte: 0.7,
    teinte: "#141f4a",
    part: 0.66,
    feux: 0.86,
    torche: 17,
    bougie: 8,
    flamme: 2,
    ciel: ["#0a1230", "#0c1638", "#0f1b42", "#12214c", "#162857"],
    collines: "#101a3e",
    palissade: "#080e26",
    chaume: ["#18244e", "#0e1634"],
    mur: "#22305e",
    rayon: "#7c94d8",
    partRayon: 0.24,
  },
};

/* ---------- Les repères de la salle ---------- */

/** Le haut du soubassement de pierres. */
const SOUBASSEMENT = 47;
/** Les deux poteaux (leur colonne de gauche), de part et d'autre du Gaulois. */
const POTEAUX = [31, 89] as const;
/** La fenêtre : son jour, de la colonne 7 à 24 et de la rangée 21 à 38. */
const FENETRE = { x: 7, y: 21, largeur: 18, hauteur: 18 } as const;
/** La table : le haut de son plateau. */
const PLATEAU = 52;
/** Les bougies de la table (leur colonne de gauche). */
const BOUGIES = [10, 39, 93, 116] as const;

/** La carte du mur : des territoires inventés, sans modèle. B bleu, R rouge, V vert, O ocre, P prune. */
const CARTE = [
  ".........................",
  "..BBBB..........VV.......",
  ".BBBBBBB.......VVVVV.....",
  ".BBBBBBBB.....VVVVVVVV...",
  "..BBBBBBRR...VVVVVVVVVV..",
  "..BBBBBRRRR...VVVVVVOOO..",
  "...BBBRRRRRR...VVVOOOOO..",
  "...PPRRRRRRR....OOOOOOO..",
  "..PPPPRRRRRR.....OOOOO...",
  "..PPPPPRRRR..BB...OOO....",
  ".PPPPPPPRR..BBB..........",
  ".PPPPPPP.....B.....RRR...",
  "..PPPPP...........RRRRR..",
  "...PPP....VVV....RRRRRR..",
  ".........VVVVV....RRRR...",
  "..........VVV............",
  ".........................",
  ".........................",
] as const;
const PAYS: Readonly<Record<string, string>> = { B: "#4f6ea6", R: "#b55a50", V: "#7d9a60", O: "#cda552", P: "#8a5e88" };
const PEAU_DE_CARTE = { mer: "#bdc9bd", bord: "#d8caa2", cote: "#95aaa6" } as const;

const borner = (v: number): number => Math.min(1, Math.max(0, v));

export const DECOR_REUNION: DessinDuLieu = (moment: Moment) => {
  const a = AMBIANCES[moment.phase];
  const astre = moment.astre;
  const toile = new Toile(a.teinte);

  /* ----- La lumière : l'ombre de la pièce, puis les feux en trois anneaux ----- */

  const feux: { x: number; y: number; rx: number; ry: number }[] = [];
  if (a.torche > 0) {
    for (const x of POTEAUX) {
      feux.push({ x: x + 2, y: 21, rx: a.torche, ry: a.torche * 0.92 });
      // La flaque de lumière au pied du poteau, sur le dallage.
      feux.push({ x: x + 2, y: 69, rx: a.torche + 3, ry: a.torche * 0.5 });
    }
  }
  if (a.bougie > 0) for (const x of BOUGIES) feux.push({ x: x + 1, y: 49, rx: a.bougie, ry: a.bougie * 0.85 });

  const eclairer = (x: number, y: number, couleur: string): string => {
    const sombre = melanger(melanger("#000000", couleur, a.clarte), a.teinte, a.part);
    let niveau = 0;
    for (const f of feux) {
      const d = Math.hypot((x + 0.5 - f.x) / f.rx, (y + 0.5 - f.y) / f.ry) + ((x + y) % 2 === 0 ? 0.05 : 0);
      if (d >= 1) continue;
      niveau = Math.max(niveau, d < 0.42 ? 1 : d < 0.72 ? 0.6 : 0.28);
    }
    return niveau === 0 ? sombre : melanger(sombre, melanger(couleur, "#ffb060", 0.14), niveau * a.feux);
  };
  /** Poser une matière, éclairée là où elle est. */
  const mat = (x: number, y: number, couleur: string) => toile.poser(x, y, eclairer(x, y, couleur));
  const pan = (x: number, y: number, largeur: number, hauteur: number, couleur: string | ((i: number, j: number) => string)) => {
    for (let j = y; j < y + hauteur; j++) for (let i = x; i < x + largeur; i++) mat(i, j, typeof couleur === "string" ? couleur : couleur(i, j));
  };

  /* ----- Le mur : torchis, puis soubassement de pierres ----- */

  pan(0, 0, LARGEUR, SOUBASSEMENT, (x, y) => {
    if (y < 7) return TORCHIS.ombre;
    if (y % 9 === 5 && grain(x, y) % 7 !== 0) return TORCHIS.ligne;
    return grain(x, y) % 19 === 0 ? TORCHIS.grain : TORCHIS.fond;
  });
  pan(0, SOUBASSEMENT, LARGEUR, HORIZON - SOUBASSEMENT, (x, y) => {
    const dy = y - SOUBASSEMENT;
    if (dy === 0) return PIERRE.joint;
    const lit = Math.floor((dy - 1) / 5);
    if ((dy - 1) % 5 === 4 || (x + lit * 7) % 14 === 0) return PIERRE.joint;
    const pierre = grain(Math.floor((x + lit * 7) / 14), lit + 3) % 5 < 2 ? PIERRE.claire : PIERRE.moyenne;
    // L'ombre de la table sur le bas du mur.
    return y >= PLATEAU + 5 && x >= 2 && x <= 121 ? melanger(pierre, "#000000", 0.2) : pierre;
  });

  /* ----- Le dallage, et la lumière de la fenêtre qui tombe dessus ----- */

  const pente = astre ? 1.3 - 1.5 * borner(astre.course) : 0.6;
  const portee = moment.phase === "nuit" ? (astre?.sorte === "lune" ? 15 : 0) : astre?.sorte === "soleil" ? 19 - Math.round(5 * borner(astre.hauteur)) : 14;
  const dansLeRayon = (x: number, y: number): boolean => {
    const t = y - HORIZON;
    if (t < 1 || t > portee) return false;
    const de = FENETRE.x + pente * t;
    const bord = x + 0.5 - de;
    if (bord < 0 || bord > FENETRE.largeur) return false;
    // Les deux bords du rayon, en damier.
    return (bord >= 1 && bord <= FENETRE.largeur - 1) || (x + y) % 2 === 0;
  };
  const RANGS = [
    { de: 61, a: 63, pas: 16, biais: 3 },
    { de: 65, a: 68, pas: 20, biais: 11 },
    { de: 70, a: 74, pas: 25, biais: 5 },
    { de: 76, a: 79, pas: 31, biais: 17 },
  ] as const;
  for (let y = HORIZON; y < HAUTEUR; y++) {
    const rang = RANGS.find((r) => y >= r.de && y <= r.a);
    for (let x = 0; x < LARGEUR; x++) {
      let couleur: string = DALLE.joint;
      if (y === HORIZON) couleur = DALLE.seuil;
      else if (rang && (x + rang.biais) % rang.pas !== 0) {
        couleur = grain(Math.floor((x + rang.biais) / rang.pas), rang.de) % 5 < 2 ? DALLE.claire : DALLE.moyenne;
        if (grain(x, y) % 43 === 0) couleur = DALLE.grain;
      }
      // L'ombre de la table et du banc sur les dalles.
      if (y >= 61 && y <= 66 && x >= 3 && x <= 120) couleur = melanger(couleur, "#000000", y === 66 && (x + y) % 2 === 0 ? 0 : 0.16);
      const eclairee = eclairer(x, y, couleur);
      toile.poser(x, y, dansLeRayon(x, y) ? melanger(eclairee, a.rayon, a.partRayon) : eclairee);
    }
  }

  /* ----- La fenêtre : ses volets ouverts, son cadre, et le dehors ----- */

  const fx = FENETRE.x;
  const fy = FENETRE.y;
  const fl = FENETRE.largeur;
  const fh = FENETRE.hauteur;
  for (const vx of [fx - 5, fx + fl + 1]) {
    pan(vx, fy - 1, 4, fh + 2, (x, y) => {
      if (y === fy - 1 || y === fy + fh) return BOIS.moyen;
      if (y === fy + 3 || y === fy + fh - 4) return FER;
      return (x - vx) % 2 === 0 ? "#7a5230" : "#684627";
    });
  }
  pan(fx - 1, fy - 1, fl + 2, fh + 2, BOIS.moyen);
  pan(fx - 2, fy + fh + 1, fl + 4, 1, "#8a5a30");
  pan(fx - 2, fy + fh + 2, fl + 4, 1, BOIS.poutreHaut);
  // Le ciel, en cinq bandes cousues d'un damier.
  const BANDES = [0, 3, 6, 9, 12] as const;
  for (let j = 0; j < fh; j++) {
    let b = 0;
    for (let i = 1; i < BANDES.length; i++) if (j >= BANDES[i]!) b = i;
    const couture = b < 4 && j + 1 === BANDES[b + 1];
    for (let i = 0; i < fl; i++) toile.poser(fx + i, fy + j, a.ciel[couture && (i + j) % 2 === 0 ? b + 1 : b]!);
  }
  if (moment.phase === "nuit") {
    for (const [i, j] of [[2, 2], [7, 1], [12, 4], [15, 1], [4, 6], [10, 8], [16, 7]] as const) toile.poser(fx + i, fy + j, "#c8d2f0");
  } else if (moment.phase === "jour") {
    toile.bloc(fx + 9, fy + 9, 6, 1, "#eef6fc");
    toile.bloc(fx + 10, fy + 8, 3, 1, "#eef6fc");
    toile.bloc(fx + 1, fy + 5, 4, 1, "#dcecf8");
  }
  // L'astre, à sa place dans le ciel de la fenêtre : il se lève à gauche, se couche à droite.
  if (astre) {
    const cx = fx + 2 + Math.round(borner(astre.course) * (fl - 5));
    const cy = fy + 11 - Math.round(borner(astre.hauteur) * 8);
    for (let j = -2; j <= 2; j++) {
      for (let i = -2; i <= 2; i++) {
        const x = cx + i;
        const y = cy + j;
        if (x < fx || x >= fx + fl || y < fy || y >= fy + fh || Math.abs(i) + Math.abs(j) > 3) continue;
        if (astre.sorte === "soleil") {
          const bas = moment.phase !== "jour";
          toile.poser(x, y, i <= 0 && j <= 0 && i + j >= -1 ? (bas ? "#ffe9a0" : "#fff8d6") : bas ? "#ffc65a" : "#ffe27a");
        } else if (Math.hypot(i + 1.3, j + 0.9) > 2.1) {
          toile.poser(x, y, i + j >= 2 ? "#b4bfdf" : "#e8ecf8");
        }
      }
    }
  }
  // Les collines, un toit de chaume du village, la palissade.
  for (let i = 0; i < fl; i++) {
    const colline = 13 + Math.round(1.2 * Math.sin(i / 3.1 + 1));
    for (let j = colline; j < fh; j++) toile.poser(fx + i, fy + j, a.collines);
  }
  for (let i = 0; i < fl; i++) {
    for (let j = i % 3 === 1 ? 14 : 15; j < fh; j++) toile.poser(fx + i, fy + j, a.palissade);
  }
  toile.poser(fx + 9, fy + 9, a.chaume[1]);
  for (let r = 0; r < 4; r++) {
    for (let i = -1 - r; i <= 1 + r; i++) toile.poser(fx + 9 + i, fy + 10 + r, i > 0 ? a.chaume[1] : a.chaume[0]);
  }
  toile.bloc(fx + 6, fy + 14, 7, 4, a.mur);
  toile.bloc(fx + 9, fy + 15, 2, 3, a.palissade);

  /* ----- La carte des territoires, tendue entre deux baguettes ----- */

  const mx = 95;
  const my = 9;
  for (const x of [mx + 3, mx + 23]) pan(x, 5, 1, 3, "#8a7a5a");
  pan(mx, my, 27, 24, (x, y) => (x === mx || x === mx + 26 || y === my || y === my + 23 ? PEAU_DE_CARTE.bord : PEAU_DE_CARTE.mer));
  const pays = (i: number, j: number): string => CARTE[j]?.[i] ?? ".";
  CARTE.forEach((ligne, j) => {
    for (let i = 0; i < ligne.length; i++) {
      const lettre = ligne[i]!;
      if (lettre !== ".") mat(mx + 1 + i, my + 3 + j, PAYS[lettre]!);
      else if ([pays(i - 1, j), pays(i + 1, j), pays(i, j - 1), pays(i, j + 1)].some((voisin) => voisin !== ".")) mat(mx + 1 + i, my + 3 + j, PEAU_DE_CARTE.cote);
    }
  });
  for (const y of [my - 1, my + 24]) {
    pan(mx - 1, y, 29, 1, BOIS.clair);
    mat(mx - 1, y, BOIS.sombre);
    mat(mx + 27, y, BOIS.sombre);
  }

  for (const [cx, teinte] of [[104, PAYS["B"]!], [114, PAYS["R"]!]] as const) {
    for (let j = -4; j <= 4; j++) {
      for (let i = -4; i <= 4; i++) {
        const d = i * i + j * j;
        if (d > 18) continue;
        mat(cx + i, 40 + j, d > 11 ? BOIS.poutre : d <= 1 ? "#8d95a6" : i * j >= 0 ? teinte : "#ddd8cc");
      }
    }
  }

  /* ----- La charpente : la poutre, les poteaux, leurs goussets, les torches ----- */

  pan(0, 0, LARGEUR, 5, (_x, y) => (y === 4 ? BOIS.sombre : y === 0 ? BOIS.poutreHaut : BOIS.poutre));
  for (const x of POTEAUX) {
    pan(x, 5, 4, HORIZON - 5, (i) => (i === x ? BOIS.clair : i === x + 3 ? BOIS.sombre : BOIS.moyen));
    for (let r = 0; r < 4; r++) {
      for (let i = 0; i < 4 - r; i++) {
        mat(x - 1 - i, 5 + r, i === 3 - r ? BOIS.sombre : BOIS.moyen);
        mat(x + 4 + i, 5 + r, i === 3 - r ? BOIS.sombre : BOIS.moyen);
      }
    }
    // La torche : son manche, sa bague de fer, sa tête d'étoupe.
    pan(x + 1, 26, 1, 9, "#8a5a30");
    pan(x + 2, 26, 1, 9, "#6a4424");
    pan(x, 30, 4, 1, FER);
    pan(x, 34, 4, 1, FER);
    pan(x, 23, 4, 3, (i, j) => (j === 23 ? "#6e665c" : (i + j) % 2 === 0 ? "#2c2420" : "#40342a"));
  }

  /* ----- La longue table, ce qui est posé dessus, et son banc ----- */

  for (const x of [4, 26, 95, 117]) pan(x, PLATEAU + 5, 3, 9, (i) => (i === x + 2 ? TABLE.piedOmbre : TABLE.pied));
  pan(2, PLATEAU, 120, 2, (x, y) => (grain(x >> 2, y) % 4 === 0 ? TABLE.veine : TABLE.dessus));
  pan(2, PLATEAU + 2, 120, 1, TABLE.reflet);
  pan(2, PLATEAU + 3, 120, 1, TABLE.chant);
  pan(2, PLATEAU + 4, 120, 1, TABLE.dessous);
  // Un pichet de terre et un gobelet de bois, à gauche.
  const gres = { c: "#a8623a", C: "#c27a4c", k: "#7a4226", b: "#8a5a30", B: "#a87542" };
  const poserGrille = (x: number, y: number, lignes: readonly string[], couleurs: Readonly<Record<string, string>>) => {
    lignes.forEach((ligne, j) => {
      for (let i = 0; i < ligne.length; i++) {
        const couleur = couleurs[ligne[i]!];
        if (couleur) mat(x + i, y + j, couleur);
      }
    });
  };
  poserGrille(18, PLATEAU - 6, [".cc..", ".Cc..", "CCck.", "CCckk", "CCck.", "CCck.", ".cc.."], gres);
  poserGrille(25, PLATEAU - 2, ["BbB", "Bbb", ".b."], gres);
  // Une carte déroulée et deux pions, à droite.
  pan(100, PLATEAU, 12, 2, (x) => (x === 100 || x === 111 ? "#b89c6a" : "#e4d7b2"));
  pan(103, PLATEAU - 1, 1, 2, PAYS["B"]!);
  pan(108, PLATEAU - 1, 1, 2, PAYS["R"]!);
  // Les bougies : hautes le soir, basses à l'aube.
  const cire = moment.phase === "aube" ? 3 : 5;
  for (const x of BOUGIES) {
    pan(x, PLATEAU + 1 - cire, 1, cire, "#e9e2cf");
    pan(x + 1, PLATEAU + 1 - cire, 1, cire, "#c9c0a8");
  }
  // Le banc, devant la table.
  for (const x of [9, 34, 88, 113]) pan(x, 64, 2, 5, (i) => (i === x ? TABLE.pied : TABLE.piedOmbre));
  pan(5, 61, 114, 1, "#a87542");
  pan(5, 62, 114, 1, TABLE.chant);
  pan(5, 63, 114, 1, TABLE.dessous);

  /* ----- Les flammes, par-dessus tout : elles éclairent, rien ne les assombrit ----- */

  if (a.flamme === 2) {
    for (const x of POTEAUX) toile.grille(x - 1, 15, ["..oo..", "..oy..", ".oyyo.", ".oyyo.", "oyywyo", "oywwyo", "oyywyo", ".oyyo."], FLAMME);
  } else if (a.flamme === 1) {
    for (const x of POTEAUX) toile.grille(x - 1, 19, ["..o...", ".oyo..", ".oyyo.", ".oywo."], FLAMME);
  }
  for (const x of BOUGIES) {
    const haut = PLATEAU + 1 - cire;
    if (a.bougie > 0) {
      toile.bloc(x, haut - 2, 2, 2, FLAMME.y);
      toile.poser(x, haut - 3, FLAMME.o);
    } else {
      toile.poser(x, haut - 1, "#3a3028");
    }
  }

  return toile.decor(melanger(eclairer(LARGEUR / 2, PIEDS, DALLE.moyenne), "#000000", 0.42));
};
