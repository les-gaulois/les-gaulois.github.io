/**
 * Bannières, lot C, « Les cartes du monde » : voir `commun.ts`. Le monde d'une partie de conquête, à notre façon : des
 * continents inventés vus du ciel, leurs territoires et leurs villes, et les paysages de leurs biomes (dunes, glaces,
 * delta, montagnes). Aucun pays réel, aucune image ni interface d'un jeu. Dessins originaux de Claude Fable 5.2 pour le
 * clan [GAL], 15 novembre 2026.
 */
import { HAUTEUR, LARGEUR, Toile, grain, melanger, type BanniereDuLot, type Decor } from "./commun.ts";

// ── Outils du lot ──────────────────────────────────────────────────────────────────────────────────────────────────

const borne = (v: number, a = 0, b = 1): number => Math.min(b, Math.max(a, v));
const lisse = (t: number): number => t * t * (3 - 2 * t);

/** Un tirage fixe de 0 à 1 pour une case entière et une graine. */
function hasard(x: number, y: number, g = 0): number {
  let h = grain(x + g * 57, y + g * 113);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  h = Math.imul(h, 0x297a2d39);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

/** Un bruit doux (valeurs interpolées), de 0 à 1. */
function bruit(x: number, y: number, g = 0): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const fx = lisse(x - xi);
  const fy = lisse(y - yi);
  const a = hasard(xi, yi, g);
  const b = hasard(xi + 1, yi, g);
  const c = hasard(xi, yi + 1, g);
  const d = hasard(xi + 1, yi + 1, g);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}

/** Un relief : plusieurs octaves de bruit, de 0 à 1. */
function relief(x: number, y: number, g = 0, octaves = 4): number {
  let somme = 0;
  let poids = 0;
  let ampli = 0.5;
  let f = 1;
  for (let i = 0; i < octaves; i++) {
    somme += bruit(x * f, y * f, g + i * 7) * ampli;
    poids += ampli;
    ampli /= 2;
    f *= 2;
  }
  return somme / poids;
}

/** La couleur d'une rampe pour `t` de 0 à 1 : des bandes nettes. */
const rampe = (couleurs: readonly string[], t: number): string =>
  couleurs[Math.min(couleurs.length - 1, Math.max(0, Math.floor(t * couleurs.length)))] ?? "#000000";

const sombre = (c: string, part: number): string => melanger(c, "#000000", part);
const clair = (c: string, part: number): string => melanger(c, "#ffffff", part);

/** Des bandes horizontales de `y0` à `y1` (exclu), avec une rangée tramée à chaque passage. */
function bandes(t: Toile, y0: number, y1: number, couleurs: readonly string[], x0 = 0, x1 = LARGEUR): void {
  const n = couleurs.length;
  const rang = (y: number) => Math.min(n - 1, Math.floor(((y - y0) / (y1 - y0)) * n));
  for (let y = y0; y < y1; y++) {
    const i = rang(y);
    const suivant = y + 1 < y1 ? rang(y + 1) : i;
    for (let x = x0; x < x1; x++) {
      const trame = suivant !== i && (x + y) % 2 === 0;
      t.poser(x, y, couleurs[trame ? suivant : i] ?? "#000000");
    }
  }
}

function ellipse(t: Toile, cx: number, cy: number, rx: number, ry: number, couleur: string): void {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) t.poser(x, y, couleur);
    }
  }
}
const disque = (t: Toile, cx: number, cy: number, r: number, couleur: string): void => ellipse(t, cx, cy, r, r, couleur);

function ligne(t: Toile, x0: number, y0: number, x1: number, y1: number, couleur: string): void {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
  for (let i = 0; i <= n; i++) t.poser(Math.round(x0 + ((x1 - x0) * i) / n), Math.round(y0 + ((y1 - y0) * i) / n), couleur);
}

/** Teinte une case déjà peinte. */
function teinter(t: Toile, x: number, y: number, couleur: string, part: number): void {
  const c = t.lire(x, y);
  if (c) t.poser(x, y, melanger(c, couleur, part));
}

// ── 1. Dunes et oasis (commun) ─────────────────────────────────────────────────────────────────────────────────────

function palmier(t: Toile, x: number, y: number, h: number, penche: number): void {
  const tronc = "#7a5330";
  for (let i = 0; i <= h; i++) t.poser(x + Math.round(penche * (i / h) ** 2), y - i, i % 3 === 2 ? "#8f6a40" : tronc);
  const sx = x + penche;
  const sy = y - h;
  const fonce = "#2c6e45";
  const vif = "#58a55a";
  const palmes: readonly (readonly [number, number])[][] = [
    [[-1, -1], [-2, -2], [-3, -2], [-4, -1], [-5, 0], [-5, 1]],
    [[1, -1], [2, -2], [3, -2], [4, -1], [5, 0], [5, 1]],
    [[-1, 0], [-2, 0], [-3, 1], [-4, 2]],
    [[1, 0], [2, 0], [3, 1], [4, 2]],
    [[0, -1], [0, -2], [-1, -3], [1, -3]],
  ];
  palmes.forEach((p, k) => p.forEach(([dx, dy]) => t.poser(sx + dx, sy + dy, k < 2 || k === 4 ? vif : fonce)));
  t.poser(sx, sy, fonce);
}

function dunesEtOasis(): Decor {
  const t = new Toile("#f6e6b4");
  bandes(t, 0, 40, ["#6db4c2", "#7dbfc6", "#91cac9", "#a9d5ca", "#c4dfc8", "#dde6c2", "#f0e8bb", "#f8e6b0"]);
  // Le soleil pâle, à droite, et son halo.
  disque(t, 103, 13, 9, "#f6ecc4");
  disque(t, 103, 13, 6, "#fffbe6");
  // Un plateau de roche au loin, à gauche sous le coin calme.
  for (let x = 0; x < 44; x++) {
    const h = x < 6 ? 5 : x < 20 ? 7 : x < 23 ? 5 : x < 34 ? 4 : 2;
    for (let y = 40 - h; y < 40; y++) t.poser(x, y, y === 40 - h ? "#ecc49a" : y % 3 === 0 ? "#c9977a" : "#d8a986");
  }
  for (const [x, y] of [[82, 24], [88, 21], [78, 28]] as const) t.grille(x, y, ["o.o", ".o."], { o: "#5c8c96" });
  // Deux voiles de nuage devant le soleil, et la clarté chaude de l'horizon.
  for (const [cx, cy, l] of [[96, 17, 10], [112, 10, 7]] as const) for (let x = cx - l; x <= cx + l; x++) t.poser(x, cy + (Math.abs(x - cx) > l * 0.6 ? 0 : x % 2), "#fdf3d2");
  for (let x = 60; x < LARGEUR; x++) for (let y = 36; y < 40; y++) if ((x + y) % 2 === 0 || y > 37) teinter(t, x, y, "#ffe9a8", 0.5 * borne((x - 60) / 30));
  // Quatre rangs de dunes : le versant tourné vers le soleil est clair, l'autre dans l'ombre, la crête file en biais.
  const rangs = [
    { base: 41, ampli: 2.5, pas: 15, phase: 0.6, clair: "#f3d39a", ombre: "#e2b585", crete: "#fbe6b8" },
    { base: 47, ampli: 4, pas: 21, phase: 2.2, clair: "#f4c880", ombre: "#d69c66", crete: "#fde0a4" },
    { base: 55, ampli: 5.5, pas: 29, phase: 4.4, clair: "#f5bb64", ombre: "#c6824c", crete: "#ffd98c" },
    { base: 67, ampli: 2.2, pas: 43, phase: 1.2, clair: "#f6c56e", ombre: "#b8713f", crete: "#ffe09a" },
  ];
  rangs.forEach((r, k) => {
    for (let x = 0; x < LARGEUR; x++) {
      const haut = Math.round(r.base + r.ampli * Math.sin(x / r.pas + r.phase) + r.ampli * 0.3 * Math.sin(x / (r.pas * 0.37) + k));
      for (let y = haut; y < HAUTEUR; y++) {
        const eclaire = Math.cos((x + 1.6 * (y - haut)) / r.pas + r.phase) < 0.15;
        let c = eclaire ? r.clair : r.ombre;
        if (y === haut) c = r.crete;
        else if (eclaire && y - haut > 9) c = melanger(r.clair, r.ombre, 0.28);
        t.poser(x, y, c);
      }
    }
    if (k === 1) {
      // Une caravane de marchands sur la crête, à gauche : trois chameaux chargés et leurs ombres longues.
      [[7, "#c0503f"], [17, "#2c4a8c"], [27, "#e8d8a8"]].forEach(([x0, charge]) => {
        const xc = Number(x0);
        const pied = Math.round(r.base + r.ampli * Math.sin((xc + 4) / r.pas + r.phase) + r.ampli * 0.3 * Math.sin((xc + 4) / (r.pas * 0.37) + k));
        for (let i = 0; i < 9; i++) teinter(t, xc - 3 - i, pied + 1 + (i > 4 ? 1 : 0), "#8c4f2a", 0.4);
        t.grille(xc, pied - 5, ["...cc....", "..bccb.bb", ".bbbbbbb.", ".bbbbbb..", ".b....b..", ".b....b.."], { b: "#7a4a30", c: String(charge) });
      });
    }
    if (k === 2) {
      // L'oasis, au creux du troisième rang : herbe, eau, palmiers.
      ellipse(t, 104, 60.5, 14, 2.6, "#5f9a4c");
      ellipse(t, 104, 60, 12, 1.6, "#7db45a");
      ellipse(t, 103, 60.6, 9, 1.3, "#2f9aa0");
      ellipse(t, 102, 60.2, 6, 0.6, "#8fdccd");
      palmier(t, 93, 59, 13, 2);
      palmier(t, 98, 59, 9, -2);
      palmier(t, 113, 59, 15, -3);
      palmier(t, 117, 60, 8, 2);
      for (const x of [90, 96, 108, 111, 116]) t.poser(x, 59, "#2c6e45");
      for (const x of [99, 101, 104]) t.poser(x, 60, "#ffffff");
    }
  });
  // Les rides du sable, devant.
  for (let y = 71; y < HAUTEUR; y += 2) {
    for (let x = 0; x < LARGEUR; x++) {
      const onde = Math.sin(x / 5 + y * 1.3) + Math.sin(x / 11 + y);
      if (onde > 1.1) teinter(t, x, y + (x % 9 < 4 ? 0 : 1), "#8c4f2a", 0.28);
      else if (onde < -1.4) teinter(t, x, y, "#fff0c0", 0.3);
    }
  }
  // Des touffes d'herbe sèche et deux pierres, de part et d'autre.
  for (const [x, y] of [[9, 71], [27, 75], [33, 70], [96, 72], [108, 76], [117, 70]] as const) {
    t.grille(x, y - 3, ["h...h", ".h.h.", "hhvhh", ".vvv."], { h: "#b89a4a", v: "#7c7a3c" });
    for (let i = 1; i < 6; i++) teinter(t, x - i, y + 1, "#8c4f2a", 0.3);
  }
  for (const [x, y, l] of [[18, 77, 3], [103, 74, 2]] as const) {
    ellipse(t, x, y, l, 1.2, "#a8683c");
    for (let i = -l + 1; i < l; i++) t.poser(x + i, y - 1, "#e8b078");
  }
  return t.decor("#9a5d34");
}

// ── 2. Banquise (commun) ───────────────────────────────────────────────────────────────────────────────────────────

/** Un iceberg à facettes : `profil` donne ses sommets (x, hauteur) ; la lumière vient de la gauche. */
function iceberg(t: Toile, base: number, profil: readonly (readonly [number, number])[], tons: { clair: string; moyen: string; ombre: string; pied: string }): void {
  for (let k = 0; k + 1 < profil.length; k++) {
    const [xa, ha] = profil[k] ?? [0, 0];
    const [xb, hb] = profil[k + 1] ?? [0, 0];
    for (let x = xa; x < xb; x++) {
      const h = Math.round(ha + ((hb - ha) * (x - xa)) / (xb - xa));
      const pente = (hb - ha) / (xb - xa);
      const face = pente > 0.25 ? tons.clair : pente < -0.25 ? tons.ombre : tons.moyen;
      for (let y = base - h; y <= base; y++) {
        let c = face;
        if (y === base - h && pente >= -0.25) c = "#ffffff";
        else if (y >= base - 1) c = tons.pied;
        else if (x === xa && k > 0 && (y - base + h) % 5 < 3) c = melanger(face, tons.ombre, 0.5);
        t.poser(x, y, c);
      }
    }
  }
}

function banquise(): Decor {
  const t = new Toile("#34609a");
  bandes(t, 0, 37, ["#a3b3da", "#afbddf", "#bcc8e4", "#cad3e8", "#d9dcea", "#e8e2e8", "#f4e5e2", "#fbe8dc"]);
  // Le soleil bas du grand Nord, à gauche sous le coin calme, et son halo.
  disque(t, 34, 31, 8, "#fbeede");
  disque(t, 34, 31, 5.5, "#fff6e6");
  disque(t, 34, 31, 3.4, "#ffffff");
  // La barrière de glace, tout au fond.
  for (let x = 0; x < LARGEUR; x++) {
    const h = 2 + Math.round(1.6 * bruit(x / 6, 3, 21) + (x > 70 ? 1.5 : 0));
    for (let y = 37 - h; y < 37; y++) t.poser(x, y, y === 37 - h ? "#f6f9ff" : (x >> 2) % 3 === 0 ? "#b5cbe8" : "#cddcf0");
  }
  // La mer, de plus en plus sombre vers nous.
  bandes(t, 37, HAUTEUR, ["#6f97c6", "#5f89bc", "#507bb1", "#446fa6", "#3a659c", "#325b92", "#2c5388"]);
  // Le chemin de lumière du soleil sur l'eau.
  for (let y = 38; y < 66; y++) {
    const demi = 2 + (y - 38) * 0.22;
    for (let x = Math.round(34 - demi); x <= 34 + demi; x++) if (hasard(x >> 1, y, 22) > 0.45 && y % 2 === 0) t.poser(x, y, y < 46 ? "#fff3e0" : "#dcebfa");
  }
  const tons = { clair: "#f4f9ff", moyen: "#cfe0f4", ombre: "#8fb4dc", pied: "#5f8fc4" };
  // Le grand iceberg, à droite, et son petit frère à gauche.
  iceberg(t, 50, [[86, 6], [90, 15], [94, 13], [98, 27], [102, 32], [105, 24], [109, 26], [113, 14], [117, 10], [121, 3]], tons);
  iceberg(t, 47, [[5, 2], [9, 9], [14, 16], [18, 10], [23, 12], [27, 5], [31, 2]], { clair: "#eef5fd", moyen: "#bdd3ee", ombre: "#7fa6d4", pied: "#5f8fc4" });
  // Leurs reflets.
  for (const [x0, x1, y0] of [[87, 120, 51], [6, 30, 48]] as const) {
    for (let y = y0; y < y0 + 6; y++) for (let x = x0 + (y - y0) * 2; x < x1 - (y - y0) * 2; x++) if (y === y0 || ((y - y0) % 2 === 0 && (x + y * 3) % 7 < 5)) teinter(t, x, y, "#cfe0f4", y === y0 ? 0.55 : 0.32);
  }
  // Les plaques de glace à la dérive, plus grandes vers nous.
  const plaques: readonly (readonly [number, number, number])[] = [
    [40, 41, 5], [62, 40, 4], [74, 43, 6], [50, 45, 3], [33, 50, 8], [70, 52, 9], [14, 55, 7], [52, 57, 6], [106, 58, 10], [88, 62, 5], [26, 61, 6],
  ];
  for (const [cx, cy, rx] of plaques) {
    const ry = Math.max(0.8, rx / 5);
    ellipse(t, cx, cy + 1, rx, ry, "#86acd6");
    ellipse(t, cx, cy, rx, ry, "#eef5fd");
    if (rx > 5) ellipse(t, cx - 1, cy - 0.3, rx - 3, ry - 0.7, "#ffffff");
  }
  // Trois manchots sur la grande plaque, à droite.
  for (const [x, y, tourne] of [[99, 52, false], [104, 53, true], [111, 52, true]] as const) {
    t.grille(x, y, tourne ? [".kk.", "okwk", ".wwk", ".wwk", ".o.o"] : [".kk.", "kwko", "kww.", "kww.", "o.o."], { k: "#1c2440", w: "#ffffff", o: "#f09a3c" });
    for (let i = 0; i < 4; i++) teinter(t, x + 3 + i, y + 5, "#86acd6", 0.6);
  }
  // La banquise où il se tient : un bord découpé, une tranche bleue, des congères et des fissures.
  const bord = (x: number): number => 67 + Math.round(1.4 * Math.sin(x / 9) + 1.2 * bruit(x / 4, 9, 5) - (x > 20 && x < 104 ? 1 : 0));
  for (let x = 0; x < LARGEUR; x++) {
    const haut = bord(x);
    for (let y = haut; y < HAUTEUR; y++) {
      const p = y - haut;
      const vague = bruit(x / 13, y / 4, 8);
      let c = p === 0 ? "#ffffff" : vague > 0.62 ? "#dbe8f7" : vague < 0.3 ? "#f8fbff" : "#ecf3fc";
      if (y > 75 && vague > 0.5) c = "#c9dcf2";
      t.poser(x, y, c);
    }
    t.poser(x, haut - 1, "#7fa6d2");
  }
  // L'eau entre deux plaques, en bas à gauche, et les fissures.
  for (let y = 70; y < HAUTEUR; y++) {
    const milieu = 10 + (y - 70) * 0.9 + 2 * Math.sin(y / 2);
    const demi = 1 + (y - 70) * 0.35;
    for (let x = Math.round(milieu - demi); x <= Math.round(milieu + demi); x++) t.poser(x, y, x === Math.round(milieu - demi) ? "#7fa6d2" : "#2f578c");
  }
  const fissures: readonly (readonly [number, number, number])[] = [[30, 72, 9], [88, 71, 11], [100, 76, 8], [42, 77, 6], [112, 73, 5]];
  for (const [x0, y0, n] of fissures) {
    let y = y0;
    for (let i = 0; i < n; i++) {
      if (hasard(x0 + i, y0, 3) > 0.6) y += hasard(i, x0, 4) > 0.5 ? 1 : -1;
      t.poser(x0 + i, y, "#a9c6e6");
    }
  }
  // Des congères qui accrochent le soleil, et quelques paillettes de givre.
  for (const [x, y, l] of [[20, 74, 7], [58, 77, 9], [96, 74, 6], [114, 78, 6]] as const) {
    for (let i = -l; i <= l; i++) {
      t.poser(x + i, y - Math.round(1.5 * Math.sqrt(1 - (i / l) ** 2)), "#ffffff");
      if (i > -l + 2) t.poser(x + i + 2, y + 1, "#c3d7ee");
    }
  }
  for (let i = 0; i < 18; i++) t.poser(3 + Math.floor(hasard(i, 1, 23) * 118), 70 + Math.floor(hasard(i, 2, 23) * 9), i % 2 === 0 ? "#ffffff" : "#a9c6e6");
  return t.decor("#b4cbe6");
}

// ── 3. Le delta verdoyant (peu commun) ─────────────────────────────────────────────────────────────────────────────

function deltaVerdoyant(): Decor {
  const t = new Toile("#6fae58");
  const horizon = 25;
  bandes(t, 0, horizon, ["#7fbfe4", "#8ec8e8", "#a0d1ea", "#b5dbec", "#cbe6ee", "#e0efea", "#f1f5e0"]);
  // Deux nuages plats, à droite du coin calme.
  for (const [cx, cy, l] of [[70, 8, 11], [96, 13, 8], [58, 15, 5]] as const) {
    ellipse(t, cx, cy, l, 1.6, "#ffffff");
    ellipse(t, cx - l / 3, cy - 1.5, l / 2.2, 1.6, "#ffffff");
    ellipse(t, cx + l / 4, cy - 1, l / 3, 1.3, "#ffffff");
    for (let x = Math.round(cx - l + 2); x < cx + l - 2; x++) t.poser(x, cy + 2, "#d5e6f0");
  }
  // La mer qui brille au bout du delta, et deux lignes de collines bleues.
  for (let x = 0; x < LARGEUR; x++) {
    t.poser(x, horizon - 2, "#dff2f0");
    t.poser(x, horizon - 1, (x + 1) % 5 < 2 ? "#ffffff" : "#c9e9ea");
    t.poser(x, horizon, "#a9d9dc");
    const g = Math.round(4 * bruit(x / 9, 1, 31) * borne((38 - x) / 20));
    const d = Math.round(5 * bruit(x / 8, 2, 32) * borne((x - 84) / 16));
    for (let y = horizon - Math.max(g, d); y <= horizon; y++) t.poser(x, y, y === horizon - Math.max(g, d) ? "#9bbfc9" : "#86adbc");
  }
  // La plaine vue de haut : le fleuve part d'en bas à gauche, s'éloigne et se partage en bras jusqu'à la mer.
  const verts = ["#cfe4b4", "#b4d69a", "#98c67e", "#7db765", "#65a852", "#529a47"];
  for (let y = horizon + 1; y < 66; y++) {
    const z = 44 / (y - horizon);
    const loin = borne((z - 1) / 12);
    for (let x = 0; x < LARGEUR; x++) {
      const wx = ((x - 62) * z) / 30;
      // Les champs : un damier de teintes, de plus en plus serré au loin.
      const champ = hasard(Math.floor(wx * 0.9 + 40), Math.floor(z * 0.9), 41);
      let c = rampe(verts, 1 - loin * 0.999);
      if (champ > 0.72) c = melanger(c, "#d9d27a", 0.3 * (1 - loin * 0.6));
      else if (champ < 0.22) c = melanger(c, "#2f7a4a", 0.3 * (1 - loin * 0.6));
      t.poser(x, y, c);
    }
  }
  // Les bosquets : des taches rondes, plus petites au loin.
  for (let i = 0; i < 70; i++) {
    const y = 30 + Math.floor(hasard(i, 5, 43) ** 1.6 * 34);
    const x = Math.floor(hasard(i, 6, 43) * LARGEUR);
    const r = (y - 26) / 14;
    ellipse(t, x, y, 1 + r * 1.6, 0.5 + r * 0.8, y < 38 ? "#5f9a5c" : "#34784a");
    if (r > 1.2) ellipse(t, x - 1, y - 1, r, r * 0.4, "#4f9a52");
  }
  // Le fleuve : un tronc en bas à gauche, puis cinq bras en éventail qui serpentent jusqu'à la mer.
  const eau = (x: number, y: number, e: number, demi: number, s: number): void => {
    if (e <= demi) t.poser(x, y, s > 0.72 ? "#e4f4f0" : e < demi * 0.5 ? "#c8eef4" : "#8fd0e4");
    else if (e <= demi + 1 && s < 0.6) t.poser(x, y, "#dbe6a4");
  };
  for (let y = 65; y > horizon; y--) {
    if (y >= 57) {
      const cx = 31 - (y - 57) * 2.1 + 1.5 * Math.sin(y / 2.5);
      const demi = 5 + (y - 57) * 0.5;
      for (let x = Math.floor(cx - demi - 1); x <= Math.ceil(cx + demi + 1); x++) eau(x, y, Math.abs(x - cx), demi, 0);
      continue;
    }
    const s = (57 - y) / (57 - horizon);
    [4, 30, 52, 86, 116].forEach((fin, k) => {
      const cx = 31 + (fin - 31) * (0.25 * s + 0.75 * s * s) + (k === 2 ? 0 : 1) * 5 * (1 - s) * Math.sin(s * 8 + k * 2.1) + (k > 2 ? 12 * Math.sin(s * 3.14) : 0);
      const demi = 0.7 + 3.4 * (1 - s) ** 1.7 * (k === 3 ? 1.25 : 1);
      for (let x = Math.floor(cx - demi - 1); x <= Math.ceil(cx + demi + 1); x++) eau(x, y, Math.abs(x - cx), demi, s);
    });
  }
  // Un village au bord d'un bras, à droite : quelques toits et leurs fumées.
  for (const [x, y] of [[91, 43], [94, 44], [97, 43], [100, 45], [93, 46]] as const) {
    t.poser(x, y, "#c8553f");
    t.poser(x + 1, y, "#e07050");
    t.poser(x, y + 1, "#f2e6c8");
    t.poser(x + 1, y + 1, "#d8c8a4");
  }
  // Une barque sur le fleuve, à gauche.
  t.grille(15, 59, ["..w..", ".ww..", ".ww..", "bbbbb", ".bbb."], { w: "#fff8e8", b: "#6b4630" });
  // L'arbre qui encadre la vue, à droite.
  for (let y = 40; y < 70; y++) for (let x = 111; x < 115; x++) t.poser(x + Math.round((70 - y) / 14), y, x === 111 ? "#6b4a30" : x === 114 ? "#3f2a1c" : "#553a26");
  ligne(t, 113, 48, 106, 41, "#553a26");
  ligne(t, 115, 46, 120, 38, "#553a26");
  const touffes: readonly (readonly [number, number, number])[] = [
    [108, 30, 9], [118, 26, 9], [100, 36, 6], [121, 38, 7], [112, 20, 8], [103, 24, 6], [121, 14, 6], [110, 38, 5], [96, 29, 4],
  ];
  for (const [cx, cy, r] of touffes) disque(t, cx, cy + 1, r, "#22573a");
  for (const [cx, cy, r] of touffes) disque(t, cx - 1, cy - 1, r - 1.5, "#2f7244");
  for (const [cx, cy, r] of touffes) {
    for (let y = cy - r; y < cy; y++) for (let x = cx - r; x < cx + 1; x++) if ((x - cx + 1) ** 2 + (y - cy + 1) ** 2 < (r - 2) ** 2 && hasard(x, y, 47) > 0.45) t.poser(x, y, hasard(x, y, 48) > 0.6 ? "#7cc060" : "#4f9a52");
  }
  // La colline où il se tient : herbe épaisse, touffes, fleurs.
  for (let x = 0; x < LARGEUR; x++) {
    const haut = Math.round(66 - 3.5 * Math.exp(-(((x - 58) / 46) ** 2)) + 1.2 * Math.sin(x / 7));
    for (let y = haut; y < HAUTEUR; y++) {
      const p = y - haut;
      let c = p === 0 ? "#86c45c" : p < 3 ? "#57a04a" : p < 8 ? "#43883f" : "#35723a";
      if (p > 0 && hasard(x, y, 51) > 0.86) c = p < 5 ? "#7cc060" : "#2b6034";
      t.poser(x, y, c);
    }
    if (hasard(x, 0, 52) > 0.55) t.poser(x, haut - 1, "#57a04a");
    if (hasard(x, 0, 52) > 0.9) t.poser(x, haut - 2, "#86c45c");
  }
  for (let i = 0; i < 26; i++) {
    const x = Math.floor(hasard(i, 1, 53) * LARGEUR);
    const y = 69 + Math.floor(hasard(i, 2, 53) * 10);
    const c = ["#ffffff", "#f6d24a", "#e8584a"][i % 3] ?? "#ffffff";
    t.poser(x, y, c);
    if (i % 4 === 0) t.poser(x + 1, y, c);
  }
  return t.decor("#2b6034");
}

// ── La carte vue du ciel ───────────────────────────────────────────────────────────────────────────────────────────

interface Clan {
  x: number;
  y: number;
  couleur: string;
}

/** Le clan le plus proche d'une case, sur des distances froissées par le bruit : des frontières naturelles. */
function clanDe(x: number, y: number, clans: readonly Clan[], g: number): number {
  const fx = x + 16 * (relief(x / 14, y / 14, g, 2) - 0.5);
  const fy = y + 16 * (relief(x / 14 + 40, y / 14 + 40, g, 2) - 0.5);
  let mieux = 0;
  let dMin = Infinity;
  clans.forEach((c, i) => {
    const d = (fx - c.x) ** 2 + ((fy - c.y) * 1.25) ** 2;
    if (d < dMin) {
      dMin = d;
      mieux = i;
    }
  });
  return mieux;
}

/** Un nuage vu du dessus et son ombre portée sur la carte. */
function nuageDuCiel(t: Toile, cx: number, cy: number, l: number): void {
  const formes: readonly (readonly [number, number, number, number])[] = [[0, 0, l, l / 3.2], [-l / 2.5, -l / 5, l / 2, l / 4], [l / 3, l / 6, l / 2, l / 4.5]];
  for (const [dx, dy, rx, ry] of formes) {
    for (let y = Math.floor(cy + dy - ry); y <= Math.ceil(cy + dy + ry); y++) {
      for (let x = Math.floor(cx + dx - rx); x <= Math.ceil(cx + dx + rx); x++) {
        if (((x - cx - dx) / rx) ** 2 + ((y - cy - dy) / ry) ** 2 <= 1) teinter(t, x + 4, y + 5, "#0c1c3c", 0.3);
      }
    }
  }
  for (const [dx, dy, rx, ry] of formes) ellipse(t, cx + dx, cy + dy, rx, ry, "#e4ecf4");
  for (const [dx, dy, rx, ry] of formes) ellipse(t, cx + dx - 0.6, cy + dy - 0.8, rx - 1, Math.max(0.6, ry - 0.9), "#ffffff");
}

// ── 4. Les terres des clans (peu commun) ───────────────────────────────────────────────────────────────────────────

function terresDesClans(): Decor {
  const t = new Toile("#2f6fb0");
  const clans: readonly Clan[] = [
    { x: 98, y: 22, couleur: "#2a3f9c" },
    { x: 116, y: 54, couleur: "#cf3f3c" },
    { x: 78, y: 50, couleur: "#e6aa34" },
    { x: 26, y: 44, couleur: "#3a9c5c" },
    { x: 48, y: 62, couleur: "#8f4fb0" },
    { x: 8, y: 64, couleur: "#e07a38" },
    { x: 60, y: 22, couleur: "#35a6ac" },
  ];
  // La terre : un relief, creusé vers le coin calme (la mer) et le long du haut.
  const terre = (x: number, y: number): number =>
    relief(x / 22, y / 22, 61, 4) + 0.16 - 0.62 * borne(1.25 - Math.hypot(x / 60, y / 36)) + 0.12 * borne((x - 60) / 50) - 0.12 * borne((6 - y) / 6);
  const mer = ["#1f558f", "#25609c", "#2b6ba8", "#3379b4", "#4a93c4"];
  const proprio: number[] = [];
  for (let y = 0; y < HAUTEUR; y++) {
    for (let x = 0; x < LARGEUR; x++) {
      const e = terre(x, y);
      proprio.push(e > 0.5 ? clanDe(x, y, clans, 63) : -1);
    }
  }
  const a = (x: number, y: number): number => (x < 0 || y < 0 || x >= LARGEUR || y >= HAUTEUR ? -2 : (proprio[y * LARGEUR + x] ?? -2));
  for (let y = 0; y < HAUTEUR; y++) {
    for (let x = 0; x < LARGEUR; x++) {
      const p = a(x, y);
      const e = terre(x, y);
      if (p < 0) {
        let c = rampe(mer, borne((e - 0.2) / 0.3));
        const cote = [a(x - 1, y), a(x + 1, y), a(x, y - 1), a(x, y + 1)].some((v) => v >= 0);
        if (cote) c = "#8cc6dc";
        else if ((y + Math.floor(x / 5)) % 6 === 0 && hasard(Math.floor(x / 3), y, 64) > 0.72) c = melanger(c, "#ffffff", 0.14);
        t.poser(x, y, c);
        continue;
      }
      const base = clans[p]?.couleur ?? "#888888";
      const voisins = [a(x - 1, y), a(x + 1, y), a(x, y - 1), a(x, y + 1)];
      const frontiere = voisins.some((v) => v !== p && v !== -2);
      const pente = terre(x + 1, y - 1) - terre(x - 1, y + 1);
      let c = pente > 0.022 ? sombre(base, 0.2) : pente < -0.022 ? clair(base, 0.16) : base;
      if (e > 0.8) c = pente < 0 ? clair(base, 0.24) : sombre(base, 0.3);
      if (frontiere) c = voisins.some((v) => v === -1) ? clair(base, 0.55) : clair(base, 0.42);
      t.poser(x, y, c);
    }
  }
  // Les villes : un point de lumière, les capitales en croix.
  for (let i = 0; i < 44; i++) {
    const x = 4 + Math.floor(hasard(i, 3, 65) * 116);
    const y = 4 + Math.floor(hasard(i, 4, 65) * 58);
    if (a(x, y) < 0 || a(x + 1, y) !== a(x, y) || a(x - 1, y) !== a(x, y) || a(x, y + 1) !== a(x, y) || a(x, y - 1) !== a(x, y)) continue;
    t.poser(x, y, "#fff6d0");
    if (i % 4 === 0) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) t.poser(x + dx, y + dy, "#f4e2a8");
  }
  nuageDuCiel(t, 24, 31, 8);
  nuageDuCiel(t, 98, 9, 7);
  // Le rempart où il se tient : un chemin de ronde dallé, des créneaux de part et d'autre.
  const pierre = { clair: "#d6d0c2", moyen: "#b9b2a3", sombre: "#8f887c", joint: "#6f695f" };
  for (let y = 66; y < HAUTEUR; y++) {
    for (let x = 0; x < LARGEUR; x++) {
      const rang = Math.floor((y - 66) / 4);
      const dalle = (x + (rang % 2) * 6) % 12;
      let c = y === 66 ? "#ece7da" : y === 67 ? pierre.clair : pierre.moyen;
      if (y > 67 && ((y - 66) % 4 === 0 || dalle === 0)) c = pierre.sombre;
      else if (y > 67 && hasard(Math.floor((x + (rang % 2) * 6) / 12), rang, 66) > 0.6) c = "#c4bdae";
      t.poser(x, y, c);
    }
  }
  for (const x0 of [0, 20, 90, 110]) {
    for (let y = 59; y < 66; y++) {
      for (let x = x0; x < x0 + 14; x++) {
        let c = y === 59 ? "#ece7da" : x === x0 + 13 ? pierre.sombre : x === x0 ? pierre.clair : pierre.moyen;
        if (y > 59 && (y - 59) % 3 === 0 && x > x0 && x < x0 + 13) c = pierre.sombre;
        if (y > 59 && (y - 59) % 3 !== 0 && (x - x0 + (Math.floor((y - 59) / 3) % 2) * 3) % 7 === 3) c = pierre.sombre;
        t.poser(x, y, c);
      }
    }
    for (let x = x0 + 1; x < x0 + 15; x++) t.poser(x, 66, pierre.joint);
  }
  // La hampe et le fanion du clan, sur le créneau de droite : bleu marine, chevron blanc, pointe rouge.
  for (let y = 38; y < 59; y++) t.poser(7, y, y % 4 === 0 ? "#8a6a40" : "#6b4e2e");
  t.poser(7, 37, "#f4d46a");
  t.grille(8, 39, ["nnnnnnnnnnnnn", "nnnnnnwwnnnr.", "nnnnwwnnnrr..", "nnnnnnwwnnnr.", "nnnnnnnnnnnnn", "nn..........."], { n: "#16245c", w: "#f4f6fb", r: "#d8343a" });
  return t.decor("#7d766b");
}

// ── 5. Crêtes au levant (épique) ───────────────────────────────────────────────────────────────────────────────────

/** Une dent de scie de 0 à 1, pour des sommets pointus. */
const dent = (u: number): number => 1 - 2 * Math.abs(u - Math.floor(u) - 0.5);

interface Chaine {
  base: number;
  /** Les trains de pics : hauteur, période, décalage. */
  pics: readonly (readonly [number, number, number])[];
  ombre: string;
  clair: string;
  neigeClaire: string;
  neigeOmbre: string;
  /** La profondeur de la neige sous la crête (0 : pas de neige). */
  neige: number;
  graine: number;
}

function chaine(t: Toile, c: Chaine, jusqua: number): void {
  const haut = (x: number): number => c.base - c.pics.reduce((s, [h, p, d]) => s + h * dent((x + d) / p) ** 1.5, 0) - 1.2 * bruit(x / 4, c.graine, c.graine);
  for (let x = 0; x < LARGEUR; x++) {
    const h = Math.round(haut(x));
    for (let y = h; y < jusqua; y++) {
      const p = y - h;
      // Le versant : on regarde la pente de la crête un peu plus à gauche à mesure qu'on descend, l'arête file en biais.
      const xs = x - p * 0.55 + (y % 4 === 0 ? 1 : 0);
      const versSoleil = haut(xs + 1.5) - haut(xs - 1.5) > 0.4;
      const enneige = c.neige > 0 && p < c.neige * (0.45 + 1.1 * bruit(x / 5, y / 7, c.graine + 1)) + (versSoleil ? 2 : 0);
      let couleur = versSoleil ? (enneige ? c.neigeClaire : c.clair) : enneige ? c.neigeOmbre : c.ombre;
      if (!enneige && p > 3 && bruit((x + p * 0.55) / 2.5, y / 9, c.graine + 2) > 0.7) couleur = sombre(couleur, 0.13);
      if (p === 0 && versSoleil) couleur = c.neige > 0 ? "#fffaf0" : clair(c.clair, 0.3);
      t.poser(x, y, couleur);
    }
  }
}

/** Une nappe de brume : une bande au bord ondulé qui voile ce qu'elle couvre. */
function brume(t: Toile, y0: number, y1: number, couleur: string, part: number, g: number): void {
  for (let x = 0; x < LARGEUR; x++) {
    const haut = y0 + Math.round(2.5 * bruit(x / 10, g, g) + 1.2 * Math.sin(x / 6 + g));
    for (let y = haut; y < y1; y++) teinter(t, x, y, couleur, y === haut ? part * 0.5 : Math.min(0.92, part + (y - haut) * 0.05));
  }
}

function cretesAuLevant(): Decor {
  const t = new Toile("#3c3c78");
  const soleil = { x: 101, y: 41 };
  bandes(t, 0, 50, ["#3b3d7c", "#454284", "#54488c", "#684f93", "#825896", "#a26293", "#c36f8c", "#de8180", "#f09a74", "#f8b672", "#fccf86", "#fde2a0"]);
  // La clarté du soleil, en anneaux, et ses rayons en éventail.
  for (let y = 0; y < 50; y++) {
    for (let x = 0; x < LARGEUR; x++) {
      const d = Math.hypot(x - soleil.x, (y - soleil.y) * 1.25);
      const anneau = Math.floor(borne(1 - d / 62) * 6) / 6;
      if (anneau > 0) teinter(t, x, y, "#ffd890", anneau * 0.55);
      const angle = Math.atan2(soleil.y - y, x - soleil.x);
      if (d > 12 && d < 78 && Math.floor(angle * 7 + 0.5 * Math.sin(angle * 3)) % 2 === 0 && x > 40) teinter(t, x, y, "#ffe6b0", 0.1 * borne(1 - d / 78) + 0.03);
    }
  }
  disque(t, soleil.x, soleil.y, 10, "#ffe9a8");
  disque(t, soleil.x, soleil.y, 7.5, "#fff8dc");
  // Des nuages en lames, dorés par-dessous, hors du coin calme.
  const lames: readonly (readonly [number, number, number])[] = [[84, 9, 22], [112, 14, 14], [66, 17, 13], [96, 21, 17], [121, 26, 9], [58, 6, 9]];
  for (const [cx, cy, l] of lames) {
    for (let x = cx - l; x <= cx + l; x++) {
      const e = 1 - Math.abs(x - cx) / l;
      const ep = Math.round(e * 2.4 + 0.6 * bruit(x / 4, cy, 74));
      for (let k = 0; k <= ep; k++) t.poser(x, cy - k, k === 0 ? "#ffd28c" : k === 1 ? "#ee9a84" : "#b0709c");
    }
  }
  // Trois oiseaux, loin.
  for (const [x, y] of [[80, 27], [86, 24], [75, 31]] as const) t.grille(x, y, ["o.o", ".o."], { o: "#4a3a70" });
  // Les chaînes, du fond vers nous : de plus en plus sombres, de plus en plus froides.
  chaine(t, { base: 47, pics: [[7, 23, 4], [4, 11, 2]], ombre: "#b4849e", clair: "#f6b68a", neigeClaire: "#ffe4b8", neigeOmbre: "#c8a0b8", neige: 0, graine: 75 }, 60);
  brume(t, 45, 52, "#f8c090", 0.45, 1);
  chaine(t, { base: 54, pics: [[17, 41, 30], [7, 17, 9], [3, 7, 1]], ombre: "#75619c", clair: "#ee9478", neigeClaire: "#fff0d0", neigeOmbre: "#a898cc", neige: 7, graine: 76 }, 66);
  brume(t, 52, 60, "#e89a90", 0.42, 2);
  chaine(t, { base: 63, pics: [[15, 53, 46], [8, 19, 3], [3, 8, 5]], ombre: "#4a437e", clair: "#c8688a", neigeClaire: "#ffd9c4", neigeOmbre: "#8478b4", neige: 5, graine: 77 }, 72);
  brume(t, 60, 68, "#b0749c", 0.38, 3);
  // Le sommet enneigé où il se tient : neige rosie par le soleil, ombres violettes, roches qui percent.
  for (let x = 0; x < LARGEUR; x++) {
    const haut = Math.round(67 - 2.5 * Math.exp(-(((x - 60) / 40) ** 2)) + 1.5 * bruit(x / 7, 4, 78) + (x < 14 ? (14 - x) * -0.5 : 0) + (x > 112 ? (x - 112) * 0.4 : 0));
    for (let y = haut; y < HAUTEUR; y++) {
      const p = y - haut;
      const v = relief(x / 12 - y / 9, y / 5, 79, 2);
      let c = p === 0 ? "#fff4e0" : p === 1 ? "#ffdcc8" : v > 0.58 ? "#b9a6d4" : v > 0.47 ? "#d6c2e0" : "#f0d6dc";
      if (y > 76 && v > 0.5) c = "#9c8cc4";
      t.poser(x, y, c);
    }
  }
  const roches: readonly (readonly [number, number, number])[] = [[6, 70, 7], [22, 76, 5], [101, 72, 6], [117, 75, 8], [36, 78, 4], [88, 78, 5]];
  for (const [cx, cy, l] of roches) {
    for (let x = cx - l; x <= cx + l; x++) {
      const h = Math.round((1 - Math.abs(x - cx) / l) ** 0.7 * l * 0.55 + hasard(x, cy, 80));
      for (let y = cy - h; y <= cy; y++) t.poser(x, y, y === cy - h ? (x > cx ? "#f09a84" : "#8a78b0") : x > cx + l * 0.2 ? "#6c5a98" : "#3f3970");
      t.poser(x, cy + 1, "#a898cc");
    }
  }
  return t.decor("#a593c6");
}

// ── 6. Le monde de nuit (épique) ───────────────────────────────────────────────────────────────────────────────────

function mondeDeNuit(): Decor {
  const t = new Toile("#050818");
  const cx = 100;
  const cy = 121;
  const r = 104;
  // L'espace : quelques bandes à peine plus claires vers la planète, des étoiles rares (discrètes dans le coin calme).
  for (let y = 0; y < HAUTEUR; y++) {
    for (let x = 0; x < LARGEUR; x++) {
      const d = Math.hypot(x - cx, y - cy) - r;
      let c = d < 3 ? "#16306a" : d < 7 ? "#0e1c48" : d < 14 ? "#0a1232" : d < 26 ? "#070c24" : "#050818";
      const tirage = hasard(x, y, 81);
      const calme = x < 48 && y < 26;
      if (d > 4 && tirage > (calme ? 0.992 : 0.982)) c = tirage > 0.997 && !calme ? "#ffffff" : tirage > 0.99 ? "#aebde8" : "#5c6aa0";
      t.poser(x, y, c);
    }
  }
  for (const [x, y] of [[62, 5], [28, 36], [118, 6]] as const) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) t.poser(x + dx, y + dy, "#7f8fc8");
  // La planète : océans de nuit, continents inventés, un liseré d'atmosphère.
  const sol = (x: number, y: number): { terre: boolean; u: number; v: number; bord: number } | null => {
    const dx = (x - cx) / r;
    const dy = (y - cy) / r;
    const q = dx * dx + dy * dy;
    if (q > 1) return null;
    const dz = Math.sqrt(1 - q);
    const u = Math.atan2(dx, dz) * 7 + 20;
    const v = Math.asin(dy) * 7 + 20;
    return { terre: relief(u, v, 82, 4) + 0.1 * bruit(u * 0.4, v * 0.4, 83) > 0.56, u, v, bord: r - Math.sqrt(q) * r };
  };
  for (let y = 0; y < HAUTEUR; y++) {
    for (let x = 0; x < LARGEUR; x++) {
      const s = sol(x, y);
      if (!s) continue;
      let c: string;
      if (s.bord < 1) c = "#9fd8ff";
      else if (s.bord < 2) c = "#4f97dc";
      else if (s.bord < 4) c = s.terre ? "#27456e" : "#2460a8";
      else if (s.bord < 8) c = s.terre ? "#223650" : "#173f7c";
      else if (s.bord < 16) c = s.terre ? "#1f2e44" : "#102c5c";
      else c = s.terre ? "#1c283a" : "#0b1f46";
      if (s.terre && s.bord >= 4) {
        const voisin = sol(x - 1, y - 1);
        if (voisin && !voisin.terre) c = clair(c, 0.14);
        else if (bruit(s.u * 5, s.v * 5, 84) > 0.66) c = clair(c, 0.05);
      }
      t.poser(x, y, c);
    }
  }
  // Les villes : de grandes cités, des traînées de lumière entre elles, des bourgs autour.
  const cites: { x: number; y: number }[] = [];
  for (let i = 0; i < 400 && cites.length < 22; i++) {
    const x = 12 + Math.floor(hasard(i, 1, 85) * 110);
    const y = 20 + Math.floor(hasard(i, 2, 85) * 46);
    const s = sol(x, y);
    if (!s || !s.terre || s.bord < 5) continue;
    if (cites.some((c) => Math.hypot(c.x - x, c.y - y) < 9)) continue;
    cites.push({ x, y });
  }
  const lumiere = (x: number, y: number, c: string): void => {
    const s = sol(x, y);
    if (s && s.terre && s.bord > 3) t.poser(x, y, c);
  };
  cites.forEach((a, i) => {
    cites.slice(i + 1).forEach((b) => {
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d > 19) return;
      for (let k = 1; k < d; k++) if (k % 2 === 0) lumiere(Math.round(a.x + ((b.x - a.x) * k) / d), Math.round(a.y + ((b.y - a.y) * k) / d + 1.2 * Math.sin((k / d) * 3.14)), "#9a5a2c");
    });
  });
  cites.forEach((c, i) => {
    const taille = 3 + Math.floor(hasard(i, 3, 85) * 4);
    for (let k = 0; k < taille * 5; k++) {
      const a = hasard(i, k, 86) * 6.283;
      const d = hasard(k, i, 87) ** 1.6 * taille * 1.5;
      lumiere(Math.round(c.x + Math.cos(a) * d), Math.round(c.y + Math.sin(a) * d * 0.7), d < taille * 0.5 ? "#ffd070" : d < taille ? "#e89a3c" : "#b06a2c");
    }
    for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [-1, 0]] as const) lumiere(c.x + dx, c.y + dy, dx === 0 && dy === 0 ? "#fff6d0" : "#ffe08a");
  });
  // Le soleil qui pointe derrière le bord du monde, à droite : un croissant d'aube et une étoile de lumière.
  const aube = { x: 113, y: Math.round(cy - Math.sqrt(r * r - 13 * 13)) };
  for (let y = 0; y < 44; y++) {
    for (let x = 60; x < LARGEUR; x++) {
      const d = Math.hypot(x - aube.x, y - aube.y);
      const bord = Math.hypot(x - cx, y - cy) - r;
      if (Math.abs(bord) < 1.6 && d < 44) t.poser(x, y, d < 14 ? "#ffffff" : d < 26 ? "#ffe9b8" : "#c8e4ff");
      else if (bord < 0 && bord > -5 && d < 30) teinter(t, x, y, "#ffcf8a", 0.4 * (1 - d / 30));
      else if (bord >= 0 && d < 16) teinter(t, x, y, d < 5 ? "#fff2c8" : "#6fa4ec", d < 5 ? 0.75 : d < 9 ? 0.4 : 0.2);
    }
  }
  for (let k = 1; k < 14; k++) {
    const c = k < 4 ? "#ffffff" : k < 8 ? "#ffe9b8" : "#8fb4e8";
    t.poser(aube.x + k, aube.y, c);
    t.poser(aube.x - k, aube.y, c);
    if (k < 9) t.poser(aube.x, aube.y - k, c);
    if (k < 5) {
      t.poser(aube.x + k, aube.y - k, "#ffe9b8");
      t.poser(aube.x - k, aube.y - k, "#ffe9b8");
    }
  }
  disque(t, aube.x, aube.y, 2.2, "#ffffff");
  // Le rocher de lune où il se tient : régolithe gris-bleu, cratères, arêtes éclairées par l'aube.
  for (let x = 0; x < LARGEUR; x++) {
    const haut = Math.round(67 + 1.6 * bruit(x / 5, 2, 88) - 5 * borne((16 - x) / 16) ** 2 - 2.5 * Math.exp(-(((x - 60) / 36) ** 2)) + 3 * borne((x - 104) / 20));
    for (let y = haut; y < HAUTEUR; y++) {
      const p = y - haut;
      const v = relief(x / 9, y / 4, 89, 3);
      let c = p === 0 ? "#c4cce0" : p === 1 ? "#8d96b4" : v > 0.6 ? "#525a7c" : v > 0.45 ? "#646c90" : "#737ba0";
      if (y > 75) c = sombre(c, 0.22);
      t.poser(x, y, c);
    }
    t.poser(x, haut - 1 + 0, hasard(x, 5, 90) > 0.8 ? "#8d96b4" : (t.lire(x, haut - 1) ?? "#050818"));
  }
  for (const [x, y, l] of [[24, 74, 6], [92, 73, 7], [110, 77, 5], [42, 78, 4], [8, 77, 4]] as const) {
    ellipse(t, x, y, l, l / 3.2, "#454c6c");
    ellipse(t, x - 0.5, y - 0.4, l - 1.4, l / 3.2 - 0.6, "#373d5a");
    for (let k = -l + 1; k < l; k++) t.poser(x + k, y + Math.round((l / 3.2) * Math.sqrt(1 - (k / l) ** 2)), "#aab2cc");
  }
  return t.decor("#32384f");
}

// ── 7. Le pacte de lumière (mystique) ──────────────────────────────────────────────────────────────────────────────

function pacteDeLumiere(): Decor {
  const t = new Toile("#0f1a40");
  const bleu = "#2b46a8";
  const rouge = "#b8303c";
  // La frontière entre les deux territoires : elle descend de la droite vers la gauche en serpentant.
  const frontiere = (x: number): number => 5 + (LARGEUR - x) * 0.43 + 5 * Math.sin(x / 14 + 0.6) + 2.2 * Math.sin(x / 5.5);
  const ecart = (x: number, y: number): number => (y - frontiere(x)) * 0.9;
  const terre = (x: number, y: number): number => relief(x / 24, y / 24, 91, 4) + 0.2 - 0.7 * borne(1.2 - Math.hypot(x / 56, y / 30)) - 0.5 * borne(1.1 - Math.hypot((x - 124) / 30, (y - 70) / 26));
  for (let y = 0; y < HAUTEUR; y++) {
    for (let x = 0; x < LARGEUR; x++) {
      const e = terre(x, y);
      const d = ecart(x, y);
      const ad = Math.abs(d);
      if (e <= 0.5) {
        // La mer du soir, et la lumière de la frontière qui s'y prolonge.
        let c = e > 0.46 ? "#2a4a8c" : e > 0.4 ? "#182c66" : e > 0.3 ? "#132352" : "#0f1a40";
        if (ad < 7) c = melanger(c, "#bcd8ff", ad < 1.5 ? 0.7 : ad < 4 ? 0.34 : 0.14);
        t.poser(x, y, c);
        continue;
      }
      const base = d < 0 ? bleu : rouge;
      const pente = terre(x + 1, y - 1) - terre(x - 1, y + 1);
      let c = pente > 0.02 ? sombre(base, 0.26) : pente < -0.02 ? clair(base, 0.1) : sombre(base, 0.1);
      if (terre(x + 1, y) <= 0.5 || terre(x - 1, y) <= 0.5 || terre(x, y + 1) <= 0.5 || terre(x, y - 1) <= 0.5) c = clair(base, 0.36);
      // La frontière s'efface : un cœur blanc, un halo doré en bandes, puis des éclats semés des deux côtés.
      if (ad < 1.3) c = "#ffffff";
      else if (ad < 3) c = "#fff3c4";
      else if (ad < 5.5) c = melanger(c, "#ffe08c", 0.62);
      else if (ad < 9) c = melanger(c, "#ffd98a", 0.34);
      else if (ad < 14) c = melanger(c, "#f4c890", 0.15);
      if (ad >= 1.3 && ad < 11 && hasard(x, y, 92) > 0.74 + ad * 0.024) c = ad < 5 ? "#ffffff" : melanger(d < 0 ? rouge : bleu, "#fff3c4", 0.55);
      t.poser(x, y, c);
    }
  }
  // Les villes des deux clans, et les routes de lumière qui passent la frontière.
  const villes: { x: number; y: number; cote: number }[] = [];
  for (let i = 0; i < 300 && villes.length < 26; i++) {
    const x = 5 + Math.floor(hasard(i, 1, 93) * 114);
    const y = 5 + Math.floor(hasard(i, 2, 93) * 58);
    const d = ecart(x, y);
    if (terre(x, y) < 0.54 || Math.abs(d) < 7 || (x < 48 && y < 26)) continue;
    if (villes.some((v) => Math.hypot(v.x - x, v.y - y) < 10)) continue;
    villes.push({ x, y, cote: Math.sign(d) });
  }
  villes.forEach((a, i) => {
    villes.slice(i + 1).forEach((b) => {
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (a.cote === b.cote || d > 27 || (Math.min(a.x, b.x) < 50 && Math.min(a.y, b.y) < 28)) return;
      for (let k = 2; k < d - 1; k++) {
        const x = Math.round(a.x + ((b.x - a.x) * k) / d);
        const y = Math.round(a.y + ((b.y - a.y) * k) / d - 3 * Math.sin((k / d) * 3.14));
        if (terre(x, y) > 0.5) teinter(t, x, y, "#fff6d8", k % 3 === 0 ? 0.85 : 0.5);
      }
    });
  });
  for (const v of villes) {
    const halo = v.cote < 0 ? "#9cc0ff" : "#ffb090";
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) t.poser(v.x + dx, v.y + dy, halo);
    for (const [dx, dy] of [[2, 0], [-2, 0], [0, 2], [0, -2], [1, 1], [-1, -1], [1, -1], [-1, 1]] as const) teinter(t, v.x + dx, v.y + dy, halo, 0.4);
    t.poser(v.x, v.y, "#ffffff");
  }
  // Le sceau du pacte, à droite, là où la frontière s'ouvre : des anneaux de lumière et une étoile.
  const sceau = { x: 100, y: Math.round(frontiere(100)) };
  for (let y = sceau.y - 20; y <= sceau.y + 20; y++) {
    for (let x = sceau.x - 24; x <= sceau.x + 24; x++) {
      const d = Math.hypot(x - sceau.x, (y - sceau.y) * 1.15);
      const angle = Math.atan2(y - sceau.y, x - sceau.x);
      if (d < 4) teinter(t, x, y, "#ffffff", 0.9);
      else if (d < 7) teinter(t, x, y, "#fff3c4", 0.6);
      else if (Math.abs(d - 10.5) < 0.7) teinter(t, x, y, "#ffffff", 0.8);
      else if (Math.abs(d - 15.5) < 0.6 && Math.floor(angle * 5 + 20) % 2 === 0) teinter(t, x, y, "#fff3c4", 0.7);
      else if (Math.abs(d - 20.5) < 0.6 && Math.floor(angle * 9 + 40) % 3 === 0) teinter(t, x, y, "#ffe08c", 0.55);
      else if (d < 20) teinter(t, x, y, "#ffe9b0", 0.1);
    }
  }
  for (let k = 1; k < 10; k++) {
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) t.poser(sceau.x + dx * k, sceau.y + dy * k, k < 6 ? "#ffffff" : "#fff3c4");
    if (k < 5) for (const [dx, dy] of [[1, 1], [-1, -1], [1, -1], [-1, 1]] as const) t.poser(sceau.x + dx * k, sceau.y + dy * k, "#fff3c4");
  }
  // Les lucioles qui montent de la frontière : un point clair et sa traîne.
  for (let i = 0; i < 34; i++) {
    const x = 4 + Math.floor(hasard(i, 4, 94) * 116);
    const montee = 3 + Math.floor(hasard(i, 5, 94) ** 1.5 * 20);
    const y = Math.round(frontiere(x)) - montee;
    if (y < 3 || (x < 48 && y < 26)) continue;
    t.poser(x, y, montee < 12 ? "#ffffff" : "#ffe9b0");
    teinter(t, x, y + 1, "#ffe9b0", 0.6);
    teinter(t, x, y + 2, "#ffe08c", 0.3);
    if (i % 5 === 0) for (const [dx, dy] of [[1, 0], [-1, 0], [0, -1]] as const) teinter(t, x + dx, y + dy, "#fff3c4", 0.55);
  }
  // Le promontoire où il se tient : roche sombre, arête dorée par la lumière, fleurs de lueur.
  for (let x = 0; x < LARGEUR; x++) {
    const haut = Math.round(67 + 1.5 * bruit(x / 6, 1, 95) - 2.5 * Math.exp(-(((x - 62) / 38) ** 2)) + 2 * Math.sin(x / 17));
    for (let y = haut; y < HAUTEUR; y++) {
      const p = y - haut;
      const v = relief(x / 8, y / 4, 96, 3);
      let c = p === 0 ? "#ffe9b0" : p === 1 ? "#a8845c" : p < 4 ? "#3c3466" : v > 0.55 ? "#221c44" : v > 0.42 ? "#2c2552" : "#352e5e";
      if (p > 3 && (x + y * 3) % 11 === 0 && v > 0.5) c = "#463e74";
      t.poser(x, y, c);
    }
    teinter(t, x, haut - 1, "#ffe9b0", 0.35);
  }
  for (let i = 0; i < 16; i++) {
    const x = 3 + Math.floor(hasard(i, 6, 97) * 118);
    const y = 71 + Math.floor(hasard(i, 7, 97) * 7);
    t.poser(x, y, "#ffffff");
    t.poser(x, y + 1, "#6c8a6a");
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, -1]] as const) teinter(t, x + dx, y + dy, "#ffe9b0", 0.5);
  }
  return t.decor("#15102e");
}

// ── 8. La table du stratège (légendaire) ───────────────────────────────────────────────────────────────────────────

function tableDuStratege(): Decor {
  const t = new Toile("#3a2c40");
  const lampe = { x: 101, y: 13 };
  // Le mur lambrissé, la poutre du plafond, la plinthe.
  for (let y = 0; y < 58; y++) {
    for (let x = 0; x < LARGEUR; x++) {
      let c = x % 11 === 0 ? "#2c2032" : x % 11 === 1 ? "#44344a" : hasard(x >> 1, y >> 3, 101) > 0.8 ? "#372a3d" : "#3a2c40";
      if (y < 4) c = y === 3 ? "#1c1422" : x % 31 === 5 ? "#5a4038" : "#402c2c";
      if (y >= 54) c = y === 54 ? "#5a4038" : y === 57 ? "#1c1422" : "#402c2c";
      t.poser(x, y, c);
    }
  }
  // La fenêtre en ogive, derrière lui : la nuit, la lune, des étoiles.
  for (let y = 6; y < 54; y++) {
    for (let x = 47; x <= 78; x++) {
      const dx = Math.abs(x - 62.5);
      const arc = y < 22 ? Math.sqrt(Math.max(0, 1 - ((22 - y) / 16) ** 2)) * 15.5 : 15.5;
      if (dx > arc) continue;
      const cadre = dx > arc - 2 || y > 51;
      let c = cadre ? (dx > arc - 1 ? "#6e5244" : "#8d6c54") : rampe(["#1a2458", "#22306c", "#2c3e80", "#3a4f94", "#4c62a4"], (y - 6) / 46);
      if (!cadre) {
        if (dx < 0.6 || y === 30 || (y === 22 && dx < arc - 2)) c = "#5c4438";
        else if (hasard(x, y, 102) > 0.955) c = "#dfe8ff";
      }
      t.poser(x, y, c);
    }
  }
  disque(t, 71, 14, 3.4, "#f4f0d8");
  disque(t, 72.4, 13, 2.6, "#22306c");
  // La grande carte au mur, à gauche : parchemin, continent inventé, quatre territoires, épingles et fils.
  const carte = { x: 5, y: 27, l: 37, h: 25 };
  t.bloc(carte.x - 2, carte.y - 2, carte.l + 4, carte.h + 4, "#4c3426");
  t.bloc(carte.x - 1, carte.y - 1, carte.l + 2, carte.h + 2, "#a87c48");
  for (let x = carte.x - 2; x < carte.x + carte.l + 2; x++) t.poser(x, carte.y - 2, "#c89858");
  const teintes = ["#3d55a0", "#c0503f", "#d8a040", "#5a9a60"];
  const foyers: readonly Clan[] = [{ x: 12, y: 8, couleur: "" }, { x: 28, y: 9, couleur: "" }, { x: 20, y: 18, couleur: "" }, { x: 8, y: 19, couleur: "" }];
  const terreCarte = (x: number, y: number): boolean => relief(x / 9 + 3, y / 9, 103, 3) - 0.75 * (Math.max(Math.abs(x - 18.5) / 18.5, Math.abs(y - 12.5) / 12.5) ** 3) > 0.3;
  for (let y = 0; y < carte.h; y++) {
    for (let x = 0; x < carte.l; x++) {
      let c = (x + y * 2) % 9 === 0 ? "#cdb886" : "#dccb9a";
      if (terreCarte(x, y)) {
        const p = clanDe(x * 2.2, y * 2.2, foyers.map((f) => ({ ...f, x: f.x * 2.2, y: f.y * 2.2 })), 104);
        const autre = [[1, 0], [0, 1]].some(([dx, dy]) => terreCarte(x + (dx ?? 0), y + (dy ?? 0)) && clanDe((x + (dx ?? 0)) * 2.2, (y + (dy ?? 0)) * 2.2, foyers.map((f) => ({ ...f, x: f.x * 2.2, y: f.y * 2.2 })), 104) !== p);
        c = autre ? "#5a4030" : (teintes[p] ?? "#888888");
        if (!terreCarte(x - 1, y) || !terreCarte(x, y - 1)) c = clair(c, 0.3);
        else if (!terreCarte(x + 1, y) || !terreCarte(x, y + 1)) c = "#5a4030";
      } else if (terreCarte(x + 1, y + 1) || terreCarte(x - 1, y - 1) || terreCarte(x + 2, y)) c = "#b9c6a8";
      t.poser(carte.x + x, carte.y + y, c);
    }
  }
  // La rose des vents, les épingles reliées d'un fil rouge.
  t.grille(carte.x + 30, carte.y + 17, ["..o..", ".ono.", "onwno", ".ono.", "..o.."], { o: "#8a6a40", n: "#5a4030", w: "#c0503f" });
  const epingles: readonly (readonly [number, number])[] = [[11, 33], [19, 37], [28, 34], [24, 44], [14, 45]];
  for (let k = 0; k + 1 < epingles.length; k++) {
    const [xa, ya] = epingles[k] ?? [0, 0];
    const [xb, yb] = epingles[k + 1] ?? [0, 0];
    ligne(t, xa, ya, xb, yb, "#e23a40");
  }
  for (const [x, y] of epingles) {
    t.poser(x, y, "#ffffff");
    t.poser(x, y - 1, "#ffd24a");
    t.poser(x + 1, y + 1, "#3a2a22");
  }
  // L'étagère, à droite : livres, rouleaux, sablier.
  t.bloc(86, 38, 36, 2, "#6e4c34");
  for (let x = 86; x < 122; x++) t.poser(x, 38, "#946a44");
  t.bloc(88, 40, 2, 3, "#4c3426");
  t.bloc(118, 40, 2, 3, "#4c3426");
  const livres: readonly (readonly [number, number, string])[] = [[88, 9, "#8c3038"], [90, 11, "#2c4a8c"], [93, 8, "#3c7a58"], [95, 10, "#c89848"], [97, 9, "#6a3c80"], [100, 11, "#8c3038"], [102, 7, "#2c4a8c"]];
  for (const [x, h, c] of livres) {
    t.bloc(x, 38 - h, 2 + (h % 2), h, c);
    t.poser(x, 38 - h, clair(c, 0.35));
    t.poser(x, 38 - h + 2, "#e8c868");
    for (let y = 38 - h + 1; y < 38; y++) t.poser(x + 1 + (h % 2), y, sombre(c, 0.3));
  }
  // Trois rouleaux couchés et un sablier.
  for (const [x, y] of [[107, 36], [109, 34], [111, 36]] as const) {
    t.bloc(x, y, 5, 2, "#e4d2a0");
    t.bloc(x, y + 1, 5, 1, "#bca472");
    t.poser(x, y, "#c0503f");
    t.poser(x + 4, y, "#8a6a40");
  }
  t.grille(117, 31, ["ggggg", ".vsv.", "..s..", ".vsv.", ".sss.", "ggggg", "....."], { g: "#c89848", v: "#a8c8d8", s: "#f0d890" });
  // La table : un plateau de chêne, la carte déroulée, les pions des deux camps, les pièces, l'encrier.
  for (let y = 53; y < 62; y++) {
    const retrait = 61 - y;
    for (let x = 82 + retrait; x < LARGEUR; x++) t.poser(x, y, y === 53 ? "#b4865a" : (x + y * 3) % 13 === 0 ? "#7a5234" : "#946a44");
  }
  t.bloc(82, 62, 42, 3, "#5a3c28");
  for (let x = 82; x < LARGEUR; x++) t.poser(x, 62, "#c89858");
  t.bloc(85, 65, 4, 13, "#4c3426");
  t.bloc(85, 65, 1, 13, "#6e4c34");
  t.bloc(116, 65, 4, 12, "#3e2a20");
  for (let y = 54; y < 61; y++) {
    const retrait = 61 - y;
    for (let x = 88 + retrait; x < 119 + Math.floor(retrait / 2); x++) {
      const u = x - retrait;
      let c = "#e8d8a8";
      if (relief(u / 6, y / 2.5, 105, 2) > 0.5) c = u < 103 ? "#5870b8" : "#d06050";
      else if (relief(u / 6, y / 2.5, 105, 2) > 0.46) c = "#8a7a58";
      t.poser(x, y, c);
    }
  }
  for (let y = 61; y < 66; y++) for (let x = 97; x < 108; x++) t.poser(x, y, y === 65 ? "#bca472" : (x + y) % 6 === 0 ? "#d0bc88" : "#e8d8a8");
  // Les pions : des tours bleu marine d'un côté, rouges de l'autre, un navire entre les deux.
  const tour = (x: number, y: number, c: string): void => t.grille(x, y, ["l.c.c", "lcccc", ".lcc.", ".lcc.", ".lcc.", "sssss"], { c, l: clair(c, 0.4), s: sombre(c, 0.5) });
  tour(92, 50, "#3450c0");
  tour(98, 52, "#3450c0");
  tour(110, 51, "#d8383c");
  tour(116, 49, "#d8383c");
  t.grille(103, 52, [".w...", ".ww..", ".w...", "bbbbb", ".bbb."], { w: "#fff8e8", b: "#6e4c34" });
  // Les pièces d'or et l'encrier à plume.
  for (let k = 0; k < 4; k++) {
    t.bloc(120, 58 - k, 3, 1, k % 2 === 0 ? "#f4c842" : "#c8961c");
    t.poser(120, 58 - k, "#fff0a0");
  }
  t.bloc(86, 55, 3, 3, "#1c2238");
  t.poser(86, 55, "#5c6890");
  ligne(t, 88, 54, 92, 45, "#f4f0e0");
  ligne(t, 89, 53, 93, 46, "#c8c4b8");
  // Le globe, à gauche : une sphère aux continents inventés, un méridien de laiton, un pied tourné.
  const globe = { x: 16, y: 61, r: 8 };
  t.bloc(globe.x - 1, globe.y + 8, 3, 6, "#6e4c34");
  t.bloc(globe.x - 5, globe.y + 14, 11, 2, "#4c3426");
  for (let x = globe.x - 5; x <= globe.x + 5; x++) t.poser(x, globe.y + 14, "#946a44");
  for (let y = globe.y - globe.r; y <= globe.y + globe.r; y++) {
    for (let x = globe.x - globe.r; x <= globe.x + globe.r; x++) {
      const dx = (x - globe.x) / globe.r;
      const dy = (y - globe.y) / globe.r;
      const q = dx * dx + dy * dy;
      if (q > 1.06) continue;
      const dz = Math.sqrt(Math.max(0, 1 - q));
      const terreGlobe = relief(Math.atan2(dx, dz) * 2.2 + 7, Math.asin(borne(dy, -1, 1)) * 2.2 + 3, 106, 3) > 0.52;
      const ombreGlobe = dx * -0.6 + dy * 0.5 + (1 - dz) * 0.5;
      let c = terreGlobe ? (ombreGlobe > 0.45 ? "#3c6a48" : ombreGlobe > 0.1 ? "#5a9a60" : "#8cc078") : ombreGlobe > 0.45 ? "#1e3470" : ombreGlobe > 0.1 ? "#2f55a4" : "#5a84cc";
      if (q > 0.86) c = q > 1 ? "#8a6420" : "#e0b040";
      t.poser(x, y, c);
    }
  }
  t.poser(globe.x + 3, globe.y - 4, "#dfeaff");
  t.poser(globe.x + 4, globe.y - 3, "#dfeaff");
  // Un coffre ouvert et des rouleaux debout, au pied de la carte.
  t.bloc(28, 62, 12, 7, "#6e4c34");
  t.bloc(28, 62, 12, 1, "#946a44");
  t.bloc(28, 65, 12, 1, "#c89848");
  t.bloc(33, 64, 2, 3, "#f4c842");
  for (const [x, h, c] of [[29, 8, "#e4d2a0"], [32, 11, "#dccb9a"], [35, 7, "#e4d2a0"], [37, 10, "#cdb886"]] as const) {
    t.bloc(x, 62 - h, 2, h, c);
    t.poser(x + 1, 62 - h, "#bca472");
    t.poser(x, 62 - h + 2, "#c0503f");
    t.poser(x + 1, 62 - h + 2, "#c0503f");
  }
  // Le plancher et le tapis du clan : bleu marine, galon rouge, filet d'or.
  for (let y = 58; y < HAUTEUR; y++) {
    for (let x = 0; x < LARGEUR; x++) {
      const c0 = t.lire(x, y);
      const rang = Math.floor((y - 58) / 4);
      const lame = (x + rang * 17) % 29;
      const libre = c0 === "#3a2c40";
      if (!libre && !(y === 58 && x < 82)) continue;
      t.poser(x, y, (y - 58) % 4 === 0 || lame === 0 ? "#4a3226" : hasard(Math.floor((x + rang * 17) / 29), rang, 107) > 0.5 ? "#7c563a" : "#86603f");
    }
  }
  for (let y = 67; y < 78; y++) {
    const retrait = Math.round((77 - y) * 0.9);
    for (let x = 24 + retrait; x < 100 - retrait; x++) {
      const b = Math.min(x - 24 - retrait, 99 - retrait - x, y - 67, 77 - y);
      let c = b === 0 ? "#f0c048" : b === 1 || b === 2 ? "#c03440" : b === 3 ? "#f0c048" : "#26368a";
      const losange = Math.abs(((x + 1000) % 12) - 6) + Math.abs(y - 72) * 2;
      if (b > 3 && losange === 4) c = "#e8ecf8";
      else if (b > 3 && losange < 3) c = "#c03440";
      t.poser(x, y, c);
    }
  }
  // Une chandelle sur le coffre : elle éclaire la carte et le globe.
  t.bloc(40, 55, 2, 7, "#f0e6c8");
  t.bloc(41, 55, 1, 7, "#c8bc98");
  t.bloc(39, 61, 4, 1, "#c89848");
  // La lampe de laiton pendue au plafond, à droite.
  for (let y = 4; y < 9; y++) t.poser(lampe.x, y, y % 2 === 0 ? "#c89848" : "#8a6420");
  t.grille(lampe.x - 7, 8, ["......ggg......", ".....gyyyg.....", "...ggyyyyygg...", "..gyyyyyyyyyg..", ".gyyyyyyyyyyyg.", "ddddddddddddddd", "....wwwwwww...."], { g: "#f4d46a", y: "#c89430", d: "#7a5418", w: "#fffbe0" });
  // La lumière : la lampe réchauffe ce qu'elle touche par anneaux, le reste s'enfonce dans l'ombre ; la lune éclaire à peine.
  for (let y = 0; y < HAUTEUR; y++) {
    for (let x = 0; x < LARGEUR; x++) {
      if (y >= 8 && y <= 14 && Math.abs(x - lampe.x) <= 7) continue;
      const d = Math.hypot(x - lampe.x, (y - lampe.y) * 0.85);
      const cone = y > lampe.y && Math.abs(x - lampe.x) < 7 + (y - lampe.y) * 0.62;
      const niveau = Math.floor(borne(1 - d / 96) * 7) / 7;
      const dansFenetre = x > 48 && x < 77 && y > 7 && y < 52;
      if (cone) teinter(t, x, y, "#ffd27a", 0.1 + niveau * 0.22);
      else if (niveau > 0.55) teinter(t, x, y, "#ffc878", (niveau - 0.55) * 0.5);
      else if (!dansFenetre) teinter(t, x, y, "#0c0820", (0.55 - niveau) * 0.75 * borne(Math.hypot(x - 40, (y - 52) * 1.1) / 44));
      const dc = Math.hypot(x - 40, (y - 52) * 1.1);
      if (dc < 30 && !dansFenetre) teinter(t, x, y, "#ffc070", (Math.floor((1 - dc / 30) * 5) / 5) * 0.3);
    }
  }
  t.grille(39, 50, [".o.", ".y.", "oyo", "owo", ".n."], { o: "#ff9a3c", y: "#ffd86a", w: "#fffbe0", n: "#3a2a22" });
  // Le faisceau : un bord tramé, des poussières qui dansent.
  for (let y = lampe.y + 2; y < 53; y++) {
    const demi = 7 + (y - lampe.y) * 0.62;
    for (const x of [Math.round(lampe.x - demi), Math.round(lampe.x + demi)]) if (y % 2 === 0) teinter(t, x, y, "#ffe6a8", 0.35);
  }
  for (let i = 0; i < 34; i++) {
    const y = 17 + Math.floor(hasard(i, 1, 108) * 34);
    const x = Math.round(lampe.x + (hasard(i, 2, 108) - 0.5) * 2 * (5 + (y - lampe.y) * 0.55));
    if (t.lire(x, y)) t.poser(x, y, i % 3 === 0 ? "#fff6d0" : "#f4d48a");
  }
  // Le halo de la lampe.
  for (let y = 12; y < 20; y++) for (let x = lampe.x - 9; x <= lampe.x + 9; x++) if (y > 14 && Math.hypot(x - lampe.x, (y - 14) * 1.6) < 8) teinter(t, x, y, "#fff6d0", 0.35 * (1 - Math.hypot(x - lampe.x, (y - 14) * 1.6) / 8));
  return t.decor("#141a48");
}

export const LOT_C: readonly BanniereDuLot[] = [
  {
    id: "dunes-et-oasis",
    nom: "Dunes et oasis",
    rarete: "commun",
    famille: "cartes",
    description: "Un désert de dunes dorées sous un soleil pâle, avec une oasis et ses palmiers à droite.",
    dessiner: dunesEtOasis,
  },
  {
    id: "banquise-du-nord",
    nom: "La banquise du Nord",
    rarete: "commun",
    famille: "cartes",
    description: "Une mer froide semée de plaques de glace, un grand iceberg à facettes à droite, la banquise sous les pieds.",
    dessiner: banquise,
  },
  {
    id: "delta-verdoyant",
    nom: "Le delta verdoyant",
    rarete: "peu-commun",
    famille: "cartes",
    description: "Du haut d'une colline, un fleuve se partage en bras à travers des champs verts jusqu'à la mer qui brille.",
    dessiner: deltaVerdoyant,
  },
  {
    id: "terres-des-clans",
    nom: "Les terres des clans",
    rarete: "peu-commun",
    famille: "cartes",
    description: "Vu d'un rempart, un continent inventé partagé entre sept territoires de couleur aux frontières claires.",
    dessiner: terresDesClans,
  },
  {
    id: "cretes-au-levant",
    nom: "Crêtes au levant",
    rarete: "epique",
    famille: "cartes",
    description: "Des chaînes de montagnes enneigées dans la brume, le soleil qui se lève derrière un pic et dore les nuages.",
    dessiner: cretesAuLevant,
  },
  {
    id: "monde-de-nuit",
    nom: "Le monde de nuit",
    rarete: "epique",
    famille: "cartes",
    description: "Vue d'un rocher de lune, une planète endormie aux villes allumées, et l'aube qui pointe au bord du monde.",
    dessiner: mondeDeNuit,
  },
  {
    id: "pacte-de-lumiere",
    nom: "Le pacte de lumière",
    rarete: "mystique",
    famille: "cartes",
    description: "Deux territoires alliés, bleu et rouge, vus du ciel : leur frontière s'efface en lumière et des lucioles en montent.",
    dessiner: pacteDeLumiere,
  },
  {
    id: "table-du-stratege",
    nom: "La table du stratège",
    rarete: "legendaire",
    famille: "cartes",
    description: "Une salle des cartes la nuit : lampe de laiton, table aux pions, grande carte épinglée, globe et tapis du clan.",
    dessiner: tableDuStratege,
  },
];
