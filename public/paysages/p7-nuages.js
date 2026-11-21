// Site du clan [GAL] (AGPL-3.0-only). Paysage animé du fond de « Mon Gaulois », dessin en cases de Claude Fable 5.2,
// 21 novembre 2026, choisi par le pilote avec les sept autres ; ils tournent toutes les 15 minutes (src/lib/jeu/fonds-du-jeu.ts,
// tenu par src/scripts/jeu.ts). Script classique : il ajoute son fond à window.FONDS, rien d'autre.
// Fond « paysage » de l'écran de jeu Mon Gaulois : p7-nuages. Dessin en cases, sans image ni bibliothèque.
(() => {
  "use strict";
  // ---- Boîte à outils du dessin en cases (la même dans p5 à p8) ----
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  const seuil = (x, y) => (BAYER[(x & 3) | ((y & 3) << 2)] + 0.5) / 16;
  const borne = (v, a, b) => (v < a ? a : v > b ? b : v);
  // Hasard à graine fixe : le même dessin à chaque ouverture.
  function alea(s) {
    return () => {
      s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hach(a, b) {
    let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  function b2(x, y) {
    const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j;
    const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    const a = hach(i, j), b = hach(i + 1, j), c = hach(i, j + 1), d = hach(i + 1, j + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  function fbm(x, y, o) {
    let s = 0, a = 0.5, n = 0;
    for (let k = 0; k < (o || 3); k++) { s += a * b2(x, y); n += a; x = x * 2 + 17.3; y = y * 2 + 9.1; a *= 0.5; }
    return s / n;
  }
  // Couleurs : "#rrggbb" vers l'entier que lit la toile (ABGR).
  const C = (h) => { const n = parseInt(h.slice(1), 16); return (0xff000000 | ((n & 255) << 16) | (n & 0xff00) | (n >>> 16)) >>> 0; };
  const P = (...h) => h.map(C);
  function mel(a, b, t) {
    const x = parseInt(a.slice(1), 16), y = parseInt(b.slice(1), 16);
    const f = (s) => { const u = (x >> s) & 255, v = (y >> s) & 255; return Math.round(u + (v - u) * t); };
    return "#" + ((1 << 24) | (f(16) << 16) | (f(8) << 8) | f(0)).toString(16).slice(1);
  }
  function melC(a, b, t) {
    const f = (s) => { const u = (a >>> s) & 255, v = (b >>> s) & 255; return Math.round(u + (v - u) * t); };
    return (0xff000000 | (f(16) << 16) | (f(8) << 8) | f(0)) >>> 0;
  }
  // Une toile hors écran qu'on peint case par case, puis qu'on fige.
  class Calque {
    constructor(w, h) {
      this.w = Math.max(1, w | 0); this.h = Math.max(1, h | 0);
      this.c = document.createElement("canvas"); this.c.width = this.w; this.c.height = this.h;
      this.x = this.c.getContext("2d");
      this.im = this.x.createImageData(this.w, this.h);
      this.d = new Uint32Array(this.im.data.buffer);
    }
    p(x, y, c) { x |= 0; y |= 0; if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.d[y * this.w + x] = c; }
    g(x, y) { x |= 0; y |= 0; return x >= 0 && y >= 0 && x < this.w && y < this.h ? this.d[y * this.w + x] : 0; }
    r(x, y, w, h, c) {
      x |= 0; y |= 0; w |= 0; h |= 0;
      const x1 = Math.min(this.w, x + w), y1 = Math.min(this.h, y + h);
      for (let j = Math.max(0, y); j < y1; j++) for (let i = Math.max(0, x); i < x1; i++) this.d[j * this.w + i] = c;
    }
    ligne(x0, y0, x1, y1, c) {
      x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
      const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
      let e = dx + dy;
      for (let n = 0; n < 4000; n++) {
        this.p(x0, y0, c);
        if (x0 === x1 && y0 === y1) break;
        const e2 = 2 * e;
        if (e2 >= dy) { e += dy; x0 += sx; }
        if (e2 <= dx) { e += dx; y0 += sy; }
      }
    }
    disque(cx, cy, r, c) {
      for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) {
        if ((x - cx) * (x - cx) + (y - cy) * (y - cy) <= r * r) this.p(x, y, typeof c === "function" ? c(x, y) : c);
      }
    }
    tampon(x, y, lignes, pal, miroir) {
      for (let j = 0; j < lignes.length; j++) {
        const l = lignes[j];
        for (let i = 0; i < l.length; i++) {
          const k = pal[l[i]];
          if (k !== undefined) this.p(x + (miroir ? l.length - 1 - i : i), y + j, k);
        }
      }
    }
    fin() { this.x.putImageData(this.im, 0, 0); return this.c; }
  }
  // Un ton choisi dans une gamme, avec une frange tramée entre deux aplats.
  function ton(x, y, f, pal, plat) {
    const n = pal.length - 1;
    if (f <= 0) return pal[0];
    if (f >= n) return pal[n];
    const i = Math.floor(f);
    let fr = f - i;
    if (plat) fr = (fr - plat) / (1 - 2 * plat);
    return pal[fr > seuil(x, y) ? i + 1 : i];
  }
  function degrade(cal, y0, y1, pal, plat) {
    for (let y = Math.max(0, y0); y < Math.min(cal.h, y1); y++) {
      const f = ((y - y0) / Math.max(1, y1 - y0 - 1)) * (pal.length - 1);
      for (let x = 0; x < cal.w; x++) cal.d[y * cal.w + x] = ton(x, y, f, pal, plat);
    }
  }
  function lutin(lignes, pal, miroir) {
    const c = new Calque(lignes[0].length, lignes.length);
    c.tampon(0, 0, lignes, pal, miroir);
    return c.fin();
  }
  // Un nuage à fond plat, fait de boules éclairées depuis (lx, ly). tons : 5 couleurs, du plus clair au plus sombre.
  function nuage(cal, cx, base, larg, haut, tons, R, lx, ly) {
    const boules = [];
    const n = Math.max(3, Math.round(larg / (haut * 0.55)));
    for (let i = 0; i < n; i++) {
      const u = (i + 0.5) / n;
      const r = haut * (0.3 + 0.42 * Math.sin(Math.PI * u)) * (0.8 + 0.4 * R());
      boules.push({ x: cx - larg / 2 + u * larg + (R() - 0.5) * haut * 0.3, y: base - r * 0.55, r });
    }
    for (let i = 0; i < n / 2; i++) {
      const u = 0.25 + 0.5 * R();
      const r = haut * (0.22 + 0.2 * R());
      boules.push({ x: cx - larg / 2 + u * larg, y: base - haut * (0.45 + 0.3 * R()), r });
    }
    boules.sort((a, b) => a.y - b.y);
    for (const b of boules) {
      for (let y = Math.floor(b.y - b.r); y <= base; y++) for (let x = Math.floor(b.x - b.r); x <= b.x + b.r; x++) {
        const dx = x - b.x, dy = y - b.y;
        if (dx * dx + dy * dy > b.r * b.r) continue;
        const l = (dx * lx + dy * ly) / b.r;
        if (l < -0.5 && cal.g(x, y)) continue;
        let f = 2 - l * 2.3;
        if (base - y < 2) f = Math.max(f, 3.2);
        cal.p(x, y, ton(x, y, borne(f, 0, 4), tons, 0.28));
      }
    }
  }
  function lune(cal, cx, cy, r, pal, halo) {
    for (let y = Math.floor(cy - r - halo); y <= cy + r + halo; y++) for (let x = Math.floor(cx - r - halo); x <= cx + r + halo; x++) {
      const d = Math.hypot(x - cx, y - cy);
      if (d <= r) {
        const k = ((x - cx) * 0.6 + (y - cy) * 0.8) / r;
        cal.p(x, y, k > 0.45 && (k - 0.45) * 2.2 > seuil(x, y) ? pal[1] : pal[0]);
      } else if (d <= r + halo) {
        const k = 1 - (d - r) / halo;
        if (k * k * 0.8 > seuil(x, y)) cal.p(x, y, k > 0.6 ? pal[3] : pal[4]);
      }
    }
    for (const [a, b, q] of [[-0.35, -0.3, 0.27], [0.3, 0.05, 0.2], [-0.12, 0.45, 0.17], [0.42, -0.48, 0.12], [-0.6, 0.2, 0.1]]) {
      const rr = Math.max(1, r * q);
      cal.disque(cx + a * r, cy + b * r, rr, pal[1]);
      if (rr >= 2) cal.disque(cx + a * r - 0.6, cy + b * r - 0.6, rr - 1, pal[2]);
    }
  }
  function etoiles(cal, R, n, y1, garde) {
    const cols = P("#6f80bd", "#6f80bd", "#93a4dc", "#c5d2f5", "#ffffff", "#ffe2b0");
    for (let i = 0; i < n; i++) {
      const x = Math.floor(R() * cal.w), y = Math.floor(R() * y1), k = R();
      if (garde && R() > garde(x, y)) continue;
      const fond = 1 - (y / y1) * 0.6;
      const c = cols[Math.min(5, Math.floor(k * k * 6 * fond + R() * 0.8))];
      cal.p(x, y, c);
      if (k > 0.985) { const b = melC(c, cal.g(x + 1, y) || c, 0.55); cal.p(x + 1, y, b); cal.p(x - 1, y, b); cal.p(x, y + 1, b); cal.p(x, y - 1, b); cal.p(x, y, cols[4]); }
    }
  }
  // Une bande de brume en longues traînées, qui se raccorde à elle-même sur sa largeur.
  function brume(T, h, cols, dens) {
    const cal = new Calque(T, h), R = alea(4242 + h);
    const n = Math.round((T / 46) * dens);
    for (let i = 0; i < n; i++) {
      const cx = R() * T, cy = h * (0.22 + 0.56 * R()), a = 22 + R() * 70, b = 1.1 + R() * h * 0.15;
      for (let dy = -Math.ceil(b) - 1; dy <= b + 1; dy++) for (let dx = -Math.ceil(a) - 1; dx <= a + 1; dx++) {
        const d = (dx * dx) / (a * a) + (dy * dy) / (b * b);
        if (d > 1) continue;
        const x = (((Math.round(cx) + dx) % T) + T) % T, y = Math.round(cy + dy);
        if (d <= 0.62) cal.p(x, y, cols[0]);
        else if (!cal.g(x, y) && (d < 0.8 || ((x + y) & 1))) cal.p(x, y, cols[1]);
      }
    }
    return cal.fin();
  }
  // Une ligne brisée adoucie, puis découpée en pas d'une case.
  function lisser(pts, n) {
    for (let k = 0; k < n; k++) {
      const q = [pts[0]];
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1];
        q.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
      }
      q.push(pts[pts.length - 1]);
      pts = q;
    }
    const pas = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1], d = Math.hypot(b[0] - a[0], b[1] - a[1]);
      for (let s = 0; s < d; s++) pas.push([a[0] + ((b[0] - a[0]) * s) / d, a[1] + ((b[1] - a[1]) * s) / d]);
    }
    return pas;
  }

  // ---- Au-dessus des nuages ----
  const M = 8;
  let W = 0, H = 0, S = false, E = null;

  // Un pic : arête centrale, face au jour et face à l'ombre, neige en haut, brume au pied.
  function pic(cal, ax, ay, yb, hw, roche, neige, brume, g, jourAGauche, partNeige) {
    for (let y = Math.floor(ay); y < yb; y++) {
      const p = (y - ay) / (yb - ay);
      const demi = hw * Math.pow(p, 0.82);
      const xl = Math.round(ax - demi - (fbm(y * 0.11, g, 3) - 0.5) * hw * 0.3 * p);
      const xr = Math.round(ax + demi + (fbm(y * 0.11, g + 50, 3) - 0.5) * hw * 0.3 * p);
      const xm = ax + (fbm(y * 0.045, g + 9, 2) - 0.5) * hw * 0.7 * p;
      for (let x = xl; x <= xr; x++) {
        const cote = x < xm ? -1 : 1;
        const q = fbm((x + (y - ay) * 0.6 * cote) * 0.085, y * 0.014 + g, 3);
        const lit = jourAGauche ? x < xm + (q - 0.5) * 8 : x > xm + (q - 0.5) * 8;
        const f = lit ? q * 1.9 - 0.2 : 1.7 + q * 1.9;
        const ys = ay + (yb - ay) * partNeige * (0.6 + 0.9 * fbm(x * 0.1, g + 3, 2));
        const blanc = y < ys || (q > 0.6 && y < ys + (yb - ay) * 0.1);
        let c = ton(x, y, borne(f, 0, 3), blanc ? neige : roche, 0.3);
        if (p > 0.6 && ((p - 0.6) / 0.4) * 1.5 + (fbm(x * 0.07, y * 0.11 + g, 3) - 0.5) * 1.3 > 0.6 + (seuil(x, y) - 0.5) * 0.22) c = brume;
        cal.p(x, y, c);
      }
    }
  }

  // Une nappe de la mer de nuages, qui se raccorde à elle-même sur la largeur T.
  function nappe(T, haut, r, tons, R, lx, ly) {
    const marge = Math.ceil(r * 3.4);
    const cal = new Calque(T, haut + marge);
    const boules = [];
    const n = Math.max(6, Math.round(T / (r * 0.8)));
    let tour = 0;
    for (let i = 0; i < n; i++) {
      const x = ((i + R() * 0.8) / n) * T;
      const rr = r * (0.6 + 0.8 * R());
      boules.push({ x, y: marge + (R() - 0.3) * r * 0.9, r: rr, e: 0 });
      // De temps en temps, une tour de cumulus qui monte au-dessus de la nappe.
      if (R() < 0.16 && i > tour + 2) {
        tour = i;
        const m = 2 + Math.floor(R() * 3);
        for (let k = 1; k <= m; k++) boules.push({ x: x + (R() - 0.5) * r * 1.2, y: marge - k * r * 0.62, r: rr * (1 - k * 0.14), e: 0, t: 1 });
        boules.push({ x: x - r * 1.1, y: marge - r * 0.3, r: rr * 0.8, e: 0, t: 1 }, { x: x + r * 1.1, y: marge - r * 0.25, r: rr * 0.85, e: 0, t: 1 });
      }
    }
    // Le dessus de la nappe, puis son corps.
    const dessus = new Float32Array(T).fill(1e9);
    for (const b of boules) if (!b.t) for (let dx = -Math.ceil(b.r); dx <= b.r; dx++) {
      const x = (((Math.round(b.x) + dx) % T) + T) % T;
      const y = b.y - Math.sqrt(Math.max(0, b.r * b.r - dx * dx));
      if (y < dessus[x]) dessus[x] = y;
    }
    for (let x = 0; x < T; x++) for (let y = Math.max(0, Math.floor(dessus[x])); y < cal.h; y++) {
      const d = (y - marge) / (r * 3.2);
      cal.p(x, y, ton(x, y, borne(2.2 + d + (fbm(x * 0.05, y * 0.09, 2) - 0.5) * 1.2, 0, 4), tons, 0.3));
    }
    // Des boules plus bas dans la nappe : le moutonnement.
    const rangs = Math.ceil(haut / (r * 1.1));
    for (let k = 1; k <= rangs; k++) for (let i = 0; i < n * 0.8; i++) {
      boules.push({ x: R() * T, y: marge + k * r * 1.1 + (R() - 0.5) * r, r: r * (0.7 + 0.9 * R()), e: k * 0.36 });
    }
    boules.sort((a, b) => a.y - b.y);
    for (const b of boules) {
      for (let y = Math.floor(b.y - b.r); y <= b.y + b.r; y++) for (let dx = -Math.ceil(b.r); dx <= b.r; dx++) {
        const dy = y - b.y;
        if (dx * dx + dy * dy > b.r * b.r) continue;
        const l = (dx * lx + dy * ly) / b.r;
        if (l < -0.25 && !(b.t && y < marge)) continue;
        const x = (((Math.round(b.x) + dx) % T) + T) % T;
        cal.p(x, y, ton(x, y, borne(2.1 - l * 2.4 + Math.min(1.5, b.e), 0, 4), tons, 0.28));
      }
    }
    return { c: cal.fin(), marge };
  }

  function monter({ largeur, hauteur, sombre }) {
    W = largeur; H = hauteur; S = sombre;
    const R = alea(7107), tel = W < H, LW = W + 2 * M;
    const hz = Math.round(H * 0.52);
    const lx = S ? 0.55 : -0.5, ly = -0.84; // le jour vient du soleil à gauche, la nuit de la lune à droite
    E = { hz, tel, nappes: [], pics: [], scint: [] };

    // Le ciel.
    const ciel = new Calque(LW, hz + 40);
    const pc = S
      ? P("#040716", "#060a1e", "#080e28", "#0a1230", "#0e1a42", "#152656", "#1e346c", "#2b4682", "#3a5894")
      : P("#1b4aa6", "#2259b8", "#2c6cc8", "#3c82d6", "#559ce2", "#78b6ec", "#a2d0f4", "#c8e4f9", "#e6f4fc");
    degrade(ciel, 0, hz + 40, pc, 0.18);
    const ax = tel ? LW * 0.14 : LW * 0.24, ay = Math.round(H * (tel ? 0.2 : 0.17));
    if (S) {
      // La Voie lactée : une bande en travers du ciel, avec sa traînée sombre.
      const x0 = LW * 0.02, y0 = hz * 1.05, x1 = LW * 0.98, y1 = -hz * 0.25;
      const L = Math.hypot(x1 - x0, y1 - y0), ux = (x1 - x0) / L, uy = (y1 - y0) / L;
      const wd = Math.max(16, hz * 0.17);
      const dens = (x, y) => {
        const u = (x - x0) * ux + (y - y0) * uy, v = -(x - x0) * uy + (y - y0) * ux;
        const g = fbm(u * 0.02 + 40, v * 0.05 + 7, 2);
        const voie = Math.exp(-Math.pow((v - (g - 0.5) * wd * 1.3) / (wd * 0.2), 2));
        return Math.exp(-(v * v) / (wd * wd)) * (0.3 + 1.05 * fbm(u * 0.035, v * 0.06, 3)) * (1 - 0.8 * voie);
      };
      const pv = [0, ...P("#121c4a", "#1d2962", "#2c377a", "#46458c", "#6b5a9a")];
      for (let y = 0; y < hz + 10; y++) for (let x = 0; x < LW; x++) {
        const c = ton(x, y, borne(dens(x, y) * 6.4 - 0.4, 0, 5), pv, 0.12);
        if (c) cal0(ciel, x, y, c);
      }
      etoiles(ciel, R, Math.round((LW * hz) / 16), hz + 6, (x, y) => 0.16 + dens(x, y) * 1.5);
      const mx = LW - ax, my = ay;
      lune(ciel, mx, my, tel ? 8 : 10, P("#f3f5ff", "#c3cdf0", "#9aa8d8", "#31457f", "#1f2f66"), 12);
      E.astre = { x: mx, y: my };
      for (let i = 0; i < 16; i++) E.scint.push({ x: Math.floor(R() * LW), y: Math.floor(R() * hz * 0.85), ph: R() * 6.28, v: 2200 + R() * 2600 });
    } else {
      // Des voiles de haute altitude, puis le soleil et son halo.
      const voile = P("#4e96df", "#6eaee9", "#9ccbf3");
      for (let i = 0; i < (tel ? 7 : 16); i++) {
        const sx = R() * LW, sy = 8 + R() * hz * 0.62, len = 26 + R() * 70, pente = (R() - 0.5) * 0.12;
        for (let k = 0; k < len; k++) {
          const e = Math.sin((k / len) * Math.PI);
          const x = Math.round(sx + k), y = Math.round(sy + k * pente + Math.sin(k * 0.12) * 1.5);
          if (e > seuil(x, y) * 0.9) ciel.p(x, y, voile[sy > hz * 0.4 ? 2 : sy > hz * 0.2 ? 1 : 0]);
          if (e > 0.75 && seuil(x, y) < 0.5) ciel.p(x, y + 1, voile[sy > hz * 0.4 ? 2 : 1]);
        }
      }
      const r = tel ? 7 : 9;
      for (let y = Math.floor(ay - r - 22); y <= ay + r + 22; y++) for (let x = Math.floor(ax - r - 22); x <= ax + r + 22; x++) {
        const d = Math.hypot(x - ax, y - ay);
        if (d <= r - 2) ciel.p(x, y, C("#fffef2"));
        else if (d <= r) ciel.p(x, y, C("#fff3b4"));
        else if (d <= r + 22) {
          const k = 1 - (d - r) / 22;
          if (k * k > seuil(x, y)) ciel.p(x, y, k > 0.72 ? C("#f4fbff") : k > 0.42 ? C("#cfe8fb") : C("#a6d0f5"));
        }
      }
      E.astre = { x: ax, y: ay };
    }
    E.ciel = ciel.fin();

    // Les nappes, de la plus lointaine à la plus proche.
    const clair = S ? ["#e4ebff", "#aebce8", "#7386c4", "#475a94", "#2b3a6c"] : ["#ffffff", "#f0f6fd", "#cadcf3", "#9db9e4", "#7797d0"];
    const voile = S ? "#3a5894" : "#e2f1fb";
    const parts = [0, 0.1, 0.24, 0.42, 0.62, 0.85], rayons = [3, 5, 8, 13, 19, 27], vit = [0.4, 0.8, 1.5, 2.6, 4, 6];
    for (let k = 0; k < 6; k++) {
      const haut = Math.round(hz - 3 + (H - hz) * parts[k]);
      const suiv = k < 5 ? Math.round(hz - 3 + (H - hz) * parts[k + 1]) : H;
      const tons = P(...clair.map((c, i) => mel(c, voile, (1 - k / 5) * (i === 0 ? 0.55 : 0.78))));
      const n = nappe(LW, suiv - haut + rayons[Math.min(5, k + 1)] * 4 + 8, rayons[k], tons, alea(900 + k * 37), lx, ly);
      E.nappes.push({ c: n.c, y: haut - n.marge, m: n.marge, v: vit[k], par: 1 + k });
    }

    // Les pics : petits au loin, un moyen à gauche, un grand à droite.
    const roche = S ? ["#5c6ca4", "#3b4a7c", "#232e5a", "#141b3e"] : ["#c2ad9c", "#9a8590", "#6f6482", "#4c476a"];
    const neige = S ? ["#e9eeff", "#aab9e6", "#6478b6", "#465892"] : ["#ffffff", "#e2ecf9", "#aec4e8", "#8ea9d8"];
    const hw = borne(W * 0.17, 60, 150);
    const toilePic = (x, y, yb, w, loin, g, pn) => {
      const cal = new Calque(Math.ceil(w * 2.9), Math.ceil(yb - y) + 2);
      const t = (pal) => P(...pal.map((c) => mel(c, voile, loin)));
      pic(cal, cal.w / 2, 1, cal.h, w, t(roche), t(neige), C(mel(S ? "#475a94" : "#d5e4f5", voile, loin * 0.6)), g, !S, pn);
      return { c: cal.fin(), x: Math.round(x - cal.w / 2), y: Math.round(y) };
    };
    const loin = [];
    for (const [fx, dh, w] of [[0.1, 22, 20], [0.2, 13, 13], [0.36, 17, 16], [0.57, 12, 12], [0.66, 20, 19], [0.86, 14, 14]]) {
      loin.push(toilePic(LW * fx, hz - dh, hz + 12, w, 0.62, fx * 100, 0.5));
    }
    E.pics = [
      { avant: 0, par: 1, liste: loin },
      { avant: 2, par: 3, liste: [toilePic(M + W * (tel ? 0.1 : 0.2), H * (tel ? 0.44 : 0.4), E.nappes[3].y + E.nappes[3].m + 16, hw * 0.56, 0.22, 31, 0.36)] },
      { avant: 4, par: 5, liste: [toilePic(M + W * 0.93, H * (tel ? 0.3 : 0.2), E.nappes[4].y + E.nappes[4].m + 24, hw, 0, 77, 0.3)] },
    ];
    E.oiseau = S ? null : "#263762";
  }
  function cal0(cal, x, y, c) { cal.d[y * cal.w + x] = c; }

  function dessiner(ctx, t, s) {
    if (!E) return;
    if (!(t > 0)) t = 0;
    const LW = W + 2 * M;
    ctx.drawImage(E.ciel, -M + Math.round(s.x * 1), Math.round(s.y * 1) - 1);
    if (S) {
      // Quelques étoiles qui respirent lentement.
      ctx.fillStyle = "#ffffff";
      for (const e of E.scint) {
        ctx.globalAlpha = 0.35 + 0.35 * Math.sin(t / e.v + e.ph);
        ctx.fillRect(e.x - M + Math.round(s.x), e.y, 1, 1);
      }
      // Une étoile filante, lente, qui paraît et s'efface sans éclat.
      const k = Math.floor(t / 24000), u = (t % 24000) / 6000;
      if (u < 1) {
        const x0 = W * (0.4 + 0.45 * hach(k, 1)), y0 = H * (0.06 + 0.1 * hach(k, 2)), env = Math.sin(Math.PI * u);
        for (let j = 0; j < 22; j++) {
          ctx.globalAlpha = env * Math.pow(1 - j / 22, 1.4) * 0.95;
          ctx.fillStyle = j < 2 ? "#ffffff" : "#b9c8f6";
          ctx.fillRect(Math.round(x0 - 76 * u + j), Math.round(y0 + 27 * u - j * 0.36), 1, 1);
        }
      }
      ctx.globalAlpha = 1;
    }
    for (let k = 0; k < 6; k++) {
      for (const g of E.pics) if (g.avant === k) for (const p of g.liste) ctx.drawImage(p.c, p.x - M + Math.round(s.x * g.par), p.y + Math.round(s.y * g.par * 0.4));
      if (k === 5 && E.oiseau) oiseaux(ctx, t);
      const n = E.nappes[k];
      const o = Math.floor((t / 1000) * n.v) % LW;
      const x = -M + Math.round(s.x * n.par) - o, y = n.y + Math.round(s.y * n.par * 0.4);
      ctx.drawImage(n.c, x, y);
      ctx.drawImage(n.c, x + LW, y);
    }
  }
  function oiseaux(ctx, t) {
    ctx.fillStyle = E.oiseau;
    const bx = ((t * 0.005 + W * 0.3) % (W + 90)) - 45, by = H * (E.tel ? 0.3 : 0.135) + Math.sin(t / 7000) * 3;
    for (let i = 0; i < 7; i++) {
      const rang = Math.ceil(i / 2), cote = i % 2 ? 1 : -1;
      const x = Math.round(bx - rang * 6), y = Math.round(by + rang * 3 * cote + Math.sin(t / 2300 + i) * 0.8);
      const haut = Math.floor(t / 720 + i * 0.37) % 2 === 0;
      ctx.fillRect(x + 2, y + 1, 1, 1);
      ctx.fillRect(x + 1, y + (haut ? 0 : 1), 1, 1); ctx.fillRect(x + 3, y + (haut ? 0 : 1), 1, 1);
      ctx.fillRect(x, y + (haut ? -1 : 1), 1, 1); ctx.fillRect(x + 4, y + (haut ? -1 : 1), 1, 1);
    }
  }

  (window.FONDS = window.FONDS || []).push({ id: "p7-nuages", nom: "Au-dessus des nuages", famille: "paysage", credit: null, monter, dessiner });
})();
