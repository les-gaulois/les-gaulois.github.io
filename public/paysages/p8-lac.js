// Site du clan [GAL] (AGPL-3.0-only). Paysage animé du fond de « Mon Gaulois », dessin en cases de Claude Fable 5.2,
// 21 novembre 2026, choisi par le pilote avec les sept autres ; ils tournent toutes les 15 minutes (src/lib/jeu/fonds-du-jeu.ts,
// tenu par src/scripts/jeu.ts). Script classique : il ajoute son fond à window.FONDS, rien d'autre.
// Fond « paysage » de l'écran de jeu Mon Gaulois : p8-lac. Dessin en cases, sans image ni bibliothèque.
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

  // ---- Le lac miroir ----
  const M = 8;
  let W = 0, H = 0, S = false, E = null;

  function monter({ largeur, hauteur, sombre }) {
    W = largeur; H = hauteur; S = sombre;
    const R = alea(8108), tel = W < H, LW = W + 2 * M;
    const hz = Math.round(H * 0.5), hw = H - hz;
    const fx = (f) => M + W * f;
    E = { hz, hw, tel, roseaux: [], lucioles: [] };

    // Tout ce qui se reflète : ciel, astre, montagnes, collines de sapins, rives.
    const T = new Calque(LW, hz);
    degrade(T, 0, hz, S
      ? P("#040716", "#060a1e", "#080e28", "#0a1230", "#0d1840", "#122252", "#1a2f66", "#263f7a", "#34508c")
      : P("#5a96d4", "#77acdf", "#96c2e8", "#b6d5ee", "#d4e4ee", "#eeeade", "#fde2c6", "#fbd0b0", "#f5c0a4"), 0.16);
    const ax = Math.round(fx(tel ? 0.84 : 0.8)), ay = hz - (S ? Math.round(hz * 0.36) : Math.round(hz * 0.24));
    if (S) {
      etoiles(T, R, Math.round((LW * hz) / 60), hz - 4, null);
      lune(T, ax, ay, 10, P("#f4f6ff", "#c6cff0", "#9eabd8", "#2c417c", "#1c2d62"), 14);
    } else {
      const voiles = P("#fff8ee", "#ffe6d0", "#f6ccb8", "#dcaeac", "#bc96ac");
      for (let i = 0; i < Math.max(3, LW / 90); i++) {
        const haut = 3 + R() * 4, larg = 50 + R() * 90;
        nuage(T, borne(R() * LW, larg / 2 + 6, LW - larg / 2 - 6), Math.round(hz * (0.12 + R() * 0.5)), larg, haut, voiles, R, 0.5, -0.8);
      }
      for (let y = ay - 34; y <= ay + 34; y++) for (let x = ax - 34; x <= ax + 34; x++) {
        const d = Math.hypot(x - ax, y - ay);
        if (d <= 7) T.p(x, y, C("#fffdf4"));
        else if (d <= 8.6) T.p(x, y, C("#fff1cf"));
        else if (d <= 34) { const k = 1 - (d - 8.6) / 26; if (k * k > seuil(x, y)) T.p(x, y, k > 0.66 ? C("#fff6e2") : k > 0.36 ? C("#fdebd2") : C("#f8e0cc")); }
      }
    }
    const m1 = S ? P("#445a98", "#2e4080", "#24346e", "#1c2a5e") : P("#f6f6fb", "#c9d2ea", "#b2c0e2", "#a0afd8");
    const m2 = S ? P("#22305e", "#1a2650", "#141e44") : P("#8fa8c4", "#7c98b8", "#6c88aa");
    const sap = S ? P("#1c2c58", "#142048", "#0e183a", "#0a122e") : P("#6a9c8c", "#527f78", "#3f6a68", "#2e5658");
    const cr1 = (x) => hz - 16 - hz * 0.34 * fbm(x * 0.011, 5, 4), cr2 = (x) => hz - 9 - hz * 0.17 * fbm(x * 0.019 + 9, 31, 3);
    // Deux pointes de terre couvertes de sapins, à gauche et à droite, laissent le milieu ouvert.
    const pointe = (x) => {
      const g = Math.max(0, 1 - (x - M) / (W * (tel ? 0.3 : 0.27))), d = Math.max(0, 1 - (M + W - x) / (W * (tel ? 0.22 : 0.17)));
      return hz - 2 - 15 * Math.pow(g, 0.8) * (0.6 + 0.8 * fbm(x * 0.05, 2, 2)) - 12 * Math.pow(d, 0.8) * (0.6 + 0.8 * fbm(x * 0.05, 8, 2));
    };
    for (let x = 0; x < LW; x++) {
      const ya = cr1(x), yb = cr2(x);
      for (let y = Math.floor(ya); y < hz; y++) {
        if (y < yb) {
          const q = fbm((x + (y - ya) * 0.7) * 0.07, y * 0.02, 3);
          T.p(x, y, ton(x, y, (y - ya < 4 + q * 10 ? 0 : 1) + q * 2.2 + (y - ya) / 44, m1, 0.3));
        } else T.p(x, y, ton(x, y, (y - yb) / 12 + fbm(x * 0.1, y * 0.2, 2) * 1.1 - 0.1, m2, 0.3));
      }
    }
    const sapin = (x, pied, h, loin) => {
      for (let k = 0; k < h; k++) {
        const demi = Math.floor(((k % 5) / 5) * 1.6 + (k / h) * h * 0.26);
        for (let dx = -demi; dx <= demi; dx++) T.p(x + dx, pied - h + k, sap[Math.min(3, loin + (dx < 0 ? 0 : 1) + (k % 5 === 4 ? 1 : 0))]);
      }
      T.p(x, pied - h - 1, sap[Math.min(3, loin + 1)]);
    };
    for (let x = 0; x < LW; x += 3) {
      const yb = cr2(x) + 6 + R() * 5;
      if (yb < hz - 3) sapin(x + Math.floor(R() * 3), Math.round(Math.min(hz - 2, yb + 8)), 6 + Math.floor(R() * 5), 1);
    }
    for (let x = 0; x < LW; x++) for (let y = Math.floor(pointe(x)); y < hz; y++) T.p(x, y, sap[2 + ((x + y) & 1 && y > hz - 3 ? 1 : 0)]);
    for (let i = 0; i < LW / 5; i++) {
      const x = Math.floor(R() * LW), p = pointe(x);
      if (p < hz - 4) sapin(x, Math.round(p + 3), 12 + Math.floor(R() * 14 * Math.min(1, (hz - p) / 12)), R() < 0.5 ? 0 : 1);
    }
    // Un liseré clair à la rive.
    for (let x = 0; x < LW; x++) if (hach(x, 3) > 0.35) T.p(x, hz - 1, S ? C("#2c3e76") : C("#e9efe6"));
    E.haut = T.fin();

    // Le reflet : la même image retournée, fondue dans la couleur de l'eau, plus profonde vers nous.
    const B = 6, Rf = new Calque(LW + 2 * B, hw);
    const eau1 = S ? C("#0e1c4e") : C("#86b6d2"), eau2 = S ? C("#081234") : C("#4f8cb6"), trait = S ? C("#27407c") : C("#d6e8f2");
    for (let y = 0; y < hw; y++) {
      const sy = Math.max(0, hz - 1 - Math.round((y * hz) / hw)), u = y / hw, teinte = melC(eau1, eau2, u);
      for (let x = 0; x < Rf.w; x++) {
        const src = T.d[sy * T.w + borne(x - B, 0, LW - 1)];
        let c = melC(src, teinte, 0.2 + 0.42 * u);
        if (hach(x >> 3, y) > 0.93 && u > 0.08) c = melC(c, trait, 0.35);
        Rf.p(x, y, c);
      }
    }
    E.reflet = Rf.fin(); E.B = B; E.astre = { x: ax, bas: hz - ay };

    // La brume qui traîne sur l'eau.
    const cb = S ? P("#34467e", "#27386c") : P("#f5f9f9", "#dde9ee");
    E.brumes = [brume(LW, tel ? 18 : 22, cb, S ? 0.9 : 1.02), brume(LW, tel ? 12 : 16, cb, S ? 0.82 : 0.92)];

    // Le premier plan : les berges, les nénuphars, puis les roseaux en cinq poses.
    const ah = Math.min(hw, 120), A = new Calque(LW, ah), a0 = H - ah;
    const dens = (x) => Math.max(Math.pow(Math.max(0, 1 - (x - M) / (W * (tel ? 0.3 : 0.2))), 0.8), Math.pow(Math.max(0, 1 - (M + W - x) / (W * (tel ? 0.26 : 0.15))), 0.8));
    const berge = S ? P("#1a2a54", "#122044", "#0c1736", "#08102a") : P("#6c9c4a", "#4f803e", "#3a6634", "#2a4e2c");
    for (let x = 0; x < LW; x++) {
      const d = dens(x), haut = d > 0.05 ? 6 + 30 * Math.pow(d, 1.4) + 5 * fbm(x * 0.05, 4, 2) : 0;
      for (let y = Math.round(ah - haut); y < ah; y++) A.p(x, y, ton(x, y + a0, (y - (ah - haut)) / 6 + fbm(x * 0.2, y * 0.3, 2) * 1.5 - 0.2, berge, 0.28));
    }
    const nenu = S ? P("#27446a", "#1a3056", "#b98ac0") : P("#8cc45c", "#5c9a48", "#ff9ec4");
    for (let i = 0; i < (tel ? 9 : 22); i++) {
      const cote = R() < 0.55, x = Math.round(cote ? fx(0.1 + R() * 0.26) : fx(0.6 + R() * 0.26)), y = Math.round(ah - 8 - R() * ah * 0.42), w = 2 + Math.floor(R() * 3 * (y / ah) + 1);
      A.r(x - w, y, 2 * w + 1, 2, nenu[0]); A.r(x - w + 1, y - 1, 2 * w - 1, 1, nenu[0]); A.r(x - w + 1, y + 2, 2 * w - 1, 1, nenu[1]); A.r(x + w - 1, y + 1, 2, 1, nenu[1]);
      A.p(x + 1, y - 1, 0); A.p(x + 1, y, 0);
      if (R() < 0.3 && w > 2) { A.r(x - 2, y - 1, 2, 2, nenu[2]); A.p(x - 2, y - 2, S ? C("#e0c0e8") : C("#ffffff")); }
    }
    E.avant = A.fin(); E.a0 = a0;
    const rh = tel ? 74 : 92, sw = 20;
    const tig = S ? P("#141e44", "#22305e", "#3a4c84") : P("#35602f", "#4f853e", "#79aa50");
    const massette = S ? P("#1c1c3c", "#34305c") : P("#5e3a20", "#8a5a34");
    for (let j = 0; j * sw < LW + sw; j++) {
      const d = dens(j * sw + sw / 2);
      if (d < 0.06) continue;
      const tiges = [];
      for (let k = 0; k < Math.round(2 + d * 7); k++) tiges.push({ x: 6 + R() * sw, h: rh * (0.3 + 0.7 * R()) * (0.45 + 0.55 * d), f: R(), g: R() });
      tiges.sort((a, b) => a.h - b.h);
      const poses = [];
      for (let b = -2; b <= 2; b++) {
        const cal = new Calque(sw + 12, rh + 4), sol = cal.h;
        for (const s of tiges) {
          const n = s.h < rh * 0.45 ? 0 : 1;
          const xo = (k) => Math.round(s.x + b * Math.pow(k / s.h, 2) * (s.h / 30) * 1.3 + (s.g - 0.5) * 7 * Math.pow(k / s.h, 1.5));
          for (let k = 0; k < s.h; k++) cal.p(xo(k), sol - 1 - k, tig[n + (k > s.h * 0.5 && n ? 1 : 0)]);
          // Une feuille longue qui retombe.
          const lf = Math.round(s.h * (0.35 + s.f * 0.3)), sens = s.g > 0.5 ? 1 : -1, ll = 6 + Math.round(s.f * 8);
          for (let q = 1; q <= ll; q++) cal.p(xo(lf) + sens * q, sol - 1 - lf - Math.round(Math.sin((q / ll) * Math.PI * 0.85) * ll * 0.55), tig[n]);
          if (s.f > 0.42 && s.h > rh * 0.35) {
            const k0 = Math.round(s.h * 0.74);
            for (let q = 0; q < 7; q++) { cal.p(xo(k0 + q), sol - 1 - k0 - q, massette[1]); cal.p(xo(k0 + q) + 1, sol - 1 - k0 - q, massette[0]); }
          }
        }
        poses.push(cal.fin());
      }
      E.roseaux.push({ x: j * sw - 6, poses, j });
    }
    E.rh = rh;

    // Le héron, la barque et son pêcheur.
    const ph = S ? { w: C("#aab6e0"), g: C("#5a6aa4"), G: C("#3a4880"), K: C("#0a1030"), y: C("#b89a4a"), l: C("#44508a") } : { w: C("#f4f6fa"), g: C("#a3b3c8"), G: C("#7488a2"), K: C("#2a3040"), y: C("#f2b830"), l: C("#8a7a50") };
    const heron = ["......KK",".....wwwwKK","....wwwwwwKKK","yyyywwKwww...KK","..yyywwww","......www","......www",".......www",".......www","........ww","........www",".......www","......www","......www","......wwww","......wwgggg","......wgggggggg","......ggggggggggg",".......gggGGGGgggg",".......ggGGGGGGGggg","........gGGGGGGGGgg","........ggGGGGGGGGgg",".........gGGGGGGGGgK",".........ggGGGGGGgKK","..........gggggggKK","...........wwwwgK","............l..l","............l..l","............l..l","............l..l","............l..l","...........l...l","...........l...l","...........l...l","...........l...l","...........l...l"].map((l) => l.padEnd(24, "."));
    E.heron = { c: lutin(heron, ph, false), r: lutin(heron.slice().reverse(), ph, false), x: Math.round(fx(tel ? 0.62 : 0.72)), y: hz + Math.round(hw * 0.58), h: heron.length };
    const pb = S ? { h: C("#6a3c40"), s: C("#8f86a8"), t: C("#27469c"), a: C("#8f86a8"), r: C("#2a3466"), B: C("#56649a"), b: C("#2a3466"), L: C("#ffd98a") } : { h: C("#c8632a"), s: C("#f0c8a0"), t: C("#3466d8"), a: C("#f0c8a0"), r: C("#6e4a2a"), B: C("#c0915a"), b: C("#7c5630"), L: C("#7c5630") };
    const barque = ["...........................r","..............hh..........r",".............hhhh........r",".............ssss.......r","............tttttt.....r","............ttttttaaaar","..L.........tttttt","BBL.........tttttt.............BB",".BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB","..bbBbbbbbbbbbbbbbbbbbbbbbbbbbb","...bbbbbbbbbbbbbbbbbbbbbbbbbbb","....bbbbbbbbbbbbbbbbbbbbbbbbb"].map((l) => l.padEnd(34, "."));
    E.barque = { c: lutin(barque, pb, false), r: lutin(barque.slice().reverse(), pb, false) };
    for (let k = 0; k < (tel ? 6 : 14); k++) {
      const g = R() < 0.5;
      E.lucioles.push({ x: g ? W * R() * 0.22 : W * (0.82 + R() * 0.18), y: H - 14 - R() * rh * 0.8, ph: R() * 6.28, v: 2400 + R() * 2000 });
    }
  }

  function dessiner(ctx, t, s) {
    if (!E) return;
    if (!(t > 0)) t = 0;
    const LW = W + 2 * M, hz = E.hz, hw = E.hw, p2 = Math.round(s.x * 2), p3 = Math.round(s.x * 3), p5 = Math.round(s.x * 5);
    ctx.drawImage(E.haut, -M + p2, 0);
    // L'eau : le reflet, rang par rang, que la houle décale un peu.
    for (let y = 0; y < hw; ) {
      const h = y < hw * 0.35 ? 1 : 2, u = y / hw;
      const dx = Math.round(Math.sin(t / 1500 + y * 0.42 + Math.sin(y * 0.11) * 2) * (0.35 + 2.3 * u));
      ctx.drawImage(E.reflet, E.B + dx, y, LW, h, -M + p2, hz + y, LW, h);
      y += h;
    }
    // La traînée de lumière de l'astre sur l'eau.
    ctx.fillStyle = S ? "#e2eaff" : "#fff8e4";
    const cx = E.astre.x - M + p2;
    for (let y = Math.max(2, E.astre.bas - 12); y < hw * 0.92; y += 2) {
      const u = (y - E.astre.bas + 12) / hw, k = 0.5 + 0.5 * Math.sin(t / 1100 + y * 1.3), w = Math.round((2 + y * 0.085) * (0.35 + 0.65 * k));
      if (w < 1) continue;
      ctx.globalAlpha = (S ? 0.8 : 0.7) * Math.max(0, 1 - u * 1.05) * (0.55 + 0.45 * k);
      ctx.fillRect(cx - w + Math.round(Math.sin(t / 1900 + y * 0.5) * 2), hz + y, w * 2, 1);
    }
    ctx.globalAlpha = 1;
    for (let i = 0; i < 2; i++) {
      const o = Math.floor((t / 1000) * (i ? 2.1 : 1.1)) % LW, x = -M + p3 + (i ? o - LW : -o), y = hz + (i ? 5 : -13);
      ctx.drawImage(E.brumes[i], x, y); ctx.drawImage(E.brumes[i], x + LW, y);
    }
    // Un rond dans l'eau, de loin en loin.
    const n = Math.floor(t / 11000), u = (t % 11000) / 6000;
    if (u < 1) {
      const rx = W * (0.25 + 0.5 * hach(n, 4)), ry = hz + hw * (0.3 + 0.4 * hach(n, 5)), r = 2 + u * 12;
      ctx.fillStyle = S ? "#8fa6dc" : "#ffffff";
      ctx.globalAlpha = (1 - u) * 0.7;
      for (let a = 0; a < 28; a++) if (a % 4 !== 3) ctx.fillRect(Math.round(rx + Math.cos((a / 28) * 6.283) * r), Math.round(ry + Math.sin((a / 28) * 6.283) * r * 0.32), 1, 1);
      ctx.globalAlpha = 1;
    }
    // La barque qui glisse, son reflet, sa ligne.
    const b = E.barque, bx = Math.round(((t * 0.0042 + W * 0.3) % (W + 90)) - 45) + p3, by = hz + Math.round(hw * 0.64) + Math.round(Math.sin(t / 1900) * 0.6);
    ctx.globalAlpha = 0.42; ctx.drawImage(b.r, bx + Math.round(Math.sin(t / 1500) * 1), by + 1); ctx.globalAlpha = 1;
    ctx.drawImage(b.c, bx, by - 12);
    ctx.fillStyle = S ? "#8fa6dc" : "#f4f8fa";
    ctx.globalAlpha = 0.6; ctx.fillRect(bx + 27, by - 12, 1, 14); ctx.fillRect(bx - 11, by, 9, 1); ctx.fillRect(bx - 20, by + 2, 6, 1);
    ctx.globalAlpha = 1; ctx.fillStyle = "#e23b3b"; ctx.fillRect(bx + 27, by + 1, 1, 1);
    // Le héron, immobile, les pattes dans l'eau.
    const h = E.heron;
    ctx.globalAlpha = 0.4; ctx.drawImage(h.r, h.x - M + p3 + Math.round(Math.sin(t / 1500 + 2) * 1), h.y); ctx.globalAlpha = 1;
    ctx.drawImage(h.c, h.x - M + p3, h.y - h.h);
    const ay = E.a0 + Math.round(s.y * 3) + 3;
    ctx.drawImage(E.avant, -M + p5, ay);
    for (const r of E.roseaux) ctx.drawImage(r.poses[Math.round(2 + 2 * Math.sin(t / 2300 - r.j * 0.45))], r.x - M + p5, H - E.rh - 4 + Math.round(s.y * 3) + 2);
    if (S) {
      ctx.fillStyle = "#eaffa0";
      for (const l of E.lucioles) {
        const a = Math.sin(t / l.v + l.ph);
        if (a <= 0) continue;
        ctx.globalAlpha = a * a * 0.9;
        ctx.fillRect(Math.round(l.x + Math.sin(t / 5100 + l.ph) * 9) + p5, Math.round(l.y + Math.cos(t / 6300 + l.ph * 2) * 5), 1, 1);
      }
      ctx.globalAlpha = 1;
    }
  }

  (window.FONDS = window.FONDS || []).push({ id: "p8-lac", nom: "Le lac miroir", famille: "paysage", credit: null, monter, dessiner });
})();
