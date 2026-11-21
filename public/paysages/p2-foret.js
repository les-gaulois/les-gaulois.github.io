// Site du clan [GAL] (AGPL-3.0-only). Paysage animé du fond de « Mon Gaulois », dessin en cases de Claude Fable 5.2,
// 21 novembre 2026, choisi par le pilote avec les sept autres ; ils tournent toutes les 15 minutes (src/lib/jeu/fonds-du-jeu.ts,
// tenu par src/scripts/jeu.ts). Script classique : il ajoute son fond à window.FONDS, rien d'autre.
// Fond de « Mon Gaulois » : p2-foret.
(() => {
  "use strict";
  // ---- Outils de dessin en cases, copiés dans chaque fichier : un fond se suffit.
  const M = 8; // marge des calques, pour la parallaxe
  const borne = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
  const hex = (h) => { const n = parseInt(h.slice(1), 16); return ((255 << 24) | ((n & 255) << 16) | (n & 0xff00) | (n >>> 16)) >>> 0; };
  const mel = (a, b, t) => {
    const ar = a & 255, ag = (a >> 8) & 255, ab = (a >> 16) & 255, br = b & 255, bg = (b >> 8) & 255, bb = (b >> 16) & 255;
    return ((255 << 24) | (((ab + (bb - ab) * t) & 255) << 16) | (((ag + (bg - ag) * t) & 255) << 8) | ((ar + (br - ar) * t) & 255)) >>> 0;
  };
  const alea = (g) => () => { g |= 0; g = (g + 0x6d2b79f5) | 0; let t = Math.imul(g ^ (g >>> 15), 1 | g); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const B8 = (() => { const o = new Float32Array(64); for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { let v = 0; for (let i = 0; i < 3; i++) v = (v << 2) | ((((x ^ y) >> i) & 1) << 1) | ((y >> i) & 1); o[y * 8 + x] = (v + 0.5) / 64; } return o; })();
  const seuil = (x, y) => B8[(y & 7) * 8 + (x & 7)];
  // Une rampe de couleurs tramée : v de 0 à 1 choisit entre deux teintes voisines selon la trame.
  const rampe = (cs) => { const n = cs.length - 1; return (v, x, y) => { v = borne(v) * n; const i = Math.min(n - 1, v | 0); return v - i > seuil(x, y) ? cs[i + 1] : cs[i]; }; };
  const hach = (n, s) => { let h = Math.imul(n ^ s, 0x9e3779b1); h ^= h >>> 15; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
  const bruit1 = (s) => (x) => { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return hach(i, s) * (1 - u) + hach(i + 1, s) * u; };
  const fbm1 = (s, oct = 4) => { const b = bruit1(s); return (x) => { let a = 0, amp = 0.5, fr = 1, tot = 0; for (let o = 0; o < oct; o++) { a += b(x * fr + o * 17.3) * amp; tot += amp; amp *= 0.5; fr *= 2; } return a / tot; }; };
  const bruit2 = (s) => (x, y) => {
    const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    const k = (a, b) => hach((Math.imul(a, 374761393) + Math.imul(b, 668265263)) | 0, s);
    return (k(ix, iy) * (1 - u) + k(ix + 1, iy) * u) * (1 - v) + (k(ix, iy + 1) * (1 - u) + k(ix + 1, iy + 1) * u) * v;
  };
  const fbm2 = (s, oct = 3) => { const b = bruit2(s); return (x, y) => { let a = 0, amp = 0.5, fr = 1, tot = 0; for (let o = 0; o < oct; o++) { a += b(x * fr + o * 31.7, y * fr - o * 11.1) * amp; tot += amp; amp *= 0.5; fr *= 2; } return a / tot; }; };

  class Calque {
    constructor(w, h) { this.w = w; this.h = h; this.c = document.createElement("canvas"); this.c.width = w; this.c.height = h; this.g = this.c.getContext("2d"); this.im = this.g.createImageData(w, h); this.p = new Uint32Array(this.im.data.buffer); }
    pt(x, y, c) { if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.p[y * this.w + x] = c; }
    ptB(x, y, c) { if (y >= 0 && y < this.h) this.p[y * this.w + (((x % this.w) + this.w) % this.w)] = c; }
    lire(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h ? this.p[y * this.w + x] : 0; }
    // Mêle une teinte à ce qui est déjà peint (rien sur une case vide).
    voile(x, y, c, t) { if (x >= 0 && y >= 0 && x < this.w && y < this.h) { const i = y * this.w + x, a = this.p[i]; if (a >>> 24) this.p[i] = mel(a, c, t); } }
    rect(x, y, w, h, c) { for (let j = Math.max(0, y); j < Math.min(this.h, y + h); j++) for (let i = Math.max(0, x); i < Math.min(this.w, x + w); i++) this.p[j * this.w + i] = c; }
    ligne(x0, y0, x1, y1, c) { x0 |= 0; y0 |= 0; x1 |= 0; y1 |= 0; const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1; let e = dx + dy; for (;;) { this.pt(x0, y0, c); if (x0 === x1 && y0 === y1) break; const e2 = 2 * e; if (e2 >= dy) { e += dy; x0 += sx; } if (e2 <= dx) { e += dx; y0 += sy; } } }
    disque(cx, cy, r, c) { for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r + r * 0.6) this.pt(cx + x, cy + y, c); }
    motif(lignes, pal, x, y, miroir) { for (let j = 0; j < lignes.length; j++) { const l = lignes[j]; for (let i = 0; i < l.length; i++) { const c = pal[l[miroir ? l.length - 1 - i : i]]; if (c !== undefined) this.pt(x + i, y + j, c); } } }
    fin() { this.g.putImageData(this.im, 0, 0); return this.c; }
  }
  // Ciel en bandes tramées, de haut en bas.
  function degrade(cal, cs, y0, y1, courbe = 1) { const r = rampe(cs); for (let y = 0; y < cal.h; y++) { const v = Math.pow(borne((y - y0) / (y1 - y0)), courbe); for (let x = 0; x < cal.w; x++) cal.p[y * cal.w + x] = r(v, x, y); } }
  // Lueur tramée autour d'un point : mêle une teinte, de plus en plus rare vers le bord.
  function lueur(cal, cx, cy, r0, r1, c, force = 0.6, ry = 1) {
    for (let y = Math.floor(cy - r1 * ry); y <= cy + r1 * ry; y++) for (let x = Math.floor(cx - r1); x <= cx + r1; x++) {
      const d = Math.hypot(x - cx, (y - cy) / ry); if (d > r1) continue;
      const v = d <= r0 ? 1 : 1 - (d - r0) / (r1 - r0);
      if (v * v > seuil(x, y) * 0.999) cal.voile(x, y, c, force * (0.35 + 0.65 * v));
    }
  }
  function etoiles(cal, r, n, yMax, cs, evite) {
    for (let i = 0; i < n; i++) {
      const x = (r() * cal.w) | 0, y = (Math.pow(r(), 1.25) * yMax) | 0, k = r();
      if (evite && Math.hypot(x - evite[0], y - evite[1]) < evite[2]) continue;
      if (k > 0.972) { cal.pt(x, y, cs[2]); cal.pt(x - 1, y, cs[0]); cal.pt(x + 1, y, cs[0]); cal.pt(x, y - 1, cs[0]); cal.pt(x, y + 1, cs[0]); }
      else cal.pt(x, y, cs[k > 0.75 ? 2 : k > 0.4 ? 1 : 0]);
    }
  }
  // Un cumulus à fond plat : des boules le long d'une base, éclairées par le haut.
  function nuage(cal, cx, by, w, h, cs, r, lx = -0.4) {
    const n = 4 + Math.floor(w / 8), bl = [], rp = rampe(cs);
    for (let i = 0; i < n; i++) { const u = (i + 0.5) / n, env = Math.sin(u * Math.PI), rr = Math.max(2, h * 0.22 + env * h * 0.34 * (0.55 + r() * 0.6)); bl.push([cx - w / 2 + u * w + (r() - 0.5) * 5, by - rr * 0.5 - env * h * 0.4 * r(), rr]); }
    for (let y = Math.floor(by - h * 1.4); y <= by; y++) for (let x = Math.floor(cx - w / 2 - h); x <= cx + w / 2 + h; x++) {
      let m = -9;
      for (const b of bl) { const dx = x - b[0], dy = y - b[1], d2 = dx * dx + dy * dy; if (d2 <= b[2] * b[2]) { const l = (-dy * 0.9 + dx * lx) / b[2]; if (l > m) m = l; } }
      if (m < -8) continue;
      if (y === by && (hach(x, 77) > 0.55)) continue;
      const v = 0.42 + m * 0.4 + ((by - y) / h) * 0.3;
      cal.ptB(x, y, rp(v, x, y));
    }
  }
  const toile = (w, h) => { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; };
  // Remplit sous une ligne de crête : col(x, y, profondeur sous la crête).
  function crete(cal, fy, col) { for (let x = 0; x < cal.w; x++) { const h = Math.round(fy(x)); for (let y = Math.max(0, h); y < cal.h; y++) cal.p[y * cal.w + x] = col(x, y, y - h); } }

  // ---- La forêt des chênes : des plans d'arbres dans la brume, une trouée de lumière, un ruisseau.
  const H_ = (a) => a.map(hex);
  const alpha = (c, a) => ((c & 0x00ffffff) | (a << 24)) >>> 0;
  const PAL = {
    jour: {
      fond: H_(["#fffbe0", "#fdf3b8", "#eaf0a8", "#c9e4a0", "#a4d49a", "#84c292", "#6cb08a"]),
      plans: [H_(["#a9d6a0", "#bfe2a8"]), H_(["#74b68a", "#8cc892"]), H_(["#44906a", "#5ca874"])], brume: [hex("#d4eeb4"), hex("#a6d6a2"), hex("#78ba8c")],
      ecorce: H_(["#2a1e20", "#40302a", "#5a4432", "#7c5e3c", "#a4824e", "#cfae6c"]),
      feuilles: H_(["#164430", "#1e5a36", "#2c743c", "#44903e", "#6aac44", "#9aca52", "#d0e870"]),
      avantE: H_(["#140f14", "#221a1c", "#342826", "#4a3a30", "#6c543a"]),
      avantF: H_(["#0c2a22", "#123a28", "#1a4e30", "#266638", "#3c843e", "#74ae48"]),
      sol: H_(["#1c4a30", "#286238", "#387c3c", "#52983e", "#78b446", "#a8d058", "#dcec88"]),
      eau: H_(["#1f5c7c", "#2c7c9c", "#48a0bc", "#7cc8d8", "#bfeaec", "#f4ffff"]), rive: hex("#1c3c2c"),
      roche: H_(["#3c4048", "#5c626c", "#868e96", "#b4bcc0"]),
      rayon: hex("#fff0a0"), rayonA: 84, tache: hex("#f0f884"),
      eclat: "#ffffff", astre: null,
    },
    nuit: {
      fond: H_(["#6c8cd0", "#4c6cb8", "#34509c", "#243c80", "#182c64", "#101f4a", "#0a1536"]),
      plans: [H_(["#1c3066", "#263e7a"]), H_(["#142452", "#1c3064"]), H_(["#0d1a3e", "#152650"])], brume: [hex("#2c4688"), hex("#1e346c"), hex("#152856")],
      ecorce: H_(["#050814", "#0a1022", "#111a32", "#1a2846", "#28405e", "#3c5c7c"]),
      feuilles: H_(["#061018", "#0a1a26", "#0f2836", "#163a48", "#22505c", "#347070", "#58988c"]),
      avantE: H_(["#02040a", "#050812", "#090e1c", "#0f182a", "#1a2a44"]),
      avantF: H_(["#02060c", "#040a14", "#07121e", "#0c1c2c", "#142c40", "#22485c"]),
      sol: H_(["#050e1a", "#081624", "#0c2030", "#122c40", "#1a3c50", "#285464", "#3c7480"]),
      eau: H_(["#0a1838", "#102450", "#1c3a70", "#345c98", "#6c98cc", "#d4e8ff"]), rive: hex("#040a16"),
      roche: H_(["#0c1226", "#162038", "#243250", "#3a4c70"]),
      rayon: hex("#a8c4ff"), rayonA: 44, tache: hex("#4c84a0"),
      eclat: "#d4e8ff", astre: 1,
    },
  };
  let E = null;

  // Un feuillage : des boules de feuilles éclairées chacune vers la lumière, au bord déchiqueté par blocs de deux cases.
  function feuillage(cal, bl, cs, lum, grain, base, contre) {
    const R = rampe(cs), n = bl.length;
    for (let i = 0; i < n; i++) {
      const cx = bl[i][0], cy = bl[i][1], r0 = bl[i][2], prof = i / n;
      let lx = lum[0] - cx, ly = lum[1] - cy; const ll = Math.hypot(lx, ly) || 1; lx /= ll; ly /= ll;
      for (let y = Math.floor(cy - r0 - 2); y <= cy + r0 + 2; y++) for (let x = Math.floor(cx - r0 - 2); x <= cx + r0 + 2; x++) {
        const dx = x - cx, dy = y - cy, rr = r0 + (hach(((x >> 1) * 73 + (y >> 1) * 19) | 0, 9) - 0.5) * grain;
        if (dx * dx + dy * dy > rr * rr) continue;
        const l = (dx * lx + dy * ly) / r0;
        cal.pt(x, y, R(base + l * contre - (1 - prof) * 0.2 + (hach((x * 13 + y * 7) | 0, 3) - 0.5) * 0.14, x, y));
      }
    }
  }
  function tronc(cal, cx, yH, yB, wH, wB, cs, cote, graine, mousse) {
    const R = rampe(cs), fb = fbm1(graine, 3), g = fbm2(graine + 1, 3), RM = mousse ? rampe(mousse) : null;
    for (let y = Math.max(0, yH); y < Math.min(cal.h, yB); y++) {
      const u = (y - yH) / (yB - yH), half = (wH + (wB - wH) * u) / 2 + Math.pow(u, 7) * wB * 0.55 + (fb(y / 13) - 0.5) * wH * 0.14, dev = (fb(y / 46 + 5) - 0.5) * wH * 0.3;
      for (let x = Math.floor(cx + dev - half); x <= cx + dev + half; x++) {
        const t = (x - cx - dev) / half, n = g(x / 2.6, y / 20);
        let v = 0.42 + t * cote * 0.34 + (n - 0.5) * 0.62 - (Math.abs(t) > 0.86 ? 0.12 : 0);
        if (RM && u > 0.62 && g(x / 5 + 30, y / 4) > 0.66 - Math.pow((u - 0.62) / 0.38, 2) * 0.4) cal.pt(x, y, RM(0.35 + t * cote * 0.3 + (n - 0.5) * 0.5, x, y)); else cal.pt(x, y, R(v, x, y));
      }
    }
  }
  function branche(cal, pts, w0, w1, cs, cote) {
    const R = rampe(cs);
    for (let s = 0; s < pts.length - 1; s++) {
      const [x0, y0] = pts[s], [x1, y1] = pts[s + 1], n = Math.ceil(Math.hypot(x1 - x0, y1 - y0));
      for (let i = 0; i <= n; i++) {
        const k = (s + i / n) / (pts.length - 1), r = Math.max(0.6, (w0 + (w1 - w0) * k) / 2), px = x0 + ((x1 - x0) * i) / n, py = y0 + ((y1 - y0) * i) / n;
        for (let dy = -Math.ceil(r); dy <= r; dy++) for (let dx = -Math.ceil(r); dx <= r; dx++) if (dx * dx + dy * dy <= r * r + 0.5) { const x = Math.round(px + dx), y = Math.round(py + dy); cal.pt(x, y, R(0.42 + (dx / r) * cote * 0.25 - (dy / r) * 0.12 + (hach((x * 5 + y * 11) | 0, 2) - 0.5) * 0.3, x, y)); }
      }
    }
  }
  function fougere(cal, x, y, haut, sens, cs, r) {
    const n = Math.round(haut);
    for (let i = 0; i <= n; i++) {
      const k = i / n, px = Math.round(x + sens * k * k * haut * 0.75), py = Math.round(y - Math.sin(k * 1.7) * haut * 0.85);
      cal.pt(px, py, cs[2]);
      const lf = Math.round((1 - k) * haut * 0.3 * Math.min(1, k * 5));
      if (i % 2 === 0) for (let j = 1; j <= lf; j++) { cal.pt(px - Math.round(j * 0.5 * sens), py - j, cs[j > lf - 2 ? 5 : 3]); cal.pt(px + Math.round(j * 0.4 * sens), py + j, cs[j > lf - 1 ? 3 : 2]); }
    }
  }

  function monter(o) {
    const W = o.largeur, H = o.hauteur, N = o.sombre, P = N ? PAL.nuit : PAL.jour, LW = W + 2 * M, LH = H + 2 * M;
    const r = alea(40219), etroit = W < 300;
    const hor = Math.round(LH * 0.64);
    const lx = Math.round(M + W * (etroit ? 0.84 : 0.685)), ly = Math.round(M + H * (etroit ? 0.15 : 0.175));
    const trouee = (x, l) => Math.exp(-Math.pow((x - lx) / l, 2));

    // Le fond : la lumière de la trouée, puis le plan d'arbres le plus lointain.
    const fond = new Calque(LW, LH), RF = rampe(P.fond), gf = fbm2(3, 3);
    for (let y = 0; y < LH; y++) for (let x = 0; x < LW; x++) { const d = Math.hypot((x - lx) * 0.8, (y - ly) * 1.0) / (Math.max(W, H) * 0.62); fond.p[y * LW + x] = RF(Math.pow(d, 0.72) + (gf(x / 50, y / 30) - 0.5) * 0.16, x, y); }
    if (N) {
      lueur(fond, lx, ly, 13, 46, hex("#b8d0ff"), 0.6);
      fond.disque(lx, ly, 12, hex("#f6f4e0"));
      for (const [a, b, c] of [[-4, -3, 3], [3, 2, 2], [-2, 5, 2], [5, -5, 1], [-7, 2, 1]]) fond.disque(lx + a, ly + b, c, hex("#d6d8cc"));
      for (let y = -12; y <= 12; y++) for (let x = -12; x <= 12; x++) if (fond.lire(lx + x, ly + y) === hex("#f6f4e0") && x - y * 0.4 < -5 && seuil(x, y) > 0.5) fond.pt(lx + x, ly + y, hex("#d6d8cc"));
    } else { lueur(fond, lx, ly, 12, 70, hex("#ffffff"), 0.8); fond.disque(lx, ly, 10, hex("#ffffff")); }

    // Un plan d'arbres lointains : voûte de feuilles, troncs, sous-bois, le tout fondu dans la brume vers le sol.
    function plan(cal, k, sol, voute, ampl, ecart, larg, graine) {
      const cs = P.plans[k], br = P.brume[k], fv = fbm1(graine, 4), fg = fbm1(graine + 7, 3), rr = alea(graine);
      const yv = (x) => voute + (fv(x / 34) - 0.5) * ampl - trouee(x, W * (0.2 - k * 0.035)) * (voute - M - H * (0.04 + k * 0.012)) + Math.abs(Math.sin(x / 5.3 + fv(x / 9) * 6)) * 4;
      const ys = (x) => sol + (fg(x / 28) - 0.5) * 9 - Math.abs(Math.sin(x / 4.1 + fg(x / 7) * 5)) * 3;
      for (let x = 0; x < LW; x++) {
        const a = Math.round(yv(x)); for (let y = 0; y < a; y++) cal.p[y * LW + x] = a - y < 9 && hach((x >> 1) * 31 + (y >> 1) * 7, graine) > 0.62 - (a - y) * 0.02 ? cs[1] : cs[0];
        const b = Math.round(ys(x)); for (let y = b; y < LH; y++) cal.p[y * LW + x] = y - b < 3 ? cs[1] : cs[0];
      }
      let x = -rr() * ecart;
      while (x < LW + ecart) {
        const w = Math.max(2, Math.round(larg * (0.6 + rr() * 0.8))), cx = Math.round(x), pen = (rr() - 0.5) * 0.12, b = Math.round(ys(cx)) + 2;
        for (let y = 0; y <= b; y++) { const u = y / b, half = w / 2 + Math.pow(u, 8) * w, xx = cx + (b - y) * pen; for (let i = Math.floor(xx - half); i <= xx + half; i++) cal.pt(i, y, (i - xx) * (lx - cx) > half * 0.4 * Math.abs(lx - cx) ? cs[1] : cs[0]); }
        if (w > 3) for (const s of [-1, 1]) { const y0 = Math.round(yv(cx) + 18 + rr() * 26), L = 14 + rr() * 18; const mx = cx + s * L * 0.55, my = y0 - L * 0.3; cal.ligne(cx, y0, mx, my, cs[0]); cal.ligne(mx, my, cx + s * L, y0 - L * 0.95, cs[0]); if (k > 0) { cal.ligne(cx, y0 + 1, mx, my + 1, cs[0]); cal.ligne(mx, my, mx + s * L * 0.3, my + 3, cs[0]); } }
        x += ecart * (0.55 + rr() * 0.9);
      }
      for (let xx = 0; xx < LW; xx++) { const b = Math.round(ys(xx)); for (let y = b - 46; y < b + 12; y++) { const v = 1 - Math.abs(y - b + 6) / 40; if (v > 0 && cal.lire(xx, y) >>> 24 && v * 0.85 > seuil(xx, y)) cal.pt(xx, y, br); } }
    }
    plan(fond, 0, hor - 10, M + H * 0.3, 26, 26, 4, 101);
    const milieu = new Calque(LW, LH);
    plan(milieu, 1, hor - 4, M + H * 0.27, 30, 44, 7, 202);
    const pres = new Calque(LW, LH);
    plan(pres, 2, hor + 2, M + H * 0.23, 34, 74, 11, 303);

    // Le sol de la forêt, ses taches de lumière, le ruisseau, puis les chênes du plan moyen.
    const sol = new Calque(LW, LH), RS = rampe(P.sol), gs = fbm2(11, 3), fs = fbm1(17, 3), RE = rampe(P.eau), RR = rampe(P.roche);
    const yS = hor + 8, xs = (y) => { const u = (y - yS) / (LH - yS); return M + W * (0.6 - 0.27 * u) + Math.sin(u * 5.2 + 0.4) * W * 0.1 * (0.2 + u); };
    const hw = (y) => { const u = (y - yS) / (LH - yS); return 2 + u * u * Math.min(44, W * 0.075) + u * 13; };
    crete(sol, (x) => hor + 4 + (fs(x / 30) - 0.5) * 6, (x, y, d) => RS(0.62 - ((y - hor) / (LH - hor)) * 0.4 + (gs(x / 30, y / 9) - 0.5) * 0.7 + (d < 2 ? 0.15 : 0) + trouee(x, W * 0.3) * 0.12, x, y));
    const taches = [];
    for (let i = 0; i < Math.max(4, W / 70); i++) { const y = hor + 16 + r() * (LH - hor - 40), x = lx - (y - ly) * 0.62 + (r() - 0.5) * W * 0.55; taches.push([x, y]); lueur(sol, x, y, 6 + r() * 8, 26 + r() * 26, P.tache, 0.6, 0.3); }
    for (let i = 0; i < (LW * (LH - hor)) / 34; i++) { // brins, feuilles mortes, fleurs
      const x = (r() * LW) | 0, y = (hor + 8 + r() * (LH - hor - 8)) | 0, k = r();
      if (k < 0.5) { sol.pt(x, y, P.sol[0]); sol.pt(x, y - 1, P.sol[1]); } else if (k < 0.82) { sol.pt(x, y, P.sol[5]); if (k < 0.66) sol.pt(x + 1, y - 1, P.sol[5]); }
      else if (k < 0.93) sol.pt(x, y, N ? P.sol[5] : hex(k < 0.88 ? "#e8a03c" : "#c8642c")); else { sol.pt(x, y, N ? P.sol[6] : hex("#ffffff")); sol.pt(x, y + 1, P.sol[2]); }
    }
    for (let y = yS; y < LH; y++) { // le ruisseau
      const c = xs(y), h = hw(y) + (gs(y / 7, 3) - 0.5) * 3;
      for (let x = Math.floor(c - h - 2); x <= c + h + 2; x++) {
        const d = Math.abs(x - c);
        if (d > h) { if (d < h + 2) sol.pt(x, y, P.rive); continue; }
        sol.pt(x, y, RE(0.2 + (1 - d / h) * 0.38 + (gs(x / 9, y / 1.6) - 0.5) * 0.75 + trouee(x, W * 0.2) * 0.1, x, y));
      }
    }
    const eclats = [];
    for (let i = 0; i < 46; i++) eclats.push({ u: r(), o: (r() - 0.5) * 1.5, v: 0.6 + r() * 0.8, p: r() * 6.28 });
    for (let i = 0; i < Math.max(6, W / 34); i++) { // des pierres moussues au bord de l'eau
      const y = Math.round(yS + 6 + Math.pow(r(), 0.7) * (LH - yS - 10)), s = r() < 0.5 ? -1 : 1, rx = Math.round(2 + ((y - yS) / (LH - yS)) * 6 * (0.5 + r())), ry = Math.max(1, Math.round(rx * 0.6)), cx = Math.round(xs(y) + s * (hw(y) + rx * 0.4));
      for (let b = -ry; b <= ry; b++) for (let a = -rx; a <= rx; a++) if ((a * a) / (rx * rx + 0.5) + (b * b) / (ry * ry + 0.5) <= 1) sol.pt(cx + a, y + b, b < -ry * 0.3 && hach(a + cx, 6) > 0.4 ? P.sol[4] : RR(0.5 - (b / ry) * 0.35 + (a / rx) * Math.sign(lx - cx) * 0.3, cx + a, y + b));
    }
    { const bl = []; for (let x = -6; x < LW + 6; x += 2) if (gs(x / 26, 40) > 0.46) bl.push([x + r() * 3, hor + 5 - r() * 7 * gs(x / 26, 40), 3 + r() * 5]);
      feuillage(sol, bl, P.feuilles.slice(0, 6), [lx, ly], 3, 0.42, 0.42); }
    const nA = Math.max(2, Math.round(W / 105));
    for (let i = 0; i < nA; i++) { // chênes du plan moyen, de part et d'autre de la clairière
      const u = (i + 0.2 + r() * 0.6) / nA, cx = Math.round(M + W * u); if ((Math.abs(u - 0.5) < 0.13 && !etroit) || Math.abs(cx - lx) < Math.max(62, W * 0.15)) continue;
      const b = Math.round(hor + 14 + r() * 26), w = Math.round(9 + r() * 6 + (b - hor) * 0.12), yH = Math.round(M + H * 0.14 + r() * 20), cote = Math.sign(lx - cx) || 1;
      tronc(sol, cx, yH, b + 3, w * 0.7, w, P.ecorce, cote, 500 + i, P.feuilles.slice(1, 5));
      branche(sol, [[cx, yH + 40], [cx - 22, yH + 14], [cx - 40, yH + 4]], w * 0.4, 1.5, P.ecorce, cote); branche(sol, [[cx, yH + 56], [cx + 24, yH + 26], [cx + 44, yH + 18]], w * 0.4, 1.5, P.ecorce, cote);
      const bl = []; for (let j = 0; j < 34; j++) { const a = r() * 6.28, d = Math.pow(r(), 0.6) * 44; bl.push([cx + Math.cos(a) * d * 1.25, yH + 4 + Math.sin(a) * d * 0.62 - 6, 7 + r() * 9]); }
      bl.sort((p, q) => p[1] - q[1]);
      feuillage(sol, bl, P.feuilles, [lx, ly], 5, 0.4, 0.4);
      for (let j = 0; j < 5; j++) fougere(sol, cx + (r() - 0.5) * w * 3.4, b + 3 + r() * 4, 6 + r() * 7, r() < 0.5 ? -1 : 1, P.feuilles, r);
    }
    for (let i = 0; i < W / 9; i++) { const y = hor + 14 + r() * (LH - hor - 14), x = r() * LW; if (Math.abs(x - xs(y)) > hw(y) + 6) fougere(sol, Math.round(x), Math.round(y), 4 + ((y - hor) / (LH - hor)) * 9 * (0.5 + r()), r() < 0.5 ? -1 : 1, P.feuilles, r); }

    // Les rayons : deux toiles qui respirent chacune à son rythme.
    const rayons = [new Calque(LW, LH), new Calque(LW, LH)], nR = Math.max(4, Math.round(W / 80));
    for (let i = 0; i < nR; i++) {
      const cal = rayons[i % 2], x0 = lx + (i - nR * 0.45) * (W / nR) * 0.8 + (r() - 0.5) * 24, lw = 6 + r() * 20, pente = 0.5 + ((x0 - lx) / W) * -0.5 + r() * 0.08, yDeb = M + H * 0.08 + r() * 20;
      for (let y = Math.round(yDeb); y < LH; y++) {
        const c = x0 - (y - ly) * pente, f = borne((y - yDeb) / 30) * (1 - Math.pow(y / LH, 2) * 0.75), l2 = lw * (1 + (y / LH) * 0.6);
        for (let x = Math.floor(c - l2); x <= c + l2; x++) { const e = 1 - Math.abs(x - c) / l2; if (e * 1.6 > seuil(x, y)) cal.pt(x, y, alpha(P.rayon, Math.round(P.rayonA * f * (e > 0.5 ? 1 : 0.6)))); }
      }
    }

    // Le premier plan : deux chênes immenses qui encadrent, la voûte, les fougères du bas.
    const avant = new Calque(LW, LH), lt = borne(W * 0.058, 20, 40);
    const gx = Math.round(M + W * (etroit ? 0.03 : 0.055)), dx = Math.round(M + W * (etroit ? 0.99 : 0.955)), yT = Math.round(M + H * 0.16);
    const ep = (x) => H * (0.075 + 0.2 * Math.pow(Math.abs((2 * (x - M)) / W - 1), 1.7)) * (1 - trouee(x, W * 0.13) * 0.55);
    const arc = (x0, y0, dx, dy, n = 9) => { const o = []; for (let i = 0; i <= n; i++) { const k = i / n; o.push([x0 + dx * (k * 0.75 + 0.25 * k * k), y0 - dy * Math.sin(k * 1.45) + Math.sin(k * 9) * 2.5]); } return o; };
    tronc(avant, gx, yT, LH, lt, lt * 1.35, P.avantE, 1, 901, P.avantF.slice(1, 5)); tronc(avant, dx, yT - 10, LH, lt * 0.9, lt * 1.3, P.avantE, -1, 902, P.avantF.slice(1, 5));
    branche(avant, arc(gx + 4, yT + 78, lt * 4.6, 104), lt * 0.55, 2, P.avantE, 1); branche(avant, arc(gx + lt * 2.2, yT + 16, lt * 1.6, -22, 6), lt * 0.2, 1, P.avantE, 1);
    branche(avant, [[gx, yT + 30], [gx + lt * 0.9, yT - 12], [gx + lt * 1.4, yT - 44]], lt * 0.55, 3, P.avantE, 1);
    branche(avant, arc(dx - 4, yT + 92, -lt * 3.9, 96), lt * 0.5, 2, P.avantE, -1); branche(avant, arc(dx - lt * 1.8, yT + 34, -lt * 1.5, -18, 6), lt * 0.2, 1, P.avantE, -1);
    branche(avant, [[dx, yT + 24], [dx - lt * 0.8, yT - 14], [dx - lt * 1.5, yT - 40]], lt * 0.5, 3, P.avantE, -1);
    { const bl = [];
      for (let x = -10; x < LW + 10; x += 3) { const t = ep(x), n = Math.ceil(t / 7); for (let j = 0; j < n; j++) bl.push([x + (r() - 0.5) * 8, M - 6 + r() * r() * 0 + r() * t, 6 + r() * 8]); }
      for (let j = 0; j < 26; j++) { bl.push([gx + lt * (2.2 + r() * 2.9), yT - 4 + (r() - 0.5) * 34, 6 + r() * 7]); if (!etroit) bl.push([dx - lt * (1.9 + r() * 2.4), yT + 12 + (r() - 0.5) * 30, 5 + r() * 7]); }
      bl.sort((p, q) => p[1] - q[1]);
      feuillage(avant, bl, P.avantF, [lx, ly + 40], 6, 0.3, 0.52);
    }
    { const fa = fbm1(77, 3), RA = rampe(P.avantF);
      const yb = (x) => LH - 14 + (fa(x / 30) - 0.5) * 12 - Math.pow(Math.abs((2 * (x - M)) / W - 1), 3) * 26;
      for (let i = 0; i < W / 3.2; i++) { const x = Math.round(r() * LW); fougere(avant, x, Math.round(yb(x)) + 4, 10 + r() * 16 + Math.pow(Math.abs((2 * (x - M)) / W - 1), 3) * 14, r() < 0.5 ? -1 : 1, P.avantF, r); }
      crete(avant, yb, (x, y, d) => RA(0.5 - d / 20 + (hach(x * 3 + y * 5, 1) - 0.5) * 0.3, x, y));
      for (let x = 0; x < LW; x++) { const t0 = Math.round(yb(x)), hb = Math.round(hach(x, 12) * hach(x >> 2, 14) * 10); for (let k = 1; k <= hb; k++) avant.pt(x, t0 - k, P.avantF[k > 6 ? 4 : 3]); }
    }

    // Ce qui bouge : feuilles qui tombent le jour, lucioles la nuit.
    const vol = [];
    const nV = Math.round(borne((W * H) / (N ? 5200 : 7000), 16, 70));
    for (let i = 0; i < nV; i++) vol.push({ x: r() * W, y: r() * (H + 30), v: 5 + r() * 5, a: 4 + r() * 8, f: 0.5 + r() * 0.7, p: r() * 6.28, c: ["#f2c84a", "#e8963c", "#b8d85a", "#d86a34"][(r() * 4) | 0], b: r() * 6.28, q: 0.35 + r() * 0.5, loin: r() < 0.6 });
    E = { W, H, N, P, LW, LH, yS, xs, hw, fond: fond.fin(), milieu: milieu.fin(), pres: pres.fin(), sol: sol.fin(), rayons: rayons.map((c) => c.fin()), avant: avant.fin(), vol, eclats };
  }

  const FACT = [0.6, 1.3, 2, 3, 5.5];
  function dessiner(ctx, t, s) {
    if (!E) return;
    ctx.imageSmoothingEnabled = false;
    const ox = FACT.map((f) => Math.round(-s.x * f) - M), oy = FACT.map((f) => Math.round(-s.y * f * 0.35) - M), N = E.N;
    ctx.drawImage(E.fond, ox[0], oy[0]);
    ctx.drawImage(E.milieu, ox[1], oy[1]);
    ctx.drawImage(E.pres, ox[2], oy[2]);
    ctx.drawImage(E.sol, ox[3], oy[3]);
    // les éclats du ruisseau, qui descendent le courant
    ctx.fillStyle = E.P.eclat;
    for (const e of E.eclats) {
      const u = (e.u + (t / 52000) * e.v) % 1, y = Math.round(E.yS + Math.pow(u, 1.25) * (E.LH - E.yS)), h = E.hw(y), l = 1 + Math.round(h * 0.16);
      ctx.globalAlpha = Math.sin(u * Math.PI) * (0.45 + 0.4 * Math.sin(t * 0.0011 + e.p)) * (N ? 0.7 : 0.9);
      ctx.fillRect(Math.round(E.xs(y) + e.o * h * 0.55 + Math.sin(t * 0.0007 + e.p) * 1.5) + ox[3], y + oy[3], l, 1);
    }
    ctx.globalAlpha = 0.72 + 0.28 * Math.sin(t * 0.00042); ctx.drawImage(E.rayons[0], ox[3], oy[3]);
    ctx.globalAlpha = 0.72 + 0.28 * Math.sin(t * 0.00031 + 2); ctx.drawImage(E.rayons[1], ox[3], oy[3]);
    ctx.globalAlpha = 1;
    volants(ctx, t, true, ox[3] + M, oy[3] + M);
    ctx.drawImage(E.avant, ox[4], oy[4]);
    volants(ctx, t, false, ox[4] + M, oy[4] + M);
  }
  function volants(ctx, t, loin, ox, oy) {
    const { W, H, N } = E, ts = t / 1000;
    for (const v of E.vol) {
      if (v.loin !== loin) continue;
      if (N) { // une luciole : elle dérive et sa lumière monte et descend lentement
        const x = Math.round(v.x + Math.sin(ts * 0.11 * v.f + v.p) * 26 + Math.sin(ts * 0.31 + v.b) * 6) + ox, y = Math.round(H * 0.36 + (v.y / (H + 30)) * H * 0.6 + Math.sin(ts * 0.13 * v.f + v.b) * 14 + Math.cos(ts * 0.37 + v.p) * 4) + oy;
        const l = 0.5 + 0.5 * Math.sin(ts * v.q + v.p * 3); if (l < 0.08) continue;
        ctx.globalAlpha = l * 0.3; ctx.fillStyle = "#b8e85a"; ctx.fillRect(x - 1, y, 3, 1); ctx.fillRect(x, y - 1, 1, 3);
        if (!loin) { ctx.globalAlpha = l * 0.14; ctx.fillRect(x - 2, y - 1, 5, 3); ctx.fillRect(x - 1, y - 2, 3, 5); }
        ctx.globalAlpha = Math.min(1, l * 1.3); ctx.fillStyle = "#f6ffb8"; ctx.fillRect(x, y, 1, 1);
      } else { // une feuille : elle tombe en se balançant
        const y = ((v.y + ts * v.v) % (H + 30)) - 12, ph = ts * v.f + v.p, x = Math.round(v.x + Math.sin(ph) * v.a - ts * 1.2 * v.f) % (W + 20);
        const X = (x < -10 ? x + W + 20 : x) + ox, Y = Math.round(y) + oy, c = Math.cos(ph);
        ctx.fillStyle = v.c;
        if (c > 0.35) ctx.fillRect(X, Y, loin ? 2 : 3, 1); else if (c < -0.35) { ctx.fillRect(X, Y, 1, 1); ctx.fillRect(X + 1, Y + 1, loin ? 1 : 2, 1); } else ctx.fillRect(X, Y, loin ? 1 : 2, 2);
      }
    }
    ctx.globalAlpha = 1;
  }

  (window.FONDS = window.FONDS || []).push({ id: "p2-foret", nom: "La forêt des chênes", famille: "paysage", credit: null, monter, dessiner });
})();
