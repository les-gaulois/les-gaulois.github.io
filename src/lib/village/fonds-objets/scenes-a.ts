/**
 * Les fonds d'objets, lot A (voir `socle.ts` et son `CATALOGUE_DES_SCENES`) : la campagne gauloise. Sept scènes d'une même
 * famille (le même ciel d'été, le même soleil en haut à gauche, les mêmes verts tramés) : la prairie, qui sert aussi de fond
 * de secours, le champ de blé, le potager, la ferme, la forêt de chênes, le bord de rivière et le jardin fleuri.
 *
 * Chaque scène pose d'abord ses grands aplats (ciel, lointains, sol), puis ses détails sur les côtés ; ce qui passe quand
 * même derrière la chose est fondu dans l'aplat (`calmer`), pour que le milieu reste calme. La graine déplace nuages,
 * collines, arbres et objets du décor ; l'accent teinte des fleurs, un chiffon, une porte, un bouchon de pêche.
 *
 * Dessin de Claude Fable 5.2, 22 novembre 2026.
 */
import { type ParametresDuFond, type Planche, type SceneDeFond, adoucir, assombrir, crete, degrade, eclaircir, entre, hasard, luminance, melanger, nuage, remplirSous, trame } from "./socle";

// ---------------------------------------------------------------------------------------------------------------------
// La palette de la famille : des tons d'été, passés vers le clair.
// ---------------------------------------------------------------------------------------------------------------------

/** Trois tons d'une matière : sa lumière, son fond, son ombre. */
interface Tons {
  claire: string;
  fond: string;
  ombre: string;
}

const CIEL_HAUT = "#a8d2f0";
const CIEL_BAS = "#e6f4fb";
const SOLEIL = "#fff6cf";
const NUAGE = "#ffffff";
const NUAGE_OMBRE = "#d3e5f4";
const OISEAU = "#8fa3bd";
/** Les collines du fond, bleutées par l'air. */
const LOIN: Tons = { claire: "#cfe9df", fond: "#b7dbd0", ombre: "#a6cfc3" };
/** Le coteau, entre le lointain et le sol. */
const COTEAU: Tons = { claire: "#c9e9b4", fond: "#afdb9d", ombre: "#9bcf8c" };
const HERBE: Tons = { claire: "#c3e79a", fond: "#a6d87f", ombre: "#8ac56c" };
const BRIN = "#72b05b";
const FEUILLE: Tons = { claire: "#a9db8e", fond: "#88c772", ombre: "#6db060" };
const FEUILLE_LOIN: Tons = { claire: "#c8e9ab", fond: "#b1dc95", ombre: "#9bcf84" };
const TERRE: Tons = { claire: "#efdab4", fond: "#e2c597", ombre: "#d0ad7e" };
const SILLON = "#bd9869";
const BOIS: Tons = { claire: "#e0c398", fond: "#c9a474", ombre: "#ad865a" };
const BOIS_CREUX = "#8f6a47";
const PAILLE: Tons = { claire: "#f9e7a6", fond: "#f0cf72", ombre: "#dcb152" };
const PAILLE_BRIN = "#c69a40";
const EAU: Tons = { claire: "#d3f0fb", fond: "#aedff3", ombre: "#92cdea" };
const REFLET = "#f3fcff";
const SABLE: Tons = { claire: "#f3ead0", fond: "#e6d9b4", ombre: "#d3c399" };
const GALET: Tons = { claire: "#eceff3", fond: "#cfd4db", ombre: "#aeb6c1" };
const CHOU: Tons = { claire: "#d2edb6", fond: "#aed993", ombre: "#8ac27b" };
const COURGE: Tons = { claire: "#ffd596", fond: "#f6b765", ombre: "#df984c" };
const FLEURS = ["#ffffff", "#ffe27a", "#f6a9c4", "#cdb8f2"] as const;

// ---------------------------------------------------------------------------------------------------------------------
// Les outils du lot.
// ---------------------------------------------------------------------------------------------------------------------

const borner = (v: number, min: number, max: number): number => Math.max(min, Math.min(max, v));

/** Ce que toutes les scènes du lot calculent d'abord. */
interface Cadre {
  L: number;
  H: number;
  /** L'échelle du décor : 1 pour la case du vestiaire (56 × 38). */
  k: number;
  /** Vrai pour les petites tailles : on y retire des détails. */
  petit: boolean;
  /** La rangée où le sol commence, un peu au-dessus des pieds de la chose. */
  terre: number;
  /** Les colonnes juste à gauche et juste à droite de la chose. */
  zg: number;
  zd: number;
  h: () => number;
  /** Une longueur à l'échelle du décor, d'au moins une case. */
  e: (n: number) => number;
  accent: string;
  accentOmbre: string;
  /** La couleur d'une fleur : l'accent s'il est franc, sinon la couleur `defaut` à peine teintée (un gris ferait une fleur sale). */
  teinte: (defaut: string) => string;
}

function cadre(o: ParametresDuFond): Cadre {
  const L = o.largeur;
  const H = o.hauteur;
  const k = Math.min(H / 38, L / 56);
  let accent = adoucir(eclaircir(o.accent, 0.22), 0.1);
  if (luminance(accent) < 0.28) accent = eclaircir(accent, 0.25);
  const [r, v, b] = [1, 3, 5].map((i) => parseInt(accent.slice(i, i + 2), 16));
  const terne = Math.max(r ?? 0, v ?? 0, b ?? 0) - Math.min(r ?? 0, v ?? 0, b ?? 0) < 70;
  return {
    teinte: (defaut) => (terne ? melanger(defaut, accent, 0.3) : luminance(accent) < 0.4 ? eclaircir(accent, 0.3) : accent),
    L,
    H,
    k,
    petit: k < 0.75,
    terre: borner(o.sol - Math.round(H * 0.14), Math.round(H * 0.5), H - 3),
    zg: o.zone.x - 1,
    zd: o.zone.x + o.zone.largeur,
    h: hasard(o.graine),
    e: (n) => Math.max(1, Math.round(n * k)),
    accent,
    accentOmbre: assombrir(accent, 0.22),
  };
}

/** Une place sur un côté de la chose pour un décor de largeur `l` : il peut déborder du cadre, pas passer derrière elle. */
function aCote(c: Cadre, l: number, gauche: boolean): number {
  const t = c.h();
  if (gauche) {
    const min = -Math.floor(l / 3);
    const max = Math.max(min, c.zg - l);
    return Math.round(min + t * (max - min));
  }
  const max = c.L - Math.ceil((l * 2) / 3);
  const min = Math.min(max, c.zd + 1);
  return Math.round(min + t * (max - min));
}

/** La couleur d'un aplat qui passe par plusieurs tons, tramés à leurs jonctions : `t` de 0 (premier ton) à 1 (dernier). */
function ton(x: number, y: number, t: number, tons: readonly string[]): string {
  const n = tons.length - 1;
  const v = borner(t, 0, 1) * n;
  const i = Math.min(n - 1, Math.floor(v));
  return (trame(x, y, v - i) ? tons[i + 1] : tons[i]) ?? "#ffffff";
}

/** Une boule éclairée d'en haut à gauche : feuillage, chou, courge, buisson. */
function boule(p: Planche, cx: number, cy: number, r: number, t: Tons): void {
  p.disque(cx, cy, r, (dx, dy) => {
    const d = (dx + dy) / Math.max(1, r);
    const x = cx + dx;
    const y = cy + dy;
    if (d < -0.75) return t.claire;
    if (d < -0.15) return trame(x, y, 0.5) ? t.claire : t.fond;
    if (d > 0.95) return t.ombre;
    if (d > 0.35) return trame(x, y, 0.5) ? t.ombre : t.fond;
    return t.fond;
  });
}

/** Le ciel de la famille : un dégradé tramé, le soleil pâle en haut à gauche, des nuages sur les côtés. */
function ciel(p: Planche, c: Cadre, bas: number): void {
  degrade(p, 0, bas, CIEL_HAUT, CIEL_BAS, 6);
  const r = c.e(3.5);
  const sx = c.e(5) + entre(c.h, 0, c.e(4));
  const sy = c.e(4) + entre(c.h, 0, c.e(1));
  const halo = r + c.e(2);
  for (let dy = -halo; dy <= halo; dy++) {
    for (let dx = -halo; dx <= halo; dx++) {
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d > halo + 0.3 || d <= r) continue;
      if (trame(sx + dx, sy + dy, d < r + halo / 3 ? 0.5 : 0.25)) p.poser(sx + dx, sy + dy, melanger(CIEL_HAUT, SOLEIL, 0.7));
    }
  }
  p.disque(sx, sy, r, SOLEIL);
  const combien = c.petit ? 1 : 2 + (c.h() < 0.5 ? 1 : 0);
  const depart = c.h() < 0.5 ? 0 : 1;
  for (let i = 0; i < combien; i++) {
    const l = c.e(entre(c.h, 9, 14));
    const gauche = (i + depart) % 2 === 0 && !c.petit;
    const x = aCote(c, l, gauche);
    const y = entre(c.h, c.e(4), Math.max(c.e(4), Math.round(bas * 0.55)));
    nuage(p, x, y, l, NUAGE, NUAGE_OMBRE);
  }
}

/** Une ligne de collines remplie jusqu'en bas, son arête éclairée. */
function collines(p: Planche, c: Cadre, base: number, ampleur: number, t: Tons): number[] {
  const ys = crete(c.L, base, ampleur, c.h);
  remplirSous(p, ys, (x, y, prof) => (prof === 0 ? t.claire : prof < 3 && trame(x, y, 0.5) ? t.claire : t.fond));
  return ys;
}

/** Le sol : sous une crête douce, des tons tramés du plus clair en haut au plus soutenu en bas, et un liseré de lumière. */
function sol(p: Planche, c: Cadre, tons: readonly string[], lisere: string, ampleur = 2): number[] {
  const ys = crete(c.L, c.terre, c.petit ? 1 : c.e(ampleur), c.h);
  remplirSous(p, ys, (x, y, prof) => (prof === 0 ? lisere : ton(x, y, (y - c.terre) / Math.max(1, c.H - 1 - c.terre), tons)));
  return ys;
}

/** Un petit arbre rond, vu de loin. */
function arbre(p: Planche, x: number, base: number, r: number, t: Tons): void {
  const tronc = Math.max(1, Math.round(r / 3));
  p.rect(x - Math.floor(tronc / 2), base - r, tronc, r + 1, BOIS.fond);
  if (tronc > 1) p.rect(x - Math.floor(tronc / 2) + tronc - 1, base - r, 1, r + 1, BOIS.ombre);
  boule(p, x, base - r - Math.round(r * 0.6), r, t);
}

/** Une touffe d'herbe : trois brins. */
function touffe(p: Planche, x: number, y: number, couleur: string): void {
  p.poser(x, y, couleur);
  p.poser(x - 1, y - 1, couleur);
  p.poser(x + 1, y - 1, couleur);
}

/** Une fleur sur sa tige : une case de couleur, ou une croix de pétales autour d'un cœur quand elle est proche. */
function fleur(p: Planche, x: number, y: number, petale: string, grande: boolean): void {
  if (!grande) {
    p.poser(x, y, petale);
    p.poser(x, y + 1, BRIN);
    return;
  }
  p.poser(x, y - 1, petale);
  p.poser(x - 1, y, petale);
  p.poser(x + 1, y, petale);
  p.poser(x, y + 1, petale);
  p.poser(x, y, petale === "#ffe27a" ? "#f2b84a" : "#ffe27a");
  p.poser(x, y + 2, BRIN);
}

/** Un oiseau au loin : un petit accent circonflexe retourné. */
function oiseau(p: Planche, x: number, y: number): void {
  p.poser(x - 1, y - 1, OISEAU);
  p.poser(x, y, OISEAU);
  p.poser(x + 1, y - 1, OISEAU);
}

/** Vrai si le rectangle touche la place de la chose (une case de marge). */
function toucheLaZone(o: ParametresDuFond, x: number, y: number, l: number, h: number): boolean {
  const z = o.zone;
  return x + l > z.x - 1 && x < z.x + z.largeur + 1 && y + h > z.y - 1 && y < z.y + z.hauteur + 1;
}

/**
 * Le milieu calme : derrière la chose, tout ce qui a été dessiné depuis `avant` (une copie de la planche aux seuls aplats)
 * est fondu dans l'aplat, à moitié au cœur, moins au bord.
 */
function calmer(p: Planche, o: ParametresDuFond, avant: readonly (string | null)[], force = 0.55): void {
  const z = o.zone;
  const cx = z.x + z.largeur / 2;
  const cy = z.y + z.hauteur / 2;
  const rx = z.largeur * 0.66 + 1.5;
  const ry = z.hauteur * 0.66 + 1.5;
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      if (x < 0 || y < 0 || x >= p.largeur || y >= p.hauteur) continue;
      const d = ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2;
      if (d >= 1) continue;
      const a = avant[y * p.largeur + x];
      const b = p.lire(x, y);
      if (!a || !b || a === b) continue;
      p.poser(x, y, melanger(b, a, d < 0.62 ? force : force * 0.5));
    }
  }
}

/** Une meule de foin : un dôme de paille, clair à gauche, et son toupet. */
function meule(p: Planche, cx: number, base: number, demi: number, haut: number): void {
  for (let dx = -demi; dx <= demi; dx++) {
    const t = dx / (demi + 0.5);
    const sommet = Math.max(1, Math.round(haut * Math.sqrt(1 - t * t)));
    for (let dy = 0; dy < sommet; dy++) {
      const x = cx + dx;
      const y = base - dy;
      let couleur = PAILLE.fond;
      if (t < -0.45) couleur = PAILLE.claire;
      else if (t < -0.1) couleur = trame(x, y, 0.5) ? PAILLE.claire : PAILLE.fond;
      else if (t > 0.55) couleur = PAILLE.ombre;
      else if (t > 0.2) couleur = trame(x, y, 0.5) ? PAILLE.ombre : PAILLE.fond;
      if (dy === 0) couleur = PAILLE.ombre;
      p.poser(x, y, couleur);
    }
  }
  p.poser(cx, base - haut, PAILLE_BRIN);
}

// ---------------------------------------------------------------------------------------------------------------------
// La prairie.
// ---------------------------------------------------------------------------------------------------------------------

function peindrePrairie(p: Planche, o: ParametresDuFond): void {
  const c = cadre(o);
  ciel(p, c, c.terre);
  collines(p, c, c.terre + 1, c.e(8), LOIN);
  const coteau = collines(p, c, c.terre + c.e(2), c.e(5), COTEAU);
  sol(p, c, [HERBE.claire, HERBE.fond, HERBE.fond, HERBE.ombre], "#d6f0b2");
  const avant = p.cases.slice();
  // Un ou deux arbres sur le coteau, sur les côtés.
  const arbres = c.petit ? 1 : 1 + (c.h() < 0.6 ? 1 : 0);
  const cote = c.h() < 0.5;
  for (let i = 0; i < arbres; i++) {
    const r = c.e(entre(c.h, 3, 4));
    const x = borner(aCote(c, r * 2, i === 0 ? cote : !cote) + r, 1, c.L - 2);
    arbre(p, x, (coteau[x] ?? c.terre) + 1, r, FEUILLE_LOIN);
  }
  if (!c.petit) {
    const x = aCote(c, 3, !cote) + 1;
    oiseau(p, x, c.e(6) + entre(c.h, 0, c.e(4)));
    if (c.h() < 0.6) oiseau(p, x + c.e(4), c.e(4) + entre(c.h, 0, c.e(3)));
  }
  // L'herbe : des touffes rangées, plus serrées vers le bas.
  const fond = c.H - c.terre;
  const touffes = Math.round((c.L * fond) / 34);
  for (let i = 0; i < touffes; i++) {
    const x = entre(c.h, 0, c.L - 1);
    const y = entre(c.h, c.terre + 2, c.H - 1);
    touffe(p, x, y, y > c.terre + fond * 0.55 ? BRIN : HERBE.ombre);
  }
  // Les fleurs : blanches, jaunes, et à la couleur de la chose ; les plus proches sont plus grandes.
  const fleurs = Math.max(3, Math.round(c.L / 6));
  for (let i = 0; i < fleurs; i++) {
    const gauche = i % 2 === 0;
    const x = i % 3 === 2 ? entre(c.h, 1, c.L - 2) : aCote(c, 3, gauche) + 1;
    const y = entre(c.h, c.terre + 2, c.H - 3);
    const couleur = i % 3 === 0 ? c.teinte("#f6a9c4") : (FLEURS[i % 2] ?? "#ffffff");
    fleur(p, x, y, couleur, !c.petit && y > c.terre + fond * 0.45);
  }
  calmer(p, o, avant);
}

// ---------------------------------------------------------------------------------------------------------------------
// Le champ de blé.
// ---------------------------------------------------------------------------------------------------------------------

function peindreChampDeBle(p: Planche, o: ParametresDuFond): void {
  const c = cadre(o);
  ciel(p, c, c.terre);
  collines(p, c, c.terre, c.e(7), LOIN);
  // Les champs du fond : une bande d'or pâle.
  const loin = crete(c.L, c.terre + 1, c.e(4), c.h);
  remplirSous(p, loin, (x, y, prof) => (prof === 0 ? "#fbf1c8" : trame(x, y, 0.25) ? "#eedb9a" : "#f5e6b0"));
  const avant = p.cases.slice();
  // Les meules, au loin, sur les côtés.
  const meules = c.petit ? 1 : 2 + (c.h() < 0.4 ? 1 : 0);
  const cote = c.h() < 0.5;
  for (let i = 0; i < meules; i++) {
    const demi = c.e(entre(c.h, 3, 4));
    const x = borner(aCote(c, demi * 2 + 1, i % 2 === 0 ? cote : !cote) + demi, 0, c.L - 1);
    meule(p, x, c.terre + c.e(1), demi, Math.round(demi * 1.5));
  }
  if (!c.petit) {
    const x = aCote(c, 3, !cote) + 1;
    oiseau(p, x, c.e(7) + entre(c.h, 0, c.e(3)));
    oiseau(p, x - c.e(3), c.e(5) + entre(c.h, 0, c.e(2)));
  }
  // Le blé : des épis dressés, en rangs serrés, plus dorés vers le bas.
  const haut = c.terre + c.e(1);
  const decalage = entre(c.h, 0, 4);
  for (let x = 0; x < c.L; x++) {
    const y0 = haut + ((x + decalage) % 2);
    for (let y = y0; y < c.H; y++) {
      p.poser(x, y, y === y0 ? "#fdf3c4" : ton(x, y, (y - haut) / Math.max(1, c.H - 1 - haut), [PAILLE.claire, PAILLE.fond, PAILLE.fond, PAILLE.ombre]));
    }
  }
  // Des rangs d'épis, de plus en plus espacés vers le bas : un grain clair sur sa tige.
  for (let r = 0, y = haut + 2; y < c.H; r++, y += Math.max(4, c.e(4)) + r) {
    const ecart = 3 + Math.min(r, 3);
    for (let x = (decalage + r * 2) % ecart; x < c.L; x += ecart) {
      p.poser(x, y, "#fdf3c4");
      p.poser(x, y + 1, PAILLE.claire);
      p.rect(x, y + 2, 1, 1 + Math.min(r, 2), PAILLE.ombre);
    }
  }
  // Les coquelicots : à la couleur de la chose, sur les côtés.
  const coquelicots = Math.max(2, Math.round(c.L / 9));
  const rouge = c.teinte("#f08a7a");
  for (let i = 0; i < coquelicots; i++) {
    const x = aCote(c, 3, i % 2 === 0) + 1;
    const y = entre(c.h, haut + 2, c.H - 3);
    const grand = !c.petit && y > haut + (c.H - haut) * 0.4;
    p.poser(x, y, rouge);
    if (grand) {
      p.poser(x + 1, y, rouge);
      p.poser(x, y + 1, assombrir(rouge, 0.2));
      p.poser(x + 1, y + 1, rouge);
    }
  }
  // Au premier rang, de grands épis qui montent du bas du cadre.
  if (!c.petit) {
    const ecart = c.e(5);
    for (let x = entre(c.h, 0, ecart - 1); x < c.L; x += ecart + entre(c.h, 0, 2)) {
      const tige = c.e(entre(c.h, 3, 6));
      const epi = c.e(4);
      const l = Math.max(1, Math.round(c.k * 0.9));
      p.rect(x, c.H - tige, 1, tige, PAILLE_BRIN);
      for (let j = 0; j < epi; j++) {
        const y = c.H - tige - 1 - j;
        p.rect(x, y, l, 1, j === epi - 1 ? "#fdf3c4" : PAILLE.claire);
        if (j % 2 === 0) {
          p.poser(x - 1, y, PAILLE.ombre);
          p.poser(x + l, y, PAILLE_BRIN);
        }
      }
    }
  }
  calmer(p, o, avant, 0.5);
}

// ---------------------------------------------------------------------------------------------------------------------
// Le potager.
// ---------------------------------------------------------------------------------------------------------------------

/** Un chou : une boule de feuilles, le cœur clair. */
function chou(p: Planche, x: number, y: number, r: number): void {
  boule(p, x, y, r, CHOU);
  if (r >= 2) p.poser(x, y, CHOU.claire);
  if (r >= 3) {
    p.disque(x - 1, y - 1, Math.round(r / 2), CHOU.claire);
    p.poser(x, y, CHOU.fond);
    for (let d = -r + 1; d < r; d++) if (d % 2 === 0) p.poser(x + d, y + Math.round(Math.sqrt(r * r - d * d)) - 1, CHOU.ombre);
  }
}

/** Une courge : une boule orange à côtes, sa queue et une feuille. */
function courge(p: Planche, x: number, y: number, r: number): void {
  boule(p, x, y, r, COURGE);
  if (r >= 2) for (let dy = -r + 1; dy < r; dy++) p.poser(x, y + dy, dy % 2 === 0 || r >= 3 ? COURGE.ombre : COURGE.fond);
  if (r >= 4) {
    const d = Math.round(r / 2);
    for (let dy = -r + 2; dy < r - 1; dy++) {
      p.poser(x - d, y + dy, COURGE.claire);
      p.poser(x + d, y + dy, COURGE.ombre);
    }
  }
  p.poser(x, y - r - 1, FEUILLE.ombre);
  p.poser(x + 1, y - r, FEUILLE.fond);
  if (r >= 3) p.rect(x + 1, y - r - 1, 2, 1, FEUILLE.fond);
}

function peindrePotager(p: Planche, o: ParametresDuFond): void {
  const c = cadre(o);
  ciel(p, c, c.terre);
  collines(p, c, c.terre, c.e(7), LOIN);
  const coteau = collines(p, c, c.terre + 1, c.e(4), COTEAU);
  sol(p, c, [TERRE.claire, TERRE.fond, TERRE.fond, TERRE.ombre], "#f7e8c8", 1);
  const avant = p.cases.slice();
  if (!c.petit) {
    const r = c.e(3);
    const x = borner(aCote(c, r * 2, c.h() < 0.5) + r, 1, c.L - 2);
    arbre(p, x, (coteau[x] ?? c.terre) + 1, r, FEUILLE_LOIN);
  }
  // La clôture de piquets, au bord du jardin.
  const lp = c.petit ? 1 : c.e(2);
  const vide = c.k < 1.5 ? 2 : c.e(1);
  const hp = c.e(6);
  const pied = c.terre + c.e(1);
  p.rect(0, pied - c.e(4), c.L, Math.max(1, c.e(1)), BOIS.fond);
  if (hp >= 5) p.rect(0, pied - c.e(2), c.L, Math.max(1, c.e(1)), BOIS.fond);
  const depart = -entre(c.h, 0, lp + vide - 1);
  const chiffon = entre(c.h, 1, 3);
  let n = 0;
  for (let x = depart; x < c.L; x += lp + vide, n++) {
    const court = n % 4 === 2 ? 1 : 0;
    p.rect(x, pied - hp + court, lp, hp - court, BOIS.claire);
    if (lp > 2) p.rect(x + lp - 1, pied - hp + court + 1, 1, hp - court - 1, BOIS.fond);
    p.rect(x, pied - hp + court, lp, 1, "#f1e0bd");
    p.poser(x, pied, BOIS.ombre);
    // Un chiffon noué sur quelques piquets, à la couleur de la chose.
    if (n % 5 === chiffon && !toucheLaZone(o, x, pied - hp, lp, 3)) {
      p.rect(x, pied - hp + court + 1, lp, Math.max(1, c.e(1)), c.accent);
      p.poser(x + lp, pied - hp + court + 1 + Math.max(1, c.e(1)), c.accentOmbre);
    }
  }
  for (let x = 0; x < c.L; x++) if (trame(x, pied + 1, 0.5)) p.poser(x, pied + 1, TERRE.ombre);
  calmer(p, o, avant, 0.6);
  // Devant la clôture, sur les côtés : une grosse courge et un chou d'un côté, des tuteurs de haricots de l'autre.
  const gauche = c.h() < 0.5;
  const jolie = c.teinte("#f6a9c4");
  {
    const r = c.e(4);
    const x = aCote(c, r * 4, gauche) + r;
    const y = c.terre + c.e(3);
    if (!toucheLaZone(o, x - r, y - r, r * 4, r * 2)) {
      p.rect(x - r + 1, y + r, r * 2 + (c.petit ? 0 : r * 2), 1, TERRE.ombre);
      if (!c.petit) chou(p, x + r * 2 + 1, y + 1, r - 1);
      courge(p, x, y, r);
    }
    const haut = c.e(15);
    const large = c.e(4);
    const xt = aCote(c, large * 2 + 1, !gauche) + large;
    const yt = c.terre + c.e(3);
    if (!toucheLaZone(o, xt - large, yt - haut, large * 2 + 1, haut)) {
      const baton = Math.max(1, Math.round(c.k * 0.8));
      // Le feuillage qui grimpe : un cône de feuilles, clair à gauche, piqué de fleurs.
      for (let j = Math.round(haut * 0.3); j <= haut; j++) {
        const d = Math.round((large * j) / haut) + 1;
        const y = yt - haut + j;
        for (let dx = -d; dx <= d; dx++) {
          if ((dx + j) % 3 === 0 && Math.abs(dx) === d) continue;
          const t = dx / (d + 0.5);
          p.poser(xt + dx, y, t < -0.3 ? FEUILLE.claire : t > 0.4 ? FEUILLE.ombre : trame(xt + dx, y, 0.5) ? FEUILLE.claire : FEUILLE.fond);
        }
      }
      for (let j = 0; j <= haut; j++) {
        const d = Math.round((large * j) / haut);
        const y = yt - haut + j;
        if (j < haut * 0.3 || j % 4 < 2) {
          p.rect(xt - d, y, baton, 1, BOIS.claire);
          p.rect(xt + d, y, baton, 1, BOIS.ombre);
        }
        if (j < haut * 0.3) p.rect(xt, y, baton, 1, BOIS.fond);
        if (j > haut * 0.35 && j % 4 === 1) p.rect(xt + (j % 8 === 1 ? -Math.round(d / 2) : Math.round(d / 2)), y, baton, baton, jolie);
      }
      p.rect(xt - 1, yt - haut + Math.max(1, c.e(1)), 2 + baton, 1, BOIS_CREUX);
    }
  }
  // Les rangs : un sillon, puis des choux, des courges, des poireaux ou des fleurs, plus gros vers le bas.
  const premier = entre(c.h, 0, 3);
  for (let i = 0, haut = pied + 2 + (c.petit ? 0 : c.e(5)); haut < c.H; i++) {
    const r = Math.max(c.petit ? 1 : 2, Math.round(c.k * (1.6 + i * 0.5)));
    const y = haut + r + 1;
    haut = y + r + 2 + Math.round(c.k);
    p.rect(0, y + r + 1, c.L, 1, i % 2 === 0 ? SILLON : TERRE.ombre);
    const sorte = (premier + i) % 4;
    const pasDuRang = r * 2 + Math.max(2, c.e(2)) + (sorte === 2 ? -r : 0);
    for (let x = entre(c.h, 0, pasDuRang - 1); x < c.L + r; x += pasDuRang) {
      if (toucheLaZone(o, x - r, y - r - 1, r * 2 + 1, r * 2 + 2)) continue;
      // L'ombre au pied.
      p.rect(x - r + 1, y + r, r * 2, 1, TERRE.ombre);
      if (sorte === 0) {
        chou(p, x, y, r);
      } else if (sorte === 1) {
        courge(p, x, y, r);
      } else if (sorte === 2) {
        for (let dy = 0; dy <= r + 1; dy++) p.poser(x, y + r - 1 - dy, dy > r ? FEUILLE.claire : FEUILLE.fond);
        p.poser(x - 1, y - 1, FEUILLE.ombre);
        p.poser(x + 1, y - 2, FEUILLE.ombre);
      } else {
        p.rect(x, y - r + 1, 1, r * 2 - 1, FEUILLE.ombre);
        p.poser(x - 1, y, FEUILLE.fond);
        p.poser(x + 1, y + 1, FEUILLE.fond);
        fleur(p, x, y - r, jolie, r >= 2);
      }
    }
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// La ferme.
// ---------------------------------------------------------------------------------------------------------------------

/** Une botte de foin carrée, liée de deux liens. */
function botte(p: Planche, x: number, y: number, l: number, h: number): void {
  p.rect(x, y, l, h, (i, j) => (j === y ? PAILLE.claire : j === y + h - 1 || i === x + l - 1 ? PAILLE.ombre : (i + j * 2) % 5 === 0 ? PAILLE.ombre : PAILLE.fond));
  const lien = Math.max(1, Math.round(l / 4));
  p.rect(x + lien, y, 1, h, PAILLE_BRIN);
  if (l >= 6) p.rect(x + l - 1 - lien, y, 1, h, PAILLE_BRIN);
}

function peindreFerme(p: Planche, o: ParametresDuFond): void {
  const c = cadre(o);
  ciel(p, c, c.terre);
  collines(p, c, c.terre, c.e(7), LOIN);
  collines(p, c, c.terre + 1, c.e(4), COTEAU);
  sol(p, c, [TERRE.claire, TERRE.claire, TERRE.fond, TERRE.ombre], "#f7e8c8", 1);
  const avant = p.cases.slice();
  const gauche = c.h() < 0.5;
  // La barrière, derrière la cour.
  const pied = c.terre + c.e(1);
  const hb = c.e(5);
  p.rect(0, pied - hb + 1, c.L, Math.max(1, c.e(1)), BOIS.claire);
  p.rect(0, pied - Math.max(2, c.e(2)), c.L, Math.max(1, c.e(1)), BOIS.claire);
  for (let x = entre(c.h, 0, c.e(8)); x < c.L; x += c.e(9)) {
    p.rect(x, pied - hb, Math.max(1, c.e(1.4)), hb + 1, BOIS.fond);
    p.poser(x, pied - hb, BOIS.claire);
  }
  for (let x = 0; x < c.L; x++) if (trame(x, pied + 1, 0.5)) p.poser(x, pied + 1, TERRE.ombre);
  calmer(p, o, avant, 0.6);
  // La grange de bois, sur un côté : des planches, un toit de chaume, une porte à la couleur de la chose.
  const place = gauche ? c.zg : c.L - c.zd - 1;
  const lg = borner(place - c.e(1), c.e(8), c.e(22));
  const x0 = gauche ? 0 : c.L - lg;
  const bas = c.terre + c.e(3);
  const mur = bas - c.e(13);
  const planche = Math.max(2, c.e(3));
  p.rect(x0, mur, lg, bas - mur + 1, (x, y) => {
    const i = gauche ? x - x0 : x0 + lg - 1 - x;
    if (i % planche === planche - 1) return BOIS.ombre;
    if (y === bas) return BOIS.ombre;
    return (y + Math.floor(i / planche) * 3) % 7 === 0 && i % planche === 1 ? BOIS.ombre : gauche === i < lg - 2 ? BOIS.fond : BOIS.claire;
  });
  // Le pan clair du mur, vers la cour.
  p.rect(gauche ? x0 + lg - 1 : x0, mur, 1, bas - mur + 1, BOIS.claire);
  const ht = c.e(8);
  for (let j = 0; j <= ht; j++) {
    const y = mur - ht + j;
    const l = lg + c.e(2) - Math.round((ht - j) * 0.8);
    if (l <= 0) continue;
    const x = gauche ? 0 : c.L - l;
    p.rect(x, y, l, 1, (i) => {
      const bord = gauche ? i === x + l - 1 : i === x;
      if (j === ht) return PAILLE_BRIN;
      if (bord) return PAILLE.claire;
      if (j % 3 === 2) return trame(i, y, 0.5) ? PAILLE.ombre : PAILLE.fond;
      return j < 2 ? PAILLE.claire : PAILLE.fond;
    });
  }
  // L'ombre du toit sur le mur.
  for (let x = x0; x < x0 + lg; x++) {
    p.poser(x, mur, BOIS.ombre);
    if (trame(x, mur + 1, 0.5)) p.poser(x, mur + 1, BOIS.ombre);
  }
  const lporte = Math.min(c.e(7), lg - 2);
  const hporte = c.e(9);
  if (lporte >= 3) {
    const xp = gauche ? Math.max(1, lg - lporte - c.e(3)) : c.L - lg + Math.min(c.e(3), lg - lporte - 1);
    const yp = bas - hporte + 1;
    p.rect(xp - 1, yp - 1, lporte + 2, hporte + 1, BOIS_CREUX);
    p.rect(xp, yp, lporte, hporte, (x, y) => {
      const i = x - xp;
      const j = y - yp;
      if (Math.round((j * (lporte - 1)) / Math.max(1, hporte - 1)) === i) return c.accentOmbre;
      if (j === 0) return eclaircir(c.accent, 0.3);
      return i % Math.max(2, c.e(2)) === 0 ? c.accentOmbre : c.accent;
    });
  }
  // Les bottes de foin, de l'autre côté de la cour.
  const lb = c.e(8);
  const hbo = c.e(5);
  const xb = aCote(c, lb + Math.round(lb / 2), !gauche);
  const yb = c.terre + c.e(5);
  if (!toucheLaZone(o, xb, yb - hbo * 2, lb * 2, hbo * 2)) {
    botte(p, xb, yb - hbo + 1, lb, hbo);
    if (!c.petit) {
      botte(p, xb + lb, yb - hbo + 1, lb, hbo);
      botte(p, xb + Math.round(lb / 2), yb - hbo * 2 + 1, lb, hbo);
    }
    for (let x = xb; x < xb + lb * (c.petit ? 1 : 2); x++) if (trame(x, yb + 1, 0.5)) p.poser(x, yb + 1, TERRE.ombre);
  }
  // La cour : des brins de paille, des cailloux, un peu d'herbe au bord.
  const fond = c.H - c.terre;
  const brins = Math.round((c.L * fond) / 60);
  for (let i = 0; i < brins; i++) {
    const x = entre(c.h, 0, c.L - 2);
    const y = entre(c.h, c.terre + c.e(5), c.H - 1);
    if (i % 3 === 0) {
      p.poser(x, y, GALET.fond);
      p.poser(x + 1, y, GALET.ombre);
    } else if (i % 3 === 1) {
      p.rect(x, y, 2, 1, PAILLE.claire);
    } else {
      touffe(p, aCote(c, 3, i % 2 === 0) + 1, y, HERBE.ombre);
    }
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// La forêt de chênes.
// ---------------------------------------------------------------------------------------------------------------------

const TRONC: Tons = { claire: "#cfb08a", fond: "#b8946c", ombre: "#9f7c58" };
const MOUSSE: Tons = { claire: "#cdeaa2", fond: "#b0d98a", ombre: "#93c876" };

/** Un champignon : un pied crème, un chapeau de couleur. */
function champignon(p: Planche, x: number, y: number, r: number, chapeau: string, ombre: string): void {
  const pied = Math.max(1, r - 1);
  p.rect(x, y - pied + 1, 1, pied, "#fbf3e0");
  if (r >= 3) p.rect(x + 1, y - pied + 1, 1, pied, "#e9dcc0");
  // Le chapeau : un dôme, large en bas.
  for (let j = 0; j < r; j++) {
    const l = j === 0 ? r : Math.max(0, r - j);
    p.rect(x - l, y - pied - j, l * 2 + 1, 1, (i) => (j === 0 && i > x ? ombre : chapeau));
  }
  if (r >= 2) p.poser(x - 1, y - pied - 1, "#ffffff");
}

function peindreForet(p: Planche, o: ParametresDuFond): void {
  const c = cadre(o);
  // Le sous-bois clair : une lumière verte et dorée.
  degrade(p, 0, c.terre, "#cfeab6", "#eff8da", 4);
  // Les troncs du fond, noyés dans la lumière.
  for (let i = 0, n = Math.round(c.L / 7); i < n; i++) {
    const l = Math.max(1, c.e(entre(c.h, 1, 2)));
    p.rect(entre(c.h, 0, c.L - 1), 0, l, c.terre + 1, "#d3e6ba");
  }
  const avantTroncs = p.cases.slice();
  for (let i = 0, n = Math.max(2, Math.round(c.L / 14)); i < n; i++) {
    const l = c.e(entre(c.h, 2, 3));
    const x = i % 3 === 2 ? entre(c.h, 0, c.L - 1) : aCote(c, l, i % 2 === 0);
    p.rect(x, 0, l, c.terre + 2, "#bfd0a0");
    p.rect(x, 0, 1, c.terre + 2, "#cbdcae");
  }
  calmer(p, o, avantTroncs, 0.7);
  // Les rais de lumière, en biais depuis le haut à gauche.
  const pas = c.e(15);
  const large = c.e(5);
  const decalage = entre(c.h, 0, pas - 1);
  for (let y = 0; y <= c.terre; y++) {
    for (let x = 0; x < c.L; x++) {
      const v = (((x - Math.round(y * 0.7) + decalage) % pas) + pas) % pas;
      if (v >= large) continue;
      const bord = v === 0 || v === large - 1;
      if (bord && !trame(x, y, 0.5)) continue;
      const ici = p.lire(x, y);
      if (ici) p.poser(x, y, melanger(ici, "#fffbe0", 0.5));
    }
  }
  // Le sol de mousse.
  const terre = sol(p, c, [MOUSSE.claire, MOUSSE.fond, MOUSSE.fond, MOUSSE.ombre], "#e0f3bd");
  // Deux gros chênes, un de chaque côté : écorce claire, racines.
  for (const gauche of [true, false]) {
    const l = c.e(entre(c.h, 6, 8));
    const x = aCote(c, l, gauche);
    const bas = Math.min(c.H - 1, c.terre + c.e(entre(c.h, 3, 5)));
    p.rect(x, 0, l, bas + 1, (i, j) => {
      const d = i - x;
      if (d < Math.max(1, Math.round(l * 0.25))) return TRONC.claire;
      if (d >= l - Math.max(1, Math.round(l * 0.25))) return TRONC.ombre;
      // L'écorce : de courts traits, rangés.
      return d % 2 === 1 && (j + d * 2) % 7 < 2 ? TRONC.ombre : TRONC.fond;
    });
    // Les racines qui s'évasent.
    const racine = c.e(2);
    for (let j = 0; j < racine; j++) {
      p.rect(x - racine + j, bas - j, racine - j, 1, TRONC.fond);
      p.rect(x + l, bas - j, racine - j, 1, TRONC.ombre);
    }
    for (let i = x - racine; i < x + l + racine; i++) if (trame(i, bas + 1, 0.5)) p.poser(i, bas + 1, MOUSSE.ombre);
  }
  // Le feuillage, en haut du cadre : deux épaisseurs de bosses, plus basses dans les coins.
  const epaisseurs: [Tons, number][] = [
    [FEUILLE_LOIN, c.e(4)],
    [FEUILLE, 0],
  ];
  for (const [tons, plus] of epaisseurs) {
    const pasBosse = Math.max(3, c.e(5));
    for (let x = -entre(c.h, 0, pasBosse); x < c.L + pasBosse; x += pasBosse) {
      const bord = Math.abs((2 * x) / Math.max(1, c.L - 1) - 1);
      const r = c.e(4) + entre(c.h, 0, c.e(1));
      const cy = Math.round(c.e(1) + plus + c.e(7) * bord * bord + entre(c.h, 0, c.e(1))) - 1;
      p.rect(x - r, 0, r * 2 + 1, Math.max(0, cy), tons.fond);
      boule(p, x, cy, r, tons);
    }
  }
  // Au sol : feuilles tombées, fougères et champignons sur les côtés.
  const fond = c.H - c.terre;
  for (let i = 0, n = Math.round((c.L * fond) / 40); i < n; i++) {
    const x = entre(c.h, 0, c.L - 2);
    const y = entre(c.h, c.terre + 2, c.H - 1);
    if ((terre[x] ?? 0) >= y) continue;
    if (i % 3 === 0) p.rect(x, y, 2, 1, "#e8c67c");
    else if (i % 3 === 1) p.poser(x, y, "#dcae62");
    else touffe(p, x, y, MOUSSE.ombre);
  }
  if (!c.petit) {
    for (const gauche of [true, false]) {
      const x = aCote(c, 7, gauche) + 3;
      const y = entre(c.h, c.terre + c.e(4), c.H - 2);
      for (let j = 0; j < c.e(4); j++) {
        p.poser(x - j, y - j, FEUILLE.ombre);
        p.poser(x + j, y - j, FEUILLE.fond);
        if (j % 2 === 1) {
          p.poser(x - j - 1, y - j + 1, FEUILLE.fond);
          p.poser(x + j + 1, y - j + 1, FEUILLE.claire);
        }
      }
      p.rect(x, y - c.e(4), 1, c.e(4), FEUILLE.fond);
    }
  }
  const champignons = c.petit ? 1 : 3;
  const chapeau = c.teinte("#ef9a7c");
  for (let i = 0; i < champignons; i++) {
    const r = Math.max(2, Math.round(c.k * (i === 0 ? 3 : 2)));
    const x = aCote(c, r * 2 + 1, i % 2 === 0) + r;
    const y = entre(c.h, Math.min(c.H - 2, c.terre + c.e(4)), c.H - 2);
    champignon(p, x, y, r, chapeau, assombrir(chapeau, 0.2));
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Le bord de rivière.
// ---------------------------------------------------------------------------------------------------------------------

function peindreRiviere(p: Planche, o: ParametresDuFond): void {
  const c = cadre(o);
  const rive = Math.round(c.terre * 0.36);
  ciel(p, c, rive + c.e(3));
  // L'autre rive : des arbres au loin, puis un talus d'herbe.
  collines(p, c, rive + c.e(1), c.e(5), LOIN);
  const bosquets = crete(c.L, rive + c.e(2), c.e(4), c.h);
  remplirSous(p, bosquets, (x, y, prof) => (prof === 0 ? FEUILLE_LOIN.claire : (x + prof * 2) % 4 === 0 && prof < 3 ? FEUILLE_LOIN.ombre : FEUILLE_LOIN.fond));
  // Quelques arbres ronds sur l'autre rive, sur les côtés.
  if (!c.petit) {
    for (const cote of [true, false]) {
      const r = c.e(entre(c.h, 2, 3));
      const x = borner(aCote(c, r * 2, cote) + r, 1, c.L - 2);
      arbre(p, x, (bosquets[x] ?? rive) + 1, r, FEUILLE_LOIN);
    }
  }
  const eau0 = rive + c.e(3);
  // L'eau claire, qui garde un peu du vert de la rive en haut.
  for (let y = eau0; y < c.H; y++) {
    for (let x = 0; x < c.L; x++) {
      const prof = y - eau0;
      let couleur = ton(x, y, (y - eau0) / Math.max(1, c.terre - eau0), [EAU.claire, EAU.fond, EAU.fond, EAU.ombre]);
      if (prof === 0) couleur = "#9fcf9a";
      else if (prof <= c.e(2) && trame(x, y, prof === 1 ? 0.5 : 0.25)) couleur = "#bfe3c2";
      p.poser(x, y, couleur);
    }
  }
  const avant = p.cases.slice();
  // Les reflets : de petits traits clairs, rangés.
  const lignes = Math.max(2, Math.round((c.terre - eau0) / 3));
  for (let i = 0; i < lignes; i++) {
    const y = eau0 + 2 + i * 3 + (i % 2);
    if (y >= c.terre - 1) break;
    for (let x = entre(c.h, 0, c.e(8)); x < c.L; x += c.e(entre(c.h, 9, 15))) {
      const l = c.e(entre(c.h, 2, 5));
      p.rect(x, y, l, 1, REFLET);
      if (!c.petit) p.rect(x + 1, y + 1, Math.max(1, l - 2), 1, EAU.ombre);
    }
  }
  calmer(p, o, avant, 0.75);
  const gauche = c.h() < 0.5;
  // Le bouchon de pêche, à la couleur de la chose, et ses ronds dans l'eau.
  {
    const x = aCote(c, c.e(5), !gauche) + c.e(2);
    const y = Math.round(eau0 + (c.terre - eau0) * (0.35 + c.h() * 0.3));
    const l = Math.max(1, Math.round(c.k));
    p.rect(x - c.e(2), y + l, c.e(4) + l, 1, REFLET);
    p.rect(x, y - l, l, l, "#ffffff");
    p.rect(x, y, l, l, c.teinte("#ef7a6a"));
    p.poser(x, y - l - 1, BOIS_CREUX);
  }
  // Le petit ponton, d'un côté : des planches sur des pieux.
  const place = gauche ? c.zg : c.L - c.zd - 1;
  const lp = borner(place - c.e(1), c.e(7), c.e(20));
  const xp = gauche ? 0 : c.L - lp;
  const yp = c.terre - c.e(4);
  const ep = Math.max(2, c.e(2));
  const pieu = Math.max(1, c.e(1.5));
  for (const t of [0.15, 0.85]) {
    const x = Math.round(gauche ? xp + (lp - pieu - 1) * t : xp + 1 + (lp - pieu - 1) * (1 - t));
    p.rect(x, yp, pieu, c.terre - yp + c.e(1), BOIS.ombre);
    p.rect(x, yp, 1, c.terre - yp + c.e(1), BOIS.fond);
    if (t > 0.5) {
      // Le pieu du bout, plus haut.
      p.rect(x, yp - c.e(3), pieu, c.e(3), BOIS.fond);
      p.rect(x, yp - c.e(3), pieu, 1, BOIS.claire);
    }
    for (let j = 1; j <= c.e(2); j++) if (trame(x, c.terre + j, 0.5)) p.rect(x, c.terre - 1 + j, pieu, 1, EAU.ombre);
  }
  p.rect(xp, yp, lp, ep, (x, y) => {
    if (y === yp) return (x - xp) % Math.max(3, c.e(4)) === 0 ? BOIS.fond : BOIS.claire;
    return y === yp + ep - 1 ? BOIS.ombre : BOIS.fond;
  });
  for (let x = xp; x < xp + lp; x++) if (trame(x, yp + ep, 0.5)) p.poser(x, yp + ep, EAU.ombre);
  // La rive d'ici : du sable, des galets, un peu d'herbe.
  const berge = sol(p, c, [SABLE.claire, SABLE.fond, SABLE.fond, SABLE.ombre], "#fbf5e2", 2);
  for (let x = 0; x < c.L; x++) {
    const y = (berge[x] ?? c.terre) - 1;
    if (trame(x, y, 0.5)) p.poser(x, y, REFLET);
  }
  const fond = c.H - c.terre;
  for (let i = 0, n = Math.max(3, Math.round((c.L * fond) / 90)); i < n; i++) {
    const l = Math.max(2, c.e(entre(c.h, 2, 4)));
    const x = entre(c.h, 0, c.L - l);
    const y = entre(c.h, c.terre + 2, c.H - 2);
    if (toucheLaZone(o, x, y, l, l)) continue;
    if (i % 4 === 3) {
      touffe(p, x, y, HERBE.ombre);
      continue;
    }
    const h = Math.max(1, Math.round(l / 2));
    p.rect(x, y, l, h, GALET.fond);
    p.rect(x, y, l - 1, 1, GALET.claire);
    p.rect(x + 1, y + h, l - 1, 1, SABLE.ombre);
    if (h > 1) p.rect(x + l - 1, y + 1, 1, h - 1, GALET.ombre);
  }
  // Les roseaux, en bouquets sur les côtés, et un iris à la couleur de la chose.
  for (const cote of [true, false]) {
    const bouquets = c.petit ? 1 : 1 + (c.h() < 0.5 ? 1 : 0);
    for (let b = 0; b < bouquets; b++) {
      const x0 = aCote(c, c.e(5), cote);
      const base = Math.min(c.H - 1, c.terre + c.e(entre(c.h, 2, 5)));
      const tiges = entre(c.h, 3, 5);
      for (let i = 0; i < tiges; i++) {
        const x = x0 + i * Math.max(2, c.e(1.6));
        const haut = c.e(entre(c.h, 8, 14));
        const penche = i % 2 === 0 ? -1 : 1;
        for (let j = 0; j < haut; j++) p.poser(x + (j > haut * 0.6 ? penche : 0), base - j, i % 2 === 0 ? FEUILLE.fond : FEUILLE.ombre);
        if (i % 2 === 1 || tiges === 3) {
          const tete = Math.max(2, c.e(3));
          const l = Math.max(1, Math.round(c.k * 0.8));
          p.rect(x + penche, base - haut - tete + 1, l, tete, "#b58558");
          p.rect(x + penche, base - haut - tete + 1, 1, tete, "#c99c6e");
          p.poser(x + penche, base - haut - tete, FEUILLE.ombre);
        }
      }
      if (b === 0 && cote === gauche) {
        const x = x0 + tiges * Math.max(2, c.e(1.6)) + 1;
        const y = base - c.e(4);
        p.rect(x, y, 1, c.e(4), FEUILLE.fond);
        fleur(p, x, y - 1, c.teinte("#b9a4ee"), !c.petit);
      }
    }
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Le jardin fleuri.
// ---------------------------------------------------------------------------------------------------------------------

/** Un papillon : deux ailes de couleur autour d'un petit corps. */
function papillon(p: Planche, x: number, y: number, aile: string, grand: boolean): void {
  const clair = eclaircir(aile, 0.35);
  if (grand) {
    p.rect(x - 2, y - 2, 2, 2, aile);
    p.rect(x + 1, y - 2, 2, 2, aile);
    p.poser(x - 2, y - 2, clair);
    p.poser(x + 2, y - 2, clair);
    p.poser(x - 1, y, clair);
    p.poser(x + 1, y, clair);
    p.rect(x, y - 2, 1, 3, "#8a7868");
    return;
  }
  p.poser(x - 1, y - 1, aile);
  p.poser(x + 1, y - 1, aile);
  p.poser(x - 1, y, clair);
  p.poser(x + 1, y, clair);
  p.poser(x, y, "#8a7868");
}

/** La ruche de paille : des boudins de paille empilés en cloche, sur un tabouret de bois. */
function ruche(p: Planche, cx: number, base: number, demi: number, haut: number, c: Cadre): void {
  const pied = c.e(2);
  p.rect(cx - demi - 1, base - pied, demi * 2 + 3, 1, BOIS.claire);
  p.rect(cx - demi, base - pied + 1, 1, pied, BOIS.ombre);
  p.rect(cx + demi, base - pied + 1, 1, pied, BOIS.ombre);
  const bas = base - pied - 1;
  const boudin = Math.max(2, c.e(2));
  for (let j = 0; j < haut; j++) {
    const t = j / Math.max(1, haut - 1);
    const l = Math.max(1, Math.round(demi * Math.sqrt(1 - t * t * 0.92)));
    const y = bas - j;
    p.rect(cx - l, y, l * 2 + 1, 1, (x) => {
      if (j % boudin === 0 && j > 0) return PAILLE_BRIN;
      const d = (x - cx) / (l + 0.5);
      if (d < -0.4) return PAILLE.claire;
      if (d > 0.5) return PAILLE.ombre;
      return PAILLE.fond;
    });
  }
  p.poser(cx, bas - haut, PAILLE_BRIN);
  p.rect(cx - Math.floor(c.e(1) / 2), bas - Math.max(1, c.e(1)) + 1 - (boudin > 2 ? 1 : 0), Math.max(1, c.e(1.4)), Math.max(1, c.e(1)), BOIS_CREUX);
}

function peindreJardin(p: Planche, o: ParametresDuFond): void {
  const c = cadre(o);
  ciel(p, c, c.terre);
  collines(p, c, c.terre, c.e(9), LOIN);
  // La haie taillée : haute sur les côtés, plus basse derrière la chose.
  const milieu = o.zone.x + o.zone.largeur / 2;
  const bosse = Math.max(4, c.e(6));
  const decalage = entre(c.h, 0, bosse - 1);
  const sommet: number[] = [];
  for (let x = 0; x < c.L; x++) {
    const ecart = Math.min(1, Math.abs(x - milieu) / Math.max(1, c.L * 0.5));
    const rond = Math.round(Math.abs(Math.sin(((x + decalage) * Math.PI) / bosse)) * (c.petit ? 1 : c.e(1.4)));
    sommet.push(c.terre - c.e(3) - Math.round(c.e(7) * ecart * ecart) - rond);
  }
  for (let x = 0; x < c.L; x++) {
    const y0 = sommet[x] ?? c.terre;
    for (let y = y0; y <= c.terre + c.e(1); y++) {
      const prof = y - y0;
      let couleur = FEUILLE.fond;
      if (prof === 0) couleur = FEUILLE.claire;
      else if (prof <= c.e(2)) couleur = trame(x, y, 0.5) ? FEUILLE.claire : FEUILLE.fond;
      else if (y >= c.terre - c.e(1)) couleur = trame(x, y, 0.5) ? FEUILLE.ombre : FEUILLE.fond;
      else if (x % 4 === (y % 8 < 4 ? 1 : 3) && y % 4 === 2) couleur = FEUILLE.ombre;
      p.poser(x, y, couleur);
    }
  }
  // La pelouse.
  const pelouse = crete(c.L, c.terre + c.e(1) + 1, 1, c.h);
  remplirSous(p, pelouse, (x, y, prof) => (prof === 0 ? "#d6f0b2" : ton(x, y, (y - c.terre) / Math.max(1, c.H - 1 - c.terre), [HERBE.claire, HERBE.fond, HERBE.fond, HERBE.ombre])));
  const avant = p.cases.slice();
  // Des fleurs dans la haie et au pied de la haie.
  const couleurs = [c.teinte("#f6a9c4"), ...FLEURS];
  for (let i = 0, n = Math.round(c.L / 5); i < n; i++) {
    const x = entre(c.h, 1, c.L - 2);
    const y0 = sommet[x] ?? c.terre;
    const y = entre(c.h, Math.min(y0 + 2, c.terre), c.terre);
    p.poser(x, y, couleurs[i % couleurs.length] ?? c.accent);
  }
  const pasFleur = Math.max(3, c.e(3));
  for (let x = entre(c.h, 0, pasFleur - 1), i = 0; x < c.L; x += pasFleur, i++) {
    const y = c.terre + c.e(1) - (i % 2);
    p.rect(x, y, 1, c.e(2) + 1, BRIN);
    p.poser(x, y - 1, couleurs[(i * 2) % couleurs.length] ?? c.accent);
    if (!c.petit) p.poser(x + (i % 2 === 0 ? 1 : -1), y, couleurs[(i * 2) % couleurs.length] ?? c.accent);
  }
  calmer(p, o, avant, 0.7);
  // La ruche de paille, d'un côté.
  const gauche = c.h() < 0.5;
  const demi = c.e(4);
  const xr = borner(aCote(c, demi * 2 + 3, gauche) + demi + 1, demi, c.L - 1 - demi);
  const yr = c.terre + c.e(5);
  if (!toucheLaZone(o, xr - demi, yr - c.e(11), demi * 2 + 1, c.e(11))) {
    for (let x = xr - demi - 1; x <= xr + demi + 1; x++) if (trame(x, yr + 1, 0.5)) p.poser(x, yr + 1, HERBE.ombre);
    ruche(p, xr, yr, demi, c.e(8), c);
  }
  // Les papillons, dans le ciel, sur les côtés.
  const papillons = c.petit ? 1 : 2 + (c.h() < 0.5 ? 1 : 0);
  for (let i = 0; i < papillons; i++) {
    const x = aCote(c, 5, i % 2 === 0 ? !gauche : gauche) + 2;
    const y = entre(c.h, c.e(8), Math.max(c.e(8), c.terre - c.e(12)));
    papillon(p, x, y, i === 0 ? c.teinte("#f6a9c4") : (FLEURS[i] ?? "#ffe27a"), c.k >= 1.6);
  }
  // Les massifs : des touffes de feuilles piquées de fleurs, dans les coins du bas.
  for (const cote of [true, false]) {
    const massifs = c.petit ? 1 : 2;
    for (let m = 0; m < massifs; m++) {
      const r = c.e(entre(c.h, 5, 7)) - m;
      const x = cote ? entre(c.h, 0, c.e(3)) + m * r * 2 : c.L - 1 - entre(c.h, 0, c.e(3)) - m * r * 2;
      const y = c.H - 1 - Math.round(r * 0.15) + m;
      if (toucheLaZone(o, x - r, y - r, r * 2 + 1, r)) continue;
      boule(p, x, y, r, FEUILLE);
      for (let i = 0, n = Math.max(3, r * 2); i < n; i++) {
        const fx = x + entre(c.h, -r + 1, r - 1);
        const fy = y - entre(c.h, 0, r - 1);
        if ((fx - x) ** 2 + (fy - y) ** 2 > (r - 1) ** 2 || fy > c.H - 2) continue;
        fleur(p, fx, fy, couleurs[(i + m) % couleurs.length] ?? c.accent, !c.petit && i % 2 === 0);
      }
    }
  }
  // Quelques fleurs semées dans la pelouse.
  for (let i = 0, n = Math.round(c.L / 10); i < n; i++) {
    const x = entre(c.h, 1, c.L - 2);
    const y = entre(c.h, c.terre + c.e(3), c.H - 3);
    if (toucheLaZone(o, x - 1, y - 1, 3, 3)) continue;
    if (i % 2 === 0) touffe(p, x, y, HERBE.ombre);
    else p.poser(x, y, couleurs[i % couleurs.length] ?? c.accent);
  }
}

export const SCENES_A: readonly SceneDeFond[] = [
  { id: "prairie", nom: "La prairie", peindre: peindrePrairie },
  { id: "champ-de-ble", nom: "Le champ de blé", peindre: peindreChampDeBle },
  { id: "potager", nom: "Le potager", peindre: peindrePotager },
  { id: "ferme", nom: "La ferme", peindre: peindreFerme },
  { id: "foret-de-chenes", nom: "La forêt de chênes", peindre: peindreForet },
  { id: "bord-de-riviere", nom: "Le bord de rivière", peindre: peindreRiviere },
  { id: "jardin-fleuri", nom: "Le jardin fleuri", peindre: peindreJardin },
];
