// Site du clan [GAL] (AGPL-3.0-only). Paysage animé du fond de « Mon Gaulois », dessin en cases de Claude Fable 5.2,
// 21 novembre 2026, choisi par le pilote avec les sept autres ; ils tournent toutes les 15 minutes (src/lib/jeu/fonds-du-jeu.ts,
// tenu par src/scripts/jeu.ts). Script classique : il ajoute son fond à window.FONDS, rien d'autre.
// Fond de « Mon Gaulois » : p3-falaises.
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

  // ---- Les falaises et la flotte : de hautes falaises de craie, une mer qui bouge, des voiliers au loin.
  const H_ = (a) => a.map(hex);
  const PAL = {
    jour: {
      ciel: H_(["#1c5cc0", "#327cd8", "#4f9ce8", "#7cbef2", "#aedcf8", "#d8f0f8", "#f4f6e6"]),
      nuage: H_(["#9cc0e8", "#cfe4f8", "#f0f8ff", "#ffffff"]),
      mer: H_(["#123c80", "#1a549c", "#2470b4", "#308cc8", "#4ca8d8", "#7cc8e4", "#b0e4ee", "#dcf4f4"]),
      craie: H_(["#5c6c8c", "#8894ac", "#b0b8c4", "#d4d4d0", "#f0eada", "#fffaec"]),
      craieLoin: [H_(["#a4bcdc", "#bcd0e6", "#d4e2ee", "#e8f0f4"]), H_(["#8ea6c8", "#aabcd4", "#c8d4de", "#e2e6e4"])],
      herbe: H_(["#2c6c3c", "#3c8844", "#58a44c", "#80c058", "#b0d870"]), herbeLoin: [hex("#a8ccb4"), hex("#84b894")], terre: hex("#8c6444"),
      avant: H_(["#123828", "#1a4c30", "#24643a", "#388042", "#5ca04c"]), fleurs: H_(["#f48cb4", "#ffffff", "#ffe064"]),
      coque: H_(["#2c1c1c", "#4c3024", "#7c5434"]), mat: hex("#3c2820"), voile: H_(["#fff8e4", "#ecdcb8", "#c4b08c"]),
      crete: "#f0fcff", creteO: "#1c5ca0", ecume: "#ffffff", reflet: "#fffbe0", refletA: 0.62,
      bois: hex("#5c3c24"),
    },
    nuit: {
      ciel: H_(["#030614", "#060b20", "#0a1230", "#0f1a44", "#162355", "#1e2f68", "#2a3d7c"]),
      nuage: H_(["#0e183c", "#16234e", "#223468", "#34498a"]),
      mer: H_(["#030818", "#060e26", "#0a1636", "#0f2048", "#152c5c", "#1d3a70", "#284a84", "#365c98"]),
      craie: H_(["#060a1c", "#0b122c", "#121c40", "#1b2a58", "#2a3e74", "#4a629c"]),
      craieLoin: [H_(["#1a2a5c", "#22346a", "#2c4078", "#384e88"]), H_(["#121e4a", "#1a2858", "#243468", "#30427a"])],
      herbe: H_(["#061420", "#0a1e2c", "#102c3a", "#183c48", "#24505a"]), herbeLoin: [hex("#1c3460"), hex("#142850")], terre: hex("#0c1024"),
      avant: H_(["#02060e", "#040a16", "#07101e", "#0c1a2a", "#14283a"]), fleurs: H_(["#2c3c64", "#3c4c7c", "#2c3c64"]),
      coque: H_(["#03050e", "#070b18", "#101830"]), mat: hex("#050814"), voile: H_(["#3c4c84", "#28366c", "#182450"]),
      crete: "#6c8cc8", creteO: "#040a1c", ecume: "#8ca8dc", reflet: "#f6f0d4", refletA: 0.8,
      bois: hex("#060a18"),
    },
  };
  const ROUGE = H_(["#e85848", "#c83a3a", "#94283a"]), BLEU = H_(["#5884e8", "#2f5fd0", "#2042a0"]), ROUGE_N = H_(["#7c3048", "#5c2040", "#3c1838"]), BLEU_N = H_(["#2c48a4", "#1c3084", "#142060"]);
  let E = null;

  function navire(w, coul, P) {
    const h = Math.round(w * 0.92), c = new Calque(w + 6, h + 2), mx = 3 + (w >> 1), pont = h - 4;
    for (let x = 0; x < w; x++) {
      const u = (x - (w - 1) / 2) / ((w - 1) / 2), top = pont - Math.round(Math.pow(Math.abs(u), 3) * w * 0.2), bas = h - Math.round(Math.pow(Math.abs(u), 2.2) * 3.4);
      for (let y = top; y <= bas; y++) c.pt(x + 3, y, y === top ? P.coque[2] : y >= bas - (w > 20 ? 1 : 0) ? P.coque[0] : P.coque[1]);
    }
    c.pt(2, pont - Math.round(w * 0.2) - 1, P.coque[2]); c.pt(w + 3, pont - Math.round(w * 0.2) - 1, P.coque[2]); c.pt(w + 4, pont - Math.round(w * 0.2) - 2, P.coque[2]);
    c.rect(mx, 1, 1, pont - 1, P.mat);
    const sw = Math.max(5, Math.round(w * 0.64)) | 1, sx = mx - (sw >> 1), sy = 3, sh = Math.max(3, pont - sy - 2), pas = Math.max(2, Math.round(sw / 5));
    for (let j = 0; j < sh; j++) for (let i = 0; i < sw; i++) {
      if ((j === sh - 1) && (i < 1 || i > sw - 2)) continue;
      const bombe = Math.round(Math.sin((j / (sh - 1)) * Math.PI) * (w > 18 ? 1.6 : 0.8)), raye = Math.floor(i / pas) % 2 === 1, k = i > sw * 0.7 ? 2 : j === 0 || i < 1 ? 0 : 1;
      c.pt(sx + i + bombe, sy + j, raye ? coul[k] : P.voile[k]);
    }
    c.rect(sx - 1, sy - 1, sw + 3, 1, P.mat);
    c.rect(mx + 1, 1, Math.max(2, Math.round(w / 8)), 1, coul[0]); if (w > 18) c.rect(mx + 1, 2, 2, 1, coul[1]);
    if (w > 16) for (let i = 0; i < w - 8; i += 3) c.pt(7 + i, pont + 1, coul[1]);
    return { im: c.fin(), w: w + 6, h: h + 2, pont };
  }

  function monter(o) {
    const W = o.largeur, H = o.hauteur, N = o.sombre, P = N ? PAL.nuit : PAL.jour, LW = W + 2 * M, LH = H + 2 * M;
    const r = alea(31807), etroit = W < 300;
    const hor = Math.round(LH * 0.55);
    const ax = Math.round(M + W * (etroit ? 0.13 : 0.232)), ay = Math.round(M + H * (etroit ? 0.2 : 0.2));

    // Le ciel.
    const ciel = new Calque(LW, LH);
    degrade(ciel, P.ciel, 6, hor + 2, N ? 1.1 : 0.85);
    if (N) {
      etoiles(ciel, r, Math.round((LW * hor) / 240), hor - 4, H_(["#4a5c9c", "#8ea4de", "#f2f5ff"]), [ax, ay, 24]);
      lueur(ciel, ax, ay, 11, 44, hex("#5a74c0"), 0.55);
      ciel.disque(ax, ay, 11, hex("#f6f2dc"));
      for (const [a, b, c] of [[-4, -3, 3], [3, 3, 2], [-1, 5, 2], [5, -4, 1], [-6, 2, 1]]) ciel.disque(ax + a, ay + b, c, hex("#dcd8c4"));
    } else { lueur(ciel, ax, ay, 10, 64, hex("#fff8d4"), 0.8); ciel.disque(ax, ay, 10, hex("#fffbe0")); ciel.disque(ax, ay, 8, hex("#ffffff")); }
    { const rb = alea(91), nbB = Math.max(3, Math.round(LW / 120));
      for (let i = 0; i < nbB; i++) { const w = Math.round(60 + rb() * 90); nuage(ciel, Math.round(((i + 0.2 + rb() * 0.6) / nbB) * LW), hor + 1 - Math.round(rb() * 5), w, Math.round(w * (N ? 0.16 : 0.3)), N ? P.nuage.slice(0, 3) : P.nuage, rb, -0.35); } }
    const NW = LW + 140, nu = new Calque(NW, hor), nb = Math.max(4, Math.round(NW / (N ? 160 : 100)));
    for (let i = 0; i < nb; i++) { const pr = r(), w = Math.round((N ? 50 : 30) + pr * 66), h = Math.round(N ? 5 + pr * 6 : 8 + pr * 16); nuage(nu, Math.round(((i + r() * 0.8) / nb) * NW), Math.round(24 + (1 - pr) * (hor - 74) * 0.7 + r() * 12), w, h, P.nuage, r, -0.35); }

    // La roche : des strates, des fissures, une arête claire du côté de la lumière.
    const gr = fbm2(41, 3), fr = fbm1(43, 3);
    const roche = (rp, x, y, bord, loin) => {
      // de grandes cannelures verticales creusées par la pluie, quelques lits de silex, une arête claire côté lumière
      const dx = x + (fr(y / 44) - 0.5) * 14, can = gr(dx / 6.5, y / 70), gros = gr(x / 46 + 3, y / 52), s = y + (fr(x / 52) - 0.5) * 16, lit = ((s % 23) + 23) % 23;
      let v = 0.2 + can * 0.66 + (gros - 0.5) * 0.44 + (gr(x / 3, y / 3) - 0.5) * 0.14 - Math.min(0.2, bord / 300);
      if (lit < 1 && hach((x >> 3) + Math.floor(s / 23) * 57, 3) > 0.3) v -= 0.16; else if (lit < 2.2 && lit >= 1) v += 0.08;
      if (bord < 2) v += 0.34; else if (bord < 5) v += 0.12;
      if (loin) v = 0.28 + v * 0.62;
      return rp(v, x, y);
    };

    // Les caps lointains, à gauche et à droite, dans la brume.
    const loin = new Calque(LW, LH), fl = fbm1(61, 4);
    const cap = (k, sens, bout, haut) => { // sens : +1 part du bord gauche, -1 du bord droit
      const rp = rampe(P.craieLoin[k]);
      for (let x = 0; x < LW; x++) {
        const u = sens > 0 ? x / bout : (LW - x) / (LW - bout); if (u > 1) continue;
        const chute = Math.pow(Math.max(0, u - 0.86) / 0.14, 2.2), top = Math.round(hor - haut * (1 - u * 0.25) + fl(x / 30 + k * 9) * 8 + chute * haut * 0.92);
        for (let y = top; y <= hor + 1; y++) { const d = y - top; loin.pt(x, y, d < 2 + (hach(x >> 1, 5) > 0.6 ? 1 : 0) && chute < 0.3 ? P.herbeLoin[k] : roche(rp, x, y + k * 40, 99, true)); }
      }
    };
    cap(0, 1, M + W * (etroit ? 0.62 : 0.36), H * 0.075); cap(0, -1, M + W * 0.5, H * 0.05);
    // La mer : des bandes tramées, plus claires vers l'horizon, turquoise au pied de la falaise.
    const mer = new Calque(LW, LH), RM = rampe(P.mer), gm = fbm2(51, 3);
    const xa = Math.round(M + W * (etroit ? 0.8 : 0.835)), yT = Math.round(M + H * 0.335), xb = Math.round(M + W * (etroit ? 0.42 : 0.6));
    const ff = fbm1(71, 3), xl = (y) => { const u = borne((y - yT) / (LH - yT)); return xa - Math.pow(u, 2.1) * (xa - xb) - u * (xa - xb) * 0.12 - Math.round((ff(y / 34) - 0.5) * 30 * Math.min(1, u * 5) / 3) * 3 - Math.round((ff(y / 7) - 0.5) * 5); };
    for (let y = hor; y < LH; y++) for (let x = 0; x < LW; x++) {
      const d = (y - hor) / (LH - hor), pied = borne(1 - (xl(y) - x) / 46);
      mer.p[y * LW + x] = RM(0.93 - Math.pow(d, 0.62) * 0.84 + (gm(x / 34, y / 2.4) - 0.5) * 0.3 + pied * pied * 0.3 * (0.4 + d) - (y - hor < 2 ? 0.12 : 0), x, y);
    }
    cap(1, -1, M + W * (etroit ? 0.55 : 0.7), H * 0.13);

    // La grande falaise de droite et son rocher détaché.
    const fal = new Calque(LW, LH), RC = rampe(P.craie), RH = rampe(P.herbe), fh = fbm1(81, 3);
    const top = (x) => yT - (x - xa) * 0.085 + (fh(x / 26) - 0.5) * 6;
    const ecume = [];
    for (let y = 0; y < LH; y++) {
      const g = Math.round(xl(y));
      if (y > hor + 4 && y % 2 === 0) ecume.push([g, y]);
      for (let x = Math.max(0, g); x < LW; x++) {
        const t = top(Math.max(x, xa)), haut = x >= xa ? t : t + Math.pow((xa - x) / 10, 2) * 3; if (y < haut) continue;
        const d = y - haut, cap0 = 4 + hach(x >> 1, 21) * 3 + (hach(x, 22) > 0.7 ? 2 : 0);
        if (d < cap0 && x > xa - 12) fal.pt(x, y, RH(0.85 - d / cap0 * 0.7 + (hach(x * 3 + y, 4) - 0.5) * 0.3, x, y));
        else if (d < cap0 + 2 && x > xa - 12) fal.pt(x, y, P.terre);
        else fal.pt(x, y, roche(RC, x, y, x - g, false));
      }
    }
    const pile = (cx, base, larg, haut, graine) => { // un rocher dressé dans la mer
      for (let y = base - haut; y <= base; y++) { const u = (y - (base - haut)) / haut, half = larg * (0.3 + 0.7 * Math.pow(u, 0.55)) / 2 + (hach(y >> 2, graine) - 0.5) * 4, dec = Math.round((hach(y >> 3, graine + 9) - 0.5) * 5); cx += 0; for (let x = Math.round(cx - half + dec); x <= cx + half + dec; x++) fal.pt(x, y, u < 0.1 && hach(x, graine) > 0.3 ? P.herbe[3] : y > base - 4 ? P.craie[1] : roche(RC, x + graine * 13, y, x - (cx - half + dec), false)); if (y > base - 3) { ecume.push([Math.round(cx - half), y]); } }
      for (let x = Math.round(cx - larg / 2 - 3); x <= cx + larg / 2 + 3; x++) if (hach(x, graine + 1) > 0.3) fal.pt(x, base + 1, hex(P.ecume));
    };
    if (!etroit) { pile(Math.round(M + W * 0.6), LH - 36, 30, 40, 3); pile(Math.round(M + W * 0.556), LH - 24, 13, 15, 5); pile(Math.round(M + W * 0.635), LH - 22, 9, 9, 8); }
    // Le poste de guet en bois, au bord du plateau.
    const drapeaux = [], px = Math.round(xa + (LW - xa) * (etroit ? 0.45 : 0.5)), py = Math.round(top(px)) + 2;
    fal.rect(px - 4, py - 16, 9, 2, P.bois); fal.rect(px - 5, py - 21, 1, 6, P.bois); fal.rect(px + 5, py - 21, 1, 6, P.bois); fal.rect(px - 5, py - 19, 11, 1, P.bois); fal.rect(px - 6, py - 23, 13, 2, P.coque[1]);
    fal.ligne(px - 3, py - 14, px - 5, py, P.bois); fal.ligne(px + 3, py - 14, px + 5, py, P.bois); fal.ligne(px - 3, py - 10, px + 4, py - 4, P.bois); fal.ligne(px + 3, py - 10, px - 4, py - 4, P.bois); fal.rect(px + 6, py - 38, 1, 17, P.bois);
    drapeaux.push({ x: px + 7, y: py - 38, w: 11, h: 6, c: (N ? ROUGE_N : ROUGE).map((c) => "#" + [c & 255, (c >> 8) & 255, (c >> 16) & 255].map((v) => v.toString(16).padStart(2, "0")).join("")), ph: 0.4, amp: 0.13 });
    for (let i = 0; i < (LW - xa) / 3; i++) { const x = Math.round(xa + r() * (LW - xa)), y = Math.round(top(x)) + (r() * 3 | 0); fal.pt(x, y, P.fleurs[(r() * 3) | 0]); }

    // Le premier plan : un bout de lande en bas à gauche, herbes couchées par le vent et fleurs.
    const avant = new Calque(LW, LH), RA = rampe(P.avant), fa = fbm1(95, 3), bout = M + W * (etroit ? 0.5 : 0.36);
    const yb = (x) => LH - 54 + Math.pow(borne(x / bout), 1.7) * 70 + (fa(x / 22) - 0.5) * 8;
    crete(avant, yb, (x, y, d) => (d > 3 && d < 9 + hach(x >> 2, 3) * 4 && x > bout * 0.45 ? roche(RC, x, y, d < 5 ? 0 : 60, false) : RA(0.9 - d / 30 + (hach(x * 3 + y * 5, 1) - 0.5) * 0.4, x, y)));
    for (let x = 0; x < bout; x++) { const t0 = Math.round(yb(x)), hb = Math.round(2 + hach(x, 12) * hach(x >> 2, 14) * 11); for (let k = 1; k <= hb; k++) avant.pt(x + Math.round(k * k * 0.03), t0 - k, P.avant[k > 6 ? 4 : 3]); if (hach(x, 30) > 0.9) { avant.pt(x + 1, t0 - hb - 1, P.fleurs[0]); avant.pt(x + 2, t0 - hb - 1, P.fleurs[0]); avant.pt(x + 1, t0 - hb - 2, P.fleurs[x % 3]); } }

    // Ce qui bouge : crêtes des vagues, voiliers, mouettes.
    const cretes = [];
    for (let i = 0; i < Math.round(borne((W * (LH - hor)) / 420, 60, 260)); i++) { const d = Math.pow(r(), 1.5); cretes.push({ x: r() * (LW + 40), y: Math.round(hor + 3 + d * (LH - hor - 4)), d, p: r(), T: 7000 + r() * 7000 }); }
    const coulR = N ? ROUGE_N : ROUGE, coulB = N ? BLEU_N : BLEU, navires = [];
    const defs = etroit ? [[9, 4, coulR, 0.07, 0.7], [15, 13, coulB, 0.55, -1.1], [22, 30, coulR, 0.85, 1.6]] : [[9, 4, coulB, 0.42, 0.7], [11, 6, coulR, 0.47, 0.7], [16, 14, coulR, 0.28, -1.1], [23, 31, coulB, 0.5, 1.5], [30, 56, coulR, 0.2, -2]];
    for (const [w, dy, coul, u, v] of defs) { const n = navire(w, coul, P); navires.push({ ...n, y: hor + dy, x: u * (LW + 80), v, ph: r() * 6 }); }
    const mouettes = [];
    if (!N) for (let i = 0; i < Math.max(4, Math.round(W / 110)); i++) mouettes.push({ x: r() * (LW + 60), y: M + H * (0.16 + r() * 0.3), v: (3 + r() * 4) * (r() < 0.5 ? -1 : 1), ph: r() * 6, g: r() < 0.4 ? 1 : 0 });
    E = { W, H, N, P, LW, LH, NW, hor, ax, ciel: ciel.fin(), nu: nu.fin(), loin: loin.fin(), mer: mer.fin(), fal: fal.fin(), avant: avant.fin(), cretes, navires, mouettes, ecume, drapeaux };
  }

  const FACT = [0.5, 1, 1.8, 3.4, 5.5];
  function dessiner(ctx, t, s) {
    if (!E) return;
    ctx.imageSmoothingEnabled = false;
    const { P, N, LW, LH, hor } = E, ts = t / 1000;
    const ox = FACT.map((f) => Math.round(-s.x * f) - M), oy = FACT.map((f) => Math.round(-s.y * f * 0.35) - M);
    ctx.drawImage(E.ciel, ox[0], oy[0]);
    const dn = Math.floor(t * 0.003) % E.NW;
    ctx.drawImage(E.nu, ox[0] - dn, oy[0]); ctx.drawImage(E.nu, ox[0] - dn + E.NW, oy[0]);
    if (!N) for (const m of E.mouettes) { // les mouettes planent, un battement de temps en temps
      const L = LW + 60, x = Math.round((((m.x + ts * m.v) % L) + L) % L) - 30 + ox[1], y = Math.round(m.y + Math.sin(ts * 0.21 + m.ph) * 7) + oy[1], b = Math.sin(ts * 1.1 + m.ph * 2), k = b > 0.55 ? 0 : b < -0.75 ? 2 : 1;
      ctx.fillStyle = m.g ? "#3c5078" : "#ffffff";
      if (k === 0) { ctx.fillRect(x - 3, y - 2, 1, 1); ctx.fillRect(x - 2, y - 1, 1, 1); ctx.fillRect(x + 2, y - 1, 1, 1); ctx.fillRect(x + 3, y - 2, 1, 1); ctx.fillRect(x - 1, y, 3, 1); }
      else if (k === 1) { ctx.fillRect(x - 3, y, 2, 1); ctx.fillRect(x + 2, y, 2, 1); ctx.fillRect(x - 1, y, 3, 1); ctx.fillRect(x - 4, y + 1, 1, 1); ctx.fillRect(x + 4, y + 1, 1, 1); }
      else { ctx.fillRect(x - 3, y + 1, 2, 1); ctx.fillRect(x + 2, y + 1, 2, 1); ctx.fillRect(x - 1, y, 3, 1); }
      if (!m.g) { ctx.fillStyle = "#5a6c94"; ctx.fillRect(x, y + 1, 1, 1); }
    }
    ctx.drawImage(E.loin, ox[1], oy[1]);
    ctx.drawImage(E.mer, ox[2], oy[2]);
    // le reflet de l'astre, qui ondule
    ctx.fillStyle = P.reflet;
    for (let y = hor + 2; y < LH; y += 1) {
      const d = y - hor, k = hach(y, 9); if (d > 14 && k < 0.34) continue;
      const w = (1.5 + d * (N ? 0.1 : 0.16)) * (0.55 + 0.45 * Math.sin(ts * 0.9 + y * 0.63 + k * 4)), cx = E.ax + Math.sin(ts * 0.55 + y * 0.31) * (1 + d / 34) + (k - 0.5) * d * (N ? 0.1 : 0.22);
      ctx.globalAlpha = P.refletA * (0.45 + 0.55 * k) * borne(1.15 - d / (LH - hor) * 0.5);
      ctx.fillRect(Math.round(cx - w) + ox[2], y + oy[2], Math.max(1, Math.round(w * 2)), 1);
    }
    // les crêtes des vagues
    for (const c of E.cretes) {
      const ph = (t / c.T + c.p) % 1, a = Math.sin(ph * Math.PI), len = Math.round(2 + c.d * 11), L = LW + 40;
      const x = Math.round(((c.x + ph * (5 + c.d * 26)) % L) - 20) + ox[2], y = c.y + oy[2] - Math.round(a * c.d * 1.6);
      ctx.globalAlpha = a * (N ? 0.5 : 0.85); ctx.fillStyle = P.crete; ctx.fillRect(x, y, len, 1);
      if (c.d > 0.3) { ctx.fillRect(x + 2, y - 1, Math.max(1, len - 5), 1); ctx.globalAlpha = a * 0.5; ctx.fillStyle = P.creteO; ctx.fillRect(x + 1, y + 1, len, 1); }
    }
    ctx.globalAlpha = 1;
    // les voiliers
    for (const n of E.navires) {
      const L = LW + 80, x = Math.round((((n.x + ts * n.v) % L) + L) % L) - 40 + ox[2], y = n.y - n.h + 2 + Math.round(Math.sin(ts * 0.8 + n.ph) * 0.7) + oy[2];
      ctx.globalAlpha = 0.4; ctx.fillStyle = P.creteO; ctx.fillRect(x + 3, y + n.h, n.w - 6, 1); ctx.fillRect(x + 5 + Math.round(Math.sin(ts + n.ph) * 1), y + n.h + 1, n.w - 10, 1);
      ctx.globalAlpha = 1; ctx.drawImage(n.im, x, y);
      ctx.fillStyle = P.ecume; ctx.globalAlpha = N ? 0.45 : 0.9; const ar = n.v > 0 ? x + 1 : x + n.w - 3;
      ctx.fillRect(ar - (n.v > 0 ? 2 : -2), y + n.h - 1, 3, 1); ctx.fillRect(ar - (n.v > 0 ? 5 : -5) + Math.round(Math.sin(ts * 1.3 + n.ph)), y + n.h, 2, 1);
      if (N) { // les fanaux et leur reflet
        const fx = n.v > 0 ? x + n.w - 3 : x + 2, fy = y + n.pont - Math.round(n.w * 0.2) - 2;
        ctx.globalAlpha = 0.3; ctx.fillStyle = "#ffb040"; ctx.fillRect(fx - 1, fy, 3, 1); ctx.fillRect(fx, fy - 1, 1, 3);
        ctx.globalAlpha = 1; ctx.fillStyle = "#ffd880"; ctx.fillRect(fx, fy, 1, 1);
        for (let k = 1; k <= Math.round(n.w / 5) + 1; k++) { ctx.globalAlpha = 0.5 - k * 0.06; ctx.fillStyle = "#f0a040"; ctx.fillRect(fx + Math.round(Math.sin(ts * 0.9 + k * 1.3 + n.ph) * 1), y + n.h + k, 1 + (k % 2), 1); }
        ctx.globalAlpha = 1;
      }
    }
    ctx.globalAlpha = 1;
    ctx.drawImage(E.fal, ox[3], oy[3]);
    // l'écume au pied de la falaise, qui avance et se retire
    ctx.fillStyle = P.ecume;
    for (let i = 0; i < E.ecume.length; i++) { const e = E.ecume[i], v = 0.5 + 0.5 * Math.sin(ts * 0.7 - e[1] * 0.16 + Math.sin(e[1] * 0.9) * 1.2), w = 1 + Math.round(v * (2 + ((e[1] - hor) / (LH - hor)) * 5)); ctx.globalAlpha = (N ? 0.4 : 0.85) * (0.5 + 0.5 * v); ctx.fillRect(e[0] - w + ox[3], e[1] + oy[3], w + 1, 1); if (v > 0.6) ctx.fillRect(e[0] - w - 2 + ox[3], e[1] + 1 + oy[3], 1, 1); }
    ctx.globalAlpha = 1;
    for (const f of E.drapeaux) for (let i = 0; i < f.w; i++) { const a = t * 0.0019 + f.ph - i * 0.5, co = Math.cos(a); ctx.fillStyle = co > 0.45 ? f.c[0] : co < -0.45 ? f.c[2] : f.c[1]; ctx.fillRect(f.x + i + ox[3], f.y + Math.round(Math.sin(a) * (0.25 + i * f.amp)) + oy[3], 1, f.h); }
    ctx.drawImage(E.avant, ox[4], oy[4]);
  }

  (window.FONDS = window.FONDS || []).push({ id: "p3-falaises", nom: "Les falaises et la flotte", famille: "paysage", credit: null, monter, dessiner });
})();
