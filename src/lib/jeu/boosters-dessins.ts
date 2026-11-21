/**
 * Les cinq boosters de « Mon Gaulois », en pixels (dessin de Claude Fable 5.2, 21 novembre 2026). Une seule famille : le
 * sachet serti de l'animation d'ouverture validée par le pilote, 60 cases sur 88. Le booster surprise est celui de la
 * maquette, case pour case ; les quatre autres gardent son anatomie et changent de robe, de bande et de médaillon :
 *
 * - `surprise` : bleu, bande rouge, médaillon carré au torque ;
 * - `stateres` : vert, bande d'or, médaillon rond, une pièce frappée du cheval ;
 * - `familiers` : vert d'eau, bande orange, médaillon à deux oreilles, une empreinte de patte ;
 * - `bannieres` : violet, bande rose, médaillon en étendard pendu à sa hampe, à queue d'aronde ;
 * - `modeles` (Gaulois uniques) : encre et gris, bande d'argent, médaillon à pans coupés, une bête cornue dans la lune.
 *
 * L'anatomie est fixe, l'animation en dépend : rangées 0 à 9, la bande de déchirure dentelée (que l'animation coupe en
 * quatre morceaux de 15 colonnes) ; rangées 10 à 77, le corps (colonnes 2 à 57, bord d'encre aux colonnes 2 et 57) ;
 * rangées 78 à 87, le bas serti. Le haut du corps (rangées 10 à 27) reste sombre et uni : les fissures blanches s'y
 * dessinent. Les oreilles du booster des familiers n'y montent que de six rangées, aux deux coins du médaillon.
 *
 * Un sixième sachet, hors de l'étal (21 novembre 2026) : `loterie`, le booster du jour de la loterie du mardi, qui ne
 * s'achète pas. Rouge carmin, bande d'or, médaillon en ticket (deux encoches, un talon à perforation, une étoile).
 */
import { Planche, R, rr, grille, poly, ell, lig } from "./planche";
import { PAL } from "./palette";

export type SorteDeBooster = "surprise" | "stateres" | "familiers" | "bannieres" | "modeles" | "loterie";

export const BOOSTER_LARGEUR = 60;
export const BOOSTER_HAUTEUR = 88;

/** La robe d'un sachet : ses teintes, de la lumière vers l'ombre, et sa bande en travers. */
interface Robe {
  /** Le haut du corps, puis le corps, sa trame d'ombre, le bas, et le bord sombre de droite. */
  haut: string;
  corps: string;
  trame: string;
  bas: string;
  fond: string;
  /** Les deux reflets en biais, puis leur cœur clair. */
  reflet: string;
  eclat: string;
  /** Le bord de gauche : la lumière, puis sa retombée. */
  bordClair: string;
  bordDoux: string;
  /** La bande en travers : sa lumière, son corps, son ombre ; et ses deux filets. */
  bande: readonly [string, string, string];
  filet: string;
}

const ROBES: Readonly<Record<SorteDeBooster, Robe>> = {
  surprise: { haut: "#3f7dff", corps: "#2f6bff", trame: "#1f55e0", bas: "#0b3fc4", fond: "#07257a", reflet: "#8fb6ff", eclat: "#cfe2ff", bordClair: "#cfe2ff", bordDoux: "#9cc2ff", bande: ["#ff5a6a", "#e0263a", "#a8101f"], filet: "#f6f1e3" },
  stateres: { haut: "#23a352", corps: "#1a8f45", trame: "#137538", bas: "#0c5a2a", fond: "#063a19", reflet: "#7fe09a", eclat: "#c9fbcf", bordClair: "#c9fbcf", bordDoux: "#8ee6a6", bande: ["#fffbe6", "#f6f1e3", "#cfc9b8"], filet: "#ffc61a" },
  familiers: { haut: "#1298a6", corps: "#0e8795", trame: "#0a6f7d", bas: "#075866", fond: "#043842", reflet: "#86e6ea", eclat: "#d2f9f8", bordClair: "#d2f9f8", bordDoux: "#93e4e8", bande: ["#ffb866", "#f5760f", "#b54a08"], filet: "#f6f1e3" },
  bannieres: { haut: "#7f52f2", corps: "#6c41e2", trame: "#5631c8", bas: "#3f1fa8", fond: "#2a1278", reflet: "#b9a0ff", eclat: "#e2d6ff", bordClair: "#e2d6ff", bordDoux: "#bda8ff", bande: ["#ff9ac6", "#e8408f", "#a3175c"], filet: "#f6f1e3" },
  loterie: { haut: "#cf2c40", corps: "#bb1d32", trame: "#9c1227", bas: "#7c0a1d", fond: "#4a0510", reflet: "#ff8f98", eclat: "#ffd3d6", bordClair: "#ffd3d6", bordDoux: "#ff9aa2", bande: ["#fff2a8", "#ffc61a", "#b97a0c"], filet: "#f6f1e3" },
  modeles: { haut: "#343e68", corps: "#283158", trame: "#1d2546", bas: "#131a34", fond: "#080c1c", reflet: "#6a769f", eclat: "#aab4d2", bordClair: "#aab4d2", bordDoux: "#77829f", bande: ["#eef2fc", "#aab3cf", "#6f7ba3"], filet: "#3a4468" },
};

const X = 2;
const W = 56;

/** Le sachet nu : les deux sertis d'argent et le corps à sa robe, sans médaillon. */
function sachet(g: Planche, t: Robe): void {
  for (let x = 0; x < W; x++) {
    const dent = x % 4 === 0 || x % 4 === 3 ? 1 : 0;
    const strie = x % 4 < 2 ? "#eef2fc" : "#9aa6c8";
    const bord = x === 0 || x === W - 1;
    R(g, X + x, dent, 1, 10 - dent, PAL.k);
    R(g, X + x, 78, 1, 10 - dent, PAL.k);
    if (!bord) {
      R(g, X + x, dent + 1, 1, 8 - dent, strie);
      R(g, X + x, 79, 1, 8 - dent, strie);
      R(g, X + x, 7, 1, 2, x % 4 < 2 ? "#b9c3df" : "#6f7ba3");
      R(g, X + x, 79, 1, 2, x % 4 < 2 ? "#b9c3df" : "#6f7ba3");
      if (x % 4 === 1) R(g, X + x, dent + 1, 1, 2, "#ffffff");
    }
  }
  for (let y = 10; y < 78; y++)
    for (let x = 0; x < W; x++) {
      let coul = y < 30 ? t.haut : t.corps;
      const d = x + (y - 10) * 0.7;
      const d2 = x + (y - 10);
      if (y >= 30 && y < 34 && (x + y) % 2) coul = t.haut;
      if (y > 60 && (x + y) % 2) coul = t.trame;
      if (y > 69) coul = (x + y) % 2 ? t.bas : t.trame;
      if ((d2 >= 9 && d2 < 14) || (d2 >= 17 && d2 < 19)) coul = t.reflet;
      if (d2 >= 10 && d2 < 12) coul = t.eclat;
      if (d >= 54 && d < 57) coul = t.filet;
      if (d >= 57 && d < 66) coul = d < 59 ? t.bande[0] : d >= 64 ? t.bande[2] : t.bande[1];
      if (d >= 66 && d < 69) coul = t.filet;
      if (x < 2) coul = t.bordClair;
      else if (x < 4) coul = t.bordDoux;
      if (x >= W - 4) coul = t.bas;
      if (x >= W - 2) coul = t.fond;
      if (y === 13 && x % 4 < 2 && x > 3 && x < W - 4) coul = "#f6f1e3";
      if (y === 10) coul = t.bas;
      if (y === 77) coul = t.fond;
      if (x === 0 || x === W - 1) coul = PAL.k;
      R(g, X + x, y, 1, 1, coul);
    }
}

/** Les trois rivets d'or sous le médaillon. */
function rivets(g: Planche): void {
  for (const x of [X + 20, X + 27, X + 34]) {
    R(g, x, 61, 3, 3, PAL.k);
    R(g, x, 61, 2, 2, PAL.y);
  }
}

/** Le cadre d'or du médaillon (32 × 26, coins taillés de `r`) et sa fenêtre sombre. */
function cadre(g: Planche, r: number, fenetre: string, ombre: string): void {
  rr(g, X + 12, 28, 32, 26, r, PAL.k);
  rr(g, X + 13, 29, 30, 24, r - 1, PAL.o);
  rr(g, X + 13, 29, 29, 23, r - 1, PAL.y);
  R(g, X + 18, 29, 12, 1, PAL.Y);
  rr(g, X + 15, 31, 26, 20, r - 2, PAL.O);
  rr(g, X + 16, 32, 24, 18, r - 2, PAL.k);
  rr(g, X + 17, 33, 22, 16, r - 3, fenetre);
  R(g, X + 19, 33, 18, 1, ombre);
}

/* ---------- Surprise : le torque ---------- */

const TORQUE = ["..kkk.........kkk..", ".kYyOk.......kYyOk.", ".kyOok.......kyOok.", "..kyOk.......kyOk..", "..kyOkk.....kkyOk..", "...kyOOkkkkkOOok...", "....kyyOOOOOook....", ".....kkyyyOokk.....", ".......kkkkk......."];

function medaillonSurprise(g: Planche): void {
  cadre(g, 5, "#131d4d", "#0a1033");
  g.drawImage(grille(TORQUE, PAL), X + 19, 37);
}

/* ---------- Statères : la pièce au cheval ---------- */

/** Le cheval au galop, son soleil et ses grains : le creux de la frappe du statère du site, à 16 cases. */
const CHEVAL = [
  ".........n...",
  "nn......nnnn.",
  "nn.....nnn.nn",
  "......nnnn...",
  ".nnnnnnnnn...",
  "nnnnnnnnnn...",
  "n.nnnnnnnn...",
  "..nn....nn...",
  ".nn......nn..",
  ".n...n.n..n..",
];

function medaillonStateres(g: Planche): void {
  const cx = X + 28;
  const cy = 41;
  ell(g, cx, cy, 14, 14, PAL.k);
  ell(g, cx, cy, 13, 13, PAL.o);
  ell(g, cx - 0.5, cy - 0.5, 12.5, 12.5, PAL.y);
  ell(g, cx, cy, 11, 11, PAL.O);
  // Le grènetis : un rang de grains au bord de la pièce.
  for (let i = 0; i < 20; i++) {
    const a = (i * Math.PI) / 10;
    R(g, Math.round(cx - 0.5 + Math.cos(a) * 11.5), Math.round(cy - 0.5 + Math.sin(a) * 11.5), 1, 1, i > 8 && i < 19 ? PAL.Y : PAL.n);
  }
  ell(g, cx, cy, 9.5, 9.5, PAL.o);
  ell(g, cx, cy, 8.5, 8.5, PAL.j);
  ell(g, cx - 1, cy - 1, 7, 7, PAL.y);
  ell(g, cx + 0.5, cy + 0.5, 7.5, 7.5, PAL.j);
  g.drawImage(grille(CHEVAL, { n: PAL.n }), cx - 6, cy - 5);
  // Un éclat sur le bord, en haut à gauche.
  R(g, cx - 9, cy - 10, 3, 1, PAL.Y);
  R(g, cx - 11, cy - 8, 1, 3, PAL.Y);
}

/* ---------- Familiers : les oreilles et l'empreinte ---------- */

const OREILLE = ["..kk....", ".kyOk...", ".kypOk..", "kyyppOk.", "kyyppOOk", "kyyyppOk", "kyyyyyOO", "kyyyyyyO"];

function medaillonFamiliers(g: Planche): void {
  const pal = { k: PAL.k, y: PAL.y, O: PAL.O, p: "#ff9a7a" };
  const gauche = grille(OREILLE, pal);
  const droite = grille(
    OREILLE.map((r) => [...r].reverse().join("")),
    { ...pal, y: PAL.O, O: PAL.o },
  );
  g.drawImage(gauche, X + 12, 23);
  g.drawImage(droite, X + 36, 23);
  cadre(g, 6, "#06323a", "#03222a");
  // L'empreinte : le coussinet et quatre doigts, crème, ombrés en bas.
  const cx = X + 28;
  const patte = (dx: number, dy: number, rx: number, ry: number): void => {
    ell(g, cx + dx, 41 + dy + 0.5, rx, ry, "#e2c18e");
    ell(g, cx + dx, 41 + dy, rx, ry - 0.4, "#fff4dc");
  };
  patte(0, 4.5, 4.6, 3);
  patte(-6.5, 0.5, 1.7, 2);
  patte(-2.5, -2.5, 1.7, 2.1);
  patte(2.5, -2.5, 1.7, 2.1);
  patte(6.5, 0.5, 1.7, 2);
}

/* ---------- Bannières : l'étendard à queue d'aronde ---------- */

function medaillonBannieres(g: Planche): void {
  const cx = X + 28;
  // L'étoffe pendue : un cadre d'or à queue d'aronde, une fenêtre sombre.
  const etoffe = (marge: number, coul: string, dx = 0, dy = 0): void =>
    poly(
      g,
      [
        [cx - 14 + marge + dx, 31 + dy],
        [cx + 14 - marge + dx, 31 + dy],
        [cx + 14 - marge + dx, 58 - marge * 1.6 + dy],
        [cx + dx, 50 - marge * 1.1 + dy],
        [cx - 14 + marge + dx, 58 - marge * 1.6 + dy],
      ],
      coul,
    );
  etoffe(0, PAL.k);
  etoffe(1, PAL.o);
  etoffe(1, PAL.y, -1, -1);
  etoffe(2, PAL.O);
  etoffe(3, PAL.k);
  etoffe(4, "#1d0f55");
  R(g, cx - 10, 35, 20, 1, "#120838");
  // Le blason : un losange d'or entre deux grains.
  const losange = (r: number, coul: string): void =>
    poly(
      g,
      [
        [cx, 41 - r],
        [cx + r, 41],
        [cx, 41 + r],
        [cx - r, 41],
      ],
      coul,
    );
  losange(4.5, PAL.o);
  losange(3.5, PAL.y);
  losange(1.5, PAL.O);
  R(g, cx - 2, 39, 1, 2, PAL.Y);
  R(g, cx - 8, 40, 2, 2, "#b9a0ff");
  R(g, cx + 6, 40, 2, 2, "#b9a0ff");
  // La hampe, en travers, et ses deux pommeaux.
  R(g, X + 10, 27, 36, 5, PAL.k);
  R(g, X + 11, 28, 34, 3, PAL.O);
  R(g, X + 11, 28, 34, 1, PAL.y);
  R(g, X + 11, 30, 34, 1, PAL.o);
  R(g, X + 16, 28, 8, 1, PAL.Y);
  for (const x of [X + 8, X + 44]) {
    rr(g, x, 26, 4, 7, 1, PAL.k);
    R(g, x + 1, 27, 2, 5, PAL.y);
    R(g, x + 2, 28, 1, 4, PAL.O);
    R(g, x + 1, 27, 1, 1, PAL.Y);
  }
  // Les deux glands, aux pointes.
  for (const x of [cx - 13, cx + 11]) {
    lig(g, x, 57, x, 59, PAL.k, 2);
    R(g, x, 57, 1, 2, PAL.y);
  }
}

/* ---------- Gaulois uniques : la bête dans la lune ---------- */

const BETE = [
  "k..............k",
  "kk............kk",
  ".kk..........kk.",
  ".kkk........kkk.",
  "..kkk......kkk..",
  "..kkkk....kkkk..",
  "...kkkkkkkkkk...",
  "...kkkkkkkkkk...",
  "...kyykkkkyyk...",
  "...kkeykkyekk...",
  "...kkkkkkkkkk...",
  "....kkkkkkkk....",
  "...kkkwkkwkkk...",
  ".kkkkkkkkkkkkkk.",
  "kkkkkkkkkkkkkkkk",
];

function medaillonModeles(g: Planche): void {
  const cx = X + 28;
  cadre(g, 8, "#4a5578", "#343e68");
  // La lune derrière la bête : un disque clair, tramé sur son bord.
  for (let y = 34; y < 49; y++)
    for (let x = cx - 11; x < cx + 11; x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - 38.5);
      if (d < 6 || (d < 8 && (x + y) % 2 === 0)) R(g, x, y, 1, 1, d < 4.5 ? "#f2f5fc" : d < 6 ? "#c8d0e6" : "#8a96b8");
    }
  g.drawImage(grille(BETE, { k: PAL.k, y: PAL.y, e: PAL.e, w: PAL.w }), cx - 8, 34);
}

/* ---------- Loterie : le ticket à l'étoile ---------- */

/**
 * La forme d'un ticket de `l` cases sur `h` : un rectangle aux coins taillés, mordu d'une encoche ronde de rayon `r` au
 * milieu de chaque petit côté. Rend vrai si la case est dans le ticket.
 */
export function dansUnTicket(x: number, y: number, l: number, h: number, r: number): boolean {
  if (x < 0 || y < 0 || x >= l || y >= h) return false;
  const d = Math.min(y, h - 1 - y);
  if (d < 2 && (x < 2 - d || x >= l - 2 + d)) return false;
  const dy = y + 0.5 - h / 2;
  return Math.hypot(x + 0.5, dy) >= r && Math.hypot(l - x - 0.5, dy) >= r;
}

const ETOILE_DU_TICKET = [".....w.....", ".....w.....", "....www....", "wwwwwwwwwww", ".wwwwwwwww.", "..wwwwwww..", "...wwwww...", "..wwwwwww..", "..www.www..", ".ww.....ww.", ".w.......w."];

function medaillonLoterie(g: Planche): void {
  const L = 38;
  const H = 25;
  const m = new Planche(L, H);
  const dans = (x: number, y: number): boolean => dansUnTicket(x, y, L, H, 3.5);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < L; x++) {
      if (!dans(x, y)) continue;
      const bord = !dans(x - 1, y) || !dans(x + 1, y) || !dans(x, y - 1) || !dans(x, y + 1);
      const ombre = !bord && (!dans(x + 2, y) || !dans(x, y + 2) || !dans(x + 1, y + 1));
      R(m, x, y, 1, 1, bord ? PAL.k : ombre ? PAL.o : y === 1 ? PAL.Y : PAL.y);
    }
  // Le talon : trois traits gravés, puis la perforation.
  for (const y of [6, 11, 16]) {
    R(m, 5, y, 3, 2, PAL.o);
    R(m, 5, y, 3, 1, PAL.O);
  }
  for (let y = 2; y < H - 2; y += 3) {
    R(m, 9, y, 1, 2, PAL.n);
    R(m, 10, y, 1, 2, PAL.Y);
  }
  // La fenêtre et son étoile.
  rr(m, 12, 3, 21, 19, 2, PAL.O);
  rr(m, 13, 4, 19, 17, 2, PAL.k);
  rr(m, 14, 5, 17, 15, 1, "#4a0510");
  R(m, 16, 5, 13, 1, "#2e0309");
  m.drawImage(grille(ETOILE_DU_TICKET, { w: PAL.o }), 17, 8);
  m.drawImage(grille(ETOILE_DU_TICKET, { w: PAL.y }), 17, 7);
  R(m, 22, 7, 1, 3, PAL.Y);
  R(m, 20, 10, 5, 1, PAL.Y);
  g.drawImage(m, X + 9, 29);
}

const MEDAILLONS: Readonly<Record<SorteDeBooster, (g: Planche) => void>> = {
  surprise: medaillonSurprise,
  stateres: medaillonStateres,
  familiers: medaillonFamiliers,
  bannieres: medaillonBannieres,
  modeles: medaillonModeles,
  loterie: medaillonLoterie,
};

/** Le booster d'une sorte, scellé : une planche de 60 cases sur 88. */
export function booster(sorte: SorteDeBooster): Planche {
  const g = new Planche(BOOSTER_LARGEUR, BOOSTER_HAUTEUR);
  sachet(g, ROBES[sorte]);
  MEDAILLONS[sorte](g);
  rivets(g);
  return g;
}

/** Les cinq sortes de booster, dans l'ordre de l'étal. */
export const SORTES_DE_BOOSTER: readonly SorteDeBooster[] = ["surprise", "stateres", "familiers", "bannieres", "modeles"];
/** Le booster de loterie du jour : il ne s'achète pas, et n'est donc pas à l'étal. */
export const SORTE_DE_LOTERIE = "loterie" as const;

const CACHE = new Map<SorteDeBooster, Planche>();
/** Le paquet d'un booster, dessiné une fois pour la page. */
export function paquetDuBooster(sorte: SorteDeBooster): Planche {
  let p = CACHE.get(sorte);
  if (!p) {
    p = booster(sorte);
    CACHE.set(sorte, p);
  }
  return p;
}
