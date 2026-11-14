/**
 * Le décor de /gaulois « place » : la place du village, dehors — une grande hutte au toit de chaume et ses tonneaux à
 * gauche, la palissade et les sapins du fond, une hutte plus loin sous un arbre, le puits et le feu de camp à droite, le
 * chemin de terre battue sous les pieds du Gaulois —, aux quatre moments de la journée : aube rose et dorée dans la
 * brume, plein jour, crépuscule orangé aux premiers feux, nuit bleue aux fenêtres allumées. Dessin original de Claude
 * Fable 5.2 pour le clan [GAL], 14 novembre 2026 ; rien n'y est emprunté à une œuvre existante.
 */
import type { Astre, Moment, Phase } from "../scene.ts";
import { HAUTEUR, HORIZON, LARGEUR, Toile, grain, melanger, type DessinDuLieu } from "./commun.ts";

/** Les feux : les seules couleurs vives du décor, les mêmes à toute heure. */
const FEU = { feu: "#f2b632", clair: "#ffdd80", coeur: "#fff1a8", braise: "#c2661a", rouge: "#d9512c", orange: "#f08a2a", cendre: "#4a3a34" } as const;

/** Les matières en plein jour, proches de celles de la place du site, un peu adoucies : c'est un fond. */
const JOUR = {
  pieu: { fond: "#96683c", clair: "#b58450", sombre: "#70482a", contour: "#4f321c", corde: "#d0bc88" },
  chaume: { fond: "#d6b055", clair: "#eccb72", sombre: "#b89244", rang: "#a5803a", bord: "#7c5f2a" },
  mur: { fond: "#d2b07a", clair: "#e6c690", sombre: "#b08c5e", poteau: "#8f6c48" },
  porte: { creux: "#3d2616", cadre: "#6a4424" },
  herbe: { fond: "#4f9648", clair: "#69ad58", sombre: "#3f7f3e", loin: "#7db86a" },
  terre: { fond: "#a88a60", clair: "#bc9e72", sombre: "#8c7050" },
  pierre: { fond: "#9aa0a8", clair: "#bcc2ca", sombre: "#70767e" },
  bois: { fond: "#8a5a30", clair: "#a87440", sombre: "#63401f", fer: "#4a4e58" },
  feuilles: { fond: "#3d8a4c", clair: "#5aa860", sombre: "#2c6c3c" },
  tronc: { fond: "#6a4826", sombre: "#4f3218" },
  fleur: { a: "#f2efe0", b: "#ecd35e" },
};
type Matieres = typeof JOUR;

/** Les mêmes matières sous une autre lumière : `ton` change chaque couleur ; `clair` dit si c'est un ton éclairé. */
function teinter(matieres: Matieres, ton: (couleur: string, clair: boolean) => string): Matieres {
  const sortie: Record<string, Record<string, string>> = {};
  for (const [nom, tons] of Object.entries(matieres)) {
    const teintes: Record<string, string> = {};
    for (const [cle, couleur] of Object.entries(tons)) teintes[cle] = ton(couleur, cle === "clair");
    sortie[nom] = teintes;
  }
  return sortie as unknown as Matieres;
}

const clarte = (c: string): number => (0.2126 * parseInt(c.slice(1, 3), 16) + 0.7152 * parseInt(c.slice(3, 5), 16) + 0.0722 * parseInt(c.slice(5, 7), 16)) / 255;

/** Ce qui change d'un moment à l'autre. `cote` : d'où vient la lumière (-1 de la gauche, 1 de la droite). */
interface Lumiere {
  ciel: readonly [string, string, string, string, string];
  collineLoin: string;
  collinePres: string;
  foret: string;
  foretClair: string;
  matieres: Matieres;
  cote: -1 | 1;
  nuages: readonly [clair: string, ombre: string] | null;
  /** La lueur du soleil à l'horizon : sa colonne quand le soleil n'est pas au ciel, et sa couleur. */
  horizon: { x: number; couleur: string } | null;
  ombres: number;
}

const LUMIERES: Readonly<Record<Phase, Lumiere>> = {
  aube: {
    ciel: ["#6a78b8", "#9c8cbe", "#dc9fb4", "#f8bc9e", "#fde0a6"],
    collineLoin: "#d4acb8",
    collinePres: "#a898ae",
    foret: "#667c8c",
    foretClair: "#7e929a",
    matieres: teinter(JOUR, (c, clair) => {
      const t = melanger(melanger(c, "#6a5a86", 0.2), "#f7b9a4", 0.15);
      return clair ? melanger(t, "#ffe2ac", 0.32) : t;
    }),
    cote: -1,
    nuages: ["#fbd3bc", "#cf98ac"],
    horizon: { x: 30, couleur: "#ffe6a8" },
    ombres: 3,
  },
  jour: {
    ciel: ["#4a90d0", "#5e9fd8", "#77b1e2", "#93c4ea", "#b4d8f2"],
    collineLoin: "#94bcc6",
    collinePres: "#74a894",
    foret: "#3f8062",
    foretClair: "#52966f",
    matieres: JOUR,
    cote: -1,
    nuages: ["#f4f8fc", "#cfe0ee"],
    horizon: null,
    ombres: 2,
  },
  crepuscule: {
    ciel: ["#3a3272", "#6a4484", "#b0567a", "#e8784e", "#f6a84e"],
    collineLoin: "#8a5c78",
    collinePres: "#644868",
    foret: "#35344c",
    foretClair: "#4a3f52",
    matieres: teinter(JOUR, (c, clair) => {
      const t = melanger(melanger(c, "#3a2238", 0.42), "#f08040", 0.14);
      return clair ? melanger(t, "#ffa860", 0.3) : t;
    }),
    cote: 1,
    nuages: ["#f29a68", "#7c4c82"],
    horizon: { x: 90, couleur: "#ffc070" },
    ombres: 3,
  },
  nuit: {
    ciel: ["#0a1230", "#0c1638", "#0f1b42", "#12214c", "#162857"],
    collineLoin: "#111e4a",
    collinePres: "#0e1a42",
    foret: "#0a1434",
    foretClair: "#0d1a3e",
    // Tout passe dans les bleus du site, du plus sombre au plus clair selon la clarté de la matière.
    matieres: teinter(JOUR, (c) => melanger(melanger("#060b1f", "#4258a0", clarte(c) ** 1.4), c, 0.08)),
    cote: 1,
    nuages: null,
    horizon: null,
    ombres: 0,
  },
};

/** Les nuages, dessinés à la main : « c » le dessus éclairé, « o » le dessous dans l'ombre. */
const GRAND_NUAGE = ["......cccc........", "....cccccccc.ccc..", "..cccccccccccccccc", ".cccccccccccccccc.", "..oooooooooooooo.."];
const PETIT_NUAGE = ["....ccc....", "..ccccccc..", ".ccccccccc.", "..ooooooo.."];

/** Le puits : son petit toit de chaume, ses deux poteaux, le treuil, la corde et le seau, la margelle de pierre. */
const PUITS = [
  "......b......",
  ".....bCb.....",
  "...bbCCcbb...",
  ".bbCCCcccsbb.",
  "bCCCCccccsssb",
  ".bbbbbbbbbbb.",
  ".P.........p.",
  ".PtttttttttP.",
  ".P....k....p.",
  ".P....k....p.",
  ".P....k....p.",
  ".P...fuf...p.",
  ".P...uUu...p.",
  "SSSSSSSSSSSSg",
  "gggGgggggGggg",
  "gggGgggggGggg",
  "GGGGGGGGGGGGG",
  "gGgggggGggggG",
  "gGgggggGggggG",
  "GGGGGGGGGGGGG",
];

/** Le feu de camp : la flamme (grande, petite, ou des braises), puis les bûches dans leur rond de pierres. */
const FLAMME_GRANDE = ["......o......", ".....oyo.....", ".....oyo.....", "....oyyyo....", "....oywyo....", "...royyyor...", "...rroyorr..."];
const FLAMME_PETITE = [".............", ".............", ".............", "......o......", ".....oyo.....", "....royor....", "....rroor...."];
const BRAISES = [".............", ".............", ".............", ".............", ".............", ".............", "....r.or.r..."];
const FOYER = ["..SbBBbBBbS..", ".sSbbBBBbbSs.", "..sS.sSs.Ss.."];

/** Où passe l'astre : il monte à gauche du Gaulois, passe au-dessus de sa tête et redescend à droite, jamais sous le logo. */
function placeDeLAstre(astre: Astre): [number, number] {
  const ecart = Math.max(-1.1, Math.min(1.1, 2 * astre.course - 1));
  const x = 60 + 30 * Math.sign(ecart) * Math.abs(ecart) ** 0.4;
  const y = 43 - 37 * Math.max(-0.2, Math.min(1, astre.hauteur));
  return [Math.round(x), Math.round(y)];
}

export const DECOR_PLACE: DessinDuLieu = (moment: Moment) => {
  const phase = moment.phase;
  const L = LUMIERES[phase];
  const M = L.matieres;
  const nuit = phase === "nuit";
  const feux = phase === "nuit" || phase === "crepuscule";
  // D'où vient la lumière : -1 de la gauche, 1 de la droite ; la nuit, du côté de la lune.
  const cote: -1 | 1 = nuit && moment.astre?.sorte === "lune" ? (moment.astre.course < 0.5 ? -1 : 1) : L.cote;
  const toile = new Toile(L.ciel[0]);
  const poser = (x: number, y: number, c: string) => toile.poser(x, y, c);
  const bloc = (x: number, y: number, l: number, h: number, c: string) => toile.bloc(x, y, l, h, c);
  /** Teinte une case déjà posée. */
  const voiler = (x: number, y: number, couleur: string, part: number) => {
    const dessous = toile.lire(x, y);
    if (dessous && part > 0) poser(x, y, melanger(dessous, couleur, part));
  };
  /** Une lueur ronde, en trois marches et un bord en damier. */
  const lueur = (cx: number, cy: number, rx: number, ry: number, couleur: string, force: number) => {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const d = Math.hypot((x - cx) / rx, (y - cy) / ry);
        if (d >= 1) continue;
        const part = d < 0.4 ? force : d < 0.7 ? force * 0.62 : (x + y) % 2 === 0 ? force * 0.4 : force * 0.2;
        voiler(x, y, couleur, part);
      }
    }
  };

  /* ---------- Le ciel ---------- */

  // Cinq teintes, du haut vers l'horizon, fondues en treize marches cousues par une rangée en damier.
  const marche = (y: number): number => Math.min(12, Math.floor((y / 46) * 12));
  const teinteDuCiel = (n: number): string => {
    const p = Math.min(4, n / 3);
    const i = Math.floor(p);
    return melanger(L.ciel[i] ?? L.ciel[4], L.ciel[Math.min(4, i + 1)] ?? L.ciel[4], p - i);
  };
  for (let y = 0; y < HORIZON; y++) {
    const n = marche(y);
    const couture = marche(y + 1) !== n;
    for (let x = 0; x < LARGEUR; x++) poser(x, y, teinteDuCiel(couture && (x + y) % 2 === 0 ? n + 1 : n));
  }
  // Les étoiles : toutes la nuit, les plus vives encore là à l'aube et déjà là au crépuscule.
  if (phase !== "jour") {
    const limite = nuit ? 44 : 18;
    for (let y = 1; y < limite; y++) {
      for (let x = 0; x < LARGEUR; x++) {
        const g = grain(x * 3 + 1, y * 5 + 2);
        if (g % 691 === 0) voiler(x, y, "#9fb0ee", nuit ? 0.85 : 0.4);
        else if (nuit && g % 167 === 0) voiler(x, y, "#5c70b8", 0.6);
      }
    }
    if (nuit) {
      for (const [x, y] of [[33, 14], [86, 22], [112, 6], [24, 31]] as const) {
        poser(x, y, "#c9d4ff");
        for (const d of [-1, 1]) {
          voiler(x + d, y, "#7f95e0", 0.6);
          voiler(x, y + d, "#7f95e0", 0.6);
        }
      }
    }
  }
  // La lueur du soleil à l'horizon, à l'aube et au crépuscule, qu'il soit déjà levé ou pas encore.
  const astre = moment.astre;
  const [ax, ay] = astre ? placeDeLAstre(astre) : [0, 0];
  if (L.horizon) {
    const gx = astre?.sorte === "soleil" ? ax : L.horizon.x;
    lueur(gx, 46, 46, 13, L.horizon.couleur, 0.34);
    lueur(gx, 45, 22, 8, L.horizon.couleur, 0.3);
  }
  if (astre?.sorte === "soleil") {
    const bas = phase !== "jour";
    const rayon = bas ? 4.6 : 3.7;
    const coeur = phase === "crepuscule" ? "#ffd27a" : phase === "aube" ? "#fff0b8" : "#fff6c4";
    const bord = phase === "crepuscule" ? "#ff9c4a" : phase === "aube" ? "#ffcf86" : "#ffe27a";
    for (let y = ay - 8; y <= ay + 8; y++) {
      for (let x = ax - 8; x <= ax + 8; x++) {
        const d = Math.hypot(x - ax, y - ay);
        if (d <= rayon - 1.3) poser(x, y, coeur);
        else if (d <= rayon) poser(x, y, bord);
        else if (d <= rayon + 1.2) voiler(x, y, bord, 0.45);
        else if (d <= rayon + 2.6 && (x + y) % 2 === 0) voiler(x, y, bord, 0.28);
      }
    }
  } else if (astre) {
    // La lune : un croissant, pâle dans le ciel clair de l'aube ou du soir.
    const force = nuit ? 1 : 0.6;
    for (let y = ay - 7; y <= ay + 7; y++) {
      for (let x = ax - 7; x <= ax + 7; x++) {
        const d = Math.hypot(x - ax, y - ay);
        const creux = Math.hypot(x - (ax - 2.8), y - (ay - 1.8)) <= 4.7;
        if (d <= 5.3 && !creux) voiler(x, y, Math.hypot(x - (ax - 1), y - (ay - 0.5)) <= 5.1 ? "#e3e9ff" : "#a9b7ec", force);
        else if (nuit && d <= 7.2 && !creux && (x + y) % 2 === 0) voiler(x, y, "#7f95e0", 0.14);
      }
    }
  }
  // Les nuages, et deux oiseaux en plein jour.
  if (L.nuages) {
    const [clair, ombre] = L.nuages;
    toile.grille(97, 7, GRAND_NUAGE, { c: clair, o: ombre });
    toile.grille(21, 24, PETIT_NUAGE, { c: clair, o: ombre });
    if (phase !== "jour") {
      // De longs nuages plats près de l'horizon, éclairés par en dessous.
      const dessous = phase === "aube" ? "#ffe2b0" : "#ffb468";
      for (const [x0, y, l] of phase === "aube" ? ([[70, 37, 34], [88, 40, 30], [2, 39, 18]] as const) : ([[18, 36, 30], [4, 40, 26], [96, 38, 26]] as const)) {
        for (let x = x0; x < x0 + l; x++) {
          if (x > x0 + 1 && x < x0 + l - 2) voiler(x, y - 1, ombre, 0.6);
          voiler(x, y, dessous, 0.55);
        }
      }
    } else {
      const oiseau = melanger(L.ciel[1], "#22304e", 0.6);
      for (const [x, y] of [[103, 18], [108, 21]] as const) {
        poser(x, y, oiseau);
        poser(x + 1, y + 1, oiseau);
        poser(x + 2, y, oiseau);
      }
    }
  }

  /* ---------- Le loin : collines, brume, sapins ---------- */

  for (let x = 0; x < LARGEUR; x++) {
    const loin = Math.round(46 - 2.6 * Math.sin(x / 15 + 0.9) - 1.6 * Math.sin(x / 6.5 + 2));
    for (let y = loin; y < HORIZON; y++) poser(x, y, L.collineLoin);
    const pres = Math.round(49.5 - 2 * Math.sin(x / 11 + 3.4) - 1.2 * Math.sin(x / 4.7));
    for (let y = pres; y < HORIZON; y++) poser(x, y, L.collinePres);
  }
  // La brume du matin, couchée au pied des collines.
  if (phase === "aube") {
    for (let x = 0; x < LARGEUR; x++) {
      for (let y = 47; y <= 50; y++) {
        const plein = y === 48 || y === 49;
        if (plein || (x + y) % 2 === 0) voiler(x, y, "#fbe3d2", plein ? 0.5 : 0.34);
      }
    }
  }
  // Les sapins : des pointes serrées, un versant éclairé.
  for (let i = 0, x = -2; x < LARGEUR + 4; i++, x += 5) {
    const g = grain(i, 77);
    const cx = x + (g % 3);
    const haut = 49 + (g % 4);
    for (let y = haut; y < HORIZON; y++) {
      const demi = Math.floor((y - haut) / 2) + ((y - haut) % 3 === 2 ? 1 : 0);
      for (let dx = -demi; dx <= demi; dx++) poser(cx + dx, y, dx * cote > 0 ? L.foretClair : L.foret);
    }
  }
  for (let x = 0; x < LARGEUR; x++) for (let y = 55; y < HORIZON; y++) if (toile.lire(x, y) !== L.foretClair) poser(x, y, L.foret);

  /* ---------- Le sol : l'herbe, et le chemin de terre battue qui vient de la porte du village ---------- */

  const milieu = 62;
  for (let y = HORIZON; y < HAUTEUR; y++) {
    const demi = 4 + (y - HORIZON) * 1.8;
    const gauche = milieu - demi - ((grain(y, 91) % 3) - 1);
    const droite = milieu + demi + ((grain(y, 17) % 3) - 1);
    for (let x = 0; x < LARGEUR; x++) {
      const g = grain(x, y);
      let couleur: string;
      if (x >= gauche && x <= droite) {
        const bord = x < gauche + 1.5 || x > droite - 1.5;
        couleur = y <= 62 ? M.terre.clair : M.terre.fond;
        if (bord && g % 2 === 0) couleur = M.terre.sombre;
        else if (g % 17 === 0) couleur = M.terre.clair;
        else if (g % 29 === 0) couleur = M.terre.sombre;
        if (y >= 77 && (x + y) % 2 === 0) couleur = M.terre.sombre;
      } else {
        couleur = y <= 61 ? M.herbe.loin : M.herbe.fond;
        if (y > 61 && g % 19 === 0) couleur = M.herbe.clair;
        else if (y > 61 && g % 23 === 0) couleur = M.herbe.sombre;
        if (y >= 77 && (x + y) % 2 === 0) couleur = M.herbe.sombre;
      }
      poser(x, y, couleur);
    }
  }
  // Des touffes d'herbe, et des fleurs quand il fait clair.
  for (let y = 64; y < 78; y++) {
    for (let x = 1; x < LARGEUR - 1; x++) {
      const g = grain(x + 5, y + 3);
      const herbe = (c: string | undefined) => c === M.herbe.fond || c === M.herbe.clair || c === M.herbe.sombre;
      if (!herbe(toile.lire(x, y)) || !herbe(toile.lire(x - 1, y - 1)) || !herbe(toile.lire(x + 1, y - 1))) continue;
      if (g % 61 === 0) {
        poser(x, y, M.herbe.sombre);
        poser(x - 1, y - 1, M.herbe.clair);
        poser(x + 1, y - 1, M.herbe.clair);
      } else if (!feux && g % 149 === 0) {
        poser(x, y, g % 2 === 0 ? M.fleur.a : M.fleur.b);
      }
    }
  }
  /** L'ombre portée d'une chose sur le sol, du côté opposé à la lumière ; plus longue quand le soleil est bas. */
  const ombrePortee = (x0: number, x1: number, y: number) => {
    for (let dy = 0; dy < L.ombres; dy++) {
      const glisse = -cote * (1 + dy * 2);
      for (let x = x0 + glisse; x <= x1 + glisse; x++) if (dy === 0 || (x + y + dy) % 2 === 0) voiler(x, y + dy, "#141022", 0.24);
    }
  };
  ombrePortee(5, 27, 66);
  ombrePortee(104, 120, 63);
  ombrePortee(88, 100, 74);
  ombrePortee(27, 36, 69);

  /* ---------- L'arbre, derrière la palissade ---------- */

  bloc(119, 42, 3, 14, M.tronc.fond);
  bloc(119 + (cote > 0 ? 0 : 2), 42, 1, 14, M.tronc.sombre);
  const boules = [[118, 36, 8.4], [111, 40, 4.8], [122, 31, 5.6]] as const;
  for (let y = 22; y <= 46; y++) {
    for (let x = 104; x < LARGEUR; x++) {
      const boule = boules.find(([bx, by, r]) => Math.hypot(x - bx, y - by) <= r);
      if (!boule) continue;
      const [bx, by, r] = boule;
      const v = (y - by) / r - (cote * (x - bx)) / r * 0.7;
      let couleur = v < -0.4 ? M.feuilles.clair : v > 0.45 ? M.feuilles.sombre : M.feuilles.fond;
      const g = grain(x, y);
      if (g % 9 === 0) couleur = couleur === M.feuilles.fond ? M.feuilles.sombre : M.feuilles.fond;
      poser(x, y, couleur);
    }
  }

  /* ---------- La palissade : des pieux taillés en pointe, inégaux, liés par une corde ; sa porte au bout du chemin ---------- */

  const hauteurs = [0, 2, 1, 0, 1, 2, 0, 1, 2, 0, 1];
  const tons = cote < 0 ? [M.pieu.clair, M.pieu.fond, M.pieu.sombre] : [M.pieu.sombre, M.pieu.fond, M.pieu.clair];
  for (let i = 0, x = 0; x < LARGEUR; i++, x += 4) {
    if (x >= 56 && x < 68) continue;
    const haut = 52 + (hauteurs[i % hauteurs.length] ?? 0);
    poser(x + 1, haut - 1, M.pieu.fond);
    for (let y = haut; y <= 61; y++) {
      tons.forEach((ton, dx) => poser(x + dx, y, y === haut && dx !== 1 ? M.pieu.fond : ton));
      poser(x + 3, y, M.pieu.contour);
    }
    bloc(x, 56, 3, 1, M.pieu.corde);
  }
  for (const x of [53, 68]) {
    bloc(x, 48, 3, 14, M.pieu.fond);
    bloc(x + (cote < 0 ? 2 : 0), 48, 1, 14, M.pieu.sombre);
    bloc(x, 47, 3, 1, M.pieu.contour);
  }
  for (let x = 0; x < LARGEUR; x++) if ((x < 56 || x >= 68) && x % 2 === 0) voiler(x, 62, "#141022", 0.2);

  /* ---------- Les huttes rondes au toit de chaume ---------- */

  /** Une hutte : `cx` son milieu, `pied` la rangée de son seuil, `k` sa taille, et sa fenêtre si elle en a une. */
  const hutte = (cx: number, pied: number, k: number, fenetre: boolean) => {
    const toit = Math.round(21 * k);
    const mur = Math.round(11 * k);
    const demiToit = Math.round(17 * k);
    const demiMur = Math.round(12 * k);
    const hautMur = pied - mur;
    // Le mur de torchis, ses rangs, l'ombre du toit.
    for (let y = hautMur; y <= pied; y++) {
      for (let x = cx - demiMur; x <= cx + demiMur; x++) {
        const d = (x - cx) * cote;
        let couleur = d > demiMur * 0.35 ? M.mur.clair : d < -demiMur * 0.45 ? M.mur.sombre : M.mur.fond;
        if ((pied - y) % 3 === 0 && (x + y) % 7 !== 0) couleur = couleur === M.mur.clair ? M.mur.fond : M.mur.sombre;
        if (y < hautMur + 2 || Math.abs(x - cx) === demiMur || y === pied) couleur = M.mur.poteau;
        poser(x, y, couleur);
      }
    }
    // Le toit : un cône de chaume, en couches, plus clair du côté de la lumière.
    for (let r = 0; r <= toit; r++) {
      const y = hautMur - toit + r;
      const demi = Math.round(1 + (r * (demiToit - 1)) / toit);
      for (let x = cx - demi; x <= cx + demi; x++) {
        const d = (x - cx) * cote;
        let couleur = d > demi * 0.3 ? M.chaume.clair : d < -demi * 0.35 ? M.chaume.sombre : M.chaume.fond;
        if (r % 4 === 3 && (x + r) % 5 !== 0) couleur = couleur === M.chaume.clair ? M.chaume.fond : M.chaume.rang;
        if (Math.abs(x - cx) === demi || r === toit) couleur = M.chaume.bord;
        poser(x, y, couleur);
      }
    }
    for (let x = cx - demiToit + 1; x < cx + demiToit; x += 2) poser(x, hautMur + 1, M.chaume.bord);
    // Le nœud de paille du faîte.
    bloc(cx - 1, hautMur - toit - 2, 3, 2, M.chaume.bord);
    poser(cx, hautMur - toit - 3, M.chaume.bord);
    // La porte : sombre le jour, rougie par les braises à l'aube, éclairée par le feu du dedans le soir et la nuit.
    const demiPorte = k > 0.8 ? 3 : 2;
    const haut = pied - Math.round(8 * k);
    bloc(cx - demiPorte - 1, haut - 1, demiPorte * 2 + 2, pied - haut + 2, M.porte.cadre);
    bloc(cx - demiPorte, haut, demiPorte * 2, pied - haut + 1, feux ? FEU.feu : M.porte.creux);
    if (feux) {
      bloc(cx - demiPorte + 1, haut + 2, demiPorte * 2 - 2, pied - haut - 1, FEU.clair);
      if (k > 0.8) bloc(cx - 1, pied - 2, 2, 3, FEU.coeur);
    } else if (phase === "aube") {
      bloc(cx - demiPorte, pied - 2, demiPorte * 2, 3, melanger(M.porte.creux, FEU.braise, 0.45));
      bloc(cx - demiPorte + 1, pied - 1, demiPorte * 2 - 2, 2, melanger(M.porte.creux, FEU.orange, 0.6));
    }
    if (fenetre) {
      const fx = cx + demiPorte + 3;
      bloc(fx - 1, hautMur + 2, 4, 4, M.porte.cadre);
      bloc(fx, hautMur + 3, 2, 2, feux ? FEU.clair : M.porte.creux);
    }
  };

  // Au fond à droite : une hutte plus petite, sous l'arbre.
  hutte(112, 62, 0.66, true);

  // La torche plantée devant la palissade : éteinte le jour, allumée dès le crépuscule.
  bloc(40, 47, 2, 17, M.bois.sombre);
  if (feux) {
    lueur(40.5, 45, 9, 9, FEU.feu, nuit ? 0.3 : 0.2);
    bloc(39, 45, 4, 2, FEU.braise);
    bloc(39, 42, 4, 3, FEU.feu);
    bloc(40, 40, 2, 4, FEU.clair);
    poser(40, 39, FEU.feu);
    bloc(40, 43, 2, 1, FEU.coeur);
    bloc(40, 47, 2, 17, melanger(M.bois.sombre, "#5e3b1a", 0.6));
  } else {
    bloc(39, 44, 4, 3, melanger(M.bois.sombre, FEU.cendre, 0.7));
    bloc(40, 43, 2, 1, melanger(M.bois.sombre, FEU.cendre, 0.7));
  }

  // À gauche : la grande hutte, et ses tonneaux.
  hutte(16, 65, 0.9, true);
  if (feux) lueur(16, 68, 11, 4.5, FEU.feu, nuit ? 0.36 : 0.24);
  const tonneau = (x: number, y: number, l: number, h: number) => {
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < l; dx++) {
        const bord = dx === 0 || dx === l - 1;
        const eclaire = cote < 0 ? dx === 1 || dx === 2 : dx === l - 2 || dx === l - 3;
        let couleur = bord ? M.bois.sombre : eclaire ? M.bois.clair : M.bois.fond;
        if (dy === 0) couleur = bord ? M.bois.fond : M.bois.clair;
        else if (dy === 2 || dy === h - 2) couleur = M.bois.fer;
        else if (dy === h - 1) couleur = M.bois.sombre;
        poser(x + dx, y + dy, couleur);
      }
    }
  };
  tonneau(27, 58, 6, 9);
  tonneau(31, 61, 6, 8);

  /* ---------- Le puits ---------- */

  toile.grille(88, 54, PUITS, {
    b: M.chaume.bord,
    C: cote < 0 ? M.chaume.clair : M.chaume.sombre,
    c: M.chaume.fond,
    s: cote < 0 ? M.chaume.sombre : M.chaume.clair,
    P: cote < 0 ? M.bois.clair : M.bois.sombre,
    p: cote < 0 ? M.bois.sombre : M.bois.clair,
    t: M.bois.fond,
    k: M.pieu.corde,
    f: M.bois.fer,
    u: M.bois.fond,
    U: M.bois.clair,
    S: M.pierre.clair,
    g: M.pierre.fond,
    G: M.pierre.sombre,
  });

  /* ---------- Le feu de camp, dans son rond de terre ---------- */

  for (let y = 72; y <= 78; y++) {
    for (let x = 104; x < LARGEUR; x++) {
      const d = Math.hypot((x - 114) / 9, (y - 75) / 3);
      if (d < 1 && (d < 0.8 || (x + y) % 2 === 0)) poser(x, y, grain(x, y) % 7 === 0 ? M.terre.sombre : M.terre.fond);
    }
  }
  if (feux) lueur(114, 73, 17, 8, FEU.feu, nuit ? 0.38 : 0.24);
  const fumee = (x0: number, y0: number, hauteur: number, force: number) => {
    for (let i = 0; i < hauteur; i++) {
      const x = x0 + Math.round(1.6 * Math.sin(i / 2.2)) + Math.floor(i / 5);
      const part = force * (1 - i / (hauteur + 2));
      voiler(x, y0 - i, "#e9e2e6", part);
      if (i % 3 !== 0) voiler(x + 1, y0 - i, "#e9e2e6", part * 0.6);
    }
  };
  const couleursDuFeu = { r: FEU.rouge, o: FEU.orange, y: FEU.clair, w: FEU.coeur };
  if (feux) toile.grille(108, 67, FLAMME_GRANDE, couleursDuFeu);
  else if (phase === "jour") {
    fumee(114, 69, 9, 0.4);
    toile.grille(108, 67, FLAMME_PETITE, couleursDuFeu);
  } else {
    fumee(114, 72, 12, 0.5);
    toile.grille(108, 67, BRAISES, { r: FEU.braise, o: FEU.orange });
  }
  toile.grille(108, 74, FOYER, { S: M.pierre.clair, s: M.pierre.fond, B: M.bois.fond, b: M.bois.sombre });
  // À l'aube, la fumée du premier feu monte de la grande hutte.
  if (phase === "aube") fumee(16, 31, 12, 0.55);

  return toile.decor(melanger(M.terre.sombre, "#05060f", 0.42));
};
