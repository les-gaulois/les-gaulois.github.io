// Site du clan [GAL] (AGPL-3.0-only). Paysage animé du fond de « Mon Gaulois », dessin en cases de Claude Fable 5.2,
// 21 novembre 2026, choisi par le pilote avec les sept autres ; ils tournent toutes les 15 minutes (src/lib/jeu/fonds-du-jeu.ts,
// tenu par src/scripts/jeu.ts). Script classique : il ajoute son fond à window.FONDS, rien d'autre.
// Fond « paysage » de l'écran de jeu Mon Gaulois : p5-plaine. Dessin en cases, sans image ni bibliothèque.
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

  // ---- La plaine dorée ----
  const M = 8;
  let W = 0, H = 0, S = false, E = null;

  function monter({ largeur, hauteur, sombre }) {
    W = largeur; H = hauteur; S = sombre;
    const R = alea(5105), tel = W < H, LW = W + 2 * M;
    const hz = Math.round(H * 0.55);
    const nuit = (c, k) => (S ? mel(c, "#141d48", k === undefined ? 0.62 : k) : c);
    const N = (...h) => P(...h.map((c) => nuit(c)));
    E = { hz, tel, rangs: [], brins: [], lucioles: [] };

    // Le ciel de fin d'après-midi, ou la nuit profonde.
    const ciel = new Calque(LW, hz + 6);
    degrade(ciel, 0, hz + 6, S
      ? P("#040716", "#060a1e", "#080e28", "#0a1230", "#0d1840", "#122252", "#1a2f66", "#263f7a", "#34508c")
      : P("#2f5fb2", "#4175c4", "#5b8dd2", "#80a7dc", "#a9bfdc", "#d3cfc6", "#f2d7a4", "#ffd283", "#ffbf68", "#ffb05c"), 0.16);
    const ax = Math.round(M + W * (tel ? 0.13 : 0.225)), ay = hz - (S ? (tel ? 60 : 50) : 33), ar = S ? 10 : 9;
    if (S) {
      etoiles(ciel, R, Math.round((LW * hz) / 70), hz, null);
      lune(ciel, ax, ay, ar, P("#f4f6ff", "#c6cff0", "#9eabd8", "#2c417c", "#1c2d62"), 13);
    } else {
      for (let y = ay - 40; y <= ay + 40; y++) for (let x = ax - 44; x <= ax + 44; x++) {
        const d = Math.hypot(x - ax, (y - ay) * 1.25);
        if (d <= ar - 2) ciel.p(x, y, C("#fffbe6"));
        else if (d <= ar) ciel.p(x, y, C("#fff0b0"));
        else if (d <= ar + 34) {
          const k = 1 - (d - ar) / 34;
          if (k * k > seuil(x, y)) ciel.p(x, y, k > 0.7 ? C("#fff3c4") : k > 0.4 ? C("#ffe3a0") : C("#ffd68c"));
        }
      }
    }
    E.ciel = ciel.fin();

    // Deux bandes de nuages qui dérivent : petits et lointains, puis gros et dorés.
    const tn = S ? P("#b4c0e8", "#7485bc", "#47578f", "#2b386a", "#1c2650") : P("#fffadf", "#ffe7ab", "#f6c98d", "#dea085", "#b3828e");
    const tl = S ? P("#7485bc", "#5263a0", "#35457c", "#243162", "#1a2552") : P("#fff3cf", "#ffdca2", "#f3c092", "#dca690", "#c093a0");
    E.nuages = [];
    for (const [tons, nb, h0, h1, y0, y1, v] of [[tl, LW / 100, 4, 8, 0.6, 0.9, 1], [tn, LW / 190, 11, 20, 0.2, 0.52, 2.2]]) {
      const cal = new Calque(LW, hz), q = Math.max(2, Math.round(nb));
      for (let i = 0; i < q; i++) {
        const haut = h0 + R() * (h1 - h0), larg = Math.min(LW * 0.45, haut * (3.2 + R() * 3.4));
        const cx = borne(((i + 0.2 + R() * 0.6) / q) * LW, larg / 2 + haut, LW - larg / 2 - haut);
        nuage(cal, cx, Math.round(hz * (y0 + R() * (y1 - y0))), larg, haut, tons, R, -0.7, -0.7);
      }
      E.nuages.push({ c: cal.fin(), v });
    }

    // La terre : collines, damier des champs, le grand champ, le chemin, la butte et la tour du moulin.
    const y0 = hz - 36, T = new Calque(LW, H - y0), yF = hz + Math.round((H - hz) * 0.2), vpx = LW * 0.45;
    const cr = (x, a, g) => fbm(x * a, g, 3);
    const colA = N("#b3a6d0", "#9c97c8", "#8a88be", "#7c7cb2"), colB = N("#8e9a86", "#a0a67e", "#b3b073");
    for (let x = 0; x < LW; x++) {
      const ya = hz - 9 - 24 * cr(x, 0.011, 3), yb = hz - 2 - 13 * cr(x, 0.02, 21);
      for (let y = Math.floor(ya); y < hz + 2; y++) {
        if (y < yb) T.p(x, y - y0, ton(x, y, (y - ya) / 7 + fbm(x * 0.05, y * 0.2, 2) * 1.4 - 0.4, colA, 0.3));
        else T.p(x, y - y0, ton(x, y, (y - yb) / 5 + fbm(x * 0.2, y * 0.3, 2) * 0.9, colB, 0.3));
      }
    }
    // Le damier : des parcelles qui fuient vers l'horizon, séparées par des haies.
    const types = [N("#f1cf6a", "#e3b548"), N("#e9d48e", "#d8bd72"), N("#a9b858", "#8ea048"), N("#7f9a4a", "#6c8842"), N("#c79a56", "#ad7f42"), N("#f4de58", "#e2c53e")];
    const haie = N("#4f7038", "#3a5830", "#6f8c44");
    const ech = (y) => 0.22 + 0.78 * ((y - hz) / (yF - hz));
    for (let y = hz; y < yF; y++) {
      const u = (y - hz) / (yF - hz), j = Math.min(3, Math.floor(Math.pow(u, 0.62) * 4));
      const jv = Math.floor(Math.pow((y - 1 - hz) / (yF - hz), 0.62) * 4);
      for (let x = 0; x < LW; x++) {
        const X = vpx + (x - vpx) / ech(y), cw = 90 + j * 22, f = X / cw + j * 0.37, cel = Math.floor(f);
        const ty = types[Math.floor(hach(cel, j * 7 + 3) * types.length)];
        let c = ton(x, y, (Math.floor(X / (2.2 + j * 0.4)) & 1) * 0.75 + fbm(x * 0.2, y * 0.5, 2) * 0.5, ty, 0.2);
        const bord = (f - cel) * cw * ech(y);
        if (bord < 1 || jv !== j || y === hz) c = haie[(x * 7 + y * 3) % 5 === 0 ? 2 : (x + y) & 1];
        T.p(x, y - y0, c);
      }
    }
    // Le grand champ de blé, clair au loin, plus riche et plus strié au premier plan.
    const ble = S ? P("#5d6fa8", "#4c5e98", "#3e4f88", "#324176", "#273464") : P("#f8dc86", "#f2c95e", "#e8b446", "#d89c34", "#c2852a");
    for (let y = yF; y < H; y++) {
      const u = (y - yF) / (H - yF), s = (y - hz) / (H - hz);
      for (let x = 0; x < LW; x++) {
        const X = vpx + (x - vpx) / s;
        const f = 0.2 + u * 1.5 + (fbm(X * 0.012, u * 5, 3) - 0.5) * 1.5 + (hach(Math.floor(X / 2.6), 1) - 0.5) * (0.4 + u * 1.1);
        T.p(x, y - y0, ton(x, y, borne(f, 0, 4), ble, 0.34));
      }
    }
    // Le chemin de terre qui monte vers le moulin.
    const mx = Math.round(M + W * (tel ? 0.8 : 0.845)), my = yF - 3;
    const terre = N("#e6c896", "#cfa970", "#b08a56"), bordure = N("#a9a24c", "#8b8a3e");
    const Ch = new Calque(LW, H - y0);
    for (let y = yF - 1; y < H; y++) {
      const u = Math.max(0, (y - yF) / (H - yF));
      const cx = mx + 4 + (LW * (tel ? 0.42 : 0.6) - mx) * Math.pow(u, 0.8) + Math.sin(u * 5.2) * LW * 0.035 * u;
      const w = 1.3 + 15 * u * u + 5 * u;
      for (let x = Math.floor(cx - w - 2); x <= cx + w + 2; x++) {
        const d = Math.abs(x - cx) / w;
        if (d > 1) { if (d < 1 + 2.5 / w && seuil(x, y) < 0.6) Ch.p(x, y - y0, bordure[(x + y) & 1]); continue; }
        const orniere = Math.abs(d - 0.55) < 0.14 && w > 3;
        Ch.p(x, y - y0, ton(x, y, (orniere ? 1.5 : 0.2) + fbm(x * 0.3, y * 0.3, 2) * 0.9, terre, 0.25));
      }
    }
    // La butte, les arbres des haies, le grand chêne.
    const herbe = N("#c3c860", "#a3b04e", "#7f9644", "#5f7c3c");
    for (let x = mx - 46; x <= mx + 46; x++) {
      const h = 11 * Math.pow(Math.cos(((x - mx) / 46) * Math.PI * 0.5), 1.6);
      for (let y = Math.round(my + 6 - h); y < my + 7; y++) T.p(x, y - y0, ton(x, y, (y - (my + 6 - h)) / 4 + (x - mx) / 40 + 0.6, herbe, 0.25));
    }
    const feuilles = N("#c6cf62", "#97b34c", "#688f40", "#426f38", "#2c5234");
    const tronc = N("#6a4a30", "#4a3222");
    const arbre = (x, pied, larg, haut) => {
      T.r(x - 1, pied - y0 - Math.round(haut * 0.5), haut > 12 ? 3 : 1, Math.round(haut * 0.5), tronc[1]);
      if (haut > 12) T.r(x - 1, pied - y0 - Math.round(haut * 0.5), 1, Math.round(haut * 0.5), tronc[0]);
      nuage(T, x, pied - y0 - Math.round(haut * 0.3), larg, haut, feuilles, R, -0.7, -0.7);
    };
    for (let i = 0; i < LW / 26; i++) {
      const x = Math.floor(R() * LW), y = hz + Math.floor(Math.pow(R(), 1.6) * (yF - hz));
      const k = 0.5 + (y - hz) / (yF - hz);
      if (Math.abs(x - mx) > 30) arbre(x, y + 1, 5 + k * 6 + R() * 4, 3 + k * 4);
    }
    arbre(Math.round(M + W * (tel ? 0.22 : 0.275)), yF + 3, tel ? 26 : 38, tel ? 16 : 22);
    arbre(Math.round(M + W * 0.03), yF + 1, 22, 13);
    // La tour du moulin : pierre chaulée, toit de bois, porte et lucarne.
    const mur = S ? P("#a3b0d6", "#6c7cae", "#48578e", "#2c3868") : P("#fbf0d6", "#e6d3b0", "#c2a88a", "#9a8070");
    const toit = S ? P("#3a4476", "#262f5a", "#171d40") : P("#a8683a", "#7c4a2a", "#553220");
    const th = tel ? 34 : 42;
    for (let k = 0; k < th; k++) {
      const demi = 6 + (k / th) * 4.5, y = my + 6 - th + k - y0;
      for (let x = Math.round(mx - demi); x <= Math.round(mx + demi); x++) {
        const u = (x - (mx - demi)) / (2 * demi);
        let f = u * 2.6 - 0.2 + (hach(x >> 1, (k / 3) | 0) > 0.82 ? 0.7 : 0);
        T.p(x, y, ton(x, y + y0, borne(f, 0, 3), mur, 0.3));
      }
    }
    for (let k = 0; k < 10; k++) for (let x = mx - k - 1; x <= mx + k + 1; x++) {
      if (k < 9) T.p(x, my + 6 - th - 9 + k - y0, toit[x < mx - 1 ? 0 : x < mx + k * 0.5 ? 1 : 2]);
    }
    T.r(mx - 2, my - 2 - y0, 5, 8, toit[2]); T.r(mx - 2, my - 2 - y0, 1, 8, toit[1]); T.r(mx - 1, my - 3 - y0, 3, 1, toit[2]);
    const lueur = S ? C("#ffd27a") : toit[2];
    T.r(mx - 1, my - 20 - y0, 2, 4, lueur);
    if (S) { T.p(mx - 2, my - 18 - y0, C("#c98a4a")); T.p(mx + 1, my - 18 - y0, C("#c98a4a")); T.r(mx - 1, my + 2 - y0, 1, 3, C("#e0a455")); }
    E.terre = T.fin(); E.chemin = Ch.fin(); E.y0 = y0; E.yF = yF; E.vpx = vpx;

    // Les ailes du moulin : trente poses pour un quart de tour.
    const bois = S ? C("#232b58") : C("#6a4a30"), toile = S ? P("#93a3d2", "#6878ae") : P("#fbf2dc", "#e2d0a8");
    const L = tel ? 24 : 31, D = L + 3;
    E.ailes = [];
    for (let i = 0; i < 30; i++) {
      const cal = new Calque(D * 2 + 1, D * 2 + 1);
      for (let a = 0; a < 4; a++) {
        const ang = (i / 30) * Math.PI * 0.5 + a * Math.PI * 0.5 + 0.2, dx = Math.cos(ang), dy = Math.sin(ang);
        for (let r = 7; r <= L; r += 0.5) for (let w = 0.5; w <= 6; w += 0.5) {
          const bord = Math.round(r) % 5 === 0 || w > 5.4 || r > L - 0.6;
          cal.p(Math.round(D + dx * r - dy * w), Math.round(D + dy * r + dx * w), bord ? bois : toile[w < 3.2 ? 0 : 1]);
        }
        for (let r = 0; r <= L; r += 0.5) cal.p(Math.round(D + dx * r), Math.round(D + dy * r), bois);
      }
      cal.r(D - 1, D - 1, 3, 3, bois); cal.p(D, D, toile[1]);
      E.ailes.push(cal.fin());
    }
    E.moulin = { x: mx - D, y: my + 6 - th - 2 - D };

    // Les rafales : des bandes de lumière qui courent sur le champ, rang par rang, plus larges vers nous.
    const clairs = S ? P("#8c9fd4", "#cbd8f8") : P("#ffe894", "#fff6c2"), creux = S ? C("#1e2a56") : C("#b57c26");
    let y = yF + 1, i = 0;
    while (y < H) {
      const h = 1 + Math.floor(i * 0.19), u = (y - yF) / (H - yF);
      const mk = (per, fort) => {
        const cal = new Calque(LW + per, h);
        for (let yy = 0; yy < h; yy++) for (let x = 0; x < cal.w; x++) {
          const s = Math.sin((x / per) * Math.PI * 2 + 0.6 * Math.sin((x / per) * Math.PI * 6));
          const sy = seuil(x, y + yy);
          if (s > 0.6 && (s - 0.6) * 4 * fort > sy) cal.p(x, yy, s > 0.93 && sy < 0.5 ? clairs[1] : clairs[0]);
          else if (fort === 1 && s < -0.6 && (-s - 0.6) * 2.6 > sy) cal.p(x, yy, creux);
        }
        return { c: cal.fin(), per };
      };
      E.rangs.push({ y, h, i, a: mk(Math.round(54 + u * 250), 1), b: mk(Math.round((54 + u * 250) * 1.7), 0.55) });
      y += h; i++;
    }

    // Le premier plan : des épis, des coquelicots et des bleuets, en cinq poses penchées.
    const fh = tel ? 40 : 54, sw = 24;
    const tige = S ? P("#141c40", "#1c2650", "#27335e", "#34437a") : P("#6e4716", "#855a1c", "#9c6c22", "#b98630");
    const epi = S ? P("#27335e", "#3b4a7c", "#6677aa", "#dfe6ff") : P("#8f621e", "#b07c26", "#d7a43c", "#fff0b0");
    const fleurs = S ? [P("#8a3a60", "#562446", "#1c1230"), P("#5468c0", "#384a94", "#1c1230")] : [P("#f04a34", "#b82420", "#3a1418"), P("#5a7cf0", "#3550c0", "#1c2a70")];
    const feuille = S ? P("#1c2650", "#2c3a68") : P("#6f6a26", "#8f8a34");
    for (let j = 0; j * sw < LW + sw; j++) {
      const tiges = [];
      for (let k = 0; k < 8; k++) tiges.push({ x: 4 + ((k + R()) / 8) * sw, h: fh * (0.4 + 0.58 * R()), f: R(), g: R() });
      tiges.sort((a, b) => a.h - b.h);
      const poses = [];
      for (let b = -2; b <= 2; b++) {
        const cal = new Calque(sw + 8, fh + 6);
        const sol = cal.h;
        for (let x = 0; x < cal.w; x++) for (let yy = sol - Math.round(fh * 0.5); yy < sol; yy++) {
          if ((sol - yy) / (fh * 0.5) < 0.3 + seuil(x + j * sw, yy) * 0.8) cal.p(x, yy, tige[(x * 3 + yy) % 5 === 0 ? 1 : 0]);
        }
        for (const s of tiges) {
          const pres = s.h < fh * 0.68 ? 0 : 1;
          const xo = (k) => Math.round(s.x + b * Math.pow(k / s.h, 2) * (s.h / 24) * 1.4 + Math.sin(s.g * 6 + k * 0.07) * 1.3);
          for (let k = 0; k < s.h; k++) cal.p(xo(k), sol - 1 - k, tige[1 + pres + (k > s.h * 0.55 && pres ? 1 : 0)]);
          const lf = Math.round(s.h * (0.28 + s.g * 0.25)), sens = s.g > 0.5 ? 1 : -1;
          for (let q = 1; q <= 5; q++) cal.p(xo(lf) + sens * q, sol - 1 - lf - (q < 4 ? q : 6 - q), feuille[pres]);
          const xt = xo(s.h), yt = sol - 1 - Math.round(s.h);
          if (s.f < 0.14 && pres) {
            const fl = fleurs[s.f < 0.095 ? 0 : 1];
            cal.r(xt - 1, yt - 3, 3, 4, fl[0]); cal.r(xt - 2, yt - 2, 5, 2, fl[0]);
            cal.p(xt - 2, yt - 1, fl[1]); cal.p(xt + 2, yt - 1, fl[1]); cal.p(xt - 1, yt, fl[1]); cal.p(xt + 1, yt, fl[1]); cal.p(xt, yt - 2, fl[2]); cal.p(xt, yt - 1, fl[2]);
          } else {
            const le = 7 + Math.round(s.g * 4);
            for (let q = 0; q < le; q++) {
              const x = xo(s.h - le + q + 1), yy = yt + le - 1 - q, i0 = pres + (q & 1);
              cal.p(x, yy, epi[1 + pres]);
              if (q < le - 1) { cal.p(x - 1, yy, epi[q & 1 ? 2 + pres : 1 + pres]); cal.p(x + 1, yy, epi[i0 > 1 ? 1 : pres]); }
              if (q > 0 && q % 2 === 0) { cal.p(x - 2, yy - 1, epi[pres + 2]); cal.p(x + 2, yy - 1, epi[pres]); }
            }
            cal.p(xt, yt - 1, epi[2 + pres]); cal.p(xt - 1, yt - 2, epi[1 + pres]); cal.p(xt + 1, yt - 2, epi[1 + pres]); cal.p(xt + (b > 0 ? 2 : -2), yt - 3, epi[pres]);
          }
        }
        poses.push(cal.fin());
      }
      E.brins.push(poses);
    }
    E.fh = fh; E.sw = sw;
    for (let k = 0; k < (tel ? 7 : 16); k++) E.lucioles.push({ x: R() * W, y: H - 12 - R() * (H - yF) * 0.7, ph: R() * 6.28, v: 2400 + R() * 2000 });
  }

  function dessiner(ctx, t, s) {
    if (!E) return;
    if (!(t > 0)) t = 0;
    const LW = W + 2 * M, p1 = Math.round(s.x), p2 = Math.round(s.x * 2), p5 = Math.round(s.x * 5);
    ctx.drawImage(E.ciel, -M + p1, 0);
    for (const n of E.nuages) {
      const o = Math.floor((t / 1000) * n.v) % LW, x = -M + p1 + o;
      ctx.drawImage(n.c, x, 0); ctx.drawImage(n.c, x - LW, 0);
    }
    const ty = E.y0 + Math.round(s.y);
    ctx.drawImage(E.terre, -M + p2, ty);
    ctx.drawImage(E.ailes[Math.floor(((t / 9000) % 1) * 30)], E.moulin.x - M + p2, E.moulin.y + Math.round(s.y));
    // Les rafales : la même onde pour tous les rangs, vue en perspective depuis le point de fuite.
    for (const r of E.rangs) {
      const ph = t / 15000 + r.i * 0.05 + 0.09 * Math.sin(r.i * 0.45);
      for (const [b, k] of [[r.a, 1], [r.b, -0.62]]) {
        const o = Math.floor((((-E.vpx - ph * k * b.per) % b.per) + b.per) % b.per);
        ctx.drawImage(b.c, o, 0, LW, r.h, -M + p2, r.y + Math.round(s.y), LW, r.h);
      }
    }
    ctx.drawImage(E.chemin, -M + p2, ty);
    if (S) {
      ctx.fillStyle = "#eaffa0";
      for (const l of E.lucioles) {
        const a = Math.sin(t / l.v + l.ph);
        if (a <= 0) continue;
        ctx.globalAlpha = a * a * 0.9;
        ctx.fillRect(Math.round(l.x + Math.sin(t / 5100 + l.ph) * 9) + p5, Math.round(l.y + Math.cos(t / 6300 + l.ph * 2) * 5), 1, 1);
      }
      ctx.globalAlpha = 1;
    } else {
      // Trois hirondelles qui passent.
      ctx.fillStyle = "#3a2c3c";
      for (let i = 0; i < 3; i++) {
        const x = Math.round(((t * (0.011 + i * 0.002) + W * (0.55 + i * 0.13)) % (W + 60)) - 30);
        const y = Math.round(E.hz * (0.5 + i * 0.09) + Math.sin(t / 2600 + i * 2) * 5);
        const haut = Math.floor(t / 520 + i * 0.4) % 3 === 0;
        ctx.fillRect(x + 2, y, 2, 1);
        ctx.fillRect(x, y + (haut ? -1 : 1), 2, 1); ctx.fillRect(x + 4, y + (haut ? -1 : 1), 2, 1);
      }
    }
    const fy = H - E.fh - 6 + Math.round(s.y * 2) + 2;
    for (let j = 0; j < E.brins.length; j++) {
      const pose = Math.round(2 + 2 * Math.sin(t / 2100 - j * 0.5));
      ctx.drawImage(E.brins[j][pose], j * E.sw - 4 - M + p5, fy);
    }
  }

  (window.FONDS = window.FONDS || []).push({ id: "p5-plaine", nom: "La plaine dorée", famille: "paysage", credit: null, monter, dessiner });
})();
