// Site du clan [GAL] (AGPL-3.0-only). Paysage animé du fond de « Mon Gaulois », dessin en cases de Claude Fable 5.2,
// 21 novembre 2026, choisi par le pilote avec les sept autres ; ils tournent toutes les 15 minutes (src/lib/jeu/fonds-du-jeu.ts,
// tenu par src/scripts/jeu.ts). Script classique : il ajoute son fond à window.FONDS, rien d'autre.
// Fond de « Mon Gaulois » : p1-camp.
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

  // ---- Le camp de guerre : des tentes de peaux au pied des collines, des étendards, la fumée des feux.
  const H_ = (a) => a.map(hex);
  const PAL = {
    jour: {
      ciel: H_(["#2466c8", "#3a84dc", "#56a2ea", "#7fbff2", "#aedaf6", "#d9edf2", "#f6ecca", "#fcdca4"]),
      nuage: H_(["#9fc0e6", "#cfe2f6", "#eef6fd", "#ffffff"]),
      r1: H_(["#9bbde0", "#b6d0ea", "#cfe2f2"]), r2: H_(["#6f9fca", "#8fb6d8", "#b3d0e6"]), r3: H_(["#3d8a6c", "#4f9f72", "#6cb57c", "#93cb8c"]),
      bois3: hex("#2f7560"),
      sol: H_(["#357f42", "#4a9a46", "#63b04c", "#83c556", "#a6d86a", "#c5e684"]),
      chemin: H_(["#a67c4c", "#c69c66", "#dfbd86", "#efd6a4"]),
      toile: H_(["#7c5c40", "#a98a5e", "#d3bc8e", "#eedfba", "#fff7e0"]), chaud: null,
      porte: hex("#3c2a22"), bois: hex("#5c3c24"), boisC: hex("#9a7046"), fer: hex("#dfe6f0"), pierre: hex("#8c8f9c"),
      avant: H_(["#143c30", "#1c5236", "#27693c", "#3a8444"]),
      ombre: hex("#1f5a38"), fumee: "#ffffff", fumeeA: 0.78,
      fleurs: H_(["#ffffff", "#ffe36a", "#f0605a"]),
    },
    nuit: {
      ciel: H_(["#030614", "#060b20", "#0a1230", "#0f1a44", "#162355", "#1e2f68", "#2a3d7c", "#38508e"]),
      nuage: H_(["#0e183c", "#16234e", "#223468", "#34498a"]),
      r1: H_(["#1a2858", "#22336a", "#2c4078"]), r2: H_(["#131e48", "#19285a", "#22346a"]), r3: H_(["#0b1532", "#0f1c3e", "#14264c", "#1b3058"]),
      bois3: hex("#091028"),
      sol: H_(["#081024", "#0b1730", "#0f203e", "#142a4c", "#1a345a", "#213e68"]),
      chemin: H_(["#171f40", "#1f2a50", "#283560", "#324270"]),
      toile: H_(["#0c1430", "#141e44", "#1d2b58", "#28396c", "#364a80"]),
      chaud: H_(["#3a1a2a", "#7a3222", "#bf5a26", "#ee9a3a", "#ffd478"]),
      porte: hex("#070b1c"), bois: hex("#0a0f24"), boisC: hex("#2a2440"), fer: hex("#8fa4d8"), pierre: hex("#2c3558"),
      avant: H_(["#040816", "#060c1e", "#091228", "#0d1a34"]),
      ombre: hex("#060c20"), fumee: "#9aa6d4", fumeeA: 0.5,
      fleurs: H_(["#3b4c84", "#3b4c84", "#3b4c84"]),
    },
  };
  const ROUGE = { c: ["#f0604c", "#d23a3a", "#9c2634"], p: H_(["#f0604c", "#d23a3a", "#9c2634"]) };
  const BLEU = { c: ["#5c88ee", "#2f5fd0", "#2042a0"], p: H_(["#5c88ee", "#2f5fd0", "#2042a0"]) };
  const ROUGE_N = { c: ["#c8483e", "#8e2a34", "#561a30"], p: H_(["#c8483e", "#8e2a34", "#561a30"]) };
  const BLEU_N = { c: ["#3e62c4", "#2440a0", "#16286c"], p: H_(["#3e62c4", "#2440a0", "#16286c"]) };
  const OR = ["#ffe27a", "#f2c230", "#b8861c"];
  const OR_N = ["#d8b050", "#a88028", "#6a5020"];
  const LETTRES = { "[": ["11", "10", "10", "10", "11"], G: ["111", "100", "101", "101", "111"], A: ["010", "101", "111", "101", "101"], L: ["100", "100", "100", "100", "111"], "]": ["11", "01", "01", "01", "11"] };

  let E = null;


  // Une tente à faîtière : un pignon avec sa porte, et un pan de toit qui file d'un côté (o.sens).
  function tente(c, cx, by, w, o) {
    const g = Math.max(4, Math.round(w * 0.44)), h = Math.max(3, Math.round(w * 0.46)), L = w - g, s = o.sens;
    const ax = Math.round(cx - (s * w) / 2 + (s * g) / 2), R = rampe(o.rp), RC = o.rpC ? rampe(o.rpC) : null;
    const versPignon = o.chaud * s < 0, pas = Math.max(3, Math.round(w / 7));
    for (let dy = 0; dy < h; dy++) {
      const y = by - h + dy, half = Math.round(((dy + 0.5) / h) * (g / 2)), b = dy / h;
      for (let j = 1; j <= L; j++) { // le pan de toit
        const x = ax + s * (half + j);
        let v = (s > 0 ? 0.74 : 0.5) - b * 0.2 + (hach(x * 31 + y * 17, 5) - 0.5) * 0.05, col;
        if (j % pas === 0 && w >= 16) v -= 0.2;
        if (j > L - 2) v -= 0.18;
        if (RC) col = RC((versPignon ? 0.3 : 0.74) - b * 0.12 - (j % pas === 0 && w >= 16 ? 0.15 : 0) + (o.chaud * (x - cx) / w) * 0.3, x, y); else col = R(v, x, y);
        if (w >= 14 && b > 0.68 && b < 0.84) col = RC ? (versPignon ? o.bande[2] : o.bande[0]) : s > 0 ? o.bande[0] : o.bande[1];
        if (w >= 60 && b > 0.6 && b < 0.64) col = o.bande2;
        if (w >= 60 && dy > 2 && dy % 13 === 0 && (j + dy) % 5 < 3) col = RC ? o.rpC[1] : o.rp[1];
        if (dy === 0) col = RC ? o.rpC[versPignon ? 2 : 4] : o.rp[4];
        c.pt(x, y, col);
      }
      for (let dx = -half; dx <= half; dx++) { // le pignon
        const x = ax + dx;
        let col = RC ? RC((versPignon ? 0.8 : 0.3) - b * 0.1 - (dx * s) / g * 0.2, x, y) : R((s > 0 ? 0.36 : 0.78) - b * 0.12 + (hach(x * 31 + y * 17, 5) - 0.5) * 0.05, x, y);
        if (half > 0 && Math.abs(dx) === half) col = RC ? o.rpC[1] : o.rp[s > 0 ? 0 : 1];
        c.pt(x, y, col);
      }
    }
    const ph = Math.max(2, Math.round(h * 0.62)), pw = Math.max(0.6, g * 0.17);
    for (let dy = 0; dy < ph; dy++) { const half = Math.round(((dy + 1) / ph) * pw); for (let dx = -half; dx <= half; dx++) c.pt(ax + dx, by - ph + dy, o.porte); if (w >= 20) c.pt(ax + s * (half + 1), by - ph + dy, o.rabat); }
    c.pt(ax, by - h - 1, o.bois); if (w >= 20) { c.pt(ax, by - h - 2, o.bois); c.pt(ax + s * (L + 1), by - h - 1, o.bois); c.pt(ax - s, by - h, o.bois); }
    if (w >= 40) { c.ligne(ax + s * (g / 2 + L), by - Math.round(h * 0.3), ax + s * (g / 2 + L + 7), by, o.bois); c.ligne(ax - s * Math.round(g / 2 - 1), by - Math.round(h * 0.3), ax - s * Math.round(g / 2 + 6), by, o.bois); }
  }

  function bouclier(c, cx, cy, rx, ry, cols, bord, or) {
    for (let y = -ry; y <= ry; y++) for (let x = -rx; x <= rx; x++) {
      const d = (x * x) / (rx * rx + 0.6) + (y * y) / (ry * ry + 0.6); if (d > 1) continue;
      let col = d > 0.72 ? bord : (x + y * 0.4) / rx > 0.25 ? cols[2] : (x + y * 0.4) / rx < -0.3 ? cols[0] : cols[1];
      if (x === 0 && d <= 0.72) col = bord;
      c.pt(cx + x, cy + y, col);
    }
    c.rect(cx - 1, cy - 1, 3, 3, or); c.pt(cx - 1, cy - 1, hex("#fff3b0"));
  }

  function faisceau(c, x, by, n, haut, P, r) {
    const sx = x, sy = by - haut * 0.72;
    for (let i = 0; i < n; i++) {
      const bx = x + Math.round((i - (n - 1) / 2) * (haut * 0.16)), dx = sx - bx, tx = Math.round(sx + dx * 0.36), ty = Math.round(by - haut - (r() * 4));
      c.ligne(bx, by, tx, ty, i % 2 ? P.bois : P.boisC);
      c.pt(tx, ty, P.fer); c.pt(tx, ty - 1, P.fer); c.pt(tx, ty - 2, P.fer); c.pt(tx + (dx > 0 ? 1 : dx < 0 ? -1 : 0), ty - 3, P.fer); c.pt(tx - 1, ty - 1, P.fer); c.pt(tx + 1, ty - 1, P.fer);
    }
    c.rect(sx - 1, Math.round(sy), 3, 2, P.boisC);
  }

  function banniere(coul, or, texte, w, h) {
    // Trois toiles de la même bannière (claire, normale, ombrée) : le pli choisit laquelle montrer, colonne par colonne.
    const out = [];
    for (let k = 0; k < 3; k++) {
      const c = new Calque(w, h), fond = hex(coul.c[k]), o = hex(or[k]), creme = hex(["#fffbe8", "#f4ecd0", "#c9c0aa"][k]);
      for (let x = 0; x < w; x++) for (let y = 0; y < h; y++) {
        const fin = x - (w - 7); // queue d'aronde
        if (fin > 0 && Math.abs(y - (h - 1) / 2) < fin * 0.9) continue;
        let col = fond;
        if (y < 2 || y >= h - 2) col = o;
        else if (y === 2 || y === h - 3) col = hex(coul.c[2]);
        c.pt(x, y, col);
      }
      if (texte) { let x = 3; const y0 = (h >> 1) - 2; for (const ch of texte) { const g = LETTRES[ch]; for (let j = 0; j < 5; j++) for (let i = 0; i < g[j].length; i++) if (g[j][i] === "1") c.pt(x + i, y0 + j, creme); x += g[0].length + 1; } }
      else { // une roue à quatre rayons, en or
        const cx = Math.round(w * 0.4), cy = (h - 1) / 2;
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const d = Math.hypot(x - cx, y - cy); if ((d > 3.6 && d < 5.2) || (d < 4 && (x === cx || Math.abs(y - cy) < 0.6))) c.pt(x, y, o); }
      }
      out.push(c.fin());
    }
    return out;
  }

  function monter(o) {
    const W = o.largeur, H = o.hauteur, N = o.sombre, P = N ? PAL.nuit : PAL.jour, LW = W + 2 * M, LH = H + 2 * M;
    const r = alea(120711), etroit = W < 300;
    const hor = Math.round(LH * 0.47);
    const rouge = N ? ROUGE_N : ROUGE, bleu = N ? BLEU_N : BLEU, or = N ? OR_N : OR;

    // Le ciel, son astre.
    const ciel = new Calque(LW, LH);
    degrade(ciel, P.ciel, 4, hor + 6, N ? 1.15 : 0.9);
    const ax = Math.round(M + W * (etroit ? 0.89 : 0.875)), ay = Math.round(M + Math.max(38, H * 0.15));
    if (N) {
      etoiles(ciel, r, Math.round((LW * hor) / 260), hor - 6, H_(["#4a5c9c", "#8ea4de", "#f2f5ff"]), [ax, ay, 22]);
      lueur(ciel, ax, ay, 9, 34, hex("#4f68b4"), 0.5);
      ciel.disque(ax, ay, 9, hex("#f4f0d8")); ciel.disque(ax + 5, ay - 3, 8, ciel.lire(ax + 22, ay - 20));
      for (let y = -9; y <= 9; y++) for (let x = -9; x <= 9; x++) { const c0 = ciel.lire(ax + x, ay + y); if (c0 === hex("#f4f0d8") && (x + y * 0.5 > -3) && seuil(x, y) > 0.55) ciel.pt(ax + x, ay + y, hex("#d8d4c0")); }
    } else {
      lueur(ciel, ax, ay, 10, 60, hex("#fff6cc"), 0.75);
      ciel.disque(ax, ay, 10, hex("#fff9dc")); ciel.disque(ax, ay, 8, hex("#ffffff"));
    }
    { const rb = alea(77), nbB = Math.max(3, Math.round(LW / 130));
      for (let i = 0; i < nbB; i++) { const w = Math.round(70 + rb() * 80); nuage(ciel, Math.round(((i + 0.2 + rb() * 0.6) / nbB) * LW), hor - 18 + Math.round(rb() * 10), w, Math.round(w * (N ? 0.22 : 0.34)), N ? P.nuage.slice(0, 3) : P.nuage, rb, 0.35); } }
    // Les nuages, sur une bande qui tourne.
    const NW = LW + 120, nu = new Calque(NW, hor);
    const nb = Math.max(4, Math.round(NW / (N ? 150 : 95)));
    for (let i = 0; i < nb; i++) {
      const prof = r(), w = Math.round((N ? 46 : 30) + prof * (N ? 60 : 62)), h = Math.round(N ? 5 + prof * 6 : 8 + prof * 15);
      nuage(nu, Math.round(((i + r() * 0.8) / nb) * NW), Math.round(26 + (1 - prof) * (hor - 80) * 0.75 + r() * 14), w, h, P.nuage, r, N ? 0.3 : 0.35);
    }

    // Les collines du fond, trois plans dans la brume.
    const loin = new Calque(LW, LH), f1 = fbm1(11, 4), f2 = fbm1(23, 4), f3 = fbm1(37, 4), g2 = fbm2(5, 3);
    const R1 = rampe(P.r1), R2 = rampe(P.r2), R3 = rampe(P.r3);
    crete(loin, (x) => hor - 26 - f1(x / 85) * 44 - Math.max(0, Math.sin(x / 61 + 1)) * 10, (x, y, d) => (d < 1 ? P.r1[2] : R1(0.15 + d / 60 + (g2(x / 12, y / 5) - 0.5) * 0.5, x, y)));
    crete(loin, (x) => hor - 12 - f2(x / 60) * 30 - (hach(x >> 1, 3) > 0.6 ? 1 : 0), (x, y, d) => R2(d / 34 + (g2(x / 9, y / 4) - 0.5) * 0.45, x, y));
    const proche = new Calque(LW, LH);
    const h3 = (x) => hor - 1 - f3(x / 48) * 20;
    crete(proche, h3, (x, y, d) => {
      const bois = g2(x / 22 + 9, y / 7) > 0.56 && d > 1 && d < 16;
      if (bois) return seuil(x, y) > 0.42 + (hach(x * 7 + y * 3, 8) - 0.5) * 0.5 ? P.bois3 : P.r3[0];
      return R3(0.25 + d / 26 + (g2(x / 14, y / 5) - 0.5) * 0.7 + (d < 2 ? 0.35 : 0), x, y);
    });
    // Une tour de guet en bois sur une crête, avec son fanion.
    const drapeaux = [], tx = Math.round(M + W * (etroit ? 0.18 : 0.36)), ty = Math.round(h3(tx));
    proche.rect(tx - 2, ty - 13, 5, 3, P.bois); proche.rect(tx - 3, ty - 14, 7, 1, P.bois); proche.ligne(tx - 2, ty - 10, tx - 3, ty + 1, P.bois); proche.ligne(tx + 2, ty - 10, tx + 3, ty + 1, P.bois);
    proche.ligne(tx - 2, ty - 6, tx + 2, ty - 2, P.bois); proche.ligne(tx + 2, ty - 6, tx - 2, ty - 2, P.bois); proche.rect(tx, ty - 21, 1, 7, P.bois);
    drapeaux.push({ x: tx + 1, y: ty - 21, w: 5, h: 3, c: rouge.c, ph: 0.4, amp: 0.2, k: 2 });

    // La plaine du camp : herbe, chemin de terre, rangs de tentes de plus en plus grandes.
    const plaine = new Calque(LW, LH), RS = rampe(P.sol), RCh = rampe(P.chemin), fs = fbm1(53, 3), g3 = fbm2(71, 3);
    const chemin = (y) => LW / 2 + Math.sin((y - hor) * 0.03 + 0.6) * (10 + (y - hor) * 0.12) - (y - hor) * 0.04;
    crete(plaine, (x) => hor + 5 + fs(x / 30) * 5, (x, y, d) => {
      const pr = (y - hor) / (LH - hor), dc = Math.abs(x - chemin(y)), lc = 2.5 + (y - hor) * 0.15 + (g3(x / 9, y / 6) - 0.5) * 6;
      if (dc < lc) return RCh(0.75 - pr * 0.5 + (g3(x / 7, y / 3) - 0.5) * 0.7 - (dc > lc - 2 ? 0.3 : 0), x, y);
      return RS(0.82 - pr * 0.42 + (g3(x / 26, y / 8) - 0.5) * 0.75 + (d < 2 ? 0.2 : 0), x, y);
    });
    for (let i = 0; i < (LW * (LH - hor)) / 55; i++) { // brins et fleurs
      const x = (r() * LW) | 0, y = (hor + 12 + r() * (LH - hor - 12)) | 0, pr = (y - hor) / (LH - hor), k = r();
      if (Math.abs(x - chemin(y)) < 5 + (y - hor) * 0.17) continue;
      if (k < 0.72) { const c0 = P.sol[k < 0.36 ? 0 : 5]; plaine.pt(x, y, c0); if (pr > 0.35) plaine.pt(x, y - 1, c0); }
      else if (pr > 0.2) plaine.pt(x, y, P.fleurs[(k * 97) % 3 | 0]);
    }
    const feux = [], grands = [];
    const rangs = []; { let y = hor + 15; while (y < LH - 62) { const w = Math.round(13 + (y - hor) * 0.4); rangs.push([y, w]); y += Math.max(9, Math.round(w * 0.5) + 5); } }
    for (const [y, w] of rangs) {
      const items = []; let x = -r() * w * 2;
      while (x < LW + w) {
        const cx = Math.round(x), dc = Math.abs(cx - chemin(y)), vide = 8 + (y - hor) * 0.44, k = r();
        if (dc > vide + w * 0.55) items.push({ x: cx, t: k < 0.54 ? "t" : k < 0.7 ? "f" : k < 0.8 ? "v" : "" });
        x += w * (1.12 + r() * 0.8);
      }
      const lesFeux = items.filter((i) => i.t === "f");
      for (const f of lesFeux) { // le foyer, sa lueur la nuit
        const s = Math.max(1, Math.round(w / 14));
        if (N) { lueur(plaine, f.x, y, w * 0.2, w * 1.9, hex("#f08a30"), 0.62, 0.42); lueur(plaine, f.x, y, 1, w * 0.7, hex("#ffd070"), 0.6, 0.45); } else lueur(plaine, f.x, y, w * 0.25, w * 0.85, P.chemin[2], 0.8, 0.36);
        plaine.rect(f.x - s - 1, y - 1, s * 2 + 3, 1, P.pierre); plaine.rect(f.x - s, y - 2, s * 2 + 1, 1, P.bois);
        if (s > 1) { plaine.pt(f.x - s - 2, y - 1, P.pierre); plaine.pt(f.x + s + 2, y - 1, P.pierre); plaine.ligne(f.x - s, y - 2, f.x + s - 1, y - 2 - s, P.bois); }
        feux.push({ x: f.x, y: y - 2, s, ph: r() * 9, k: 3 });
      }
      for (const it of items) {
        if (it.t !== "t") continue;
        let chaud = 0;
        if (N) { let best = 1e9; for (const f of lesFeux) { const d = f.x - it.x; if (Math.abs(d) < Math.abs(best)) best = d; } if (Math.abs(best) < w * 2.6) chaud = Math.sign(best); }
        const coul = r() < 0.5 ? rouge : bleu, cote = 1;
        if (!N) lueur(plaine, it.x - w * 0.12, y, w * 0.3, w * 0.72, P.ombre, 0.55, 0.2);
        tente(plaine, it.x, y, w, { sens: r() < 0.5 ? 1 : -1, rp: P.toile, rpC: chaud ? P.chaud : null, chaud, cote, bande: chaud ? [hex(N ? "#ffb04a" : coul.c[0]), coul.p[1], coul.p[2]] : coul.p, bande2: P.toile[1], porte: N && r() < 0.3 ? hex("#f2a23a") : P.porte, rabat: chaud ? P.chaud[3] : P.toile[4], bois: P.bois });
        if (r() < 0.36 && w >= 11) { // un étendard planté à côté
          const px = it.x + Math.round(w * 0.6), hp = Math.round(w * 0.95);
          plaine.rect(px, y - hp, 1, hp, P.bois); plaine.pt(px, y - hp - 1, hex(or[1]));
          drapeaux.push({ x: px + 1, y: y - hp + 1, w: Math.max(4, Math.round(w * 0.26)), h: Math.max(3, Math.round(w * 0.17)), c: (coul === rouge ? bleu : rouge).c, ph: r() * 6, amp: 0.16, k: 3 });
        }
      }
      for (const it of items) if (it.t === "v" && w >= 16) { // faisceau de lances et boucliers
        faisceau(plaine, it.x, y, 3, Math.round(w * 0.62), P, r);
        const rx = Math.max(1, Math.round(w / 17)), ry = Math.max(2, Math.round(w / 10));
        bouclier(plaine, it.x - rx * 2 - 1, y - ry, rx, ry, rouge.p, P.bois, hex(or[1])); bouclier(plaine, it.x + rx * 2 + 1, y - ry, rx, ry, bleu.p, P.bois, hex(or[1]));
      }
    }

    // Le premier plan : talus sombre, deux grandes tentes dans les coins, les deux grands étendards.
    const avant = new Calque(LW, LH), fa = fbm1(91, 3), RA = rampe(P.avant), g4 = fbm2(15, 2);
    const talus = (x) => LH - 30 + fa(x / 40) * 12 - Math.pow(Math.abs(x - LW / 2) / (LW / 2), 2) * 12;
    const baseY = Math.min(LH - 34, hor + 158);
    const posG = etroit ? M + 12 : Math.round(M + W * 0.232), posD = etroit ? M + W - 40 : Math.round(M + W * 0.905), hautMat = baseY - Math.round(M + H * 0.27);
    for (const [px, coul] of [[posG, rouge], [posD, bleu]]) { // les mâts, plantés dans la plaine devant le talus
      avant.rect(px, baseY - hautMat, 2, hautMat + 40, P.bois); for (let y = baseY - hautMat; y < baseY + 40; y++) if (hach(y, 4) > 0.3) avant.pt(px + 1, y, P.boisC);
      avant.rect(px - 1, baseY - hautMat + 2, 4, 1, hex(or[1])); avant.rect(px - 1, baseY - hautMat + 25, 4, 1, hex(or[2]));
      const ry = baseY - hautMat - 4; for (let y = -3; y <= 3; y++) for (let x = -3; x <= 3; x++) { const d = Math.hypot(x, y); if ((d > 2.2 && d < 3.6) || x === 0 || y === 0) if (d < 3.6) avant.pt(px + x, ry + y, hex(or[d > 2.2 ? 1 : 0])); }
      grands.push({ x: px + 2, y: baseY - hautMat + 3, im: banniere(coul, or, coul === rouge ? "[GAL]" : null, 30, 21), ph: coul === rouge ? 0 : 2.2 });
    }
    crete(avant, talus, (x, y, d) => RA(0.95 - d / 26 + (g4(x / 10, y / 5) - 0.5) * 0.8, x, y));
    for (let x = 0; x < LW; x++) { const t0 = Math.round(talus(x)), hb = Math.round(hach(x, 12) * hach(x >> 2, 14) * 9); for (let k = 1; k <= hb; k++) avant.pt(x + (k > 4 && hach(x, 3) > 0.5 ? 1 : 0), t0 - k, P.avant[k > 5 ? 3 : 2]); }
    if (!etroit) {
      const tg = Math.round(M + W * 0.075), td = Math.round(M + W * 0.945);
      if (N) { feux.push({ x: Math.round(M + W * 0.3), y: LH - 24, s: 4, ph: 3, k: 4 }); lueur(avant, Math.round(M + W * 0.3), LH - 22, 6, 90, hex("#f08a30"), 0.5, 0.5); }
      else feux.push({ x: Math.round(M + W * 0.3), y: LH - 24, s: 4, ph: 3, k: 4 });
      const fx = Math.round(M + W * 0.3); avant.rect(fx - 6, LH - 23, 13, 2, P.pierre); avant.rect(fx - 5, LH - 25, 11, 2, P.bois); avant.ligne(fx - 5, LH - 25, fx + 3, LH - 29, P.boisC); avant.ligne(fx + 5, LH - 25, fx - 3, LH - 29, P.bois);
      tente(avant, tg, LH - 12, 150, { sens: 1, rp: P.toile, rpC: N ? P.chaud : null, chaud: 1, cote: 1, bande: rouge.p, bande2: hex(or[2]), porte: P.porte, rabat: N ? P.chaud[3] : P.toile[4], bois: P.bois });
      tente(avant, td, LH - 10, 140, { sens: -1, rp: P.toile, rpC: null, chaud: 0, cote: 1, bande: bleu.p, bande2: hex(or[2]), porte: N ? hex("#f2a23a") : P.porte, rabat: P.toile[4], bois: P.bois });
      const sx = Math.round(M + W * 0.775);
      faisceau(avant, sx, LH - 16, 5, 62, P, r);
      bouclier(avant, sx - 13, LH - 26, 6, 10, rouge.p, P.bois, hex(or[1])); bouclier(avant, sx + 12, LH - 25, 6, 10, bleu.p, P.bois, hex(or[1])); bouclier(avant, sx + 26, LH - 22, 5, 9, rouge.p, P.bois, hex(or[1]));
    }
    E = { W, H, N, P, LW, LH, NW, ciel: ciel.fin(), nu: nu.fin(), loin: loin.fin(), proche: proche.fin(), plaine: plaine.fin(), avant: avant.fin(), feux, drapeaux, grands };
  }

  const FACT = [0.6, 1.2, 2, 3.2, 5.5];
  function dessiner(ctx, t, s) {
    if (!E) return;
    ctx.imageSmoothingEnabled = false;
    const ox = FACT.map((f) => Math.round(-s.x * f) - M), oy = FACT.map((f) => Math.round(-s.y * f * 0.35) - M);
    ctx.drawImage(E.ciel, ox[0], oy[0]);
    const dn = Math.floor(t * 0.0035) % E.NW;
    ctx.drawImage(E.nu, ox[0] - dn, oy[0]); ctx.drawImage(E.nu, ox[0] - dn + E.NW, oy[0]);
    ctx.drawImage(E.loin, ox[1], oy[1]);
    ctx.drawImage(E.proche, ox[2], oy[2]);
    ctx.drawImage(E.plaine, ox[3], oy[3]);
    fumees(ctx, t, 3, ox[3], oy[3]);
    flammes(ctx, t, 3, ox[3], oy[3]);
    for (const f of E.drapeaux) {
      const X = f.x + ox[f.k], Y = f.y + oy[f.k];
      for (let i = 0; i < f.w; i++) { const a = t * 0.0019 + f.ph - i * 0.55, co = Math.cos(a); ctx.fillStyle = co > 0.45 ? f.c[0] : co < -0.45 ? f.c[2] : f.c[1]; ctx.fillRect(X + i, Y + Math.round(Math.sin(a) * (0.25 + i * f.amp)), 1, f.h); }
    }
    ctx.drawImage(E.avant, ox[4], oy[4]);
    for (const g of E.grands) {
      const X = g.x + ox[4], Y = g.y + oy[4];
      for (let i = 0; i < 30; i++) { const a = t * 0.0016 + g.ph - i * 0.27, co = Math.cos(a); ctx.drawImage(g.im[co > 0.5 ? 0 : co < -0.5 ? 2 : 1], i, 0, 1, 21, X + i, Y + Math.round(Math.sin(a) * (0.2 + i * 0.075)), 1, 21); }
    }
    fumees(ctx, t, 4, ox[4], oy[4]);
    flammes(ctx, t, 4, ox[4], oy[4]);
  }
  function flammes(ctx, t, k, ox, oy) {
    for (const f of E.feux) {
      if (f.k !== k) continue;
      const X = f.x + ox, Y = f.y + oy, s = f.s;
      for (let j = -s; j <= s; j++) {
        const hgt = Math.max(1, Math.round((s + 1 - Math.abs(j)) * 1.5 + Math.sin(t * 0.0042 + j * 1.9 + f.ph) * 0.7 * s));
        ctx.fillStyle = "#f0702a"; ctx.fillRect(X + j, Y - hgt, 1, hgt);
        if (Math.abs(j) < s) { const h2 = Math.max(1, Math.round(hgt * 0.55)); ctx.fillStyle = "#ffc84a"; ctx.fillRect(X + j, Y - h2, 1, h2); }
        if (j === 0 && s > 2) { ctx.fillStyle = "#fff4c0"; ctx.fillRect(X, Y - 2, 1, 2); }
      }
    }
  }
  function fumees(ctx, t, k, ox, oy) {
    const P = E.P; ctx.fillStyle = P.fumee;
    for (const f of E.feux) {
      if (f.k !== k) continue;
      const n = 11, s = f.s, haut = 30 + s * 17;
      for (let i = 0; i < n; i++) {
        const p = (t / 17000 + i / n + f.ph) % 1, ta = 2 + Math.floor(p * (2.5 + s * 1.8));
        const x = Math.round(f.x + ox + p * p * (6 + s * 5) + Math.sin(p * 5 + i * 2.1 + f.ph) * 1.4 * s * p - ta / 2), y = Math.round(f.y + oy - 3 - s - p * haut);
        ctx.globalAlpha = Math.min(1, p * 9) * Math.pow(1 - p, 1.15) * P.fumeeA;
        if (ta <= 2) ctx.fillRect(x, y, ta, ta); else { ctx.fillRect(x + 1, y, ta - 2, ta); ctx.fillRect(x, y + 1, ta, ta - 2); }
      }
    }
    ctx.globalAlpha = 1;
  }

  (window.FONDS = window.FONDS || []).push({ id: "p1-camp", nom: "Le camp de guerre", famille: "paysage", credit: null, monter, dessiner });
})();
