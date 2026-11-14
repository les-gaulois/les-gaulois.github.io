/**
 * Les arbres du monde du village, vus de côté et posés sur leur sol, dessinés case par case à la taille des Gaulois
 * (48 × 64) : le grand chêne, le hêtre, le bouleau au tronc blanc, le sapin, le saule, le pommier, le noisetier et les
 * buissons. Un tronc noueux qui s'évase en racines, une écorce, des branches, puis le feuillage en masses : chaque masse
 * a son côté au soleil et son dessous dans l'ombre, et son bord est déchiqueté par les feuilles. Une ombre portée
 * assombrit le sol au pied.
 *
 * Chaque arbre se dessine dans son propre cadre puis se pose, à l'endroit ou retourné ; la lumière vient toujours de la
 * gauche. `variante` choisit le sens, la taille et la teinte : deux voisins ne sont jamais pareils. Rien n'est tiré au
 * hasard : `alea(x, y)` donne un grain qui ne bouge pas. Aucun dessin ne rappelle une œuvre existante.
 * Design : Claude Fable 5.2.
 */
import { type Palette, Planche, alea } from "../decor";
import { type Lumiere, couleurDuDehors, melanger } from "../lumiere";

export type Essence = "chene" | "hetre" | "bouleau" | "sapin" | "saule" | "pommier" | "noisetier" | "buisson";

/** Le cadre de chaque essence à sa taille ordinaire : le tronc est au milieu, le pied sur la dernière rangée. */
export const ARBRES: Readonly<Record<Essence, { largeur: number; hauteur: number }>> = {
  chene: { largeur: 236, hauteur: 250 },
  hetre: { largeur: 160, hauteur: 270 },
  bouleau: { largeur: 104, hauteur: 216 },
  sapin: { largeur: 104, hauteur: 236 },
  saule: { largeur: 200, hauteur: 190 },
  pommier: { largeur: 128, hauteur: 132 },
  noisetier: { largeur: 116, hauteur: 108 },
  buisson: { largeur: 64, hauteur: 38 },
};

/** La taille d'un arbre, de 0,78 à 1,14 fois l'ordinaire, et son sens. */
export const tailleDeLArbre = (variante: number): number => 0.78 + Math.round(alea(variante, 401) * 6) * 0.06;
const retourne = (variante: number): boolean => alea(variante, 733) < 0.5;

/** Le cadre d'un arbre posé : sa largeur et sa hauteur en cases, à sa taille. */
export function cadreDeLArbre(essence: Essence, variante: number, taille = tailleDeLArbre(variante)): { largeur: number; hauteur: number } {
  return { largeur: Math.ceil(ARBRES[essence].largeur * taille), hauteur: Math.ceil(ARBRES[essence].hauteur * taille) };
}

interface Tons {
  /** Du plus éclairé au plus sombre. */
  feuilles: readonly [string, string, string, string, string];
  tronc: { clair: string; fond: string; sombre: string; creux: string };
}

interface Atelier {
  pl: Planche;
  tons: Tons;
  envers: boolean;
  variante: number;
  /** La taille : toutes les mesures du dessin en sont multipliées. */
  s: number;
  /** La colonne du tronc et la rangée du pied. */
  cx: number;
  g: number;
}

/** Les teintes de chaque essence : vers quoi tire son feuillage, de jour et de nuit, et de combien. */
const TEINTES: Readonly<Record<Essence, readonly [string, string, number]>> = {
  chene: ["#3f7a34", "#1c4a30", 0.35],
  hetre: ["#6aa83e", "#2a6040", 0.4],
  bouleau: ["#9cc04a", "#3a6a4a", 0.5],
  sapin: ["#1f5a4a", "#0f3034", 0.62],
  saule: ["#8aa86a", "#34584a", 0.55],
  pommier: ["#5a9a3a", "#245a38", 0.3],
  noisetier: ["#7a9a34", "#2c5434", 0.4],
  buisson: ["#3f8a48", "#1d5236", 0.2],
};

function tonsDe(p: Palette, l: Lumiere, essence: Essence, variante: number): Tons {
  const [deJour, deNuit, part] = TEINTES[essence];
  const vers = couleurDuDehors(deJour, deNuit, l);
  // Une nuance par arbre : un peu plus jaune, un peu plus bleue, ou telle quelle.
  const nuance = [null, couleurDuDehors("#b8b03a", "#3a5a3a", l), couleurDuDehors("#2a6a6a", "#143a44", l)][Math.floor(alea(variante, 87) * 3)];
  const f = (couleur: string): string => {
    const teinte = melanger(couleur, vers, part);
    return nuance ? melanger(teinte, nuance, 0.16) : teinte;
  };
  const soleil = couleurDuDehors("#e2ee7a", "#4a8a6a", l);
  const nuit = couleurDuDehors("#0e2a22", "#06141c", l);
  const blanc = essence === "bouleau";
  const gris = essence === "hetre";
  const k = (deJ: string, deN: string) => couleurDuDehors(deJ, deN, l);
  return {
    feuilles: [melanger(f(p.feuilles.claire), soleil, 0.34), f(p.feuilles.claire), f(p.feuilles.fond), f(p.feuilles.sombre), melanger(f(p.feuilles.sombre), nuit, 0.5)],
    tronc: blanc
      ? { clair: k("#f4f1e6", "#8c90a0"), fond: k("#dcd8c8", "#70748a"), sombre: k("#a8a698", "#50546a"), creux: k("#2c2a28", "#16161c") }
      : gris
        ? { clair: k("#a8a394", "#5c5e6a"), fond: k("#8a8678", "#484a56"), sombre: k("#676358", "#343640"), creux: k("#3a372f", "#1c1c24") }
        : { clair: p.tronc.clair, fond: p.tronc.fond, sombre: p.tronc.sombre, creux: melanger(p.tronc.sombre, "#0a0806", 0.45) },
  };
}

/** Le côté d'une case, de −1 (vers la lumière) à 1 (dans l'ombre). */
const versLOmbre = (a: Atelier, dx: number): number => (a.envers ? -dx : dx);

/* ---------- Le tronc et les branches ---------- */

/**
 * Un tronc : de la rangée du pied jusqu'à `hauteur` plus haut, large de `bas` au pied et de `haut` en haut, penché de
 * `penche` cases ; il s'évase en racines sur ses douze dernières rangées. Rend la colonne de son sommet.
 */
function tronc(a: Atelier, hauteur: number, bas: number, haut: number, penche = 0, noeuds = 2): number {
  const { pl, tons, g } = a;
  const H = Math.round(hauteur * a.s);
  const evase = Math.round(12 * a.s);
  let sommet = a.cx;
  for (let r = 0; r <= H; r++) {
    const part = r / Math.max(1, H);
    const milieu = a.cx + Math.round(penche * a.s * part * part);
    let large = (haut + (bas - haut) * (1 - part) ** 1.6) * a.s;
    if (r < evase) large += ((evase - r) ** 2 / evase) * 0.9;
    const demi = Math.max(1, Math.round(large / 2));
    const y = g - r;
    for (let dx = -demi; dx <= demi; dx++) {
      const u = versLOmbre(a, dx) / demi;
      const x = milieu + dx;
      // L'écorce : des gerçures qui montent, plus serrées sur le côté à l'ombre.
      const gercure = alea(x * 3 + (y >> 3), y >> 2) < 0.2 + (u > 0 ? 0.12 : 0);
      let couleur = u < -0.45 ? tons.tronc.clair : u > 0.5 ? tons.tronc.sombre : tons.tronc.fond;
      if (gercure) couleur = u > 0.5 ? tons.tronc.creux : tons.tronc.sombre;
      if (Math.abs(dx) === demi) couleur = u > 0 ? tons.tronc.creux : tons.tronc.sombre;
      // Les racines : sous l'évasement, on voit la terre entre elles.
      if (r < evase * 0.5 && Math.abs(dx) > demi * 0.45 && (x + a.variante) % 5 === 0 && r < 3) continue;
      pl.poser(x, y, couleur);
    }
    sommet = milieu;
  }
  // Les nœuds : un œil sombre cerné de clair.
  for (let n = 0; n < noeuds; n++) {
    const r = Math.round(H * (0.28 + 0.3 * n + alea(a.variante, n) * 0.1));
    const part = r / Math.max(1, H);
    const nx = a.cx + Math.round(penche * a.s * part * part) + (n % 2 === 0 ? -1 : 2);
    const ny = g - r;
    if (bas * a.s < 9) {
      pl.rect(nx - 2, ny, 5, 1, tons.tronc.creux);
      continue;
    }
    pl.rect(nx - 2, ny - 2, 5, 5, (i, j) => {
      const d = Math.abs(i - nx) + Math.abs(j - ny);
      return d === 0 ? tons.tronc.creux : d === 1 ? tons.tronc.sombre : d === 2 && j < ny ? tons.tronc.clair : null;
    });
  }
  return sommet;
}

/** Une branche, de (x0, y0) à (x1, y1), qui s'amincit. */
function branche(a: Atelier, x0: number, y0: number, x1: number, y1: number, epaisseur: number): void {
  const { pl, tons } = a;
  const pas = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
  for (let k = 0; k <= pas; k++) {
    const part = k / pas;
    const x = Math.round(x0 + (x1 - x0) * part);
    // Une branche monte en s'arrondissant : elle part droit, puis se couche.
    const y = Math.round(y0 + (y1 - y0) * Math.sin((part * Math.PI) / 2));
    const e = Math.max(1, Math.round(epaisseur * a.s * (1 - part * 0.7)));
    for (let j = 0; j < e; j++) pl.poser(x, y + j, j === 0 && e > 1 ? tons.tronc.clair : j === e - 1 ? tons.tronc.sombre : tons.tronc.fond);
  }
}

/* ---------- Le feuillage ---------- */

interface Masse {
  /** Le centre, depuis la colonne du tronc et au-dessus du pied, et les deux rayons, en cases à la taille ordinaire. */
  x: number;
  y: number;
  rx: number;
  ry: number;
}

/**
 * Une masse de feuilles : un ovale au bord déchiqueté, le dessus au soleil du côté de la lumière, le dessous dans
 * l'ombre, et des touches de feuilles plus claires ou plus sombres par petits paquets. `ajour` : la part de trous.
 */
function masse(a: Atelier, m: Masse, ajour = 0): void {
  const { pl, tons, s } = a;
  const cx = a.cx + Math.round(m.x * s);
  const cy = a.g - Math.round(m.y * s);
  const rx = Math.max(3, Math.round(m.rx * s));
  const ry = Math.max(3, Math.round(m.ry * s));
  for (let dy = -ry - 2; dy <= ry + 2; dy++) {
    for (let dx = -rx - 2; dx <= rx + 2; dx++) {
      const x = cx + dx;
      const y = cy + dy;
      const d = (dx / rx) ** 2 + (dy / ry) ** 2;
      // Le bord : des paquets de feuilles de trois cases qui dépassent ou qui manquent.
      const bord = d + (alea(Math.floor(x / 3), Math.floor(y / 3)) - 0.5) * 0.34 + (alea(x, y) - 0.5) * 0.1;
      if (bord > 1) continue;
      if (ajour > 0 && d > 0.3 && alea(Math.floor(x / 2) + 91, Math.floor(y / 2)) < ajour) continue;
      // La lumière vient d'en haut à gauche.
      let v = (-versLOmbre(a, dx) / rx) * 0.55 - (dy / ry) * 0.85 + (alea(Math.floor(x / 2), Math.floor(y / 2) + 31) - 0.5) * 0.5;
      const paquet = alea(Math.floor((x + y) / 3), Math.floor((x - y) / 3) + 57);
      if (paquet < 0.16) v += 0.42;
      else if (paquet > 0.86) v -= 0.4;
      let ton = v > 0.72 ? 0 : v > 0.22 ? 1 : v > -0.3 ? 2 : v > -0.78 ? 3 : 4;
      // Le dessous de la masse : un liseré sombre qui la détache de celles d'en dessous.
      if (bord > 0.84 && dy > ry * 0.25) ton = Math.max(ton, dy > ry * 0.6 ? 4 : 3);
      pl.poser(x, y, tons.feuilles[ton]!);
    }
  }
}

/* ---------- Les essences ---------- */

function chene(a: Atelier): void {
  const haut = tronc(a, 96, 34, 20, 4, 3);
  const y = a.g - Math.round(96 * a.s);
  const b = (x: number, h: number, e: number) => branche(a, haut, y + Math.round(6 * a.s), a.cx + Math.round(x * a.s), a.g - Math.round(h * a.s), e);
  b(-78, 128, 9);
  b(74, 138, 9);
  b(-34, 170, 7);
  b(40, 176, 7);
  b(-84, 116, 5);
  for (const m of [
    { x: 52, y: 196, rx: 46, ry: 34 },
    { x: -40, y: 206, rx: 50, ry: 36 },
    { x: 84, y: 150, rx: 32, ry: 28 },
    { x: -86, y: 148, rx: 30, ry: 28 },
    { x: 8, y: 168, rx: 56, ry: 38 },
    { x: -62, y: 176, rx: 38, ry: 30 },
    { x: 62, y: 172, rx: 36, ry: 28 },
    { x: -92, y: 112, rx: 20, ry: 16 },
    { x: 20, y: 214, rx: 34, ry: 24 },
    { x: -14, y: 138, rx: 28, ry: 18 },
    { x: 46, y: 132, rx: 26, ry: 17 },
  ])
    masse(a, m);
}

function hetre(a: Atelier): void {
  const haut = tronc(a, 138, 20, 11, -3, 2);
  const y = a.g - Math.round(138 * a.s);
  branche(a, haut, y + Math.round(30 * a.s), a.cx - Math.round(44 * a.s), a.g - Math.round(150 * a.s), 5);
  branche(a, haut, y + Math.round(20 * a.s), a.cx + Math.round(46 * a.s), a.g - Math.round(164 * a.s), 5);
  branche(a, haut, y, a.cx - Math.round(8 * a.s), a.g - Math.round(200 * a.s), 5);
  for (const m of [
    { x: -6, y: 236, rx: 30, ry: 26 },
    { x: 28, y: 206, rx: 36, ry: 30 },
    { x: -34, y: 200, rx: 36, ry: 32 },
    { x: 46, y: 166, rx: 26, ry: 24 },
    { x: -50, y: 158, rx: 24, ry: 24 },
    { x: 0, y: 172, rx: 42, ry: 34 },
    { x: -26, y: 134, rx: 26, ry: 18 },
    { x: 26, y: 132, rx: 28, ry: 18 },
  ])
    masse(a, m);
}

function bouleau(a: Atelier): void {
  const { pl, tons } = a;
  tronc(a, 176, 9, 4, 10, 0);
  // Les marques noires de l'écorce : des traits couchés, de place en place.
  const H = Math.round(176 * a.s);
  for (let r = 6; r < H * 0.8; r += 5 + Math.floor(alea(r, a.variante) * 9)) {
    const part = r / H;
    const milieu = a.cx + Math.round(10 * a.s * part * part);
    const long = 2 + Math.floor(alea(r, 9) * 3);
    pl.rect(milieu - (alea(r, 4) < 0.5 ? 3 : 0), a.g - r, long, 1, tons.tronc.creux);
  }
  const sommet = a.cx + Math.round(10 * a.s);
  branche(a, sommet - Math.round(5 * a.s), a.g - Math.round(120 * a.s), a.cx - Math.round(30 * a.s), a.g - Math.round(152 * a.s), 2);
  branche(a, sommet - Math.round(3 * a.s), a.g - Math.round(132 * a.s), a.cx + Math.round(38 * a.s), a.g - Math.round(160 * a.s), 2);
  for (const m of [
    { x: 10, y: 196, rx: 20, ry: 17 },
    { x: -18, y: 174, rx: 22, ry: 17 },
    { x: 30, y: 168, rx: 20, ry: 16 },
    { x: 4, y: 152, rx: 26, ry: 16 },
    { x: -30, y: 142, rx: 15, ry: 14 },
    { x: 36, y: 136, rx: 14, ry: 15 },
    { x: -10, y: 122, rx: 14, ry: 11 },
    { x: 20, y: 114, rx: 12, ry: 10 },
  ])
    masse(a, m, 0.2);
}

function sapin(a: Atelier): void {
  const { pl, tons, s } = a;
  tronc(a, 60, 13, 8, 0, 1);
  const etages = 7;
  const haut = Math.round(232 * s);
  const bas = Math.round(26 * s);
  // Des étages de branches qui retombent, du plus large en bas au plus étroit en haut ; chacun ombre celui d'en dessous.
  for (let e = 0; e < etages; e++) {
    const pointe = a.g - haut + Math.round(((haut - bas) * e * 0.86) / etages);
    const pied = a.g - haut + Math.round(((haut - bas) * (e + 1.55)) / etages);
    const demi = Math.round((9 + e * 6.4) * s);
    for (let y = pointe; y <= pied; y++) {
      const part = (y - pointe) / Math.max(1, pied - pointe);
      const large = Math.round(2 + demi * part ** 0.85);
      for (let dx = -large; dx <= large; dx++) {
        const x = a.cx + dx;
        // Le bas de l'étage : des rameaux en dents, qui pendent plus bas vers l'extérieur.
        const dent = Math.floor(alea(Math.floor(x / 3), e) * 5);
        if (y > pied - dent - (Math.abs(dx) > large * 0.6 ? 0 : 2)) continue;
        const u = versLOmbre(a, dx) / Math.max(1, large);
        let v = -u * 0.7 - part * 0.9 + 0.55 + (alea(Math.floor(x / 2), y) - 0.5) * 0.5;
        if ((x + y * 2) % 7 === 0) v += 0.3;
        let ton = v > 0.7 ? 1 : v > 0.2 ? 2 : v > -0.3 ? 3 : 4;
        if (e > 0 && y < pointe + 4 * s + 2) ton = Math.max(ton, 3);
        pl.poser(x, y, tons.feuilles[ton]!);
      }
    }
  }
  pl.rect(a.cx, a.g - haut - 3, 1, 4, tons.feuilles[3]);
}

function saule(a: Atelier): void {
  const { pl, tons, s } = a;
  const haut = tronc(a, 70, 30, 20, -6, 3);
  const y = a.g - Math.round(70 * s);
  branche(a, haut, y + 4, a.cx - Math.round(62 * s), a.g - Math.round(118 * s), 7);
  branche(a, haut, y + 4, a.cx + Math.round(60 * s), a.g - Math.round(124 * s), 7);
  branche(a, haut, y, a.cx - Math.round(6 * s), a.g - Math.round(140 * s), 6);
  for (const m of [
    { x: -6, y: 160, rx: 50, ry: 24 },
    { x: -58, y: 136, rx: 34, ry: 24 },
    { x: 54, y: 138, rx: 36, ry: 26 },
    { x: 0, y: 134, rx: 48, ry: 26 },
  ])
    masse(a, m);
  // Les rameaux qui pleurent : de longs fils qui tombent du feuillage, presque jusqu'à l'herbe, par mèches.
  const demi = Math.round(92 * s);
  for (let dx = -demi; dx <= demi; dx++) {
    const x = a.cx + dx;
    const meche = Math.floor((x + a.variante * 3) / 4);
    if ((x + a.variante) % 5 === 4 || alea(meche, 5) < 0.1) continue;
    const depart = a.g - Math.round((112 + 26 * Math.sqrt(Math.max(0, 1 - (dx / demi) ** 2))) * s);
    const fin = a.g - Math.round((14 + alea(meche, 77) * 46 + (Math.abs(dx) < 24 * s ? 26 : 0)) * s) - Math.floor(alea(x, 3) * 5);
    const u = versLOmbre(a, dx) / demi;
    for (let yy = depart; yy <= fin; yy++) {
      if (!pl.lire(x, yy) && !pl.lire(x, yy - 1) && yy < depart + 6) continue;
      const bout = (yy - depart) / Math.max(1, fin - depart);
      let ton = u < -0.3 ? 1 : u > 0.45 ? 3 : 2;
      if (alea(x, yy >> 2) < 0.2) ton += u > 0 ? 1 : -1;
      if (bout > 0.82) ton = Math.min(4, ton + 1);
      if (alea(x, yy) < 0.1 && bout > 0.3) continue;
      pl.poser(x, yy, tons.feuilles[Math.max(0, Math.min(4, ton))]!);
    }
  }
}

function pommier(a: Atelier, l: Lumiere): void {
  const { pl, s } = a;
  const haut = tronc(a, 50, 15, 9, 7, 1);
  const y = a.g - Math.round(50 * s);
  branche(a, haut, y + 3, a.cx - Math.round(34 * s), a.g - Math.round(72 * s), 4);
  branche(a, haut, y + 3, a.cx + Math.round(42 * s), a.g - Math.round(76 * s), 4);
  for (const m of [
    { x: 8, y: 102, rx: 36, ry: 24 },
    { x: -30, y: 84, rx: 26, ry: 22 },
    { x: 40, y: 84, rx: 24, ry: 22 },
    { x: 6, y: 78, rx: 34, ry: 20 },
  ])
    masse(a, m);
  // Les pommes : rouges, deux cases de large, un reflet.
  const rouge = couleurDuDehors("#d23a2e", "#6a2630", l);
  const reflet = couleurDuDehors("#f08a6a", "#8a4048", l);
  for (let n = 0; n < 16; n++) {
    const x = a.cx + Math.round((alea(n, a.variante + 3) * 108 - 50) * s);
    const yy = a.g - Math.round((62 + alea(n, a.variante + 8) * 52) * s);
    if (!pl.lire(x, yy) || !pl.lire(x + 2, yy + 2) || !pl.lire(x - 1, yy - 1)) continue;
    pl.rect(x, yy, 3, 3, (i, j) => (i === x && j === yy ? reflet : i === x + 2 && j === yy + 2 ? melanger(rouge, "#1a0a0a", 0.4) : rouge));
  }
}

function noisetier(a: Atelier): void {
  const { s } = a;
  // Une cépée : plusieurs tiges fines qui partent du même pied et s'écartent.
  for (const [x, h] of [
    [-40, 62],
    [-22, 80],
    [-4, 88],
    [16, 82],
    [38, 66],
    [-30, 40],
    [28, 44],
  ] as const)
    branche(a, a.cx + Math.round((x / 9) * s), a.g, a.cx + Math.round(x * s), a.g - Math.round(h * s), 3);
  for (const m of [
    { x: -4, y: 86, rx: 28, ry: 18 },
    { x: -36, y: 66, rx: 20, ry: 17 },
    { x: 36, y: 68, rx: 20, ry: 17 },
    { x: 14, y: 70, rx: 24, ry: 16 },
    { x: -16, y: 60, rx: 24, ry: 15 },
    { x: -44, y: 44, rx: 11, ry: 9 },
    { x: 44, y: 46, rx: 10, ry: 9 },
  ])
    masse(a, m, 0.07);
}

function buisson(a: Atelier, l: Lumiere): void {
  const { pl, s } = a;
  for (const m of [
    { x: -14, y: 14, rx: 15, ry: 12 },
    { x: 14, y: 12, rx: 15, ry: 11 },
    { x: 0, y: 20, rx: 17, ry: 14 },
  ])
    masse(a, { ...m, y: m.y - 2 });
  // Un buisson sur trois porte des baies.
  if (a.variante % 3 !== 0) return;
  const baie = a.variante % 2 === 0 ? couleurDuDehors("#c8283a", "#5e2030", l) : couleurDuDehors("#5a3a9a", "#2c2250", l);
  for (let n = 0; n < 9; n++) {
    const x = a.cx + Math.round((alea(n, a.variante) * 50 - 25) * s);
    const y = a.g - Math.round((6 + alea(n, a.variante + 2) * 22) * s);
    if (pl.lire(x, y) && pl.lire(x, y - 2)) pl.poser(x, y, baie);
  }
}

const DESSINS: Readonly<Record<Essence, (a: Atelier, l: Lumiere) => void>> = { chene, hetre, bouleau, sapin, saule, pommier, noisetier, buisson };

/** La demi-largeur de l'ombre portée au pied, en cases à la taille ordinaire. */
const OMBRES: Readonly<Record<Essence, number>> = { chene: 92, hetre: 60, bouleau: 34, sapin: 44, saule: 84, pommier: 48, noisetier: 46, buisson: 26 };

/**
 * Pose un arbre : `cx` la colonne de son tronc, `pied` la rangée du sol. `variante` choisit son sens, sa taille et sa
 * teinte ; `taille` l'impose. L'ombre portée assombrit ce qui est déjà dessiné au pied, sans rien y ajouter.
 */
export function poserArbre(planche: Planche, p: Palette, l: Lumiere, essence: Essence, cx: number, pied: number, variante: number, taille = tailleDeLArbre(variante)): void {
  const { largeur, hauteur } = cadreDeLArbre(essence, variante, taille);
  const envers = retourne(variante);
  // L'ombre portée : une ellipse plate sous l'arbre, un peu décalée à l'opposé de la lumière.
  const demi = Math.round(OMBRES[essence] * taille);
  const force = 0.16 + 0.12 * l.jour;
  for (let dy = -2; dy <= 4; dy++) {
    for (let dx = -demi; dx <= demi; dx++) {
      const d = (dx / demi) ** 2 + ((dy - 1) / 3.4) ** 2;
      if (d > 1 || (d > 0.7 && (dx + dy) % 2 !== 0)) continue;
      const x = cx + dx + Math.round(demi * 0.12);
      const fond = planche.lire(x, pied + dy);
      if (fond) planche.poser(x, pied + dy, melanger(fond, "#0a1410", force));
    }
  }
  const cadre = new Planche(largeur, hauteur);
  const milieu = largeur >> 1;
  DESSINS[essence]({ pl: cadre, tons: tonsDe(p, l, essence, variante), envers, variante, s: taille, cx: milieu, g: hauteur - 1 }, l);
  const haut = pied - hauteur + 1;
  for (let j = 0; j < hauteur; j++) {
    for (let i = 0; i < largeur; i++) {
      const couleur = cadre.cases[j * largeur + (envers ? largeur - 1 - i : i)];
      if (couleur) planche.poser(cx - milieu + i, haut + j, couleur);
    }
  }
}

/** Les essences des grands arbres, dans l'ordre où on les sème le long d'une rue : jamais deux voisins pareils. */
const SEMIS: readonly Essence[] = ["chene", "bouleau", "hetre", "sapin", "pommier", "saule", "sapin", "noisetier", "hetre", "bouleau", "chene", "pommier"];
export const essenceDuSemis = (n: number): Essence => SEMIS[((n % SEMIS.length) + SEMIS.length) % SEMIS.length]!;
