/**
 * Les fonds d'objets, lot F (voir `socle.ts` et son `CATALOGUE_DES_SCENES`) : « le divin et les étoiles ». Six scènes pour
 * les tenues divines, la rareté la plus haute du jeu, et ce qui leur ressemble : le monde sans texture (la tenue « bug »),
 * le pré des vaches, la zone contaminée (la tenue jaune), le pas de tir (la tenue fusée), l'espace (la soucoupe et le
 * visiteur des étoiles) et la salle de contrôle (le gros bouton rouge, la télécommande).
 *
 * Une même famille : chacune porte une touche du turquoise de la rareté divine (`DIVIN`), et une petite blague au loin, sur
 * un bord. Le milieu reste calme, la chose s'y pose. La graine déplace le décor, l'accent teinte un détail.
 *
 * Dessin de Claude Fable 5.2, 22 novembre 2026.
 */
import { CATALOGUE_DES_SCENES, adoucir, crete, degrade, eclaircir, entre, hasard, melanger, nuage, remplirSous, trame, Planche, type ParametresDuFond, type SceneDeFond } from "./socle";

/** Le turquoise de la rareté divine : la touche commune aux six scènes. */
const DIVIN = "#19d3c5";
const DIVIN_CLAIR = melanger(DIVIN, "#ffffff", 0.45);
const DIVIN_PALE = melanger(DIVIN, "#ffffff", 0.72);

type Cote = "g" | "d";

const borner = (v: number, min: number, max: number): number => Math.max(min, Math.min(max, v));

/** La rangée où commence le sol de la scène : juste au-dessus des pieds de la chose, jamais trop haut ni tout en bas. */
const solDe = (o: ParametresDuFond): number => borner(o.sol - 2, Math.round(o.hauteur * 0.5), o.hauteur - 3);

/** Vrai si la case est hors de la place de la chose, à `marge` cases près. */
const horsZone = (o: ParametresDuFond, x: number, y: number, marge = 1): boolean =>
  x < o.zone.x - marge || x >= o.zone.x + o.zone.largeur + marge || y < o.zone.y - marge || y >= o.zone.y + o.zone.hauteur + marge;

/** Vrai si les colonnes x à x + l - 1 ne passent pas derrière la chose. */
const colonnesLibres = (o: ParametresDuFond, x: number, l: number, marge = 1): boolean => x + l <= o.zone.x - marge || x >= o.zone.x + o.zone.largeur + marge;

/**
 * La colonne où poser un décor de largeur `l` sur un côté de la chose : au milieu de la place libre, poussé de `pousse`
 * (de -1, contre le bord de l'image, à 1, contre la chose) ; s'il n'y a pas la place, il dépasse du bord de l'image.
 */
function place(o: ParametresDuFond, cote: Cote, l: number, pousse = 0): number {
  if (cote === "g") {
    const libre = o.zone.x - 1;
    if (libre < l) return libre - l;
    return Math.round(((libre - l) / 2) * (1 + pousse));
  }
  const debut = o.zone.x + o.zone.largeur + 1;
  const libre = o.largeur - debut;
  if (libre < l) return debut;
  return debut + Math.round(((libre - l) / 2) * (1 - pousse));
}

/** Un trait d'une case d'épaisseur. */
function trait(p: Planche, x0: number, y0: number, x1: number, y1: number, couleur: string | ((x: number, y: number) => string | null)): void {
  let x = Math.round(x0);
  let y = Math.round(y0);
  const xf = Math.round(x1);
  const yf = Math.round(y1);
  const dx = Math.abs(xf - x);
  const dy = -Math.abs(yf - y);
  const sx = x < xf ? 1 : -1;
  const sy = y < yf ? 1 : -1;
  let e = dx + dy;
  for (let n = 0; n < 400; n++) {
    const c = typeof couleur === "string" ? couleur : couleur(x, y);
    if (c !== null) p.poser(x, y, c);
    if (x === xf && y === yf) break;
    const e2 = 2 * e;
    if (e2 >= dy) {
      e += dy;
      x += sx;
    }
    if (e2 <= dx) {
      e += dx;
      y += sy;
    }
  }
}

/** Un petit dessin en lettres, agrandi `e` fois, retourné de gauche à droite si `miroir`. */
function motif(p: Planche, x: number, y: number, lignes: readonly string[], couleurs: Readonly<Record<string, string>>, e = 1, miroir = false): void {
  lignes.forEach((ligne, j) => {
    for (let i = 0; i < ligne.length; i++) {
      const c = couleurs[ligne[miroir ? ligne.length - 1 - i : i]!];
      if (c) p.rect(x + i * e, y + j * e, e, e, c);
    }
  });
}

/** Une ellipse pleine. */
function ellipse(p: Planche, cx: number, cy: number, rx: number, ry: number, couleur: string | ((dx: number, dy: number) => string | null)): void {
  for (let dy = -ry; dy <= ry; dy++) {
    for (let dx = -rx; dx <= rx; dx++) {
      if ((dx * dx) / (rx * rx + 0.5) + (dy * dy) / (ry * ry + 0.5) > 1) continue;
      const c = typeof couleur === "string" ? couleur : couleur(dx, dy);
      if (c !== null) p.poser(cx + dx, cy + dy, c);
    }
  }
}

/** Des bandes de danger en biais, jaunes et grises, sur un rectangle. */
function bandesDeDanger(p: Planche, x: number, y: number, l: number, h: number, pas: number, phase: number, jaune: string, gris: string): void {
  p.rect(x, y, l, h, (i, j) => ((Math.floor((i + j + phase) / pas) & 1) === 0 ? jaune : gris));
}

// ---------------------------------------------------------------------------------------------------------------------
// Le monde sans texture : un décor de jeu qui n'a pas fini de charger.
// ---------------------------------------------------------------------------------------------------------------------

function peindreSansTexture(p: Planche, o: ParametresDuFond): void {
  const h = hasard(o.graine);
  const W = o.largeur;
  const H = o.hauteur;
  const ys = solDe(o);
  const grand = W >= 100;
  const petit = W < 34;
  const e = grand ? 2 : 1;
  const ROSE = "#f6b4ea";
  const GRIS = "#e9e9f2";
  const ROSE_CALME = melanger(ROSE, GRIS, 0.62);
  const VIOLET = "#b48fd6";
  const BLANC = "#f8f5fd";

  // Le ciel : le damier des textures manquantes, adouci derrière la chose et vers l'horizon.
  const cote = Math.max(3, Math.round(W / 9));
  const dx = entre(h, 0, cote - 1);
  const dy = entre(h, 0, cote - 1);
  for (let y = 0; y < ys; y++) {
    for (let x = 0; x < W; x++) {
      const pair = ((Math.floor((x + dx) / cote) + Math.floor((y + dy) / cote)) & 1) === 0;
      const ex = Math.max(o.zone.x - x, x - (o.zone.x + o.zone.largeur - 1), 0);
      const ey = Math.max(o.zone.y - y, y - (o.zone.y + o.zone.hauteur - 1), 0);
      const pres = 1 - Math.min(1, Math.max(ex, ey) / cote);
      let c = pair ? (trame(x, y, pres) ? ROSE_CALME : ROSE) : GRIS;
      if (trame(x, y, (y / ys - 0.5) * 1.3)) c = eclaircir(c, 0.4);
      p.poser(x, y, c);
    }
  }

  // Le sol : une grille de fil de fer, en perspective.
  const GRILLE = melanger(DIVIN, "#ffffff", 0.35);
  p.rect(0, ys, W, H - ys, "#f4f1fa");
  const fx = W / 2 + entre(h, -Math.round(W / 8), Math.round(W / 8));
  const fy = ys - Math.round(H * 0.3);
  const pasBas = Math.max(5, Math.round(W / 6));
  for (let i = -12; i <= 12; i++) {
    const xBas = fx + i * pasBas;
    const xHaut = fx + (i * pasBas * (ys - fy)) / (H - 1 - fy);
    trait(p, xHaut, ys, xBas, H - 1, (x, y) => (y >= ys ? GRILLE : null));
  }
  for (let y = ys, saut = Math.max(2, Math.round(H * 0.05)); y < H; y += saut, saut += Math.max(1, Math.round(H * 0.03))) p.rect(0, y, W, 1, GRILLE);

  // Des monts en fil de fer, pas encore remplis, sur les côtés.
  const mont = (cote_: Cote, pousse: number, l: number, haut: number): void => {
    const x0 = place(o, cote_, l, pousse);
    const sommet = x0 + Math.round(l * (0.35 + h() * 0.3));
    for (let j = 0; j <= haut; j++) {
      const a = Math.round(sommet + ((x0 - sommet) * j) / haut);
      const b = Math.round(sommet + ((x0 + l - 1 - sommet) * j) / haut);
      p.rect(a, ys - 1 - haut + j, b - a + 1, 1, BLANC);
    }
    const pied = x0 + Math.round(l * (0.45 + h() * 0.25));
    trait(p, sommet, ys - 1 - haut, pied, ys - 1, VIOLET);
    trait(p, sommet, ys - 1 - haut, x0, ys - 1, VIOLET);
    trait(p, sommet, ys - 1 - haut, x0 + l - 1, ys - 1, VIOLET);
    p.rect(x0, ys - 1, l, 1, VIOLET);
  };
  const premier: Cote = h() < 0.5 ? "g" : "d";
  const second: Cote = premier === "g" ? "d" : "g";
  mont(premier, -0.6, entre(h, Math.round(W * 0.16), Math.round(W * 0.24)), entre(h, Math.round(H * 0.16), Math.round(H * 0.26)));
  mont(second, -0.8, entre(h, Math.round(W * 0.12), Math.round(W * 0.18)), entre(h, Math.round(H * 0.1), Math.round(H * 0.16)));
  if (!petit) mont(premier, 0.5, entre(h, Math.round(W * 0.1), Math.round(W * 0.14)), entre(h, Math.round(H * 0.07), Math.round(H * 0.12)));

  // L'image manquante : un cadre barré d'une croix, en haut d'un côté.
  const cadre = Math.max(5, Math.round(H * 0.19)) | 1;
  const cx0 = place(o, premier, cadre, -0.5);
  const cy0 = Math.max(1, Math.round(H * 0.07));
  p.rect(cx0, cy0, cadre, cadre, VIOLET);
  p.rect(cx0 + 1, cy0 + 1, cadre - 2, cadre - 2, BLANC);
  const CROIX = "#ef7fdc";
  for (let i = 1; i < cadre - 1; i++) {
    p.poser(cx0 + i, cy0 + i, CROIX);
    p.poser(cx0 + cadre - 1 - i, cy0 + i, CROIX);
  }

  // Le nuage chargé à moitié : la moitié de droite n'a que son contour.
  const ln = Math.max(8, Math.round(W * 0.22));
  const rn = Math.max(1, Math.round(ln / 5));
  const calque = new Planche(ln + 2, rn * 3 + 4);
  nuage(calque, 1, rn * 2 + 1, ln, "#ffffff", "#d9d3ea");
  const nx = place(o, second, ln + 2, -0.4);
  const ny = Math.max(0, Math.round(H * 0.05));
  for (let j = 0; j < calque.hauteur; j++) {
    for (let i = 0; i < calque.largeur; i++) {
      const c = calque.lire(i, j);
      if (!c) continue;
      if (i < calque.largeur / 2) p.poser(nx + i, ny + j, c);
      else if (!calque.lire(i - 1, j) || !calque.lire(i + 1, j) || !calque.lire(i, j - 1) || !calque.lire(i, j + 1)) p.poser(nx + i, ny + j, VIOLET);
    }
  }

  // La barre de chargement, sous le nuage : ses crans pleins prennent la couleur de la chose.
  const cran = Math.max(1, Math.round(W / 45));
  const crans = 5;
  const bl = crans * (cran + 1) + 1;
  const bx = nx + Math.round((ln + 2 - bl) / 2);
  const by = ny + calque.hauteur + 1;
  const pleins = entre(h, 1, 4);
  if (by + cran + 2 < ys - 1) {
    p.rect(bx, by, bl, cran + 2, "#8d82b0");
    for (let i = 0; i < crans; i++) p.rect(bx + 1 + i * (cran + 1), by + 1, cran, cran, i < pleins ? eclaircir(adoucir(o.accent, 0.1), 0.15) : BLANC);
  }

  // Des bandes décalées : l'image qui saute, sur les bords.
  const copie = p.cases.slice();
  for (let n = petit ? 1 : 3; n > 0; n--) {
    const gauche = h() < 0.5;
    const y0 = entre(h, 1, Math.max(1, ys - 3));
    const saut = (h() < 0.5 ? -1 : 1) * Math.max(2, Math.round(cote / 2));
    const x0 = gauche ? 0 : o.zone.x + o.zone.largeur + 2;
    const x1 = gauche ? o.zone.x - 3 : W - 1;
    const long = entre(h, Math.round(W * 0.08), Math.round(W * 0.2));
    const depart = entre(h, x0, Math.max(x0, x1 - long));
    for (let j = 0; j < e; j++) {
      for (let x = depart; x <= Math.min(x1, depart + long); x++) {
        const source = copie[(y0 + j) * W + ((x + saut + W) % W)];
        if (source && y0 + j < ys) p.poser(x, y0 + j, source);
      }
    }
  }

  // Des pixels perdus, aux couleurs vives du bug.
  const VIVES = ["#f257d6", "#5fe8f2", "#ffe46a", DIVIN, eclaircir(o.accent, 0.1)] as const;
  for (let n = Math.round((W * H) / (grand ? 420 : 260)); n > 0; n--) {
    const x = entre(h, 0, W - e);
    const y = entre(h, 0, H - e);
    const c = VIVES[entre(h, 0, VIVES.length - 1)]!;
    if (horsZone(o, x, y, 2) && horsZone(o, x + e - 1, y + e - 1, 2)) p.rect(x, y, e, e, c);
  }

  // Le repère des trois axes, oublié dans un coin du sol.
  if (!petit && H - ys >= 5) {
    const l = Math.min(H - ys - 2, 3 * e + 1);
    const ax = premier === "g" ? W - 3 - l : 2;
    const ay = H - 2;
    p.rect(ax, ay - l, 1, l, "#7fd98a");
    p.rect(ax, ay, l + 1, 1, "#f08a8a");
    trait(p, ax, ay, ax + Math.round(l * 0.7), ay - Math.round(l * 0.7), "#8aa5f2");
    p.poser(ax, ay, "#6b6585");
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Le pré des vaches : l'alpage, sa clôture ouverte, ses cloches et ses vaches au loin.
// ---------------------------------------------------------------------------------------------------------------------

const VACHE = [
  "........cc.",
  "twwkkwwwwww",
  "twkkwwwkwwr",
  ".wwwwwkkw..",
  ".g.g...g.g.",
] as const;
const PETITE_VACHE = [
  "...c.",
  "wkwww",
  "wwkwr",
  "g..g.",
] as const;
const COULEURS_DE_VACHE = { w: "#fdfaf3", k: "#5f5a66", r: "#f2a9b8", c: "#e3cfa3", g: "#b9b0a6", t: "#e6dccb" } as const;

function peindrePreDesVaches(p: Planche, o: ParametresDuFond): void {
  const h = hasard(o.graine);
  const W = o.largeur;
  const H = o.hauteur;
  const ys = solDe(o);
  const grand = W >= 100;
  const petit = W < 34;
  const e = grand ? 2 : 1;

  degrade(p, 0, ys, "#b8dffa", "#eaf6fd", 4);

  // Les nuages : l'un d'eux a pris les taches des vaches.
  const TACHE = "#cfc6cf";
  const nuages = petit ? 1 : 2;
  const coteDuNuageTachete: Cote = h() < 0.5 ? "g" : "d";
  for (let n = 0; n < nuages; n++) {
    const cote: Cote = n === 0 ? coteDuNuageTachete : coteDuNuageTachete === "g" ? "d" : "g";
    const l = Math.max(7, Math.round(W * (0.18 + h() * 0.08)));
    const r = Math.max(1, Math.round(l / 5));
    const x = place(o, cote, l, -0.3 + h() * 0.5);
    const y = r + 1 + entre(h, 0, Math.round(H * 0.08));
    nuage(p, x, y, l, "#ffffff", "#d6e6f5");
    if (n === 0) {
      for (let k = 0; k < 3; k++) {
        const tx = x + Math.round(l * (0.16 + 0.28 * k)) + entre(h, 0, 1);
        const ty = y - (k === 1 ? Math.max(1, Math.round(r * 0.8)) : 0);
        const lt = Math.max(2, Math.round(l * 0.14)) + (k === 1 ? 1 : 0);
        const ht = Math.max(1, Math.round(r * 0.7));
        const tache = (i: number, j: number): string | null => (p.lire(i, j) === "#ffffff" ? TACHE : null);
        p.rect(tx, ty, lt, ht, tache);
        p.rect(tx + 1, ty + ht, Math.max(1, lt - 2), 1, tache);
      }
    }
  }

  // Les montagnes au loin, coiffées de neige.
  const MONT = "#bfcdea";
  const base = Math.round(ys * 0.8);
  const ampleur = Math.round(H * 0.24);
  const monts = crete(W, base, ampleur, h);
  const neige = Math.max(1, Math.round(H * 0.045));
  remplirSous(p, monts, (x, y, prof) => {
    if (y > ys) return null;
    const haut = (monts[x] ?? base) < base - ampleur * 0.5;
    if (haut && prof < neige + ((x >> (grand ? 1 : 0)) & 1)) return "#f8fbfe";
    return trame(x, y, prof / (ampleur * 1.6)) ? "#cdd9ef" : MONT;
  });

  // La colline du milieu, vert tendre, où paissent les vaches.
  const COLLINE = "#cfeab6";
  const hf = Math.max(3, Math.round(H * 0.13));
  const colline = crete(W, ys - hf - 1, Math.round(H * 0.13), h);
  remplirSous(p, colline, (x, y, prof) => (y > ys ? null : prof === 0 ? "#e0f3cb" : COLLINE));

  // Le pré, devant.
  const pre = crete(W, ys + 1, Math.max(1, Math.round(H * 0.04)), h);
  remplirSous(p, pre, (x, y, prof) => (prof === 0 ? "#c5ecaa" : trame(x, y, ((y - ys) / Math.max(1, H - ys)) * 0.8) ? "#9fd784" : "#aede92"));

  // Les vaches au loin, et celle qui a grimpé tout en haut de la montagne.
  const dessin = petit ? PETITE_VACHE : VACHE;
  const lv = dessin[0].length * e;
  const hv = dessin.length * e;
  const vaches = petit ? 1 : grand ? 3 : 2;
  for (let n = 0; n < vaches; n++) {
    const cote: Cote = (n & 1) === 0 ? coteDuNuageTachete : coteDuNuageTachete === "g" ? "d" : "g";
    const x = place(o, cote, lv, n < 2 ? -0.5 + h() * 0.9 : -0.95);
    const pied = Math.min(colline[borner(x + Math.round(lv / 2), 0, W - 1)] ?? ys, ys - 1);
    if (colonnesLibres(o, x, lv, 0) || pied < o.zone.y) motif(p, x, pied - hv + 1, dessin, COULEURS_DE_VACHE, e, h() < 0.5);
  }
  if (!petit) {
    let sommet = 0;
    for (let x = 2; x < W - 6; x++) if ((monts[x] ?? H) < (monts[sommet] ?? H) && colonnesLibres(o, x - 2, 6, 0)) sommet = x;
    if (sommet > 0) motif(p, sommet - 2, (monts[sommet] ?? 0) - PETITE_VACHE.length + 1, PETITE_VACHE, COULEURS_DE_VACHE, 1, h() < 0.5);
  }

  // La clôture, ouverte au milieu : quelqu'un a laissé la barrière ouverte.
  const BOIS = "#cda87c";
  const BOIS_OMBRE = "#a98660";
  const BOIS_CLAIR = "#e6c9a0";
  const pasPoteau = Math.max(4, Math.round(W / 9));
  const decal = entre(h, 0, pasPoteau - 1);
  const poteaux: number[] = [];
  for (let x = decal - pasPoteau; x < W + pasPoteau; x += pasPoteau) if (x + e <= o.zone.x - 2 || x >= o.zone.x + o.zone.largeur + 2) poteaux.push(x);
  const piedDe = (x: number): number => (pre[borner(x, 0, W - 1)] ?? ys) + 1;
  for (let i = 0; i + 1 < poteaux.length; i++) {
    const a = poteaux[i]!;
    const b = poteaux[i + 1]!;
    if (b - a !== pasPoteau) continue;
    for (const part of [0.25, 0.65]) {
      const dyy = Math.round(hf * part);
      trait(p, a, piedDe(a) - hf + dyy, b, piedDe(b) - hf + dyy, BOIS);
      if (grand) trait(p, a, piedDe(a) - hf + dyy + 1, b, piedDe(b) - hf + dyy + 1, BOIS_OMBRE);
    }
  }
  for (const x of poteaux) {
    const pied = piedDe(x);
    p.rect(x, pied - hf, e, hf + 1, BOIS);
    p.rect(x + e - 1, pied - hf + 1, 1, hf, e > 1 ? BOIS_OMBRE : BOIS);
    p.rect(x, pied - hf, e, 1, BOIS_CLAIR);
  }

  // La cloche pendue à la clôture, à son ruban de la couleur de la chose.
  const coteCloche: Cote = coteDuNuageTachete === "g" ? "d" : "g";
  const accroches = poteaux.filter((x) => x >= 1 && x + 3 * e < W && (coteCloche === "g" ? x < o.zone.x : x > o.zone.x));
  const accroche = accroches.length ? accroches[coteCloche === "g" ? accroches.length - 1 : 0]! : null;
  if (accroche !== null) {
    const RUBAN = eclaircir(o.accent, 0.1);
    const cxx = accroche + (coteCloche === "g" ? -2 * e : e);
    const cyy = piedDe(accroche) - hf + Math.round(hf * 0.25);
    motif(p, cxx, cyy, [".a.", "jjJ", "jJJ", ".k."], { a: RUBAN, j: "#f2cf5e", J: "#cfa23a", k: "#7a6a4a" }, e);
  }

  // Les fleurs du pré : gentianes turquoise, fleurs à la couleur de la chose, pâquerettes.
  const FLEURS = [melanger(DIVIN, "#ffffff", 0.15), eclaircir(o.accent, 0.2), "#ffffff", "#ffe98f"] as const;
  for (let n = Math.round(W / 3.5); n > 0; n--) {
    const x = entre(h, 1, W - 2 - e);
    const y = entre(h, ys + 3, Math.max(ys + 3, H - 1 - e));
    const c = FLEURS[n % FLEURS.length]!;
    if (!horsZone(o, x, y, 1) || y >= H - 1) continue;
    if (grand) {
      p.rect(x, y + 1, 1, 2, "#84c46c");
      motif(p, x - 1, y - 1, [".f.", "fof", ".f."], { f: c, o: c === "#ffe98f" ? "#ffffff" : "#ffe98f" });
    } else {
      p.poser(x, y + 1, "#84c46c");
      p.poser(x, y, c);
    }
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// La zone contaminée : un sas, des fûts, une flaque qui luit. Drôle, pas inquiétant.
// ---------------------------------------------------------------------------------------------------------------------

function peindreZoneContaminee(p: Planche, o: ParametresDuFond): void {
  const h = hasard(o.graine);
  const W = o.largeur;
  const H = o.hauteur;
  const ys = solDe(o);
  const grand = W >= 100;
  const petit = W < 34;
  const e = grand ? 2 : 1;
  const MUR = "#f0f1e6";
  const JOINT = "#e0e3d4";
  const JAUNE = "#f6d95f";
  const GRIS = "#a9adb8";
  const VERT = "#bff0a2";
  const VERT_BORD = "#93dc7b";
  const VERT_PALE = "#e4f8d4";
  const coteSas: Cote = h() < 0.5 ? "g" : "d";
  const coteFuts: Cote = coteSas === "g" ? "d" : "g";

  // Le mur de panneaux clairs, ses joints et ses rivets.
  p.rect(0, 0, W, ys, MUR);
  const panneau = Math.max(6, Math.round(W / 5));
  const dp = entre(h, 0, panneau - 1);
  const hb = Math.max(2, Math.round(H * 0.09));
  for (let x = dp; x < W; x += panneau) {
    if (!colonnesLibres(o, x, 1, 1)) continue;
    p.rect(x, hb, 1, ys - hb, JOINT);
    if (!petit) {
      p.poser(x + 1, hb + 2, "#d3d6c8");
      p.poser(x + 1, ys - 3, "#d3d6c8");
    }
  }

  // Le sol, et la lueur verte qui monte de la flaque sur le mur.
  degrade(p, ys, H - 1, "#e9ecdf", "#dadfd0", 3);
  p.rect(0, ys, W, 1, "#cfd3c4");
  const fl = Math.max(4, Math.round(W * 0.13));
  const fh = Math.max(1, Math.round((H - ys) * 0.22));
  const fx = borner(place(o, coteFuts, fl * 2, 0.2) + fl, fl - 2, W - fl + 2);
  const fy = Math.min(H - fh - 1, ys + Math.round((H - ys) * 0.55));
  const rayon = H * 0.5;
  for (let y = hb; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const d = Math.hypot((x - fx) * 0.8, y - fy) / rayon;
      if (d < 1 && horsZone(o, x, y, 0) && trame(x, y, (1 - d) * 0.55)) p.poser(x, y, y < ys ? "#e2f5d2" : "#d9f1c8");
    }
  }

  // Les bandes de danger, en haut et tout en bas : le cadre de la scène.
  const pas = Math.max(2, Math.round(hb * 0.9));
  const phase = entre(h, 0, pas * 2 - 1);
  bandesDeDanger(p, 0, 0, W, hb, pas, phase, JAUNE, GRIS);
  p.rect(0, hb, W, 1, "#cdd0c2");
  const hb2 = Math.max(1, Math.round(hb / 2));
  bandesDeDanger(p, 0, H - hb2, W, hb2, pas, phase + 1, JAUNE, GRIS);

  // Le sas : une porte ronde aux coins, son hublot turquoise, son volant, sa lampe.
  const lp = Math.max(7, Math.round(W * 0.22));
  const hp = Math.max(8, Math.round((ys - hb) * 0.82));
  const px = place(o, coteSas, lp, -0.2);
  const py = ys - hp;
  const CADRE = "#b3b9c6";
  const PORTE = "#d9dde6";
  p.rect(px, py, lp, hp, CADRE);
  p.rect(px + e, py + e, lp - 2 * e, hp - e, PORTE);
  p.rect(px + e, py + e, lp - 2 * e, 1, "#eceff4");
  p.rect(px + lp - 2 * e, py + e, e, hp - e, "#c6cbd6");
  for (const [qx, qy] of [[px, py], [px + lp - 1, py]] as const) p.poser(qx, qy, MUR);
  const rh = Math.max(1, Math.round(lp * 0.2));
  const hx = px + Math.floor(lp / 2);
  const hy = py + e + rh + Math.max(1, Math.round(hp * 0.12));
  p.disque(hx, hy, rh + 1, "#8f98aa");
  p.disque(hx, hy, rh, (ddx, ddy) => (ddx + ddy < -rh * 0.4 ? "#eafcf9" : ddx + ddy > rh * 0.7 ? melanger(DIVIN, "#ffffff", 0.2) : DIVIN_CLAIR));
  const vy = Math.min(ys - 3, hy + rh + Math.max(3, Math.round(hp * 0.22)));
  if (vy - 1 > hy + rh + 1) {
    p.rect(hx - e, vy, 2 * e + 1, 1, "#8f98aa");
    p.rect(hx, vy - e, 1, 2 * e + 1, "#8f98aa");
  }
  if (hp > 12) bandesDeDanger(p, px + e, ys - 1 - e, lp - 2 * e, e, Math.max(1, e), phase, JAUNE, GRIS);
  if (py - 2 > hb) {
    p.rect(hx - e, py - 1 - e, 2 * e + 1, e, DIVIN);
    p.rect(hx - e, py - 1 - e, 2 * e + 1, 1, DIVIN_PALE);
  }

  // La flaque verte, son reflet.
  ellipse(p, fx, fy, fl, fh, (ddx, ddy) => {
    if (!horsZone(o, fx + ddx, fy + ddy, 0)) return null;
    return ddy === -fh || (ddx * ddx) / (fl * fl) + (ddy * ddy) / (fh * fh + 0.5) > 0.7 ? VERT_BORD : VERT;
  });
  if (fh > 1) p.rect(fx - Math.round(fl * 0.4), fy - Math.round(fh * 0.3), Math.max(2, Math.round(fl * 0.4)), 1, VERT_PALE);

  // Les fûts jaunes : l'un d'eux a deux yeux qui regardent sous son couvercle.
  const lf = Math.max(4, Math.round(W * 0.1));
  const hf = Math.round(lf * 1.4);
  const fut = (x: number, pied: number, yeux: boolean): void => {
    const y0 = pied - hf + 1;
    p.rect(x, y0, lf, hf, "#f3d25a");
    p.rect(x, y0, Math.max(1, e), hf, "#fbe793");
    p.rect(x + lf - Math.max(1, e), y0, Math.max(1, e), hf, "#d6b03f");
    for (const part of [0.28, 0.72]) p.rect(x, y0 + Math.round(hf * part), lf, e, "#cfa93c");
    p.rect(x, y0, lf, e, "#c2c6d0");
    const le = Math.max(2, Math.round(lf * 0.34));
    p.rect(x + Math.round((lf - le) / 2), y0 + Math.round(hf * 0.42), le, Math.max(1, Math.round(hf * 0.2)), eclaircir(adoucir(o.accent, 0.1), 0.15));
    if (yeux) {
      p.rect(x, y0 - 2 * e, lf, 2 * e, "#5d6270");
      p.rect(x - (e > 1 ? 1 : 0), y0 - 3 * e, lf + (e > 1 ? 2 : 0), e, "#c2c6d0");
      const oeil = Math.max(1, e);
      for (const ox of [x + Math.round(lf * 0.2), x + lf - Math.round(lf * 0.2) - oeil]) {
        p.rect(ox, y0 - 2 * e, oeil, oeil, "#ffffff");
        if (e > 1) p.poser(ox + 1, y0 - 2 * e + 1, "#2b2f3a");
      }
    }
  };
  const futs = petit ? 1 : entre(h, 2, 3);
  const lotFuts = futs * lf + (futs - 1);
  const x0 = place(o, coteFuts, lotFuts, -0.7);
  const quiRegarde = entre(h, 0, futs - 1);
  for (let n = 0; n < futs; n++) {
    const i = coteFuts === "g" ? n : futs - 1 - n;
    fut(x0 + i * (lf + 1), ys + (n === 1 ? Math.max(1, Math.round((H - ys) * 0.25)) : 0), n === quiRegarde);
  }

  // Les bulles qui montent de la flaque.
  if (!petit) {
    for (let n = 0; n < (grand ? 5 : 3); n++) {
      const r = n % 2 === 0 ? e : Math.max(1, e - 1);
      const bx = fx + entre(h, -Math.round(fl * 0.7), Math.round(fl * 0.7));
      const by = fy - fh - 2 - n * Math.max(3, Math.round(H * 0.07)) - entre(h, 0, 2);
      if (by - r <= hb + 1 || !horsZone(o, bx - r, by, 1) || !horsZone(o, bx + r, by, 1)) continue;
      if (p.lire(bx, by) !== MUR && p.lire(bx, by) !== "#e2f5d2" && by < ys) continue;
      p.disque(bx, by, r, VERT_BORD);
      if (r > 1) p.disque(bx, by, r - 1, VERT_PALE);
      else p.poser(bx, by, VERT_PALE);
    }
  }

  // La fleur à trois têtes qui a poussé dans la flaque : ses fleurs ont la couleur de la chose.
  const tx = fx + (coteFuts === "g" ? 1 : -1) * Math.round(fl * 0.55);
  const haut = Math.max(3, Math.round(H * 0.1));
  if (horsZone(o, tx - 2 * e, fy - haut - e, 1) && horsZone(o, tx + 2 * e, fy, 1)) {
    const TIGE = "#6fbd62";
    const FLEUR = eclaircir(o.accent, 0.15);
    p.rect(tx, fy - haut, 1, haut, TIGE);
    trait(p, tx, fy - Math.round(haut * 0.5), tx - 2 * e, fy - haut + e, TIGE);
    trait(p, tx, fy - Math.round(haut * 0.4), tx + 2 * e, fy - haut + 2 * e, TIGE);
    for (const [ddx, ddy] of [[0, -haut - e], [-2 * e, -haut], [2 * e, -haut + e]] as const) {
      if (grand) motif(p, tx + ddx - 1, fy + ddy - 1, [".f.", "fof", ".f."], { f: FLEUR, o: "#fff2a8" });
      else p.poser(tx + ddx, fy + ddy, FLEUR);
    }
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Le pas de tir : la tour, la fusée au loin dans sa vapeur, et celle qui est partie de travers.
// ---------------------------------------------------------------------------------------------------------------------

function peindrePasDeTir(p: Planche, o: ParametresDuFond): void {
  const h = hasard(o.graine);
  const W = o.largeur;
  const H = o.hauteur;
  const ys = solDe(o);
  const grand = W >= 100;
  const petit = W < 34;
  const e = grand ? 2 : 1;
  const coteTour: Cote = h() < 0.5 ? "g" : "d";
  const coteFusee: Cote = coteTour === "g" ? "d" : "g";

  degrade(p, 0, ys, "#a6d5f6", "#edf6fc", 5);

  // Un nuage ou deux, haut dans le ciel, du côté de la tour.
  for (let n = 0; n < (petit ? 1 : 2); n++) {
    const l = Math.max(7, Math.round(W * (0.14 + h() * 0.08)));
    const r = Math.max(1, Math.round(l / 5));
    const x = n === 0 ? place(o, coteTour, l, 0.6 - h() * 0.5) : Math.round(W / 2 - l / 2 + (h() - 0.5) * W * 0.2);
    const y = r + 1 + entre(h, 0, Math.round(H * 0.06));
    if (y + r + 1 < o.zone.y - 1 || colonnesLibres(o, x, l, 1)) nuage(p, x, y, l, "#ffffff", "#d3e6f6");
  }

  // Les collines pâles de l'horizon, puis la dalle claire du pas de tir.
  const loin = crete(W, ys, Math.max(1, Math.round(H * 0.07)), h);
  remplirSous(p, loin, (x, y) => (y >= ys ? null : "#cfe6cf"));
  degrade(p, ys, H - 1, "#eeece5", "#dedbd2", 3);
  p.rect(0, ys, W, 1, "#f7f6f1");
  const joint = Math.max(8, Math.round(W / 4));
  const dj = entre(h, 0, joint - 1);
  for (let x = dj; x < W; x += joint) if (colonnesLibres(o, x, 1, 1)) p.rect(x, ys + 1, 1, H - ys - 1, "#d6d3ca");

  // La tour de lancement : deux montants, des croisillons, un bras, un feu turquoise et sa manche à air.
  const ROUGE = "#e58f7c";
  const ROUGE_CLAIR = "#f4b9aa";
  const ROUGE_OMBRE = "#cb7463";
  const lt = Math.max(4, Math.round(W * 0.1));
  const ht = Math.round(ys * 0.84);
  const tx = place(o, coteTour, lt, -0.35);
  const ty = ys - ht;
  const etage = Math.max(3, lt - 1);
  for (let y = ys - 1; y - etage >= ty; y -= etage) {
    if (lt >= 5) {
      trait(p, tx + e, y, tx + lt - 1 - e, y - etage + 1, ROUGE_CLAIR);
      trait(p, tx + lt - 1 - e, y, tx + e, y - etage + 1, ROUGE_CLAIR);
    }
    p.rect(tx, y - etage, lt, 1, ROUGE_OMBRE);
  }
  p.rect(tx, ty, e, ht, ROUGE);
  p.rect(tx + lt - e, ty, e, ht, ROUGE_OMBRE);
  p.rect(tx - 1, ty, lt + 2, e, ROUGE);
  p.rect(tx - 1, ys - 1, lt + 2, 1, ROUGE_OMBRE);
  const versLeMilieu = coteTour === "g" ? 1 : -1;
  const bras = Math.max(2, Math.round(lt * 0.7));
  const byBras = ty + Math.round(ht * 0.3);
  p.rect(versLeMilieu > 0 ? tx + lt : tx - bras, byBras, bras, e, ROUGE);
  p.rect(versLeMilieu > 0 ? tx + lt + bras - 1 : tx - bras, byBras + e, 1, e + 1, ROUGE_OMBRE);
  const mat = Math.max(2, Math.round(H * 0.07));
  const mx = tx + Math.floor(lt / 2);
  if (ty - mat - e >= 0) {
    p.rect(mx, ty - mat, 1, mat, "#9aa3b5");
    p.rect(mx - (e - 1), ty - mat - e, 2 * e - 1, e, DIVIN);
    for (let i = 1; i <= 3 * e; i++) p.rect(mx - versLeMilieu * i, ty - mat + 1 + (i > 2 * e ? 1 : 0), 1, Math.max(1, e - (i > e ? 1 : 0)) + (i <= e ? 1 : 0), i % 2 === 0 || e > 1 ? DIVIN_CLAIR : "#ffffff");
  }

  // La fusée, au loin sur son socle, dans sa vapeur : coiffe, ailerons et bande à la couleur de la chose.
  const COIFFE = eclaircir(adoucir(o.accent, 0.1), 0.2);
  const lfu = Math.max(3, Math.round(W * 0.07)) | 1;
  const hfu = Math.round(lfu * 3.2);
  const aileron = Math.max(1, Math.round(lfu / 2));
  const fx = place(o, coteFusee, lfu + 2 * aileron + 4, 0.1 - h() * 0.5) + aileron + 2;
  const pied = ys - 1 - Math.max(1, e);
  const fy = pied - hfu + 1;
  for (let n = 0; n < 2; n++) {
    const l = Math.max(5, Math.round(lfu * (1.8 + h() * 0.8)));
    const r = Math.max(1, Math.round(l / 5));
    const x = fx + Math.round(lfu / 2) + (n === 0 ? -l + 1 : 0) + entre(h, -1, 1);
    if (colonnesLibres(o, x, l, 1) || pied - 2 * r > o.zone.y + o.zone.hauteur) nuage(p, x, pied - r + 1, l, "#ffffff", "#d5e0ec");
  }
  const pointe = Math.ceil(lfu / 2);
  const OMBRE = "#bcc6d6";
  for (let j = 0; j < pointe; j++) p.rect(fx + Math.floor(lfu / 2) - j, fy + j, 2 * j + 1, 1, COIFFE);
  p.rect(fx, fy + pointe, lfu, hfu - pointe, "#fbfcfe");
  p.rect(fx + lfu - Math.max(1, Math.floor(lfu / 3)), fy + pointe, Math.max(1, Math.floor(lfu / 3)), hfu - pointe, OMBRE);
  p.rect(fx, fy + pointe + Math.round(hfu * 0.34), lfu, Math.max(1, e), COIFFE);
  if (lfu >= 5) p.rect(fx + Math.floor(lfu / 2) - e, fy + pointe + Math.max(1, e), e + 1, e + 1, DIVIN);
  else p.poser(fx + Math.floor(lfu / 2), fy + pointe + 1, DIVIN);
  for (let j = 0; j < aileron + 1; j++) {
    p.rect(fx - 1 - j, pied - aileron + j, j + 1, 1, COIFFE);
    p.rect(fx + lfu, pied - aileron + j, j + 1, 1, COIFFE);
  }
  const pasCarre = Math.max(1, e);
  p.rect(fx - 2 - aileron, pied + 1, lfu + 4 + 2 * aileron, pasCarre, "#b9bfcb");
  p.rect(fx - 2 - aileron, pied + 1 + pasCarre, lfu + 4 + 2 * aileron, pasCarre, (x) => ((Math.floor(x / pasCarre) & 1) === 0 ? "#f6d95f" : "#a9adb8"));

  // La petite fusée partie de travers : sa traînée fait une boucle dans le ciel, au-dessus de l'autre.
  if (!petit) {
    const sens = coteFusee === "g" ? -1 : 1;
    const rayon = Math.max(3, Math.round(Math.min(W * 0.06, H * 0.09)));
    const long = rayon * 2.6;
    const etendue = Math.round(long * 1.3 + 2 * rayon);
    const ccx = place(o, coteFusee, etendue, -0.3) + etendue / 2;
    const monte = rayon * 0.9;
    const ccy = Math.round(rayon + 2 + monte * 0.7 + entre(h, 0, Math.round(H * 0.04)));
    let bout: [number, number] | null = null;
    let avant: [number, number] | null = null;
    for (let k = 0; k <= 400; k++) {
      const t = -0.15 + (k / 400) * 1.3;
      const x = Math.round(ccx + sens * (long * (t - 0.5) + rayon * Math.sin(2 * Math.PI * t)));
      const y = Math.round(ccy + rayon * Math.cos(2 * Math.PI * t) - monte * (t - 0.5));
      if (bout && bout[0] === x && bout[1] === y) continue;
      if (!horsZone(o, x, y, 2) || y < 1 || y > fy - 2 || x < 1 || x > W - 2) continue;
      if (t > 0.2 || ((x + y) & 1) === 0) p.poser(x, y, "#ffffff");
      avant = bout;
      bout = [x, y];
    }
    if (bout && avant) {
      const ddx = Math.sign(bout[0] - avant[0]);
      const ddy = Math.sign(bout[1] - avant[1]);
      p.rect(bout[0], bout[1], e, e, "#ffc56b");
      p.rect(bout[0] + ddx * e, bout[1] + ddy * e, e, e, "#fbfcfe");
      p.rect(bout[0] + 2 * ddx * e, bout[1] + 2 * ddy * e, e, e, "#e8626e");
    }
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// L'espace : un ciel lavande, une planète à anneau, la lune sous les pieds, et une soucoupe qui emporte une vache.
// ---------------------------------------------------------------------------------------------------------------------

function peindreEspace(p: Planche, o: ParametresDuFond): void {
  const h = hasard(o.graine);
  const W = o.largeur;
  const H = o.hauteur;
  const ys = solDe(o);
  const grand = W >= 100;
  const petit = W < 34;
  const e = grand ? 2 : 1;
  const cotePlanete: Cote = h() < 0.5 ? "g" : "d";
  const coteLune: Cote = cotePlanete === "g" ? "d" : "g";

  degrade(p, 0, ys + 2, "#b7a5ec", "#eadcfb", 6);

  // Les étoiles : des points partout, des croix sur les bords.
  for (let n = Math.round((W * H) / 70); n > 0; n--) {
    const x = entre(h, 1, W - 2);
    const y = entre(h, 1, Math.max(1, ys - 2));
    const croix = n % (grand ? 7 : 4) === 0 && horsZone(o, x, y, 3);
    if (croix) {
      p.rect(x - e, y, 2 * e + 1, 1, "#ffffff");
      p.rect(x, y - e, 1, 2 * e + 1, "#ffffff");
      p.poser(x, y, n % 8 === 0 ? "#fff3b8" : "#ffffff");
    } else if (horsZone(o, x, y, 1)) p.poser(x, y, n % 3 === 0 ? "#fff6cf" : "#ffffff");
    else if (n % 5 === 0) p.poser(x, y, "#e3d6f8");
  }

  // La planète à anneau, dans un coin du haut : des bandes pêche et rose, un anneau turquoise.
  const r = Math.max(3, Math.round(Math.min(W, H) * 0.13));
  const px = borner(place(o, cotePlanete, r * 2 + 1, -0.1) + r, r - 1, W - r);
  const py = r + 1 + entre(h, 0, Math.round(H * 0.06));
  const penche = (cotePlanete === "g" ? -1 : 1) * 0.22;
  const anneau = (devant: boolean, a: number, b: number, couleur: string): void => {
    for (let k = 0; k < 360; k++) {
      const t = (k / 360) * Math.PI * 2;
      const estDevant = Math.sin(t) > 0;
      if (estDevant !== devant) continue;
      const ax = Math.round(a * Math.cos(t));
      const ay = Math.round(b * Math.sin(t) + penche * a * Math.cos(t));
      if (horsZone(o, px + ax, py + ay, 1)) p.poser(px + ax, py + ay, couleur);
    }
  };
  const ra = Math.round(r * 1.9);
  const rb = Math.max(1, Math.round(r * 0.42));
  anneau(false, ra, rb, DIVIN_CLAIR);
  if (grand) anneau(false, ra - 2, rb - 1, DIVIN_PALE);
  const bande = Math.max(1, Math.round(r / 3));
  const decalBande = entre(h, 0, bande);
  p.disque(px, py, r, (ddx, ddy) => {
    const rang = Math.floor((ddy + r + decalBande) / bande) % 3;
    const c = rang === 0 ? "#f9cfae" : rang === 1 ? "#f4aebe" : "#fbe0c4";
    if (ddx + ddy > r * 0.75) return melanger(c, "#a58bd6", 0.4);
    if (ddx + ddy > r * 0.2 && trame(px + ddx, py + ddy, 0.5)) return melanger(c, "#a58bd6", 0.4);
    return c;
  });
  anneau(true, ra, rb, DIVIN_CLAIR);
  if (grand) anneau(true, ra - 2, rb - 1, "#ffffff");

  // Une petite lune, de l'autre côté.
  const rl = Math.max(2, Math.round(Math.min(W, H) * 0.075));
  const lx = borner(place(o, coteLune, rl * 2 + 1, -0.5 + h() * 0.6) + rl, rl, W - rl - 1);
  const ly = rl + 1 + entre(h, 0, Math.round(H * 0.05));
  p.disque(lx, ly, rl, (ddx, ddy) => (ddx + ddy > rl * 0.7 ? "#e2d6c4" : "#fcf6e4"));
  if (rl >= 3) {
    p.poser(lx - 1, ly - 1, "#e8dcc6");
    p.poser(lx + 1, ly + 1, "#d8cbb8");
    if (grand) p.rect(lx - 3, ly + 1, 2, 2, "#e8dcc6");
  }

  // Le sol de lune, lilas pâle, et ses cratères.
  const SOL = "#dccff2";
  const sol = crete(W, ys + 1, Math.max(1, Math.round(H * 0.05)), h);
  remplirSous(p, sol, (x, y, prof) => (prof === 0 ? "#f5effd" : trame(x, y, ((y - ys) / Math.max(1, H - ys)) * 0.7) ? "#cfc0ea" : SOL));
  for (let n = petit ? 2 : Math.round(W / 11); n > 0; n--) {
    const rx = entre(h, 2, Math.max(2, Math.round(W * 0.05)));
    const cx = entre(h, rx, W - rx - 1);
    const cy = entre(h, ys + 4, Math.max(ys + 4, H - 2));
    if (cy >= H - 1 || !horsZone(o, cx - rx, cy, 0) || !horsZone(o, cx + rx, cy, 0)) continue;
    const ry = Math.max(1, Math.round(rx / 3));
    ellipse(p, cx, cy, rx, ry, (ddx, ddy) => (cy + ddy > (sol[borner(cx + ddx, 0, W - 1)] ?? ys) + 1 ? "#c4b3e3" : null));
    p.rect(cx - rx + 1, cy + ry, Math.max(1, rx * 2 - 1), 1, "#f5effd");
  }

  // Le fanion planté sur la lune, à la couleur de la chose.
  const mat = Math.max(4, Math.round(H * 0.15));
  const fxx = place(o, cotePlanete, 5 * e, -0.2);
  const piedFanion = (sol[borner(fxx, 0, W - 1)] ?? ys) + 1;
  if (fxx >= 0 && fxx < W) {
    const FANION = eclaircir(o.accent, 0.12);
    p.rect(fxx, piedFanion - mat, 1, mat + 1, "#8f84ad");
    for (let j = 0; j < 2 * e + 1; j++) p.rect(fxx + 1, piedFanion - mat + j, Math.max(1, 3 * e - Math.abs(j - e) * (e > 1 ? 1 : 2)), 1, FANION);
  }

  // La soucoupe au loin, son rayon turquoise, et la vache qu'elle emporte.
  if (H >= 34) {
    const ls = 9 * e;
    const sx = place(o, coteLune, ls, -0.6);
    const sy = Math.max(ly + rl + 3, Math.round(H * 0.3));
    const fin = Math.min(ys - 2, sy + 4 * e + Math.round(H * 0.3));
    if (colonnesLibres(o, sx, ls, 0) && fin - sy > 8 * e) {
      for (let y = sy + 3 * e; y <= fin; y++) {
        const demi = Math.round(e + ((y - sy - 3 * e) / (fin - sy - 3 * e)) * 3 * e);
        const mx = sx + Math.floor(ls / 2);
        for (let x = mx - demi; x <= mx + demi; x++) if (trame(x, y, 0.62)) p.poser(x, y, DIVIN_PALE);
      }
      motif(p, sx + Math.round((ls - PETITE_VACHE[0].length * e) / 2), fin - PETITE_VACHE.length * e - e, PETITE_VACHE, COULEURS_DE_VACHE, e, coteLune === "g");
      motif(p, sx, sy, ["...ttt...", "..tTTTt..", "ggggggggg", ".GyGyGyG."], { t: DIVIN_CLAIR, T: "#e6fbf8", g: "#c9cfdd", G: "#9ea6b9", y: "#ffe98f" }, e);
    }
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// La salle de contrôle : la grande carte d'un monde inventé, des écrans, deux pupitres, un gros bouton et une tasse.
// ---------------------------------------------------------------------------------------------------------------------

function peindreSalleDeControle(p: Planche, o: ParametresDuFond): void {
  const h = hasard(o.graine);
  const W = o.largeur;
  const H = o.hauteur;
  const ys = solDe(o);
  const grand = W >= 100;
  const petit = W < 34;
  const e = grand ? 2 : 1;
  const MUR = "#eaeff6";
  const CADRE = "#aab5c9";
  const ECRAN = "#e0f5f3";
  const TERRE = "#b2e6dd";
  const coteBouton: Cote = h() < 0.5 ? "g" : "d";

  // Le mur clair, le plafond, le sol.
  p.rect(0, 0, W, ys, MUR);
  const plafond = Math.max(1, Math.round(H * 0.05));
  p.rect(0, 0, W, plafond, "#d5dde9");
  p.rect(0, plafond, W, 1, "#f6f8fb");
  degrade(p, ys, H - 1, "#e3e8f0", "#d3dae6", 3);
  p.rect(0, ys, W, 1, "#f3f6fa");

  // La grande carte : un monde inventé, en turquoise pâle, qui tient tout le mur derrière la chose.
  const marge = Math.max(3, Math.round(W * 0.17));
  const cx0 = marge;
  const cx1 = W - marge - 1;
  const cy0 = plafond + 2;
  const cy1 = ys - Math.max(2, Math.round(H * 0.07));
  p.rect(cx0, cy0, cx1 - cx0 + 1, cy1 - cy0 + 1, CADRE);
  p.rect(cx0 + e, cy0 + e, cx1 - cx0 + 1 - 2 * e, cy1 - cy0 + 1 - 2 * e, ECRAN);
  const dedans = (x: number, y: number): boolean => x >= cx0 + e && x <= cx1 - e && y >= cy0 + e && y <= cy1 - e;
  const maille = Math.max(4, Math.round(W / 10));
  const dm = entre(h, 0, maille - 1);
  for (let x = cx0 + e + dm; x <= cx1 - e; x += maille) p.rect(x, cy0 + e, 1, cy1 - cy0 + 1 - 2 * e, "#d2eeea");
  for (let y = cy0 + e + (dm % maille); y <= cy1 - e; y += maille) p.rect(cx0 + e, y, cx1 - cx0 + 1 - 2 * e, 1, "#d2eeea");
  const lc = cx1 - cx0;
  const hc = cy1 - cy0;
  for (let n = petit ? 4 : 7; n > 0; n--) {
    let x = cx0 + Math.round(lc * (0.08 + h() * 0.84));
    let y = cy0 + Math.round(hc * (0.15 + h() * 0.7));
    for (let k = entre(h, 2, 4); k > 0; k--) {
      const r = entre(h, 1, Math.max(1, Math.round(hc * 0.11)));
      const bx = x;
      const by = y;
      p.disque(bx, by, r, (ddx, ddy) => (dedans(bx + ddx, by + ddy) ? TERRE : null));
      x += entre(h, -r, r + 1);
      y += entre(h, -r, r);
    }
  }
  // Deux points sur la carte, sur un bord : l'un turquoise, l'autre à la couleur de la chose, cerclé.
  const coteCible: Cote = coteBouton === "g" ? "d" : "g";
  const xCible = coteCible === "g" ? cx0 + e + Math.max(2, Math.round(lc * 0.08)) : cx1 - e - Math.max(2, Math.round(lc * 0.08));
  const yCible = cy0 + Math.round(hc * (0.3 + h() * 0.3));
  if (horsZone(o, xCible - 2 * e, yCible, 0) && horsZone(o, xCible + 2 * e, yCible, 0) && !petit) {
    const CIBLE = eclaircir(o.accent, 0.1);
    for (const [ddx, ddy] of [[-2, 0], [2, 0], [0, -2], [0, 2]] as const) p.rect(xCible + ddx * e, yCible + ddy * e, e, e, CIBLE);
    p.rect(xCible, yCible, e, e, CIBLE);
  }
  const xPoint = coteCible === "g" ? cx1 - e - Math.max(2, Math.round(lc * 0.1)) : cx0 + e + Math.max(2, Math.round(lc * 0.1));
  const yPoint = cy0 + Math.round(hc * (0.2 + h() * 0.2));
  if (horsZone(o, xPoint, yPoint, 1)) p.rect(xPoint, yPoint, e, e, DIVIN);

  // Les petits écrans des côtés : une courbe à la couleur de la chose, des barres turquoise, un visage content.
  const lm = marge - 2;
  if (lm >= 4) {
    const hm = Math.max(4, Math.round(H * 0.15));
    const sortes = [0, 1, 2, 1, 0, 2];
    const tour = entre(h, 0, 2);
    let k = tour;
    for (const x0 of [1, W - 1 - lm]) {
      for (let y0 = cy0; y0 + hm <= ys - Math.round(H * 0.24); y0 += hm + 1 + (e - 1)) {
        const sorte = sortes[k++ % sortes.length]!;
        p.rect(x0, y0, lm, hm, CADRE);
        const fond = sorte === 2 ? "#e6f7d8" : "#d9e6f8";
        p.rect(x0 + 1, y0 + 1, lm - 2, hm - 2, fond);
        if (sorte === 0) {
          const COURBE = eclaircir(adoucir(o.accent, 0.1), 0.1);
          for (let i = 0; i < lm - 2; i++) p.poser(x0 + 1 + i, y0 + 1 + Math.round((hm - 3) * (0.5 + 0.5 * Math.sin(i * (4.4 / lm) + tour + k))), COURBE);
        } else if (sorte === 1) {
          for (let i = 0; i + 1 < lm - 2; i += 2) {
            const hb = 1 + Math.floor(h() * (hm - 3));
            p.rect(x0 + 1 + i, y0 + hm - 1 - hb, 1, hb, melanger(DIVIN, "#ffffff", 0.25));
          }
        } else {
          const mxx = x0 + Math.floor(lm / 2);
          const VISAGE = "#6f8f78";
          p.poser(mxx - 1 - (lm > 6 ? 1 : 0), y0 + 1 + Math.max(0, Math.floor((hm - 4) / 2)), VISAGE);
          p.poser(mxx + 1, y0 + 1 + Math.max(0, Math.floor((hm - 4) / 2)), VISAGE);
          const yb = y0 + hm - 2 - Math.max(0, Math.floor((hm - 5) / 2));
          p.rect(mxx - 1 - (lm > 6 ? 1 : 0), yb, 3 + (lm > 6 ? 1 : 0), 1, VISAGE);
          if (hm >= 6) {
            p.poser(mxx - 2 - (lm > 6 ? 1 : 0), yb - 1, VISAGE);
            p.poser(mxx + 2, yb - 1, VISAGE);
          }
        }
      }
    }
  }

  // Les deux pupitres : un dessus penché, des voyants, une grille.
  const lpu = Math.max(5, Math.round(W * 0.2));
  const hpu = Math.max(5, Math.round(H * 0.22));
  const bas = Math.min(H - 1, ys + Math.max(1, Math.round((H - ys) * 0.5)));
  const VOYANTS = ["#f08f8f", "#f6da74", "#9fe2a4", DIVIN, "#ffffff"] as const;
  for (const cote of ["g", "d"] as const) {
    const x0 = cote === "g" ? Math.min(0, o.zone.x - 1 - lpu) : Math.max(W - lpu, o.zone.x + o.zone.largeur + 1);
    const y0 = bas - hpu;
    const dessus = Math.max(2, Math.round(hpu * 0.3));
    p.rect(x0, y0 + dessus, lpu, hpu - dessus + 1, "#cbd4e2");
    p.rect(cote === "g" ? x0 + lpu - e : x0, y0 + dessus, e, hpu - dessus + 1, cote === "g" ? "#b3bdcf" : "#dbe2ec");
    for (let j = 0; j < dessus; j++) {
      const retrait = Math.round(((dessus - 1 - j) / dessus) * 2 * e);
      p.rect(cote === "g" ? x0 : x0 + retrait, y0 + j, lpu - retrait, 1, j === 0 ? "#f5f7fb" : "#e3e9f2");
    }
    const decalV = entre(h, 0, VOYANTS.length - 1);
    for (let i = 0; 1 + i * 2 * e + e <= lpu - 2 - 2 * e; i++) p.rect(x0 + (cote === "g" ? 1 : 1 + 2 * e) + i * 2 * e, y0 + Math.max(1, dessus - e), e, Math.min(e, dessus - 1), VOYANTS[(i + decalV) % VOYANTS.length]!);
    if (hpu - dessus >= 4) for (let j = 2; j < hpu - dessus - 1; j += 2) p.rect(x0 + 2, y0 + dessus + j, lpu - 4, 1, "#b8c2d3");
    p.rect(x0, bas + 1, lpu, 1, "#c3ccda");

    // Sur l'un, le gros bouton rouge sous sa cloche ; sur l'autre, la tasse qui fume, à la couleur de la chose.
    const milieu = x0 + Math.floor(lpu / 2);
    if (cote === coteBouton) {
      p.rect(milieu - 2 * e, y0 - 1, 4 * e + 1, 1, "#8f99ad");
      p.rect(milieu - e, y0 - 1 - 2 * e, 2 * e + 1, 2 * e, "#e9565f");
      p.rect(milieu - e, y0 - 1 - 2 * e, e, e, "#f6a0a4");
      if (e > 1) p.rect(milieu + e, y0 - 2, 1, 1, "#c23d48");
      if (!petit) {
        for (let j = 0; j < 3 * e; j++) {
          p.poser(milieu - 2 * e, y0 - 2 - j, "#dff4f8");
          p.poser(milieu + 2 * e, y0 - 2 - j, "#dff4f8");
        }
        p.rect(milieu - 2 * e + 1, y0 - 2 - 3 * e, 4 * e - 1, 1, "#dff4f8");
      }
    } else {
      const TASSE = eclaircir(adoucir(o.accent, 0.1), 0.15);
      const lt = 2 * e + 1;
      p.rect(milieu - e, y0 - lt, lt, lt, TASSE);
      p.rect(milieu - e, y0 - lt, lt, 1, "#ffffff");
      p.rect(milieu - e + lt, y0 - lt + 1, 1, Math.max(1, lt - 2), TASSE);
      if (!petit) {
        for (let j = 0; j < 3 * e; j++) p.poser(milieu + (((j / e) | 0) % 2 === 0 ? 0 : 1), y0 - lt - 2 - j, "#ffffff");
      }
    }
  }
}

const nomDe = (id: keyof typeof CATALOGUE_DES_SCENES): string => CATALOGUE_DES_SCENES[id].nom;

export const SCENES_F: readonly SceneDeFond[] = [
  { id: "sans-texture", nom: nomDe("sans-texture"), peindre: peindreSansTexture },
  { id: "pre-des-vaches", nom: nomDe("pre-des-vaches"), peindre: peindrePreDesVaches },
  { id: "zone-contaminee", nom: nomDe("zone-contaminee"), peindre: peindreZoneContaminee },
  { id: "pas-de-tir", nom: nomDe("pas-de-tir"), peindre: peindrePasDeTir },
  { id: "espace", nom: nomDe("espace"), peindre: peindreEspace },
  { id: "salle-de-controle", nom: nomDe("salle-de-controle"), peindre: peindreSalleDeControle },
];
