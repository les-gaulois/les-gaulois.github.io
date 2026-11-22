/**
 * Les fonds d'objets, lot E, « légendes et trésors » (voir `socle.ts` et son `CATALOGUE_DES_SCENES`) : la salle du trésor,
 * le palais, le cercle de pierres, la forêt enchantée, l'antre du dragon, le ciel des dieux et la nuit étoilée. Ce sont les
 * fonds des choses mystiques et légendaires : précieux, mais clairs et calmes, un décor de théâtre derrière la chose.
 *
 * Leur air de famille : un halo pâle derrière la chose, le décor rangé sur les deux bords, un sol clair sous elle, et un peu
 * d'or. La graine déplace le décor, l'accent teinte un détail, et le rang ajoute un peu de richesse au loin.
 *
 * Dessin de Claude Fable 5.2, 22 novembre 2026.
 */
import { Planche, crete, degrade, eclaircir, entre, hasard, melanger, trame, type ParametresDuFond, type SceneDeFond } from "./socle";

// ---------------------------------------------------------------------------------------------------------------------
// Outils du lot.
// ---------------------------------------------------------------------------------------------------------------------

/** Les mesures d'une scène : sa taille, son échelle (1 pour une case du vestiaire de 56 cases), son horizon, son hasard. */
interface Mesures {
  W: number;
  H: number;
  /** L'échelle : 1 à 56 cases de large, 2 à 112. */
  k: number;
  /** La rangée où le sol commence, un peu au-dessus des pieds de la chose. */
  hz: number;
  h: () => number;
  /** Une longueur à l'échelle, jamais sous `min`. */
  u: (n: number, min?: number) => number;
}

function mesurer(o: ParametresDuFond): Mesures {
  const W = o.largeur;
  const H = o.hauteur;
  const k = Math.min(W / 56, H / 38);
  const hz = Math.max(Math.round(H * 0.5), Math.min(o.sol - Math.max(1, Math.round(H * 0.1)), Math.round(H * 0.8)));
  return { W, H, k, hz, h: hasard(o.graine), u: (n, min = 1) => Math.max(min, Math.round(n * k)) };
}

/** La distance d'une case au milieu de la chose, en parts de sa place élargie de `marge` (moins de 1 : dedans). */
function versLaChose(o: ParametresDuFond, x: number, y: number, marge: number): number {
  const rx = o.zone.largeur / 2 + marge * o.largeur;
  const ry = o.zone.hauteur / 2 + marge * o.hauteur;
  const dx = (x + 0.5 - (o.zone.x + o.zone.largeur / 2)) / rx;
  const dy = (y + 0.5 - (o.zone.y + o.zone.hauteur / 2)) / ry;
  return Math.sqrt(dx * dx + dy * dy);
}

/** Vrai si la case est hors de la place de la chose : là où un petit détail a le droit de se poser. */
const auLarge = (o: ParametresDuFond, x: number, y: number): boolean => versLaChose(o, x, y, 0.06) > 1;

/**
 * Le halo du lot : derrière la chose, le décor est fondu vers une couleur pâle, en trois marches tramées. Le milieu reste
 * calme, la chose se détache, et les bords gardent tout leur dessin.
 */
function halo(p: Planche, o: ParametresDuFond, vers: string, force: number): void {
  for (let y = 0; y < p.hauteur; y++) {
    for (let x = 0; x < p.largeur; x++) {
      const d = versLaChose(o, x, y, 0.12);
      if (d >= 1) continue;
      const t = Math.min(1, (1 - d) * 1.6) * 3;
      const reste = t - Math.floor(t);
      const marche = Math.min(3, Math.floor(t) + (reste > 0.7 || (reste > 0.3 && trame(x, y, (reste - 0.3) / 0.4)) ? 1 : 0));
      if (marche === 0) continue;
      const ici = p.lire(x, y);
      if (ici) p.poser(x, y, melanger(ici, vers, (force * marche) / 3));
    }
  }
}

/** Un éclat : une case vive, et quatre petites branches plus douces quand il est grand. */
function eclat(p: Planche, x: number, y: number, vif: string, doux: string, grand: boolean): void {
  if (grand) {
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) p.poser(x + dx, y + dy, doux);
  }
  p.poser(x, y, vif);
}

/** Fond la case vers une couleur, d'une part donnée : pour une lueur autour d'une chose qui brille. */
function teinter(p: Planche, x: number, y: number, vers: string, part: number): void {
  const ici = p.lire(x, y);
  if (ici) p.poser(x, y, melanger(ici, vers, part));
}

/** Une lueur ronde, tramée sur son bord. */
function lueur(p: Planche, cx: number, cy: number, r: number, vers: string, part: number): void {
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      const d = Math.sqrt(dx * dx + dy * dy) / (r + 0.5);
      if (d > 1) continue;
      if (d < 0.6 || trame(cx + dx, cy + dy, (1 - d) * 2.2)) teinter(p, cx + dx, cy + dy, vers, part);
    }
  }
}

/** Les deux côtés dans l'ordre de la graine : le décor change de côté d'une chose à l'autre. */
const cotes = (h: () => number): readonly [number, number] => (h() < 0.5 ? [0, 1] : [1, 0]);

// ---------------------------------------------------------------------------------------------------------------------
// La salle du trésor.
// ---------------------------------------------------------------------------------------------------------------------

const OR = { vif: "#fff3b0", clair: "#f9db6a", fond: "#eec24a", ombre: "#d6a13a", creux: "#b98230" } as const;

/** Un tas de statères : une butte d'or, des pièces rangées en écailles, la lumière en haut à gauche. */
function tasDOr(p: Planche, cx: number, r: number, haut: number): number[] {
  const sommets: number[] = [];
  for (let x = cx - r; x <= cx + r; x++) {
    const t = (x - cx) / r;
    const bosse = 0.86 + 0.14 * Math.cos(t * 9 + cx);
    const sommet = p.hauteur - Math.round(haut * Math.max(0, 1 - t * t) ** 0.75 * bosse);
    sommets.push(sommet);
    for (let y = sommet; y < p.hauteur; y++) {
      const fond = y - sommet;
      const joint = ((x + ((y >> 1) & 1) * 2) & 3) === 3;
      let c: string = (y & 1) === 0 ? OR.clair : OR.fond;
      if (joint) c = OR.ombre;
      if (t > 0.35 && !joint && (y & 1) === 1) c = OR.ombre;
      if (fond === 0) c = t < 0.3 ? OR.vif : OR.clair;
      p.poser(x, y, c);
    }
  }
  return sommets;
}

/** Un coffre ouvert : le bois clair, les ferrures d'or, le couvercle relevé doublé de la couleur de la chose, de l'or dedans. */
function coffre(p: Planche, x: number, bas: number, l: number, hgt: number, doublure: string): void {
  const bois = "#c08a55";
  const boisClair = "#d8a670";
  const boisSombre = "#9a6a40";
  const couvercle = Math.max(2, Math.round(hgt * 0.55));
  const haut = bas - hgt;
  // Le couvercle, relevé derrière.
  p.rect(x, haut - couvercle, l, couvercle, doublure);
  p.rect(x, haut - couvercle, l, 1, boisClair);
  p.rect(x, haut - couvercle, 1, couvercle, bois);
  p.rect(x + l - 1, haut - couvercle, 1, couvercle, boisSombre);
  if (couvercle > 3) p.rect(x + 1, haut - couvercle + 1, l - 2, 1, eclaircir(doublure, 0.3));
  // L'or qui déborde.
  p.rect(x + 1, haut - 1, l - 2, 1, OR.clair);
  for (let i = x + 2; i < x + l - 2; i += 3) p.poser(i, haut - 2, OR.vif);
  // La caisse.
  p.rect(x, haut, l, hgt, bois);
  p.rect(x, haut, l, 1, OR.fond);
  p.rect(x, haut + 1, 1, hgt - 1, boisClair);
  p.rect(x + l - 1, haut + 1, 1, hgt - 1, boisSombre);
  p.rect(x, bas - 1, l, 1, boisSombre);
  if (l >= 9) {
    p.rect(x + 2, haut, 1, hgt, OR.ombre);
    p.rect(x + l - 3, haut, 1, hgt, OR.ombre);
  }
  // La serrure.
  const m = x + Math.floor(l / 2);
  p.rect(m - (l >= 9 ? 1 : 0), haut + 1, l >= 9 ? 2 : 1, Math.max(1, Math.round(hgt * 0.4)), OR.clair);
}

function peindreSalleDuTresor(p: Planche, o: ParametresDuFond): void {
  const { W, H, k, hz, h, u } = mesurer(o);
  const mur = { haut: "#f6ead0", bas: "#eedcb6", joint: "#e3cfa4", clair: "#fbf3df" };
  // Le mur de grosses pierres claires.
  degrade(p, 0, hz - 1, mur.haut, mur.bas, 3);
  const bh = u(7, 4);
  const bw = bh * 2 + 1;
  const decalage = entre(h, 0, bw - 1);
  for (let y = 0; y < hz; y++) {
    const rangee = Math.floor(y / bh);
    for (let x = 0; x < W; x++) {
      const dansRangee = y % bh;
      const dansPierre = (x + decalage + (rangee & 1) * Math.floor(bw / 2)) % bw;
      if (dansRangee === bh - 1 || dansPierre === 0) p.poser(x, y, mur.joint);
      else if (dansRangee === 0 && bh > 4) p.poser(x, y, mur.clair);
    }
  }
  // La frise d'or du haut, sertie de la couleur de la chose : plus riche avec le rang.
  const frise = o.rang >= 3 ? u(2) : 1;
  p.rect(0, 0, W, frise, OR.fond);
  p.rect(0, frise, W, 1, OR.ombre);
  const pas = u(8, 5);
  for (let x = entre(h, 1, pas - 1); x < W; x += pas) {
    p.rect(x, 0, frise >= 2 ? 2 : 1, frise, melanger(o.accent, "#ffffff", 0.25));
    if (frise >= 2) p.poser(x, 0, eclaircir(o.accent, 0.65));
  }
  // Le dallage clair.
  degrade(p, hz, H - 1, "#f0dfbc", "#e2cc9e", 3);
  p.rect(0, hz, W, 1, mur.clair);
  // Les deux tas de statères, sur les bords.
  const [grand, petit] = cotes(h);
  const richesse = 1 + (o.rang - 1) * 0.05;
  const sommetsDesTas: { cx: number; r: number; ys: number[] }[] = [];
  for (const cote of [grand, petit]) {
    const gros = cote === grand;
    const r = Math.round(W * (gros ? 0.3 : 0.24) * richesse);
    const haut = Math.round((H - hz) * (gros ? 1.55 : 1.15) * richesse + H * (gros ? 0.12 : 0.05));
    const cx = cote === 0 ? Math.round(W * (0.02 + h() * 0.05)) : W - 1 - Math.round(W * (0.02 + h() * 0.05));
    sommetsDesTas.push({ cx, r, ys: tasDOr(p, cx, r, haut) });
  }
  // Le coffre ouvert, sur le petit tas.
  if (k >= 0.6) {
    const l = u(13, 7);
    const hgt = u(7, 4);
    const x = petit === 0 ? u(2) : W - l - u(2);
    coffre(p, x, H - u(2), l, hgt, melanger(o.accent, "#ffffff", 0.3));
  }
  // Des pierres de la couleur de la chose et des éclats dans l'or.
  const pierres = Math.round((2 + o.rang) * Math.max(1, k));
  for (let i = 0; i < pierres; i++) {
    const tas = sommetsDesTas[i % 2]!;
    const dx = Math.round((h() * 2 - 1) * tas.r * 0.8);
    const sommet = tas.ys[dx + tas.r] ?? H;
    const y = sommet + 2 + Math.floor(h() * Math.max(1, H - sommet - 4));
    const x = tas.cx + dx;
    if (y >= H - 1 || !auLarge(o, x, y)) continue;
    if (i % 3 === 2) eclat(p, x, y, "#ffffff", OR.vif, k >= 1);
    else {
      p.poser(x, y, melanger(o.accent, "#ffffff", 0.15));
      p.poser(x + 1, y, melanger(o.accent, "#0a1230", 0.15));
      p.poser(x, y - 1, eclaircir(o.accent, 0.6));
    }
  }
  // Quelques statères tombés sur les dalles.
  const tombes = Math.round(2 + 2 * k);
  for (let i = 0; i < tombes; i++) {
    const x = Math.round(W * (0.22 + h() * 0.56));
    const y = hz + 2 + Math.floor(h() * Math.max(1, H - hz - 3));
    if (versLaChose(o, x, y, 0) < 0.7) continue;
    p.poser(x, y, OR.clair);
    p.poser(x + 1, y, OR.ombre);
  }
  halo(p, o, "#fff8e4", 0.6);
}

// ---------------------------------------------------------------------------------------------------------------------
// Le palais.
// ---------------------------------------------------------------------------------------------------------------------

/** Une colonne de marbre cannelée, du haut de la planche à son socle. */
function colonne(p: Planche, x: number, l: number, bas: number, k: number): void {
  const marbre = { clair: "#fbf8fd", fond: "#ece4f1", ombre: "#d3c6dd", creux: "#bfb0cc" };
  for (let i = 0; i < l; i++) {
    const t = i / Math.max(1, l - 1);
    const c = t < 0.2 ? marbre.clair : t > 0.78 ? marbre.ombre : l >= 5 && i % 2 === 0 ? marbre.fond : melanger(marbre.fond, marbre.clair, 0.5);
    p.rect(x + i, 0, 1, bas, c);
  }
  // Le chapiteau et le socle, dorés.
  const e = Math.max(1, Math.round(1.6 * k));
  const haut = Math.max(1, Math.round(3 * k));
  p.rect(x - 1, haut, l + 2, e, OR.fond);
  p.rect(x - 1, haut, l + 2, 1, OR.clair);
  if (k >= 1) p.rect(x - 2, haut - 1, l + 4, 1, OR.ombre);
  p.rect(x - 1, bas - e, l + 2, e, marbre.fond);
  p.rect(x - 2, bas, l + 4, Math.max(1, e), marbre.ombre);
  p.rect(x - 2, bas, l + 4, 1, marbre.clair);
}

function peindrePalais(p: Planche, o: ParametresDuFond): void {
  const { W, H, k, hz, h, u } = mesurer(o);
  const tenture = melanger(o.accent, "#ffffff", 0.45);
  const tentureClaire = melanger(o.accent, "#ffffff", 0.62);
  const tentureSombre = melanger(tenture, "#6a5a8a", 0.16);
  const pliLarge = Math.max(1, Math.round(k * 1.5));
  // Le mur de marbre pâle, et ses panneaux.
  degrade(p, 0, hz - 1, "#f4eef7", "#eadff0", 3);
  const panneau = u(15, 8);
  const depart = entre(h, 0, panneau - 1);
  const lambris = Math.max(2, Math.round((hz * 2) / 3));
  for (let x = -depart; x < W; x += panneau) {
    p.rect(x, lambris, 1, hz - lambris, "#ddd0e6");
    p.rect(x + 1, lambris, 1, hz - lambris, "#faf6fc");
  }
  p.rect(0, lambris, W, 1, "#ddd0e6");
  p.rect(0, lambris + 1, W, 1, "#faf6fc");
  // Le dallage en damier, qui fuit vers le fond.
  for (let y = hz; y < H; y++) {
    const v = (y - hz) / Math.max(1, H - hz);
    const z = 1 / (0.3 + v);
    const rangee = Math.floor(z * 2.4);
    for (let x = 0; x < W; x++) {
      const col = Math.floor(((x - W / 2 + 0.5) * z) / u(9, 5) + 100);
      p.poser(x, y, (rangee + col) % 2 === 0 ? "#f3ecf5" : "#e0d3e8");
    }
  }
  p.rect(0, hz, W, 1, "#d3c6dd");
  // Le trône au fond, tout pâle, sur ses marches ; son dossier monte avec le rang.
  const cx = Math.round(W / 2);
  if (k >= 0.6) {
    const lt = u(11, 7);
    const ht = u(15 + o.rang, 8);
    const x0 = cx - Math.floor(lt / 2);
    p.rect(x0 - u(3), hz - u(2), lt + u(3) * 2, u(2), "#e6d9ec");
    p.rect(x0 - u(3), hz - u(2), lt + u(3) * 2, 1, "#faf6fc");
    p.rect(x0, hz - ht, lt, ht - u(2), "#f1dfa4");
    p.rect(x0, hz - ht, lt, 1, OR.vif);
    p.rect(x0, hz - ht, 1, ht - u(2), OR.clair);
    p.rect(x0 + lt - 1, hz - ht, 1, ht - u(2), "#dcc27a");
    p.rect(x0 + 2, hz - ht + 2, lt - 4, ht - u(2) - 3, tentureClaire);
    p.disque(cx, hz - ht - 1, Math.max(1, Math.round(lt / 5)), "#f1dfa4");
  }
  // Le tapis, de la couleur de la chose, bordé d'or.
  for (let y = hz + 1; y < H; y++) {
    const v = (y - hz) / Math.max(1, H - hz);
    const demi = Math.round(W * (0.1 + 0.2 * v));
    for (let x = cx - demi; x <= cx + demi; x++) {
      const bord = x - (cx - demi) < Math.max(1, Math.round(k)) || cx + demi - x < Math.max(1, Math.round(k));
      p.poser(x, y, bord ? OR.fond : tentureClaire);
    }
  }
  // Les deux colonnes.
  const lc = u(6, 3);
  const ecart = Math.round(W * (0.13 + h() * 0.05));
  const basDesColonnes = Math.min(H - 2, hz + u(2));
  // Les pans de tenture, derrière les colonnes.
  for (const cote of [0, 1]) {
    const lp = Math.round(W * (0.07 + h() * 0.04)) + lc;
    const bas = Math.round(H * (0.5 + h() * 0.16));
    for (let i = 0; i < lp; i++) {
      const x = cote === 0 ? ecart + i - 1 : W - ecart - i;
      const long = bas - Math.round(((i / lp) ** 2) * H * 0.2);
      const pli = (Math.floor(i / pliLarge) + cote) % 3;
      p.rect(x, 0, 1, long, pli === 0 ? tentureClaire : pli === 1 ? tenture : tentureSombre);
      p.poser(x, long, OR.fond);
    }
  }
  colonne(p, ecart - lc, lc, basDesColonnes, k);
  colonne(p, W - ecart, lc, basDesColonnes, k);
  // Le lambrequin du haut : des festons de tenture, frangés d'or.
  const festons = entre(h, 2, 3) + (W >= 100 ? 1 : 0);
  const lf = W / festons;
  for (let x = 0; x < W; x++) {
    const t = (x % lf) / lf;
    const bas = Math.round(H * 0.07 + H * 0.09 * Math.sin(t * Math.PI));
    for (let y = 0; y <= bas; y++) {
      const pli = Math.floor(t * 6) % 3;
      p.poser(x, y, y === bas ? OR.fond : y === 0 ? tentureSombre : pli === 0 ? tentureClaire : pli === 1 ? tenture : tentureSombre);
    }
  }
  halo(p, o, "#fdfaff", 0.62);
}

// ---------------------------------------------------------------------------------------------------------------------
// Le cercle de pierres.
// ---------------------------------------------------------------------------------------------------------------------

const PIERRE = { clair: "#e6e0ef", fond: "#c4bbd4", ombre: "#a398ba", creux: "#8d82a8" } as const;

/** Un menhir : une pierre levée, plus étroite en haut, la lumière à gauche, un peu penchée. */
function menhir(p: Planche, x: number, bas: number, l: number, hgt: number, penche: number, t: Readonly<Record<keyof typeof PIERRE, string>> = PIERRE): void {
  for (let dy = 0; dy < hgt; dy++) {
    const v = dy / Math.max(1, hgt - 1);
    const lr = Math.max(1, Math.round(l * (v < 0.6 ? 1 - v * 0.12 : 0.93 - ((v - 0.6) / 0.4) ** 2 * 0.5)));
    const x0 = x + Math.round((l - lr) / 2 + penche * dy);
    const y = bas - dy;
    for (let i = 0; i < lr; i++) {
      const part = i / Math.max(1, lr - 1);
      let c: string = part < 0.22 ? t.clair : part > 0.68 ? t.ombre : t.fond;
      if (dy === hgt - 1 || (lr > 3 && i === 0 && v > 0.6)) c = t.clair;
      if (lr > 4 && part > 0.3 && part < 0.6 && (dy * 7 + x) % 11 === 0) c = t.ombre;
      p.poser(x0 + i, y, c);
    }
  }
}

function peindreCercleDePierres(p: Planche, o: ParametresDuFond): void {
  const { W, H, k, hz, h, u } = mesurer(o);
  // Le crépuscule mauve clair, rose à l'horizon.
  degrade(p, 0, hz, "#cdc1ec", "#f8dcdc", 5);
  // Le soleil couché, pâle, à gauche ou à droite.
  const [coteDuSoleil, coteDuGui] = cotes(h);
  const sx = coteDuSoleil === 0 ? Math.round(W * (0.3 + h() * 0.08)) : Math.round(W * (0.62 + h() * 0.08));
  p.disque(sx, hz, u(6, 3), "#fdeee4");
  // Les collines au loin.
  const loin = crete(W, hz, Math.round(H * 0.1), h);
  for (let x = 0; x < W; x++) for (let y = loin[x] ?? hz; y <= hz; y++) p.poser(x, y, trame(x, y, 0.25) ? "#c9bbe2" : "#bfb1dc");
  // Les pierres du fond du cercle, petites et pâles.
  const PIERRE_LOIN = { clair: "#e2dbee", fond: "#cdc3df", ombre: "#bcb0d2", creux: "#bcb0d2" } as const;
  const nbLoin = W >= 50 ? 5 : 3;
  for (let i = 0; i < nbLoin; i++) {
    const x = Math.round(W * (0.3 + (0.4 * i) / (nbLoin - 1))) - 1;
    menhir(p, x, hz, u(2.4, 2), u(5 + ((i * 3 + (o.graine & 3)) % 3), 3), 0, PIERRE_LOIN);
  }
  // Le dolmen du fond, à l'opposé du soleil : deux pierres et leur table.
  if (k >= 0.6) {
    const ld = u(9, 6);
    const hd = u(8, 5);
    const xd = coteDuSoleil === 0 ? Math.round(W * 0.66) : Math.round(W * 0.34) - ld;
    const pied = Math.max(1, Math.round(ld / 4));
    menhir(p, xd, hz, pied, hd - 1, 0, PIERRE_LOIN);
    menhir(p, xd + ld - pied, hz, pied, hd - 1, 0, PIERRE_LOIN);
    p.rect(xd - 1, hz - hd - Math.max(1, Math.round(k)), ld + 2, Math.max(2, Math.round(k * 2)), PIERRE_LOIN.fond);
    p.rect(xd - 1, hz - hd - Math.max(1, Math.round(k)), ld + 2, 1, PIERRE_LOIN.clair);
  }
  // L'herbe du soir.
  degrade(p, hz, H - 1, "#b9d3a8", "#a5c698", 3);
  p.rect(0, hz, W, 1, "#cfe2bd");
  for (let i = 0; i < Math.round(W / 4); i++) {
    const x = Math.floor(h() * W);
    const y = hz + 2 + Math.floor(h() * Math.max(1, H - hz - 2));
    if (versLaChose(o, x, y, 0) > 0.8) p.poser(x, y, "#93b888");
  }
  // Les grands menhirs des bords, et un dolmen quand la place le permet.
  const nb = W >= 50 ? 2 : 1;
  for (const cote of [0, 1]) {
    for (let i = 0; i < nb; i++) {
      const l = u(6 + h() * 3, 3);
      const hgt = Math.round(H * (0.34 + h() * 0.2) * (i === 0 ? 1 : 0.7));
      const dx = Math.round(W * (0.02 + i * 0.15 + h() * 0.03));
      const x = cote === 0 ? dx : W - dx - l;
      const bas = Math.min(H - 1, hz + u(2 + (1 - i) * 3));
      menhir(p, x, bas, l, hgt, (h() - 0.5) * 0.12);
      // L'ombre et la touffe au pied.
      p.rect(x + 1, bas + 1, l + 1, 1, "#93b888");
      p.poser(x - 1, bas, "#cfe2bd");
      // Le ruban noué, de la couleur de la chose, sur la première pierre.
      if (i === 0 && k >= 0.6) {
        const yr = bas - Math.round(hgt * 0.45);
        p.rect(x, yr, l, Math.max(1, Math.round(k)), melanger(o.accent, "#ffffff", 0.25));
        p.poser(x, yr, eclaircir(o.accent, 0.6));
      }
    }
  }
  // La branche de gui, dans un coin du haut.
  if (k >= 0.6) {
    const long = Math.round(W * 0.26);
    for (let i = 0; i < long; i++) {
      const x = coteDuGui === 0 ? i : W - 1 - i;
      const y = Math.round(H * 0.05 + (i / long) ** 2 * H * 0.08);
      p.rect(x, y, 1, i < long * 0.5 ? 2 : 1, i % 5 === 0 ? "#a58a78" : "#b89c88");
    }
    const boules = k >= 1 ? 2 : 1;
    for (let i = 0; i < boules; i++) {
      const dx = Math.round(long * (0.35 + i * 0.5));
      const x = coteDuGui === 0 ? dx : W - 1 - dx;
      const r = u(3 - i, 2);
      const y = Math.round(H * 0.05 + (dx / long) ** 2 * H * 0.08) + r + 1;
      p.disque(x, y, r, (ddx, ddy) => (ddx + ddy < -1 ? "#b5dba0" : ddx + ddy > r * 0.8 ? "#7fb47c" : "#97c88c"));
      p.poser(x + 1, y + 1, "#fffdf0");
      if (r >= 3) p.poser(x - 2, y, "#fffdf0");
    }
  }
  // Des fleurs de la couleur de la chose, au pied des pierres.
  for (let i = 0; i < Math.round(3 + 2 * k); i++) {
    const x = h() < 0.5 ? Math.round(W * h() * 0.28) : Math.round(W * (1 - h() * 0.28));
    const y = hz + 2 + Math.floor(h() * Math.max(1, H - hz - 3));
    p.poser(x, y, melanger(o.accent, "#ffffff", 0.3));
    if (k >= 1) p.poser(x, y - 1, eclaircir(o.accent, 0.7));
  }
  halo(p, o, "#fdf1f0", 0.55);
  // Les lucioles, hors de la place de la chose.
  const lucioles = Math.round((3 + o.rang) * Math.max(1, k * 0.8));
  for (let i = 0; i < lucioles; i++) {
    const x = 1 + Math.floor(h() * (W - 2));
    const y = Math.round(H * (0.18 + h() * 0.7));
    if (!auLarge(o, x, y)) continue;
    if (k >= 1) lueur(p, x, y, 1 + (i % 2), "#fff6b8", 0.45);
    p.poser(x, y, "#fffbe0");
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// La forêt enchantée.
// ---------------------------------------------------------------------------------------------------------------------

/** Un champignon lumineux : un pied crème, un chapeau de la couleur de la chose, des points clairs, une lueur autour. */
function champignon(p: Planche, x: number, bas: number, r: number, chapeau: string): void {
  const pied = Math.max(1, Math.round(r * 0.6));
  const hp = Math.max(1, Math.round(r * 1.1));
  lueur(p, x, bas - hp, r + Math.max(2, r), "#fbffd8", 0.4);
  p.rect(x - Math.floor(pied / 2), bas - hp, pied, hp + 1, "#fbf6e2");
  if (pied > 1) p.rect(x - Math.floor(pied / 2) + pied - 1, bas - hp, 1, hp + 1, "#e0d8c0");
  const cy = bas - hp;
  for (let dy = -r; dy <= 0; dy++) {
    for (let dx = -r - 1; dx <= r + 1; dx++) {
      if ((dx * dx) / ((r + 1.3) * (r + 1.3)) + (dy * dy) / (r * r + 0.3) > 1) continue;
      let c = chapeau;
      if (dy === 0) c = melanger(chapeau, "#3a2a5a", 0.2);
      else if (dx + dy * 1.5 < -r * 0.9) c = eclaircir(chapeau, 0.4);
      p.poser(x + dx, cy + dy, c);
    }
  }
  if (r >= 2) {
    p.poser(x - 1, cy - r + 1, "#fffef0");
    p.poser(x + Math.max(1, r - 1), cy - 1, "#fffef0");
  }
  if (r >= 4) p.poser(x - r + 1, cy - 2, "#fffef0");
}

function peindreForetEnchantee(p: Planche, o: ParametresDuFond): void {
  const { W, H, k, hz, h, u } = mesurer(o);
  // La brume vert d'eau, plus claire vers le sol.
  degrade(p, 0, hz, "#cfeee6", "#effbf2", 4);
  // Les troncs du fond, à peine plus foncés que la brume.
  const pasLoin = u(9, 5);
  for (let x = entre(h, 0, pasLoin - 1); x < W; x += pasLoin + entre(h, 0, u(4))) {
    const l = u(2 + h() * 2, 1);
    p.rect(x, 0, l, hz, (_x, y) => (trame(_x, y, (y / hz) * 0.9) ? "#dcf3ea" : "#c2e4dc"));
  }
  // La mousse du sol.
  degrade(p, hz, H - 1, "#c4e8b8", "#aedba8", 3);
  p.rect(0, hz, W, 1, "#e0f6d0");
  // La brume qui traîne sur l'horizon.
  for (let y = hz - u(3); y < hz; y++) for (let x = 0; x < W; x++) if (trame(x + y, y, 0.5)) p.poser(x, y, "#f6fff8");
  // Les grands troncs lilas des bords, avec leur mousse.
  const tronc = { clair: "#d9d2f0", fond: "#bdb4e0", ombre: "#a297cf" };
  const nb = W >= 50 ? 2 : 1;
  for (const cote of [0, 1]) {
    for (let i = 0; i < nb; i++) {
      const l = u(i === 0 ? 7 + h() * 2 : 4 + h() * 2, 2);
      const dx = i === 0 ? -Math.round(l * 0.25 * h()) : Math.round(W * (0.14 + h() * 0.06));
      const x = cote === 0 ? dx : W - dx - l;
      const bas = Math.min(H - 1, hz + u(i === 0 ? 5 : 2));
      const ici = i === 0 ? tronc : { clair: "#e0daf3", fond: "#cbc3e8", ombre: "#b6acdc" };
      for (let j = 0; j < l; j++) {
        const part = j / Math.max(1, l - 1);
        p.rect(x + j, 0, 1, bas, part < 0.25 ? ici.clair : part > 0.7 ? ici.ombre : ici.fond);
      }
      // Les racines qui s'évasent, et la mousse.
      p.rect(x - 1, bas - u(2), l + 2, u(2) + 1, ici.fond);
      p.rect(x - 1, bas - u(2), 1, u(2) + 1, ici.clair);
      p.rect(x - 2, bas, l + 4, 1, ici.ombre);
      if (l >= 4) for (let y = Math.round(H * 0.2) + entre(h, 0, u(6)); y < bas - 3; y += u(9, 6)) p.rect(x + 1, y, Math.max(1, Math.round(l * 0.4)), 1, "#a8dcc0");
    }
  }
  // Le feuillage du haut, en festons.
  const feuillage = crete(W, Math.round(H * 0.2), Math.round(H * 0.14), h);
  for (let x = 0; x < W; x++) {
    const bord = Math.abs(x - W / 2) / (W / 2);
    const bas = Math.round((feuillage[x] ?? 0) * (0.35 + 0.65 * bord * bord)) + ((x >> 1) & 1);
    for (let y = 0; y <= bas; y++) p.poser(x, y, y >= bas - 1 ? "#8fd0b0" : trame(x, y, 0.3) ? "#b9e8cc" : "#a4dcc0");
  }
  // Les champignons lumineux, coiffés de la couleur de la chose.
  const chapeau = melanger(o.accent, "#ffffff", 0.3);
  const nbChamp = Math.min(6, Math.round(2 + k + o.rang * 0.4));
  for (let i = 0; i < nbChamp; i++) {
    const cote = i % 2;
    const dx = Math.round(W * (0.05 + h() * 0.24));
    const x = cote === 0 ? dx : W - 1 - dx;
    const r = u(1.6 + h() * 2.2, 1);
    const bas = Math.min(H - 2, hz + 2 + Math.floor(h() * Math.max(1, H - hz - 3)));
    if (versLaChose(o, x, bas - r, 0.02) < 1) continue;
    champignon(p, x, bas, r, i % 3 === 2 ? "#bfe6f2" : chapeau);
  }
  halo(p, o, "#f6fff6", 0.6);
  // Les lueurs qui flottent.
  const lueurs = Math.round((3 + o.rang) * Math.max(1, k * 0.8));
  for (let i = 0; i < lueurs; i++) {
    const x = 1 + Math.floor(h() * (W - 2));
    const y = Math.round(H * (0.22 + h() * 0.6));
    if (!auLarge(o, x, y)) continue;
    if (k >= 1) lueur(p, x, y, 1 + (i % 2), "#fdffd0", 0.5);
    p.poser(x, y, "#ffffff");
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// L'antre du dragon.
// ---------------------------------------------------------------------------------------------------------------------

const LAVE = { vif: "#fff0a0", clair: "#ffd45e", fond: "#ffab48", bord: "#f08a3c" } as const;
const ROCHE = { clair: "#f6d2ac", fond: "#e6b58a", ombre: "#d39a70", creux: "#bd8460" } as const;

function peindreAntreDuDragon(p: Planche, o: ParametresDuFond): void {
  const { W, H, k, hz, h, u } = mesurer(o);
  // La paroi du fond, pêche, éclairée par la lave.
  degrade(p, 0, hz, "#f7dcc0", "#fbe6c4", 3);
  // Des strates de roche, larges et douces.
  const strates = crete(W, Math.round(hz * 0.55), Math.round(H * 0.12), h);
  for (let x = 0; x < W; x++) {
    const y0 = strates[x] ?? 0;
    for (let y = y0; y < hz; y++) p.poser(x, y, y === y0 ? "#fdf0d8" : trame(x, y, 0.25) ? "#f5d8b4" : "#f8dfbc");
  }
  // Le sol de roche chaude.
  degrade(p, hz, H - 1, "#f0c8a0", "#e6b58a", 3);
  p.rect(0, hz, W, 1, "#fbe6c8");
  // Les piliers de roche des deux bords, et la coulée de lave qui descend sur chacun.
  const [coteDesOs, coteDeLOeuf] = cotes(h);
  for (const cote of [0, 1]) {
    const large = Math.round(W * (0.15 + h() * 0.06));
    const phase = h() * 6;
    const onde = 1.5 + h() * 1.5;
    const bord: number[] = [];
    for (let y = 0; y < H; y++) {
      const v = y / H;
      const l = Math.round(large * (0.75 + 0.3 * Math.sin(v * Math.PI * onde + phase) + 0.25 * (v - 0.5) * (v - 0.5) * 4));
      bord.push(l);
      for (let i = 0; i < l; i++) {
        const x = cote === 0 ? i : W - 1 - i;
        const versLeBord = i / Math.max(1, l - 1);
        let c: string = ROCHE.fond;
        if (versLeBord > 0.85) c = cote === 0 ? ROCHE.ombre : ROCHE.clair;
        else if (((y + Math.floor(i / 3) * 2) % u(6, 4)) === 0) c = ROCHE.ombre;
        else if (((y + Math.floor(i / 3) * 2) % u(6, 4)) === 1) c = ROCHE.clair;
        p.poser(x, y, c);
      }
    }
    // La coulée : un filet lumineux, bordé d'orange, qui serpente.
    const lc = u(2, 1);
    const ph = h() * 6;
    const depart = h() * 0.25;
    for (let y = 0; y < H; y++) {
      const l = bord[y] ?? large;
      const i0 = Math.max(1, Math.round(l * (0.35 + depart + 0.14 * Math.sin(y / u(5, 3) + ph))));
      for (let j = -1; j <= lc; j++) {
        const x = cote === 0 ? i0 + j : W - 1 - i0 - j;
        p.poser(x, y, j === -1 || j === lc ? LAVE.bord : j === 0 ? LAVE.vif : LAVE.clair);
      }
    }
  }
  // Les stalactites du haut.
  const pas = u(8, 5);
  for (let x = entre(h, 1, pas); x < W; x += pas + entre(h, 0, u(5))) {
    const bordure = Math.abs(x - W / 2) / (W / 2);
    const long = Math.round(H * (0.08 + 0.2 * bordure * bordure + h() * 0.08));
    const demi = Math.max(1, Math.round(long / 3));
    for (let dy = 0; dy < long; dy++) {
      const d = Math.round(demi * (1 - dy / long));
      for (let dx = -d; dx <= d; dx++) p.poser(x + dx, dy, dx === -d && d > 0 ? ROCHE.clair : dx === d && d > 0 ? ROCHE.ombre : ROCHE.fond);
    }
  }
  p.rect(0, 0, W, 1, ROCHE.ombre);
  // Le lac de lave, sur les bords du bas.
  const lac = crete(W, H - u(2), Math.round(H * 0.1), h);
  for (let x = 0; x < W; x++) {
    const bordure = Math.abs(x - W / 2) / (W / 2);
    const y0 = (lac[x] ?? H) + Math.round((1 - bordure) ** 1.5 * H * 0.45);
    for (let y = Math.max(hz + 2, y0); y < H; y++) {
      const d = y - Math.max(hz + 2, y0);
      p.poser(x, y, d === 0 ? LAVE.bord : d === 1 ? LAVE.fond : (x + y * 2) % 7 < 2 ? LAVE.vif : LAVE.clair);
    }
  }
  // Les os d'une vieille bête : des côtes en arceaux, un crâne.
  if (k >= 0.6) {
    const os = "#fffaea";
    const osOmbre = "#dccbb0";
    const cotesDOs = k >= 1 ? 3 : 2;
    const r = u(4, 3);
    const base = Math.min(H - 2, hz + u(4, 2));
    const x0 = coteDesOs === 0 ? Math.round(W * 0.2) : Math.round(W * 0.8) - cotesDOs * (r + 1);
    for (let i = 0; i < cotesDOs; i++) {
      const cx = x0 + i * (r + 1);
      for (let a = 0; a <= r * 2; a++) {
        const dx = a - r;
        const dy = Math.round(Math.sqrt(Math.max(0, r * r - dx * dx)) * 1.2);
        if (dx <= 0) p.poser(cx + dx, base - dy, dx === -r ? osOmbre : os);
      }
      p.rect(cx - r, base - Math.round(r * 0.6), 1, Math.round(r * 0.6) + 1, os);
    }
    p.rect(x0 - r, base + 1, cotesDOs * (r + 1) + r, 1, osOmbre);
  }
  // L'œuf du dragon, de la couleur de la chose, dans son nid de braises ; d'autres avec le rang.
  const oeufs = k < 0.6 ? 1 : 1 + (o.rang >= 4 ? 1 : 0) + (o.rang >= 6 ? 1 : 0);
  const coquille = melanger(o.accent, "#ffffff", 0.3);
  for (let i = 0; i < oeufs; i++) {
    const r = u(3 - i * 0.6, 1);
    const dx = Math.round(W * (0.22 + i * 0.07));
    const x = coteDeLOeuf === 0 ? dx : W - 1 - dx;
    const y = Math.min(H - r - 2, hz + u(3, 1) + i * u(2));
    p.rect(x - r - 1, y + r, r * 2 + 3, 1, ROCHE.creux);
    for (let dy = -r - 1; dy <= r; dy++) {
      for (let ddx = -r; ddx <= r; ddx++) {
        const ry = dy < 0 ? r + 1.3 : r + 0.2;
        if ((ddx * ddx) / (r * r + 0.4) + (dy * dy) / (ry * ry) > 1) continue;
        p.poser(x + ddx, y + dy, ddx + dy < -r * 0.7 ? eclaircir(coquille, 0.45) : ddx > r * 0.4 ? melanger(coquille, "#7a3a2a", 0.2) : coquille);
      }
    }
    if (r >= 2) p.poser(x + 1, y, eclaircir(coquille, 0.5));
  }
  halo(p, o, "#fff3da", 0.6);
  // Les braises qui montent, sur les côtés.
  const braises = Math.round((3 + o.rang) * Math.max(1, k * 0.8));
  for (let i = 0; i < braises; i++) {
    const x = 1 + Math.floor(h() * (W - 2));
    const y = Math.round(H * (0.15 + h() * 0.7));
    if (!auLarge(o, x, y)) continue;
    p.poser(x, y, i % 2 === 0 ? LAVE.fond : LAVE.clair);
    if (k >= 1.5) p.poser(x, y - 1, LAVE.vif);
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Le ciel des dieux.
// ---------------------------------------------------------------------------------------------------------------------

/** Un banc de nuages : des bosses rondes posées sur une ligne, blanches en haut, dorées dessous. */
function bancDeNuages(p: Planche, sommets: readonly number[], dessus: string, corps: string, dessous: string, epaisseur: number): void {
  for (let x = 0; x < p.largeur; x++) {
    const y0 = sommets[x] ?? p.hauteur;
    for (let y = Math.max(0, y0); y < p.hauteur; y++) {
      const d = y - y0;
      const part = d / Math.max(1, epaisseur);
      p.poser(x, y, d < 1 ? dessus : part < 0.7 ? corps : d < epaisseur * 0.7 + 2 ? (trame(x, y, 0.5) ? dessous : corps) : dessous);
    }
  }
}

/** La ligne du haut d'un banc de nuages : la plus haute des bosses, à chaque colonne. */
function bosses(W: number, H: number, h: () => number, base: (x: number) => number, rayon: number, nb: number): number[] {
  const ys = Array.from({ length: W }, (_, x) => Math.round(base(x)));
  for (let i = 0; i < nb; i++) {
    const cx = Math.round(((i + 0.2 + h() * 0.6) / nb) * W);
    const r = Math.max(2, Math.round(rayon * (0.7 + h() * 0.6)));
    const cy = base(cx) + Math.round(r * 0.3);
    for (let dx = -r; dx <= r; dx++) {
      const x = cx + dx;
      if (x < 0 || x >= W) continue;
      const y = Math.round(cy - Math.sqrt(r * r - dx * dx));
      if (y < (ys[x] ?? H)) ys[x] = y;
    }
  }
  return ys;
}

function peindreCielDesDieux(p: Planche, o: ParametresDuFond): void {
  const { W, H, k, hz, h, u } = mesurer(o);
  // Le ciel, bleu tendre en haut, doré vers les nuages.
  degrade(p, 0, H - 1, "#c4e2f8", "#fdf1cc", 5);
  // Le soleil, en haut, d'un côté, et ses rayons en éventail.
  const [coteDuSoleil] = cotes(h);
  const sx = coteDuSoleil === 0 ? Math.round(W * (0.14 + h() * 0.12)) : Math.round(W * (0.74 + h() * 0.12));
  const sy = Math.round(H * (0.04 + h() * 0.08));
  const secteurs = 9 + (o.rang >= 5 ? 3 : 0);
  const tour = h() * Math.PI;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const a = Math.atan2(y - sy, x - sx) + tour;
      const s = (((a / Math.PI) * secteurs) % 2 + 2) % 2;
      if (s < 0.8) teinter(p, x, y, "#fffbe2", 0.42);
    }
  }
  const rs = u(7, 4);
  p.disque(sx, sy, rs + u(2), "#fff6c4");
  p.disque(sx, sy, rs, "#fffdf0");
  p.disque(sx, sy, Math.max(1, rs - u(2)), "#ffffff");
  // Le temple au loin, sur son nuage, pour les choses les plus rares.
  const ombreDoree = melanger("#f3d596", melanger(o.accent, "#ffffff", 0.45), 0.35);
  if (o.rang >= 4 && k >= 0.6) {
    const lt = u(11, 7);
    const ht = u(7, 4);
    const x0 = coteDuSoleil === 0 ? Math.round(W * 0.78) - lt : Math.round(W * 0.22);
    const y0 = Math.round(hz * 0.72);
    p.rect(x0, y0 - ht, lt, ht, "#fdf6dc");
    for (let x = x0; x < x0 + lt; x += 2) p.rect(x, y0 - ht + 1, 1, ht - 1, "#ecd9a4");
    p.rect(x0 - 1, y0 - ht - 1, lt + 2, 1, OR.clair);
    for (let i = 0; i < Math.ceil(lt / 2); i++) p.rect(x0 + i, y0 - ht - 2 - Math.min(i, Math.max(1, Math.round(lt / 5))), lt - i * 2, 1, "#f6e2a6");
    p.rect(x0 - 1, y0, lt + 2, 1, "#ecd9a4");
    const nuee = bosses(W, H, h, (x) => (x >= x0 - u(5) && x <= x0 + lt + u(5) ? y0 + 1 : H), u(3, 2), 0);
    for (let x = x0 - u(4); x <= x0 + lt + u(4); x++) {
      const bord = Math.min(x - (x0 - u(4)), x0 + lt + u(4) - x);
      const e = Math.min(u(3, 2), bord + 1);
      p.rect(x, (nuee[x] ?? y0 + 1) - (bord > 1 ? 1 : 0), 1, e, "#ffffff");
      p.poser(x, (nuee[x] ?? y0 + 1) - (bord > 1 ? 1 : 0) + e, ombreDoree);
    }
  }
  // Les petits nuages du haut, sur les bords.
  for (const cote of [0, 1]) {
    if (k < 0.6 && cote === coteDuSoleil) continue;
    const l = u(12 + h() * 6, 6);
    const dx = Math.round(W * (0.02 + h() * 0.1));
    const x = cote === 0 ? dx : W - dx - l;
    const y = Math.round(H * (cote === coteDuSoleil ? 0.36 + h() * 0.08 : 0.16 + h() * 0.1));
    const r = Math.max(1, Math.round(l / 5));
    p.rect(x, y, l, r + 1, "#ffffff");
    p.disque(x + r, y, r, "#ffffff");
    p.disque(x + Math.round(l / 2), y - Math.round(r * 0.6), r + 1, "#ffffff");
    p.disque(x + l - r - 1, y, r, "#ffffff");
    p.rect(x + 1, y + r, l - 2, 1, ombreDoree);
  }
  // Les bancs de nuages : un au fond qui monte sur les bords, un devant, sous les pieds de la chose.
  const fond = bosses(W, H, h, (x) => hz - H * 0.02 - ((Math.abs(x - W / 2) / (W / 2)) ** 2) * H * 0.2, u(6, 3), W >= 50 ? 7 : 4);
  bancDeNuages(p, fond, "#ffffff", "#fff8e6", ombreDoree, u(7, 3));
  const devant = bosses(W, H, h, (x) => hz + (H - hz) * 0.45 - ((Math.abs(x - W / 2) / (W / 2)) ** 2) * H * 0.1, u(5, 2), W >= 50 ? 6 : 4);
  bancDeNuages(p, devant, "#ffffff", "#fffaf0", melanger(ombreDoree, "#ffffff", 0.3), u(7, 3));
  halo(p, o, "#fffdf2", 0.6);
  // Des poussières d'or dans la lumière.
  const poussieres = Math.round((2 + o.rang) * Math.max(1, k * 0.8));
  for (let i = 0; i < poussieres; i++) {
    const x = 1 + Math.floor(h() * (W - 2));
    const y = Math.round(H * (0.12 + h() * 0.5));
    if (!auLarge(o, x, y)) continue;
    p.poser(x, y, i % 2 === 0 ? OR.clair : "#ffffff");
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// La nuit étoilée.
// ---------------------------------------------------------------------------------------------------------------------

function peindreNuitEtoilee(p: Planche, o: ParametresDuFond): void {
  const { W, H, k, hz, h, u } = mesurer(o);
  // Le ciel d'une nuit claire de pleine lune : bleu-mauve pâle, presque rose à l'horizon.
  degrade(p, 0, hz, "#b7b9ea", "#e6dcf6", 5);
  // La lune, grande et pâle, d'un côté, dans son halo.
  const [coteDeLaLune, coteDuSapin] = cotes(h);
  const rl = u(7, 4);
  const lx = coteDeLaLune === 0 ? Math.round(W * (0.16 + h() * 0.08)) : Math.round(W * (0.76 + h() * 0.08));
  const ly = Math.round(H * (0.2 + h() * 0.08));
  lueur(p, lx, ly, rl + u(5, 3), "#f4f0ff", 0.5);
  lueur(p, lx, ly, rl + u(2, 1), "#fbf8ff", 0.6);
  p.disque(lx, ly, rl, (dx, dy) => (dx + dy > rl * 0.9 ? "#ebe6cf" : "#fffdee"));
  if (rl >= 5) {
    p.disque(lx - Math.round(rl * 0.3), ly + Math.round(rl * 0.25), Math.max(1, Math.round(rl * 0.22)), "#eee8d2");
    p.poser(lx + Math.round(rl * 0.3), ly - Math.round(rl * 0.35), "#eee8d2");
    p.poser(lx + Math.round(rl * 0.1), ly + Math.round(rl * 0.5), "#eee8d2");
  }
  // Les étoiles, plus nombreuses avec le rang, jamais derrière la chose.
  const etoiles = Math.round(((W * hz) / 110) * (0.8 + o.rang * 0.08));
  for (let i = 0; i < etoiles; i++) {
    const x = 1 + Math.floor(h() * (W - 2));
    const y = 1 + Math.floor(h() * Math.max(1, hz - Math.round(H * 0.12)));
    const grande = i % 5 === 0;
    if (!auLarge(o, x, y) || Math.hypot(x - lx, y - ly) < rl + u(3, 2)) continue;
    eclat(p, x, y, "#ffffff", "#dcdcfa", grande && k >= 0.9);
    if (!grande && i % 3 === 0) p.poser(x, y, "#fff6cc");
  }
  // L'étoile filante, de la couleur de la chose.
  if (k >= 0.6) {
    const long = u(8, 5);
    const fx = coteDeLaLune === 0 ? Math.round(W * (0.7 + h() * 0.12)) : Math.round(W * (0.14 + h() * 0.12));
    const fy = Math.round(H * (0.08 + h() * 0.08));
    const trainee = melanger(o.accent, "#ffffff", 0.45);
    for (let i = 0; i < long; i++) p.poser(fx + i, fy + long - 1 - Math.round(i * 0.6) - Math.round(long * 0.4), i > long * 0.6 ? eclaircir(trainee, 0.5) : trame(i, 0, 0.5) || i > long * 0.3 ? trainee : eclaircir(trainee, 0.3));
    eclat(p, fx + long, fy + long - 1 - Math.round(long * 0.6) - Math.round(long * 0.4), "#ffffff", "#fff6cc", k >= 1);
  }
  // Les collines au loin, puis la colline où la chose se tient.
  const loin = crete(W, hz, Math.round(H * 0.12), h);
  for (let x = 0; x < W; x++) for (let y = loin[x] ?? hz; y <= hz; y++) p.poser(x, y, y === (loin[x] ?? hz) ? "#c6c6ec" : trame(x, y, 0.25) ? "#b4b6e2" : "#babbe6");
  const colline: number[] = [];
  for (let x = 0; x < W; x++) colline.push(hz + Math.round(((Math.abs(x - W / 2) / (W / 2)) ** 2) * (H - hz) * 0.25));
  for (let x = 0; x < W; x++) {
    const y0 = colline[x] ?? hz;
    for (let y = y0; y < H; y++) {
      const d = (y - y0) / Math.max(1, H - y0);
      p.poser(x, y, y === y0 ? "#d9def6" : d > 0.55 ? "#a9b5e0" : d > 0.45 && trame(x, y, 0.5) ? "#a9b5e0" : "#b4bfe6");
    }
  }
  // Les sapins d'un bord, en ombres bleues.
  const sapins = W >= 50 ? 3 : 2;
  for (let i = 0; i < sapins; i++) {
    const hgt = Math.round(H * (0.3 - i * 0.07 + h() * 0.06));
    const dx = Math.round(W * (0.05 + i * 0.09 + h() * 0.02));
    const x = coteDuSapin === 0 ? dx : W - 1 - dx;
    const bas = (colline[Math.max(0, Math.min(W - 1, x))] ?? hz) + 1;
    const demi = Math.max(2, Math.round(hgt * 0.3));
    const etages = Math.max(2, Math.min(4, Math.round(hgt / u(5, 3))));
    for (let dy = 0; dy < hgt; dy++) {
      const etage = Math.min(etages - 1, Math.floor((dy / hgt) * etages));
      const dansEtage = (dy - (etage * hgt) / etages) / (hgt / etages);
      const d = dy === 0 ? 0 : Math.max(dy < 2 ? 0 : 1, Math.round(((demi * (etage + 1)) / etages) * (0.3 + 0.7 * dansEtage)));
      for (let ddx = -d; ddx <= d; ddx++) p.poser(x + ddx, bas - hgt + dy, ddx < 0 ? "#a8b2de" : "#939fd2");
    }
    p.poser(x, bas, "#8792c6");
  }
  // Des fleurs de nuit, de la couleur de la chose, sur la colline.
  for (let i = 0; i < Math.round(3 + 2 * k); i++) {
    const x = h() < 0.5 ? Math.round(W * h() * 0.3) : Math.round(W * (1 - h() * 0.3));
    const y0 = colline[Math.max(0, Math.min(W - 1, x))] ?? hz;
    const y = y0 + 2 + Math.floor(h() * Math.max(1, H - y0 - 3));
    p.poser(x, y, melanger(o.accent, "#ffffff", 0.4));
    if (k >= 1) p.poser(x, y - 1, "#ffffff");
  }
  halo(p, o, "#f4f1ff", 0.5);
}

// ---------------------------------------------------------------------------------------------------------------------
// Le lot.
// ---------------------------------------------------------------------------------------------------------------------

export const SCENES_E: readonly SceneDeFond[] = [
  { id: "salle-du-tresor", nom: "La salle du trésor", peindre: peindreSalleDuTresor },
  { id: "palais", nom: "Le palais", peindre: peindrePalais },
  { id: "cercle-de-pierres", nom: "Le cercle de pierres", peindre: peindreCercleDePierres },
  { id: "foret-enchantee", nom: "La forêt enchantée", peindre: peindreForetEnchantee },
  { id: "antre-du-dragon", nom: "L'antre du dragon", peindre: peindreAntreDuDragon },
  { id: "ciel-des-dieux", nom: "Le ciel des dieux", peindre: peindreCielDesDieux },
  { id: "nuit-etoilee", nom: "La nuit étoilée", peindre: peindreNuitEtoilee },
];
