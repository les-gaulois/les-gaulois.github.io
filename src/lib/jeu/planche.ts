/**
 * La planche du kit en pixels de « Mon Gaulois » (le jeu à `/village`, 21 novembre 2026) : une image de quelques dizaines de
 * cases, peinte case par case, sans navigateur. Tout le kit (`src/lib/jeu/`) dessine sur elle ; le site la change ensuite
 * en image, à la construction (PNG par sharp, `src/pages/village/kit.css.ts`) ou dans la page (toile, `urlDeLaPlanche` de
 * `src/lib/jeu/dans-la-page.ts`). Ses outils sont ceux de la maquette validée par le pilote (planche de Claude Fable 5.2,
 * 19-21 novembre 2026) : `fillStyle`, `fillRect`, `clearRect` et `drawImage` y gardent le sens qu'ils ont sur une toile,
 * pour que ses dessins se recopient tels quels. Voir « Le kit du jeu » dans docs/DESIGN.md.
 *
 * Une couleur se donne en `#rgb`, `#rrggbb`, `rgb(…)`, `rgba(…)` ou `hsl(…)`. Une couleur transparente se pose par-dessus
 * ce qui est déjà peint, comme sur une toile ; une couleur pleine remplace la case.
 */

/** Une couleur lue : rouge, vert, bleu de 0 à 255, opacité de 0 à 1. */
export type Rvba = readonly [number, number, number, number];

const CACHE_DES_COULEURS = new Map<string, Rvba>();

/** Lit une couleur CSS simple. Une écriture inconnue lève une erreur : un dessin faux doit se voir dans les tests. */
export function lireCouleur(texte: string): Rvba {
  const deja = CACHE_DES_COULEURS.get(texte);
  if (deja) return deja;
  const t = texte.trim().toLowerCase();
  let c: Rvba | null = null;
  if (/^#[0-9a-f]{3}$/.test(t)) c = [parseInt(t[1]! + t[1]!, 16), parseInt(t[2]! + t[2]!, 16), parseInt(t[3]! + t[3]!, 16), 1];
  else if (/^#[0-9a-f]{6}$/.test(t)) c = [parseInt(t.slice(1, 3), 16), parseInt(t.slice(3, 5), 16), parseInt(t.slice(5, 7), 16), 1];
  else {
    const m = /^(rgba?|hsla?)\(([^)]*)\)$/.exec(t);
    if (m) {
      const parts = m[2]!.split(/[\s,/]+/).filter(Boolean);
      const nombre = (p: string | undefined, max: number): number => (p === undefined ? max : p.endsWith("%") ? (parseFloat(p) / 100) * max : parseFloat(p));
      if (m[1]!.startsWith("rgb")) c = [nombre(parts[0], 255), nombre(parts[1], 255), nombre(parts[2], 255), nombre(parts[3], 1)];
      else {
        const h = (((parseFloat(parts[0] ?? "0") % 360) + 360) % 360) / 360;
        const s = nombre(parts[1], 1);
        const l = nombre(parts[2], 1);
        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        const teinte = (x: number): number => {
          const u = x < 0 ? x + 1 : x > 1 ? x - 1 : x;
          return u < 1 / 6 ? p + (q - p) * 6 * u : u < 1 / 2 ? q : u < 2 / 3 ? p + (q - p) * (2 / 3 - u) * 6 : p;
        };
        c = [teinte(h + 1 / 3) * 255, teinte(h) * 255, teinte(h - 1 / 3) * 255, nombre(parts[3], 1)];
      }
    }
  }
  if (!c || c.some((v) => !Number.isFinite(v))) throw new Error(`planche : couleur illisible « ${texte} »`);
  const ronde: Rvba = [Math.round(Math.min(255, Math.max(0, c[0]))), Math.round(Math.min(255, Math.max(0, c[1]))), Math.round(Math.min(255, Math.max(0, c[2]))), Math.min(1, Math.max(0, c[3]))];
  CACHE_DES_COULEURS.set(texte, ronde);
  return ronde;
}

/** Une image en cases, rouge-vert-bleu-opacité, quatre octets par case, comme `ImageData`. */
export class Planche {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;
  /** La couleur des prochains `fillRect`, comme sur une toile. */
  fillStyle = "#000000";

  constructor(largeur: number, hauteur: number) {
    this.width = Math.max(1, Math.round(largeur));
    this.height = Math.max(1, Math.round(hauteur));
    this.data = new Uint8ClampedArray(this.width * this.height * 4);
  }

  /** Pose une couleur sur une case, par-dessus ce qui y est. */
  poser(x: number, y: number, [r, v, b, a]: Rvba): void {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height || a <= 0) return;
    const i = (y * this.width + x) * 4;
    const d = this.data;
    if (a >= 1) {
      d[i] = r;
      d[i + 1] = v;
      d[i + 2] = b;
      d[i + 3] = 255;
      return;
    }
    const fond = d[i + 3]! / 255;
    const total = a + fond * (1 - a);
    if (total <= 0) return;
    d[i] = (r * a + d[i]! * fond * (1 - a)) / total;
    d[i + 1] = (v * a + d[i + 1]! * fond * (1 - a)) / total;
    d[i + 2] = (b * a + d[i + 2]! * fond * (1 - a)) / total;
    d[i + 3] = total * 255;
  }

  /** La case est-elle peinte ? */
  pleine(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height && this.data[(y * this.width + x) * 4 + 3]! > 0;
  }

  /** La couleur d'une case, `null` si elle est vide. */
  couleur(x: number, y: number): Rvba | null {
    if (!this.pleine(x, y)) return null;
    const i = (y * this.width + x) * 4;
    return [this.data[i]!, this.data[i + 1]!, this.data[i + 2]!, this.data[i + 3]! / 255];
  }

  fillRect(x: number, y: number, w: number, h: number): void {
    const c = lireCouleur(this.fillStyle);
    const x0 = Math.round(x);
    const y0 = Math.round(y);
    const x1 = Math.round(x + w);
    const y1 = Math.round(y + h);
    for (let yy = Math.max(0, y0); yy < Math.min(this.height, y1); yy++) for (let xx = Math.max(0, x0); xx < Math.min(this.width, x1); xx++) this.poser(xx, yy, c);
  }

  clearRect(x: number, y: number, w: number, h: number): void {
    for (let yy = Math.max(0, Math.round(y)); yy < Math.min(this.height, Math.round(y + h)); yy++)
      for (let xx = Math.max(0, Math.round(x)); xx < Math.min(this.width, Math.round(x + w)); xx++) this.data.fill(0, (yy * this.width + xx) * 4, (yy * this.width + xx) * 4 + 4);
  }

  /** Recopie une autre planche, agrandie case pour case si on lui donne une taille (`agrandi`). */
  drawImage(source: Planche, x: number, y: number, w = source.width, h = source.height): void {
    const x0 = Math.round(x);
    const y0 = Math.round(y);
    for (let yy = 0; yy < h; yy++)
      for (let xx = 0; xx < w; xx++) {
        const sx = Math.floor((xx * source.width) / w);
        const sy = Math.floor((yy * source.height) / h);
        const c = source.couleur(sx, sy);
        if (c) this.poser(x0 + xx, y0 + yy, c);
      }
  }

  /** Une copie de la planche. */
  copie(): Planche {
    const p = new Planche(this.width, this.height);
    p.data.set(this.data);
    return p;
  }
}

/** Un rectangle plein. */
export function R(g: Planche, x: number, y: number, w: number, h: number, coul: string): void {
  g.fillStyle = coul;
  g.fillRect(x, y, w, h);
}

/** Un rectangle aux coins taillés en marches. */
export function rr(g: Planche, x: number, y: number, w: number, h: number, r: number, coul: string): void {
  g.fillStyle = coul;
  for (let i = 0; i < h; i++) {
    const d = Math.min(i, h - 1 - i);
    const e = d < r ? r - d : 0;
    g.fillRect(x + e, y + i, w - 2 * e, 1);
  }
}

/** Un polygone plein ; la couleur peut dépendre de la case (`(x, y) => couleur`). */
export function poly(g: Planche, pts: readonly (readonly [number, number])[], coul: string | ((x: number, y: number) => string | null)): void {
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const [, y] of pts) {
    y0 = Math.min(y0, y);
    y1 = Math.max(y1, y);
  }
  for (let y = Math.floor(y0); y <= Math.ceil(y1); y++) {
    const yc = y + 0.5;
    const xs: number[] = [];
    for (let i = 0; i < pts.length; i++) {
      const [xa, ya] = pts[i]!;
      const [xb, yb] = pts[(i + 1) % pts.length]!;
      if ((ya <= yc && yb > yc) || (yb <= yc && ya > yc)) xs.push(xa + ((yc - ya) / (yb - ya)) * (xb - xa));
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2)
      for (let x = Math.ceil(xs[k]! - 0.5); x <= Math.floor(xs[k + 1]! - 0.5); x++) {
        const c = typeof coul === "function" ? coul(x, y) : coul;
        if (c) R(g, x, y, 1, 1, c);
      }
  }
}

/** Une ellipse pleine. */
export function ell(g: Planche, cx: number, cy: number, rx: number, ry: number, coul: string): void {
  g.fillStyle = coul;
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) if (((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1) g.fillRect(x, y, 1, 1);
}

/** Un trait d'une case (ou plus, `ep`), de case en case. */
export function lig(g: Planche, x0: number, y0: number, x1: number, y1: number, coul: string, ep = 1): void {
  g.fillStyle = coul;
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let e = dx - dy;
  let x = x0;
  let y = y0;
  for (let garde = 0; garde < 10_000; garde++) {
    g.fillRect(x, y, ep, ep);
    if (x === x1 && y === y1) break;
    const e2 = 2 * e;
    if (e2 > -dy) {
      e -= dy;
      x += sx;
    }
    if (e2 < dx) {
      e += dx;
      y += sy;
    }
  }
}

/** Le cerne : une case d'encre autour de tout ce qui est peint. */
export function cerne(c: Planche, coul = "#070b1f"): Planche {
  const avant = c.copie();
  const k = lireCouleur(coul);
  for (let y = 0; y < c.height; y++)
    for (let x = 0; x < c.width; x++) if (!avant.pleine(x, y) && (avant.pleine(x - 1, y) || avant.pleine(x + 1, y) || avant.pleine(x, y - 1) || avant.pleine(x, y + 1))) c.poser(x, y, k);
  return c;
}

/** Le volume : lumière sur les bords du haut et de gauche, ombre sur ceux du bas et de droite, cerne compris. */
export function volume(c: Planche): Planche {
  const s = c.copie();
  const W = c.width;
  const encre = (x: number, y: number): boolean => {
    if (!s.pleine(x, y)) return true;
    const i = (y * W + x) * 4;
    return s.data[i] === 7 && s.data[i + 1] === 11 && s.data[i + 2] === 31;
  };
  for (let y = 0; y < c.height; y++)
    for (let x = 0; x < W; x++) {
      if (encre(x, y)) continue;
      const haut = encre(x, y - 1) || encre(x - 1, y);
      const bas = encre(x, y + 1) || encre(x + 1, y);
      if (haut === bas) continue;
      const i = (y * W + x) * 4;
      for (let k = 0; k < 3; k++) c.data[i + k] = haut ? s.data[i + k]! + (255 - s.data[i + k]!) * 0.36 : s.data[i + k]! * 0.72;
    }
  return c;
}

/** Efface la marge d'une case autour d'une planche carrée de `t` cases. */
export function marge(g: Planche, t: number): void {
  g.clearRect(0, 0, t, 1);
  g.clearRect(0, t - 1, t, 1);
  g.clearRect(0, 0, 1, t);
  g.clearRect(t - 1, 0, 1, t);
}

/** Les dix pointes d'une étoile à cinq branches. */
export const etoile5 = (cx: number, cy: number, r1: number, r2: number): [number, number][] =>
  Array.from({ length: 10 }, (_, i) => {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const r = i % 2 ? r2 : r1;
    return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
  });

/** Un dessin écrit en rangées de lettres, chaque lettre une couleur de la palette ; un point ou une lettre inconnue : vide. */
export function grille(rangees: readonly string[], pal: Readonly<Record<string, string>>): Planche {
  const c = new Planche(Math.max(...rangees.map((r) => r.length)), rangees.length);
  rangees.forEach((r, y) => {
    for (let x = 0; x < r.length; x++) {
      const coul = pal[r[x]!];
      if (coul) R(c, x, y, 1, 1, coul);
    }
  });
  return c;
}

/** La tresse : deux brins qui passent l'un sur l'autre, sur `long` cases. */
export function tresse(g: Planche, x0: number, y0: number, long: number, h: number, brinA: readonly [string, string], brinB: readonly [string, string], creux: string): void {
  const amp = (h - 2) / 2;
  const axe = y0 + amp;
  for (let i = 0; i < long; i++) {
    const s = Math.sin((i * Math.PI) / 6);
    const ya = Math.round(axe + amp * s);
    const yb = Math.round(axe - amp * s);
    const dessusA = Math.floor((i + 3) / 6) % 2 === 0;
    const brin = (y: number, coul: readonly [string, string]): void => {
      R(g, x0 + i, y - 1, 1, 4, creux);
      R(g, x0 + i, y, 1, 1, coul[0]);
      R(g, x0 + i, y + 1, 1, 1, coul[1]);
    };
    if (dessusA) {
      brin(yb, brinB);
      brin(ya, brinA);
    } else {
      brin(ya, brinA);
      brin(yb, brinB);
    }
  }
}

/** Mélange deux couleurs `#rrggbb` : `t` de 0 (la première) à 1 (la seconde). */
export function melange(a: string, b: string, t: number): string {
  const A = lireCouleur(a);
  const B = lireCouleur(b);
  return `#${[0, 1, 2].map((i) => Math.round(A[i]! + (B[i]! - A[i]!) * t).toString(16).padStart(2, "0")).join("")}`;
}
