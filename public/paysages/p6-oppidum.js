// Site du clan [GAL] (AGPL-3.0-only). Paysage animé du fond de « Mon Gaulois », dessin en cases de Claude Fable 5.2,
// 21 novembre 2026, choisi par le pilote avec les sept autres ; ils tournent toutes les 15 minutes (src/lib/jeu/fonds-du-jeu.ts,
// tenu par src/scripts/jeu.ts). Script classique : il ajoute son fond à window.FONDS, rien d'autre.
// Fond « paysage » de l'écran de jeu Mon Gaulois : p6-oppidum. Dessin en cases, sans image ni bibliothèque.
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

  // ---- La cité sur la colline ----
  const M = 8;
  let W = 0, H = 0, S = false, E = null;
  const LETTRES = {
    "[": ["111", "100", "100", "100", "100", "100", "111"], G: ["01110", "10001", "10000", "10111", "10001", "10001", "01110"], A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
    L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"], "]": ["111", "001", "001", "001", "001", "001", "111"],
  };

  function monter({ largeur, hauteur, sombre }) {
    W = largeur; H = hauteur; S = sombre;
    const R = alea(6106), tel = W < H, LW = W + 2 * M;
    const hz = Math.round(H * 0.5);
    const nuit = (c, k) => (S ? mel(c, "#0a2070", k === undefined ? 0.74 : k) : c);
    const N = (...h) => P(...h.map((c) => nuit(c)));
    const fx = (f) => M + W * f;
    E = { hz, tel, fumees: [], fanions: [], torches: [], reflets: [] };

    // Le ciel du matin, ou la nuit étoilée.
    const ciel = new Calque(LW, hz + 30);
    degrade(ciel, 0, hz + 30, S
      ? P("#040716", "#060a1e", "#080e28", "#0a1230", "#0d1840", "#122252", "#1a2f66", "#263f7a", "#34508c")
      : P("#3572c8", "#4a88d6", "#63a0e2", "#82b8ec", "#a4cdf2", "#c4dff6", "#deecf4", "#f2f0e2", "#fbeccc"), 0.16);
    if (S) {
      etoiles(ciel, R, Math.round((LW * hz) / 70), hz, null);
      lune(ciel, Math.round(fx(tel ? 0.14 : 0.2)), Math.round(H * 0.2), 10, P("#f4f6ff", "#c6cff0", "#9eabd8", "#2c417c", "#1c2d62"), 13);
    }
    // Les montagnes au loin : deux crêtes, un peu de neige.
    const m1 = S ? P("#3a4c86", "#2c3c74", "#223064", "#1a2654") : P("#eef4fc", "#b4c6e6", "#9cb2da", "#8aa2cf");
    const m2 = S ? P("#22305e", "#1a2650", "#141e44") : P("#8fb0c0", "#7c9fae", "#6a8e9c");
    for (let x = 0; x < LW; x++) {
      const ya = hz - 12 - 40 * fbm(x * 0.012, 5, 4), yb = hz - 4 - 22 * fbm(x * 0.021 + 9, 31, 3);
      for (let y = Math.floor(ya); y < hz + 30; y++) {
        if (y < yb) {
          const q = fbm((x + (y - ya) * 0.7) * 0.07, y * 0.02, 3);
          ciel.p(x, y, ton(x, y, (y - ya < 5 + q * 9 ? 0 : 1) + q * 2.2 + (y - ya) / 40, m1, 0.3));
        } else ciel.p(x, y, ton(x, y, (y - yb) / 9 + fbm(x * 0.15, y * 0.3, 2) * 1.2 - 0.2, m2, 0.3));
      }
    }
    E.ciel = ciel.fin();
    const tn = S ? P("#b4c0e8", "#7485bc", "#47578f", "#2b386a", "#1c2650") : P("#ffffff", "#f4f8fd", "#dbe7f5", "#b9cdea", "#9ab3da");
    E.nuages = [];
    for (const [nb, h0, h1, y0, y1, v] of [[LW / 120, 4, 8, 0.5, 0.8, 1], [LW / 200, 11, 19, 0.14, 0.42, 2.2]]) {
      const cal = new Calque(LW, hz), q = Math.max(2, Math.round(nb));
      for (let i = 0; i < q; i++) {
        const haut = h0 + R() * (h1 - h0), larg = Math.min(LW * 0.45, haut * (3.2 + R() * 3.4));
        nuage(cal, borne(((i + 0.2 + R() * 0.6) / q) * LW, larg / 2 + haut, LW - larg / 2 - haut), Math.round(hz * (y0 + R() * (y1 - y0))), larg, haut, tn, R, -0.6, -0.8);
      }
      E.nuages.push({ c: cal.fin(), v });
    }

    // Le terrain : collines boisées, plaine, rivière, colline de la cité.
    const D = new Calque(LW, H);
    const xa = fx(0.5), xb = fx(0.88), yp = Math.round(H * 0.25), xl = fx(0.22), xr = fx(1.12), yr = H * 0.5;
    const ease = (u) => (1 - Math.cos(Math.PI * borne(u, 0, 1))) / 2;
    const val = (x) => hz + 5 + 4 * fbm(x * 0.02, 77, 2);
    const prof = (x) => (x < xa ? yp + (hz + 12 - yp) * ease((xa - x) / (xa - xl)) : x > xb ? yp + (yr - yp) * ease((x - xb) / (xr - xb)) : yp - 3 * Math.sin((Math.PI * (x - xa)) / (xb - xa)));
    const bois = S ? P("#2c4674", "#233a64", "#1b2e54", "#142446", "#0f1b3a") : P("#8fba62", "#6fa456", "#548c4c", "#3f7444", "#2f5e3c");
    const pre = S ? P("#4a6c9c", "#3a5a8a", "#2e4a78", "#243c66", "#1c3056") : P("#c4de70", "#a6cf60", "#88b954", "#6ea24a", "#588a42");
    const champs = [N("#b2d466", "#9cc65a"), N("#8fbc56", "#7aa94c"), N("#a6cc5e", "#90b852"), N("#ecd27a", "#d9b85a"), N("#d6dc84", "#c2c86c"), N("#7ea64a", "#6c9442")];
    const haie = N("#4f7c3c", "#3c6634");
    const vpx = LW * 0.4;
    for (let x = 0; x < LW; x++) {
      const yv = val(x), yh = prof(x), yc = hz - 3 - 15 * fbm(x * 0.018, 12, 3);
      const estColline = yh < yv - 1, sol = Math.min(yv, yh);
      const part = estColline ? (yv - yh) / (yv - yp) : 0;
      const pied = yv + (H * 0.62 - yv) * Math.pow(part, 0.7);
      const pente = prof(x + 2) - prof(x - 2);
      for (let y = Math.floor(Math.min(yc, sol)); y < H; y++) {
        let c;
        if (y < sol) c = ton(x, y, (y - yc) / 7 + fbm(x * 0.35, y * 0.5, 2) * 2.2 - 0.3, bois, 0.25);
        else if (estColline && y < pied) {
          const d = y - yh, k = d / Math.max(1, pied - yh);
          let f = 1.5 + borne(pente * 0.55, -1.2, 1.5) * (1 - k * 0.7) + (fbm(x * 0.06, y * 0.09, 3) - 0.5) * 1.9 + k * 0.5;
          c = ton(x, y, borne(f, 0, 4), pre, 0.28);
          if (d < 3 + fbm(x * 0.2, 1, 2) * 5 && x > xa - 4 && x < xb + 6) c = ton(x, y, d * 0.5 + hach(x, y) * 0.8, N("#d8ccae", "#b9a98c", "#93846e"), 0.3);
        } else {
          const s = Math.max(0.04, (y - hz) / (H - hz) + (fbm(x * 0.009, 3, 2) - 0.5) * 0.09), X = vpx + (x - vpx) / s;
          const j = Math.min(5, Math.floor(Math.pow(s, 0.55) * 6)), cw = 150 + j * 30, f = X / cw + j * 0.41, cel = Math.floor(f);
          const ty = champs[Math.floor(hach(cel, j * 5 + 1) * champs.length)];
          c = ton(x, y, (Math.floor(X / 3) & 1) * 0.6 + fbm(x * 0.12, y * 0.3, 2) * 0.7, ty, 0.25);
          const jv = Math.min(5, Math.floor(Math.pow(Math.max(0.04, s - 1 / (H - hz)), 0.55) * 6));
          if ((f - cel) * cw * s < 1 || jv !== j) c = haie[(x + y) & 1];
        }
        D.p(x, y, c);
      }
    }
    // La rivière, en lacets dans la plaine à gauche.
    const eau = S ? P("#6f8fd6", "#4666b0", "#2c4688") : P("#c8ecfa", "#8fcaee", "#62a6da");
    const riv = lisser([[-0.03, 0.53], [0.09, 0.545], [0.2, 0.565], [0.285, 0.61], [0.26, 0.665], [0.16, 0.7], [0.07, 0.745], [0.12, 0.81], [0.2, 0.86], [0.16, 0.95], [0.1, 1.05]].map(([a, b]) => [fx(a), H * b]), 3);
    for (const passe of [1, 0]) riv.forEach(([x, y], i) => {
      const u = i / riv.length, w = 1 + 7 * u * u + 2 * u;
      for (let dy = -Math.ceil(w * 0.6) - 1; dy <= w * 0.6 + 1; dy++) for (let dx = -Math.ceil(w) - 1; dx <= w + 1; dx++) {
        const d = Math.hypot(dx / w, dy / (w * 0.6));
        if (passe ? d <= 1 + 1.2 / w : d <= 1) D.p(x + dx, y + dy, passe ? haie[1] : ton(Math.round(x + dx), Math.round(y + dy), d * 1.6 + (((y + dy) | 0) & 1) * 0.5, eau, 0.2));
      }
      if (passe && i % 37 === 9 && u > 0.2) E.reflets.push({ x: Math.round(x), y: Math.round(y), ph: i });
    });
    // Des arbres dans la plaine.
    const feuilles = N("#b4d066", "#8cb650", "#649644", "#447838", "#2e5c34");
    const arbre = (cal, x, pied, larg, haut) => {
      cal.r(x, pied - Math.round(haut * 0.45), 1 + (haut > 10 ? 1 : 0), Math.round(haut * 0.45), N("#5a3c26")[0]);
      nuage(cal, x, pied - Math.round(haut * 0.3), larg, haut, feuilles, R, -0.7, -0.7);
    };
    for (let i = 0; i < LW / 14; i++) {
      const x = Math.floor(R() * LW), s = Math.pow(R(), 1.4), y = Math.round(hz + 10 + s * (H - hz) * 0.7);
      const surColline = prof(x) < val(x) - 2 && y < H * 0.62;
      if (surColline && (y < prof(x) + 14 || R() < 0.55)) continue;
      arbre(D, x, y, 5 + s * 12 + R() * 4, 3 + s * 8);
    }
    // Des moutons sur le versant, par petits troupeaux.
    const laine = S ? P("#aab6e0", "#1a2250") : P("#fffaf0", "#3a3030");
    for (let i = 0; i < Math.max(2, W / 150); i++) {
      const cx = xa + R() * (xb - xa) * 0.9 - (xb - xa) * 0.15, cy = prof(cx) + 22 + R() * (H * 0.5 - prof(cx)) * 0.7;
      if (cy < prof(cx) + 14) continue;
      for (let k = 0; k < 6; k++) {
        const x = Math.round(cx + (R() - 0.5) * 26), y = Math.round(cy + (R() - 0.5) * 10);
        D.r(x, y, 2, 1, laine[0]); D.p(x + (k & 1 ? 2 : -1), y, laine[1]);
      }
    }

    // La cité : deux rangs de toits de chaume, la grande halle, puis le rempart et ses tours.
    const chaume = N("#f0d27a", "#d6ae54", "#ae863c", "#806030"), torchis = N("#f0e6cc", "#c8b896");
    const cret = (x) => Math.round(prof(x));
    const toit = (x, base, w, h) => {
      for (let k = 0; k <= h; k++) for (let dx = -Math.round((k / h) * w / 2); dx <= Math.round((k / h) * w / 2); dx++) {
        D.p(x + dx, base - h + k, chaume[(dx < -1 ? 0 : dx < w * 0.12 ? 1 : 2) + ((k & 1) && dx > -w * 0.3 ? 1 : 0)]);
      }
      D.r(x - Math.round(w / 2) + 1, base + 1, w - 2, 2, torchis[1]); D.r(x - Math.round(w / 2) + 1, base + 1, Math.round(w / 2), 2, torchis[0]);
    };
    const larg = xb - xa;
    for (let i = 0; i < larg / 9; i++) {
      const x = Math.round(xa + 12 + R() * (larg - 26)), u = (x - xa) / larg, w = 7 + Math.floor(R() * 5);
      toit(x, cret(x) - 13 - Math.round(7 * Math.sin(Math.PI * u)) - Math.floor(R() * 3), w, Math.round(w * 0.7));
      if (R() < 0.3) arbre(D, x + 7, cret(x) - 12, 6, 5);
    }
    const hx = Math.round(xa + larg * 0.46), hb = cret(hx) - 12;
    for (let k = 0; k <= 13; k++) for (let dx = -k - 3; dx <= k + 3; dx++) D.p(hx + dx, hb - 13 + k, chaume[(dx < 0 ? 0 : 2) + (k & 1)]);
    D.r(hx - 15, hb + 1, 31, 3, torchis[1]); D.r(hx - 15, hb + 1, 15, 3, torchis[0]);
    D.r(hx, hb - 19, 1, 6, N("#5a3c26")[0]);
    for (let i = 0; i < larg / 13; i++) {
      const x = Math.round(xa + 10 + ((i + 0.2 + R() * 0.6) / (larg / 13)) * (larg - 22)), w = 9 + Math.floor(R() * 6);
      toit(x, cret(x) - 11 - Math.floor(R() * 2), w, Math.round(w * 0.72));
      if (i % 3 === 1) E.fumees.push({ x, y: cret(x) - 13 - Math.round(w * 0.72), ph: R() });
    }
    E.fumees.push({ x: hx + 5, y: hb - 9, ph: 0.4 });
    // Le rempart : parement de pierre, bouts de poutres, palissade.
    const pierre = S ? P("#7f8fbe", "#5c6da2", "#404f86", "#2a3668") : P("#f2e8cc", "#d8cbac", "#b4a488", "#8c7c68");
    const poutre = S ? C("#1a2148") : C("#6a4a2e"), pieu = S ? P("#4a5890", "#2e3a6c", "#1c2552") : P("#c08a4a", "#94642f", "#6a4424");
    const x0 = Math.round(xa + 5), x1 = Math.round(xb - 3);
    for (let x = x0; x <= x1; x++) {
      const b = cret(x) + 2;
      for (let k = 0; k < 8; k++) {
        const y = b - k;
        let c = ton(x, y, (k === 7 ? 0 : k < 2 ? 2.2 : 1) + (hach(x >> 2, k >> 1) - 0.5) * 1.3 + (x - x0) / (x1 - x0) * 0.8, pierre, 0.3);
        if (x % 5 === 2 && k % 3 === 1) c = poutre;
        D.p(x, y, c);
      }
      const h = 3 + (x & 1);
      for (let k = 0; k < h; k++) D.p(x, b - 8 - k, pieu[x % 3 === 0 ? 1 : k === h - 1 ? 0 : (x + k) & 1]);
    }
    // Les tours de guet, la porte à droite.
    const tour = (x, h, drapeau) => {
      const b = cret(x) + 2;
      for (let k = 0; k < h; k++) for (let dx = -4; dx <= 4; dx++) {
        let c = pieu[Math.abs(dx) === 4 ? 2 : k % 4 === 0 ? 2 : dx < 0 ? 0 : 1];
        if (k >= h - 5 && k < h - 2 && Math.abs(dx) < 4) c = Math.abs(dx) === 1 ? pieu[1] : S ? C("#0c1230") : C("#3a2616");
        D.p(x + dx, b - k, c);
      }
      for (let k = 0; k < 6; k++) for (let dx = -k - 1; dx <= k + 1; dx++) D.p(x + dx, b - h - 5 + k, chaume[(dx < 0 ? 0 : 2) + (k & 1)]);
      E.torches.push({ x, y: b - h + 3 });
      if (drapeau !== undefined) { D.r(x, b - h - 12, 1, 7, pieu[2]); E.fanions.push({ x: x + 1, y: b - h - 12, c: drapeau }); }
    };
    const nt = Math.max(2, Math.round((x1 - x0) / 46));
    const gx = x1 - 12;
    for (let i = 0; i < nt; i++) tour(Math.round(x0 + 5 + (i / nt) * (gx - 12 - x0 - 5)), 19 + (i % 2) * 2, i % 2 ? undefined : i % 4);
    tour(gx - 8, 22, 1); tour(gx + 8, 22, undefined);
    D.r(gx - 3, cret(gx) - 7, 7, 10, S ? C("#0c1230") : C("#3a2616")); D.r(gx - 4, cret(gx) - 8, 9, 1, pieu[2]);
    D.r(gx - 3, cret(gx) - 13, 7, 2, pieu[1]);
    for (let x = x0 + 8; x < x1 - 30; x += 17) E.torches.push({ x, y: cret(x) - 8 });
    E.torches.push({ x: gx - 4, y: cret(gx) - 4 }, { x: gx + 4, y: cret(gx) - 4 });

    // La route : de la porte, en lacets sur le versant, puis à travers la plaine.
    const route = lisser([[gx, cret(gx) + 3], [fx(0.985), H * 0.35], [fx(0.875), H * 0.45], [fx(0.985), H * 0.57], [fx(0.8), H * 0.71], [fx(0.56), H * 0.8], [fx(0.36), H * 0.875], [fx(0.2), H * 1.04]].map(([a, b]) => [a, b]), 3);
    const rc = S ? P("#8c98c4", "#6a78aa", "#4c5a8e") : P("#f6e6b8", "#e2ca94", "#c0a470");
    const lr = (y) => 0.9 + 4.6 * Math.pow(borne((y - yp) / (H - yp), 0, 1), 1.25);
    for (const passe of [1, 0]) for (const [x, y] of route) {
      const w = lr(y) + passe * 0.9;
      for (let dy = -Math.ceil(w * 0.55); dy <= w * 0.55; dy++) for (let dx = -Math.ceil(w); dx <= w; dx++) {
        if (Math.hypot(dx / w, dy / (w * 0.55)) <= 1) D.p(x + dx, y + dy, passe ? rc[2] : ton(Math.round(x + dx), Math.round(y + dy), fbm((x + dx) * 0.3, (y + dy) * 0.4, 2) * 1.7 - 0.2, rc, 0.3));
      }
    }
    // Le temps de parcours le long de la route : plus lent au loin, comme vu de loin.
    let cumul = 0;
    E.route = route.map(([x, y]) => { cumul += 1 / (1.6 + lr(y) * 1.1); return { x, y, T: cumul, g: lr(y) > 2.6 }; });
    E.duree = cumul;
    // La nuit : torches sur le rempart, leur lueur fixe sur la pierre et le bois.
    if (S) {
      const chaud = C("#ffb054");
      for (const q of E.torches) {
        for (let dy = -6; dy <= 6; dy++) for (let dx = -6; dx <= 6; dx++) {
          const d = Math.hypot(dx, dy), c = D.g(q.x + dx, q.y + dy);
          if (d <= 6 && c) D.p(q.x + dx, q.y + dy, melC(c, chaud, Math.pow(1 - d / 6.5, 1.3) * 0.62));
        }
        D.p(q.x, q.y, C("#ffe9a8")); D.p(q.x, q.y - 1, C("#ffc15e")); D.p(q.x, q.y + 1, C("#e07a2c"));
      }
    }
    E.terrain = D.fin();

    // La brume du matin dans la vallée.
    const cb = S ? P("#3a4e88", "#2c3e76") : P("#ffffff", "#e4f0f8");
    E.brume = brume(LW, tel ? 16 : 20, cb, 0.92);

    // Le premier plan : un talus sombre, des buissons, et l'étendard planté sur sa butte.
    const A = new Calque(LW, 100), ay = H - 100;
    const herbe = S ? P("#243a5c", "#1a2c4e", "#122040", "#0c1634") : P("#6ca844", "#52903a", "#3d7632", "#2c5c2a");
    const bx = Math.round(fx(tel ? 0.13 : 0.07));
    const talus = (x) => 86 - 9 * fbm(x * 0.025, 40, 3) - 30 * Math.exp(-Math.pow((x - bx) / (W * (tel ? 0.16 : 0.075)), 2));
    for (let x = 0; x < LW; x++) {
      const y0 = Math.round(talus(x)) - (hach(x, 9) > 0.6 ? 2 : hach(x, 9) > 0.3 ? 1 : 0);
      for (let y = y0; y < 100; y++) A.p(x, y, ton(x, y + ay, (y - talus(x)) / 7 + fbm(x * 0.2, y * 0.3, 2) * 1.6 - 0.2, herbe, 0.28));
      if (hach(x, 4) > 0.93) A.p(x, y0 + 2, S ? C("#5a6cae") : hach(x, 5) > 0.5 ? C("#fff2a8") : C("#ffffff"));
    }
    const sombres = S ? P("#2c4468", "#22365a", "#182a4c", "#102040", "#0a1634") : P("#86b84e", "#629c40", "#467e36", "#32642e", "#234c28");
    for (let i = 0; i < LW / 60; i++) {
      const x = Math.floor(fx(0.3) + R() * W * 0.75);
      nuage(A, x, Math.round(talus(x)) + 3, 14 + R() * 18, 7 + R() * 6, sombres, R, -0.7, -0.7);
    }
    const py = Math.round(talus(bx)), ph = tel ? 46 : 56;
    const mat = S ? P("#56649a", "#2a3466") : P("#b98a52", "#6e4a2a");
    A.r(bx, py - ph, 1, ph + 2, mat[0]); A.r(bx + 1, py - ph, 1, ph + 2, mat[1]);
    A.r(bx - 1, py - ph - 3, 4, 3, S ? C("#c9b060") : C("#f2c230")); A.p(bx, py - ph - 2, S ? C("#fff0b0") : C("#fff6c8"));
    E.avant = A.fin(); E.ay = ay;
    // L'étendard [GAL], en huit poses d'une ondulation lente.
    const drap = S ? P("#27469c", "#1c3478", "#c9d4f4", "#b89a4a") : P("#3466d8", "#2450b4", "#fff6dc", "#f2c230");
    E.etendard = [];
    for (let i = 0; i < 8; i++) {
      const cal = new Calque(33, 19);
      const onde = (x) => Math.round(Math.sin((x / 31) * 4.2 - (i / 8) * Math.PI * 2) * (x / 31) * 1.6) + 3;
      for (let x = 0; x < 31; x++) {
        const a = (x / 31) * 4.2 - (i / 8) * Math.PI * 2, dy = onde(x);
        const ombre = Math.cos(a) > 0.35 ? 1 : 0;
        for (let y = 0; y < 13; y++) cal.p(x, y + dy, y === 0 || y === 12 || x === 30 ? drap[3] : drap[ombre]);
      }
      let x = 3;
      for (const l of "[GAL]") {
        const g = LETTRES[l];
        for (let j = 0; j < 7; j++) for (let k = 0; k < g[j].length; k++) if (g[j][k] === "1") cal.p(x + k, 3 + j + onde(x + k), drap[2]);
        x += g[0].length + 1;
      }
      E.etendard.push(cal.fin());
    }
    E.mat = { x: bx + 2, y: ay + py - ph - 2 };
    // Les chariots à bœufs, vus de près et de loin.
    const pc = S ? { h: C("#6f7fb6"), b: C("#2a3466"), o: C("#56649a"), k: C("#0c1230"), y: C("#ffd98a") } : { h: C("#f0d27a"), b: C("#8a5a30"), o: C("#f4ecd8"), k: C("#3a2616"), y: C("#6e4a2a") };
    const pres = ["..hhhh......", ".hhhhhh...o.", "bbbbbbb.oooo", "bbbbbbbyoooo", ".kk.kk..o.o.", ".kk.kk..o.o."], loin = ["hhh...", "bbbyoo", ".k..oo"];
    E.chariots = { pres: [lutin(pres, pc, false), lutin(pres, pc, true)], loin: [lutin(loin, pc, false), lutin(loin, pc, true)] };
  }

  function dessiner(ctx, t, s) {
    if (!E) return;
    if (!(t > 0)) t = 0;
    const LW = W + 2 * M, p1 = Math.round(s.x), p3 = Math.round(s.x * 3), p5 = Math.round(s.x * 5), q3 = Math.round(s.y * 1.5);
    ctx.drawImage(E.ciel, -M + p1, 0);
    for (const n of E.nuages) {
      const o = Math.floor((t / 1000) * n.v) % LW, x = -M + p1 + o;
      ctx.drawImage(n.c, x, 0); ctx.drawImage(n.c, x - LW, 0);
    }
    const tx = -M + p3;
    const ob = Math.floor((t / 1000) * 0.8) % LW;
    ctx.drawImage(E.brume, -M + p1 - ob, E.hz - 18); ctx.drawImage(E.brume, -M + p1 - ob + LW, E.hz - 18);
    ctx.drawImage(E.terrain, tx, q3);
    // Les fumées des foyers, qui montent et se défont.
    ctx.fillStyle = S ? "#8f9cc8" : "#fbf7ec";
    for (const f of E.fumees) for (let i = 0; i < 7; i++) {
      const a = (t / 11000 + i / 7 + f.ph) % 1, g = 1 + Math.floor(a * 3.2);
      ctx.globalAlpha = (1 - a) * 0.8 * Math.min(1, a * 7);
      ctx.fillRect(Math.round(f.x + tx + Math.sin(a * 5 + f.ph * 9) * 2.5 * a + a * 9), Math.round(f.y + q3 - a * 40), g, Math.max(1, g - 1));
    }
    ctx.globalAlpha = 1;
    // Les fanions des tours.
    const teintes = S ? ["#8a3a48", "#b89a4a", "#3a58b0", "#8a3a48"] : ["#e23b3b", "#f2c230", "#3466d8", "#e23b3b"];
    for (const f of E.fanions) {
      const k = Math.floor(t / 900 + f.x) % 2;
      ctx.fillStyle = teintes[f.c];
      ctx.fillRect(f.x + tx, f.y + q3, 3, 3); ctx.fillRect(f.x + tx + 3, f.y + q3 + k, 2, 2);
    }
    // Les reflets de la rivière, lents.
    ctx.fillStyle = S ? "#a9bcf0" : "#ffffff";
    for (const r of E.reflets) {
      const a = Math.sin(t / 2600 + r.ph);
      if (a > 0) { ctx.globalAlpha = a * 0.85; ctx.fillRect(r.x + tx + (a > 0.6 ? -1 : 0), r.y + q3, a > 0.6 ? 3 : 2, 1); }
    }
    ctx.globalAlpha = 1;
    // Les chariots sur la route.
    for (let i = 0; i < 4; i++) {
      const sens = i % 2 === 0, tau = ((t / 1000) * 0.9 + (i / 4 + 0.07) * E.duree) % E.duree, cible = sens ? tau : E.duree - tau;
      let a = 0, b = E.route.length - 1;
      while (a < b) { const m = (a + b) >> 1; if (E.route[m].T < cible) a = m + 1; else b = m; }
      const p = E.route[a], q = E.route[Math.min(E.route.length - 1, a + 3)];
      const versDroite = (q.x >= p.x) === sens;
      const img = (p.g ? E.chariots.pres : E.chariots.loin)[versDroite ? 0 : 1];
      ctx.drawImage(img, Math.round(p.x - img.width / 2) + tx, Math.round(p.y - img.height + 1) + q3);
    }
    if (!S) {
      ctx.fillStyle = "#33405c";
      for (let i = 0; i < 4; i++) {
        const x = Math.round(((t * (0.008 + i * 0.0015) + W * (0.2 + i * 0.21)) % (W + 60)) - 30);
        const y = Math.round(H * (0.09 + i * 0.022) + Math.sin(t / 3100 + i * 2) * 4);
        const haut = Math.floor(t / 640 + i * 0.4) % 3 === 0;
        ctx.fillRect(x + 2, y, 1, 1);
        ctx.fillRect(x, y + (haut ? -1 : 1), 2, 1); ctx.fillRect(x + 3, y + (haut ? -1 : 1), 2, 1);
      }
    }
    const ax = -M + p5, ay = E.ay + Math.round(s.y * 3) + 3;
    ctx.drawImage(E.avant, ax, ay);
    ctx.drawImage(E.etendard[Math.floor(t / 300) % 8], E.mat.x + ax, E.mat.y - E.ay + ay);
  }

  (window.FONDS = window.FONDS || []).push({ id: "p6-oppidum", nom: "La cité sur la colline", famille: "paysage", credit: null, monter, dessiner });
})();
