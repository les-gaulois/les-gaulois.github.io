/**
 * Les dessins en pixels du pass et de la forge de « Mon Gaulois » (dessin de Claude Fable 5.2, 21 novembre 2026) : le booster
 * d'un palier, à la couleur de la rareté de son objet, la page du calendrier de présence, l'étendard du défi du clan, le
 * sceau d'un palier pris, la route de pavés et ses dalles numérotées, la coche d'une mission, et la place creusée du creuset
 * de la fusion. Tout est peint case par case sur une `Planche`, sans navigateur : l'écran en fait des images
 * (`urlDeLaPlanche` de `dans-la-page.ts`). Voir « Le kit du jeu » dans docs/DESIGN.md.
 *
 * Le booster du pass est le booster surprise reteint : il garde son anatomie (rangées 0 à 9 la bande de déchirure, 10 à 77
 * le corps, 78 à 87 le bas serti, le haut du corps uni), dont dépend l'animation d'ouverture validée par le pilote.
 */
import { paquetDuBooster } from "./boosters-dessins";
import { ecrire } from "./ecriture";
import { PAL } from "./palette";
import { Planche, R, cerne, ell, grille, lig, lireCouleur, melange, rr } from "./planche";

export type RareteDuPass = "commun" | "peu-commun" | "epique" | "mystique" | "legendaire" | "saison";
export type ThemeDuPass = "clair" | "sombre";

/** Les six raretés d'un palier, de la plus courante à l'objet de la saison. */
export const RARETES_DU_PASS: readonly RareteDuPass[] = ["commun", "peu-commun", "epique", "mystique", "legendaire", "saison"];

/* ---------- Le booster d'un palier ---------- */

/**
 * Une robe du booster du pass, dans l'ordre des teintes du booster surprise : le haut, le corps, la trame, le bas, le bord
 * sombre, le reflet, l'éclat (et le bord clair), le bord doux, les trois tons de la bande, son filet, puis la fenêtre du
 * médaillon et son ombre.
 */
type Robe = readonly [string, string, string, string, string, string, string, string, string, string, string, string, string, string];

/** Les teintes du booster surprise (`ROBES.surprise` de boosters-dessins.ts), dans le même ordre : ce qu'on reteint. */
const ROBE_SURPRISE: Robe = ["#3f7dff", "#2f6bff", "#1f55e0", "#0b3fc4", "#07257a", "#8fb6ff", "#cfe2ff", "#9cc2ff", "#ff5a6a", "#e0263a", "#a8101f", "#f6f1e3", "#131d4d", "#0a1033"];

const ROBES_DU_PASS: Readonly<Record<RareteDuPass, Robe>> = {
  // Bleu ciel, bande marine.
  commun: ["#56abff", "#4aa3ff", "#318ae8", "#1b68c2", "#0d3f80", "#b4dcff", "#e6f4ff", "#b4dcff", "#4a6cf0", "#1c3fc0", "#0a2278", "#f6f1e3", "#0c2a5c", "#061a3e"],
  // Indigo, bande turquoise.
  "peu-commun": ["#4a5ef2", "#3a4fe8", "#2c3ecb", "#1f2ca3", "#121a6b", "#9ba8ff", "#dbe0ff", "#a9b4ff", "#b4f4ff", "#3fd0f0", "#1590b8", "#f6f1e3", "#141a5c", "#0b0f3c"],
  // Violet, bande crème à filets d'or.
  epique: ["#a65eff", "#9b4dff", "#8038e0", "#5f22b8", "#3c1280", "#d6b6ff", "#f1e4ff", "#d0adff", "#ffffff", "#f6f1e3", "#cfc9b8", "#ffc61a", "#2c1260", "#1c0a42"],
  // Rouge, bande d'or.
  mystique: ["#ff4059", "#f52a45", "#d41a36", "#a30f26", "#6a0716", "#ffa3ad", "#ffdde0", "#ffb0b8", "#fff1a8", "#ffc61a", "#b97a0c", "#fffbe6", "#4a0a16", "#30050d"],
  // Or, bande marine.
  legendaire: ["#eaa820", "#f2b632", "#d9981b", "#b97a0c", "#7a4d06", "#ffe58a", "#fffbe6", "#ffe9a0", "#3d5ac0", "#18265e", "#0a1230", "#fffbe6", "#3a2606", "#231503"],
  // Or chaud et nacré : l'objet de la saison. Bande rouge, reflets de nacre rose et vert d'eau.
  saison: ["#f29440", "#f8a548", "#e2853a", "#b9582a", "#7a2f14", "#ffdcec", "#e2fff6", "#ffd2b0", "#ff5a6a", "#e0263a", "#a8101f", "#fffbe6", "#4a1a1a", "#300e10"],
};

const cle = (r: number, v: number, b: number): number => (r << 16) | (v << 8) | b;

/** L'emblème du pass, dans la fenêtre du médaillon : deux chevrons d'or, comme l'insigne de niveau de la barre du jeu. */
function chevrons(g: Planche): void {
  for (const haut of [35, 40])
    for (let d = 0; d < 7; d++)
      for (const x of [29 - d, 30 + d]) {
        R(g, x, haut + d, 1, 3, PAL.y);
        R(g, x, haut + d, 1, 1, PAL.Y);
        R(g, x, haut + d + 2, 1, 1, PAL.O);
      }
}

/** L'emblème de l'objet de la saison : une couronne à trois pointes, un grain rouge au front. */
const COURONNE = [
  "..Y.....YY.....y..",
  ".kyk...kyyk...kOk.",
  ".kyk...kyOk...kOk.",
  ".kyyk.kyyOOk.kyOk.",
  ".kyyykyyyOOOkyOOk.",
  ".kyyyyyyyOOOOOOOk.",
  ".kyyyyyyRrOOOOOOk.",
  ".kOOOOOOrrOOOOook.",
  ".kkkkkkkkkkkkkkkk.",
  ".kYyyyyyyyyOOOOok.",
  ".kkkkkkkkkkkkkkkk.",
];

/** Le booster d'un palier du pass, scellé, à la couleur de la rareté de son objet : 60 × 88 cases. */
export function boosterDuPass(rarete: RareteDuPass): Planche {
  const g = paquetDuBooster("surprise").copie();
  const robe = ROBES_DU_PASS[rarete];
  const vers = new Map<number, readonly [number, number, number]>();
  ROBE_SURPRISE.forEach((couleur, i) => {
    const de = lireCouleur(couleur);
    const a = lireCouleur(robe[i]!);
    vers.set(cle(de[0], de[1], de[2]), [a[0], a[1], a[2]]);
  });
  // La robe, case par case : seul le corps change, les deux sertis d'argent restent ceux de la famille.
  const d = g.data;
  for (let y = 10; y < 78; y++)
    for (let x = 0; x < g.width; x++) {
      const i = (y * g.width + x) * 4;
      if (!d[i + 3]) continue;
      const a = vers.get(cle(d[i]!, d[i + 1]!, d[i + 2]!));
      if (!a) continue;
      d[i] = a[0];
      d[i + 1] = a[1];
      d[i + 2] = a[2];
    }
  // La nacre de la saison : un semis de grains clairs sur le bas du corps, sous le médaillon (le haut reste uni).
  if (rarete === "saison") {
    const corps = lireCouleur(robe[1]);
    for (let y = 56; y < 70; y++)
      for (let x = 6; x < 54; x++) {
        const c = g.couleur(x, y);
        if (c && c[0] === corps[0] && c[1] === corps[1] && c[2] === corps[2] && (x * 3 + y * 7) % 13 === 0) R(g, x, y, 1, 1, (x + y) % 2 ? "#ffe6d2" : "#fff6c8");
      }
  }
  // Le médaillon : la fenêtre est vidée de son torque, et reçoit l'emblème du pass.
  rr(g, 19, 33, 22, 16, 2, robe[12]);
  R(g, 21, 33, 18, 1, robe[13]);
  if (rarete === "saison") g.drawImage(grille(COURONNE, PAL), 21, 36);
  else chevrons(g);
  return g;
}

/* ---------- Le calendrier de présence ---------- */

export type EtatDuJour = "fait" | "vide" | "aujourdhui" | "cadeau" | "cadeau-fait";

export const JOUR_LARGEUR = 18;
export const JOUR_HAUTEUR = 21;

/** Le petit booster du septième jour, dans la page du cadeau. */
const MINI_BOOSTER = ["k.kk.kk.k", "kttkttktk", "kkkkkkkkk", "kcBBBBRbk", "kcBBBRwbk", "kcBBRwBbk", "kcBRwBBbk", "kcRwBBBbk", "kkkkkkkkk", "kttkttktk", "k.kk.kk.k"];

/** La coche d'un jour fait : deux traits épais, clairs, ombrés d'une case. */
function cocheDuJour(g: Planche, x: number, y: number, coul: string, ombre: string): void {
  for (const [dy, c] of [[1, ombre], [0, coul]] as const) {
    lig(g, x, y + 3 + dy, x + 2, y + 5 + dy, c, 2);
    lig(g, x + 3, y + 5 + dy, x + 8, y + dy, c, 2);
  }
}

/** Une case du calendrier de présence : une petite page de calendrier à deux anneaux, son numéro écrit dedans. 18 × 21 cases. */
export function jourDuCalendrier(n: number, etat: EtatDuJour): Planche {
  const g = new Planche(JOUR_LARGEUR, JOUR_HAUTEUR);
  const cadeau = etat === "cadeau" || etat === "cadeau-fait";
  const papier = etat === "fait" ? PAL.G : cadeau ? PAL.y : "#f8faff";
  const pli = etat === "fait" ? PAL.g : cadeau ? PAL.O : "#c7d3ee";
  const tete = etat === "fait" ? PAL.g : cadeau ? "#d9981b" : PAL.R;
  const teteClaire = etat === "fait" ? "#2aa858" : cadeau ? "#f0b730" : "#ff5a6a";
  const teteSombre = etat === "fait" ? "#166b36" : cadeau ? PAL.o : PAL.r;
  // La page : son cerne, son papier, le bas plus sombre et un coin corné.
  rr(g, 0, 1, 18, 20, 2, PAL.k);
  rr(g, 1, 2, 16, 18, 1, papier);
  R(g, 2, 19, 14, 1, pli);
  R(g, 15, 17, 2, 2, pli);
  R(g, 14, 18, 1, 1, pli);
  // L'en-tête, et ses deux anneaux qui dépassent.
  rr(g, 1, 2, 16, 5, 1, tete);
  R(g, 2, 2, 14, 1, teteClaire);
  R(g, 1, 6, 16, 1, teteSombre);
  for (const x of [3, 12]) {
    R(g, x, 0, 3, 5, PAL.k);
    R(g, x + 1, 1, 1, 3, PAL.t);
    R(g, x + 1, 1, 1, 1, "#ffffff");
  }
  if (etat === "aujourdhui") {
    // Le jour à venir : un liseré d'or tout autour du papier.
    R(g, 1, 7, 16, 1, PAL.j);
    R(g, 1, 19, 16, 1, PAL.j);
    R(g, 1, 7, 1, 12, PAL.j);
    R(g, 16, 7, 1, 12, PAL.j);
    R(g, 2, 8, 14, 1, PAL.q);
  }
  if (etat === "fait") cocheDuJour(g, 4, 9, "#ffffff", PAL.g);
  else if (etat === "cadeau") g.drawImage(grille(MINI_BOOSTER, PAL), 5, 8);
  else if (etat === "cadeau-fait") {
    // Le cadeau ouvert : un sceau vert, coché, sur la page d'or.
    ell(g, 9, 13, 5.6, 5.6, PAL.k);
    ell(g, 9, 13, 4.6, 4.6, PAL.g);
    ell(g, 8.6, 12.6, 3.6, 3.6, PAL.G);
    lig(g, 6, 13, 7, 14, "#ffffff", 2);
    lig(g, 8, 14, 11, 11, "#ffffff", 2);
  } else {
    const t = ecrire(String(Math.max(0, Math.round(n))), "#0a1230");
    g.drawImage(t, Math.round(9 - t.width / 2), 10);
  }
  return g;
}

/* ---------- L'étendard du défi du clan ---------- */

export const ETENDARD_LARGEUR = 40;
export const ETENDARD_HAUTEUR = 56;

/** La pointe dorée de la hampe. */
const POINTE = ["...k...", "..kYk..", "..kyk..", ".kyyOk.", ".kyyOk.", ".kyOOk.", "..kOk..", ".kkkkk.", ".kyyOk.", ".kkkkk."];

/** Un éclat à quatre branches. */
function eclat(g: Planche, x: number, y: number, grand: boolean): void {
  const r = grand ? 2 : 1;
  R(g, x - r, y, 2 * r + 1, 1, PAL.Y);
  R(g, x, y - r, 1, 2 * r + 1, PAL.Y);
  R(g, x, y, 1, 1, "#ffffff");
}

/**
 * L'étendard du défi du clan : une hampe à pointe dorée, une traverse, et une toile à queue d'aronde qui se remplit d'or de
 * bas en haut à hauteur de `part` (0 à 1). `rempli` : défi atteint, tout l'or et trois éclats. 40 × 56 cases.
 */
export function etendardDuDefi(part: number, rempli: boolean): Planche {
  const g = new Planche(ETENDARD_LARGEUR, ETENDARD_HAUTEUR);
  const p = rempli ? 1 : Math.min(1, Math.max(0, Number.isFinite(part) ? part : 0));
  // La hampe, son pied, sa pointe.
  R(g, 4, 9, 3, 45, PAL.k);
  R(g, 5, 10, 1, 43, PAL.N);
  for (let y = 14; y < 53; y += 6) R(g, 5, y, 1, 2, PAL.M);
  rr(g, 1, 52, 9, 4, 1, PAL.k);
  R(g, 2, 53, 7, 2, PAL.M);
  R(g, 2, 53, 7, 1, PAL.N);
  g.drawImage(grille(POINTE, PAL), 2, 0);
  // La toile : du haut (13) à ses deux pointes (47), l'entaille de la queue d'aronde au milieu.
  const X0 = 9;
  const X1 = 34;
  const HAUT = 13;
  const bas = (x: number): number => Math.round(37 + Math.abs(x - 21.5) * 0.8);
  const BAS = bas(X0);
  const niveau = BAS + 1 - Math.round((BAS + 1 - HAUT) * p);
  const dedans = (x: number, y: number): boolean => x >= X0 && x <= X1 && y >= HAUT && y <= bas(x);
  for (let x = X0; x <= X1; x++)
    for (let y = HAUT; y <= bas(x); y++) {
      const bord = !dedans(x - 1, y) || !dedans(x + 1, y) || !dedans(x, y + 1) || y === HAUT;
      const lisere = !bord && (!dedans(x - 2, y) || !dedans(x + 2, y) || !dedans(x, y + 2) || !dedans(x - 1, y + 1) || !dedans(x + 1, y + 1));
      const plein = y >= niveau;
      let coul: string;
      if (bord) coul = PAL.k;
      else if (lisere) coul = plein ? "#b97a0c" : PAL.B;
      else if (plein) coul = y === niveau && p < 1 ? PAL.Y : y === niveau + 1 && p < 1 ? PAL.q : (x * 3 + y * 5) % 17 === 0 ? PAL.q : x >= X1 - 4 || y >= bas(x) - 3 ? "#f0ae12" : PAL.j;
      else coul = y < HAUT + 3 ? "#c9d3ee" : x >= X1 - 4 ? "#dfe5f5" : (x + y * 2) % 9 === 0 ? "#dfe5f5" : "#f3f6fd";
      R(g, x, y, 1, 1, coul);
    }
  // La traverse dorée où pend la toile, et son pommeau.
  R(g, 6, 10, 31, 4, PAL.k);
  R(g, 7, 11, 29, 2, PAL.O);
  R(g, 7, 11, 29, 1, PAL.y);
  R(g, 12, 11, 8, 1, PAL.Y);
  rr(g, 35, 9, 4, 6, 1, PAL.k);
  R(g, 36, 10, 2, 4, PAL.y);
  R(g, 37, 11, 1, 3, PAL.O);
  R(g, 36, 10, 1, 1, PAL.Y);
  if (rempli) {
    eclat(g, 15, 21, true);
    eclat(g, 29, 30, false);
    eclat(g, 36, 22, false);
    eclat(g, 13, 40, false);
  }
  return g;
}

/* ---------- Le sceau d'un palier pris ---------- */

export const SCEAU_COTE = 15;

/** Le sceau d'un palier pris : de la cire verte au bord festonné, une coche crème, tamponné sur sa case. 15 × 15 cases. */
export function sceauDuPalier(): Planche {
  const g = new Planche(SCEAU_COTE, SCEAU_COTE);
  const c = 7.5;
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4 + Math.PI / 8;
    ell(g, c + Math.cos(a) * 4.9, c + Math.sin(a) * 4.9, 1.7, 1.7, PAL.g);
  }
  ell(g, c, c, 5.6, 5.6, PAL.g);
  ell(g, c, c, 4.6, 4.6, "#2aa858");
  ell(g, c - 0.4, c - 0.4, 3.9, 3.9, PAL.G);
  // Un reflet sur la cire, en haut à gauche.
  R(g, 4, 4, 2, 1, PAL.h);
  R(g, 4, 5, 1, 1, PAL.h);
  // La coche, crème, ombrée d'une case.
  for (const [dy, coul] of [[1, PAL.g], [0, PAL.w]] as const) {
    lig(g, 4, 7 + dy, 6, 9 + dy, coul);
    lig(g, 5, 7 + dy, 6, 8 + dy, coul);
    lig(g, 7, 8 + dy, 10, 5 + dy, coul);
    lig(g, 7, 9 + dy, 10, 6 + dy, coul);
  }
  return cerne(g);
}

/* ---------- La route et ses dalles ---------- */

export const PAVE_LARGEUR = 24;
export const PAVE_HAUTEUR = 13;

/** Les tons d'un pavé : la lumière du haut, la face, l'ombre du bas. */
const TONS_DES_PAVES = {
  dore: ["#fff2a8", "#ffc61a", "#b97a0c"],
  gris: ["#aab4d2", "#7783a8", "#4a5578"],
} as const;

/**
 * Un motif de la route du pass, à répéter de gauche à droite sans couture : deux rangées de pavés décalées d'un demi-pavé,
 * l'encre au-dessus, entre elles et au-dessous. 24 × 13 cases (quatre pavés par rangée).
 */
export function paveDeLaRoute(dore: boolean): Planche {
  const g = new Planche(PAVE_LARGEUR, PAVE_HAUTEUR);
  const [clair, face, ombre] = TONS_DES_PAVES[dore ? "dore" : "gris"];
  R(g, 0, 0, PAVE_LARGEUR, PAVE_HAUTEUR, PAL.k);
  const point = (x: number, y: number, coul: string): void => R(g, ((x % PAVE_LARGEUR) + PAVE_LARGEUR) % PAVE_LARGEUR, y, 1, 1, coul);
  [1, 7].forEach((y0, rang) => {
    for (let i = 0; i < 4; i++) {
      const x0 = i * 6 + (rang ? 3 : 0);
      // Un pavé sur quatre est un peu plus usé : la route ne fait pas papier peint.
      const use = (i + rang * 2) % 4 === 1;
      const corps = use ? melange(face, ombre, 0.22) : face;
      for (let x = 0; x < 5; x++) {
        point(x0 + x, y0, clair);
        for (let y = 1; y < 4; y++) point(x0 + x, y0 + y, x === 4 ? melange(corps, ombre, 0.45) : corps);
        point(x0 + x, y0 + 4, ombre);
      }
      point(x0, y0 + 1, melange(corps, clair, 0.6));
      if (use) point(x0 + 2, y0 + 2, melange(corps, ombre, 0.5));
    }
  });
  return g;
}

export const DALLE_LARGEUR = 17;
export const DALLE_HAUTEUR = 13;

export type EtatDeLaDalle = "dore" | "gris" | "a-prendre";

/** Les tons d'une dalle : la lumière, la face, l'ombre, le numéro, l'ombre du numéro, le liseré d'un jalon. */
const TONS_DES_DALLES: Readonly<Record<EtatDeLaDalle, readonly [string, string, string, string, string | null, string]>> = {
  dore: ["#fffbe6", "#ffd84a", "#b97a0c", "#231503", null, "#e0263a"],
  gris: ["#dfe5f5", "#aab4d2", "#6f7ba3", "#1a2348", null, "#ffc61a"],
  "a-prendre": ["#9cc2ff", "#2f6bff", "#0b3fc4", "#ffffff", "#07257a", "#ffd84a"],
};

/**
 * La dalle numérotée d'un palier, posée sur la route : son numéro (1 à 99) écrit dedans. Dorée (palier atteint), grise (pas
 * encore) ou bleue (un booster à prendre) ; `jalon` (paliers 10, 20, 30) : un liseré et quatre clous aux coins. 17 × 13 cases.
 */
export function dalleDuPalier(n: number, etat: EtatDeLaDalle, jalon: boolean): Planche {
  const g = new Planche(DALLE_LARGEUR, DALLE_HAUTEUR);
  const [clair, face, ombre, encre, ombreDuNumero, lisere] = TONS_DES_DALLES[etat];
  rr(g, 0, 0, 17, 13, 2, PAL.k);
  rr(g, 1, 1, 15, 11, 1, face);
  R(g, 2, 1, 13, 1, clair);
  R(g, 2, 11, 13, 1, ombre);
  R(g, 15, 2, 1, 9, melange(face, ombre, 0.5));
  if (jalon) {
    R(g, 2, 1, 13, 1, lisere);
    R(g, 2, 11, 13, 1, lisere);
    R(g, 1, 2, 1, 9, lisere);
    R(g, 15, 2, 1, 9, lisere);
    for (const [x, y] of [[2, 2], [14, 2], [2, 10], [14, 10]] as const) R(g, x, y, 1, 1, lisere);
  }
  const texte = String(Math.min(99, Math.max(0, Math.round(n))));
  const t = ecrire(texte, encre, ombreDuNumero);
  g.drawImage(t, Math.round(8.5 - t.width / 2), 3);
  return g;
}

/* ---------- Les missions du jour ---------- */

const COCHE_FAITE = ["kkkkkkkkk", "kGGGGGGwk", "kGGGGGwwk", "kwGGGwwGk", "kwwGwwGGk", "kGwwwGGGk", "kGGwGGGgk", "kGggggggk", "kkkkkkkkk"];
const COCHE_VIDE = ["kkkkkkkkk", "kDDDDDDDk", "kDdddddDk", "kDdddddlk", "kDdddddlk", "kDdddddlk", "kDdddddlk", "kDllllllk", "kkkkkkkkk"];

/** La coche d'une mission du jour : pleine (faite, verte et cochée) ou vide (une case creuse). 9 × 9 cases. */
export function cocheDeMission(faite: boolean): Planche {
  return grille(faite ? COCHE_FAITE : COCHE_VIDE, { ...PAL, d: "#101a4a", D: "#070d2c", l: "#22347c" });
}

/* ---------- Le creuset de la fusion ---------- */

/** Les bords de la place du creuset, en cases : haut, droite, bas, gauche (pour `border-image-slice`). */
export const BORDS_DE_LA_PLACE: readonly [number, number, number, number] = [4, 4, 4, 4];

export const PLACE_COTE = 16;

/** Les tons du creux : la lèvre de pierre, l'ombre portée du haut, le fond, la lumière du bas, le clou des coins. */
const TONS_DU_CREUSET: Readonly<Record<ThemeDuPass, readonly [string, string, string, string, string]>> = {
  clair: ["#7783a8", "#9aa6c8", "#c7d3ee", "#ffffff", "#aab4d2"],
  sombre: ["#040716", "#070d2c", "#0d1744", "#3550b0", "#22347c"],
};

/**
 * Une place vide du creuset de la fusion : un creux de pierre gris-bleu où l'on pose un objet à fondre, l'ombre en haut et
 * la lumière en bas, comme taillé dans le panneau. En neuf parts (bords de `BORDS_DE_LA_PLACE`), le centre uni : 16 × 16 cases.
 */
export function placeDuCreuset(theme: ThemeDuPass): Planche {
  const g = new Planche(PLACE_COTE, PLACE_COTE);
  const [levre, ombre, fond, lumiere, clou] = TONS_DU_CREUSET[theme];
  rr(g, 0, 0, 16, 16, 2, levre);
  rr(g, 1, 1, 14, 14, 1, fond);
  // L'ombre du bord haut et du bord gauche, qui tombe dans le creux.
  R(g, 2, 1, 12, 1, ombre);
  R(g, 1, 2, 1, 12, ombre);
  R(g, 2, 2, 12, 1, melange(ombre, fond, 0.5));
  R(g, 2, 2, 1, 12, melange(ombre, fond, 0.5));
  // La lumière sur le bord bas et le bord droit.
  R(g, 2, 14, 12, 1, lumiere);
  R(g, 14, 2, 1, 12, melange(lumiere, fond, 0.45));
  // Quatre clous, aux coins.
  for (const [x, y] of [[3, 3], [12, 3], [3, 12], [12, 12]] as const) R(g, x, y, 1, 1, clou);
  return g;
}

export const PLUS_COTE = 7;

/** Le signe « + » d'une place vide, gravé : le trait sombre, sa lumière une case plus bas et à droite. 7 × 7 cases. */
export function plusDuCreuset(theme: ThemeDuPass): Planche {
  const g = new Planche(PLUS_COTE, PLUS_COTE);
  const [trait, lumiere] = theme === "clair" ? ["#7783a8", "#ffffff"] : ["#040716", "#3550b0"];
  for (const [d, coul] of [[1, lumiere], [0, trait]] as const) {
    R(g, d, 3 + d, 7, 1, coul);
    R(g, 3 + d, d, 1, 7, coul);
  }
  return g;
}
