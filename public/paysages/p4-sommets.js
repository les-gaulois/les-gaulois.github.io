// Site du clan [GAL] (AGPL-3.0-only). Paysage animé du fond de « Mon Gaulois », dessin en cases de Claude Fable 5.2,
// 21 novembre 2026, choisi par le pilote avec les sept autres ; ils tournent toutes les 15 minutes (src/lib/jeu/fonds-du-jeu.ts,
// tenu par src/scripts/jeu.ts). Script classique : il ajoute son fond à window.FONDS, rien d'autre.
// Fond de « Mon Gaulois » : p4-sommets.
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

  // ---- Les sommets : des montagnes enneigées sur plusieurs plans, des sapins, la neige qui tombe.
  const H_ = (a) => a.map(hex);
  const PAL = {
    jour: {
      ciel: H_(["#2854b0", "#3c70cc", "#5c90e0", "#88b0ee", "#b4d0f6", "#d8e6fa", "#f2f7fd"]),
      nuage: H_(["#a8c0e4", "#d0e0f4", "#f0f6fd", "#ffffff"]),
      neige: [H_(["#7c9cd4", "#9cb6e2", "#c4d6f0", "#f0f5fc"]), H_(["#5478bc", "#7c9cd4", "#b0c8ea", "#e4eef9", "#ffffff"]), H_(["#4c6cb0", "#7494cc", "#b0c8e8", "#e2ecf8", "#ffffff"])],
      roc: [H_(["#8ca4d0", "#a0b6dc"]), H_(["#2c3c74", "#44588c", "#6478a8"]), H_(["#1c2858", "#30407c", "#4c6098"])],
      brume: hex("#dce8f8"),
      sapin: H_(["#0c1838", "#142850", "#1c3c64", "#2c5878"]), sapinLoin: H_(["#3c5488", "#506c9c"]),
      sol: H_(["#6c8cc8", "#98b4e0", "#c4d6f0", "#e4eefa", "#ffffff"]),
      flocon: "#ffffff", floconA: 0.95,
      tronc: hex("#2c2030"),
    },
    nuit: {
      ciel: H_(["#02040e", "#040818", "#070e26", "#0a1230", "#0e1a42", "#142454", "#1b3066"]),
      nuage: H_(["#0c1638", "#14204a", "#1e2e60", "#2c4078"]),
      neige: [H_(["#131f4c", "#1a2a5e", "#243a74", "#34508c"]), H_(["#0c1638", "#152450", "#22386e", "#3c5898", "#7c9cd0"]), H_(["#081030", "#101e48", "#1c3266", "#365490", "#8cb0dc"])],
      roc: [H_(["#0e183e", "#131f4a"]), H_(["#040816", "#080e24", "#0e1834"]), H_(["#03060f", "#060b1c", "#0b142c"])],
      brume: hex("#1c2c60"),
      sapin: H_(["#02050c", "#040a16", "#081424", "#0e2234"]), sapinLoin: H_(["#0a1230", "#101c40"]),
      sol: H_(["#0a1434", "#12224e", "#1e366c", "#30508c", "#5c80b8"]),
      flocon: "#a8c0ec", floconA: 0.7,
      tronc: hex("#02040a"),
    },
  };
  let E = null;

  function monter(o) {
    const W = o.largeur, H = o.hauteur, N = o.sombre, P = N ? PAL.nuit : PAL.jour, LW = W + 2 * M, LH = H + 2 * M;
    const r = alea(48073), etroit = W < 300;
    const ax = Math.round(M + W * (etroit ? 0.13 : 0.232)), ay = Math.round(M + H * 0.2);

    const ciel = new Calque(LW, LH);
    degrade(ciel, P.ciel, 4, M + H * 0.62, N ? 1.05 : 0.9);
    if (N) {
      etoiles(ciel, r, Math.round((LW * LH * 0.6) / 230), LH * 0.62, H_(["#4a5c9c", "#8ea4de", "#f2f5ff"]), [ax, ay, 18]);
      lueur(ciel, ax, ay, 7, 26, hex("#4f68b4"), 0.5);
      ciel.disque(ax, ay, 7, hex("#f4f0d8")); ciel.disque(ax + 4, ay - 2, 6, ciel.lire(ax + 16, ay - 16));
    } else { lueur(ciel, ax, ay, 9, 70, hex("#ffffff"), 0.8); ciel.disque(ax, ay, 9, hex("#fffdf0")); ciel.disque(ax, ay, 7, hex("#ffffff")); }

    // Un massif : des pics, une arête qui descend de chaque sommet (un versant au soleil, l'autre à l'ombre), neige en haut, roche en bas.
    const gr = fbm2(31, 3);
    function massif(cal, k, pics, base, amp, graine) {
      const fb = fbm1(graine, 4), fa = fbm1(graine + 5, 3), RN = rampe(P.neige[k]), RR = rampe(P.roc[k]);
      for (let x = 0; x < LW; x++) {
        let h = base, g = -1;
        for (let i = 0; i < pics.length; i++) { const p = pics[i], y = p[1] + Math.pow(Math.abs(x - p[0]) / p[2], 0.86) * (base - p[1]); if (y < h) { h = y; g = i; } }
        if (g < 0) { g = 0; }
        const p = pics[g], hauteur = Math.max(20, base - p[1]);
        h += (fb(x / 15) - 0.5) * amp * Math.min(1, Math.abs(x - p[0]) / 6 + 0.25) + (fb(x / 4) - 0.5) * amp * 0.22;
        const top = Math.round(h);
        for (let y = Math.max(0, top); y < LH; y++) {
          const d = y - top, dy = y - p[1], arete = p[0] + dy * 0.2 + (fa(dy / 20 + g * 9) - 0.5) * dy * 0.6;
          const n = gr((x + d * 0.6) / 11 + graine, y / 34), n2 = gr((x + (x < arete ? 1 : -1) * dy * 0.5) / 4.2 + graine, y / 30);
          let lum = x < arete; if (lum && n > 0.63) lum = false; else if (!lum && n < 0.33) lum = true;
          const roc = n2 * 0.7 + (dy / hauteur) * (lum ? 0.62 : 0.8) + (d < 3 ? -0.3 : 0) > (k === 0 ? 1.2 : lum ? 0.94 : 0.8);
          let col;
          if (roc) col = RR((lum ? 0.72 : 0.2) + (n2 - 0.5) * 0.6, x, y);
          else col = RN((lum ? 0.86 : 0.24) + (n - 0.5) * 0.36 + (n2 - 0.5) * 0.2 + (d < 1 && lum ? 0.3 : 0), x, y);
          if (k < 1) { const br = (y - (base - hauteur * 0.42)) / (hauteur * 0.5); if (br > 0.15 + seuil(x, y) * 1.5) col = P.brume; }
          cal.p[y * LW + x] = col;
        }
      }
    }
    const b0 = M + H * 0.66, b1 = M + H * 0.75;
    const pics0 = [[0.07, 0.3], [0.42, 0.52], [0.64, 0.36], [0.9, 0.46], [0.25, 0.26], [0.78, 0.25]].map(([u, h]) => [M + W * u, b0 - H * h, H * h * (0.62 + r() * 0.2)]);
    for (let i = 0; i < W / 130; i++) pics0.push([r() * LW, b0 - H * (0.14 + r() * 0.14), H * 0.16]);
    const pics1 = [[0.2, 0.3], [0.56, 0.23], [0.79, 0.33], [1.02, 0.3], [-0.03, 0.22], [0.38, 0.17]].map(([u, h]) => [M + W * u, b1 - H * h, H * h * (0.7 + r() * 0.3)]);
    for (let i = 0; i < W / 150; i++) pics1.push([r() * LW, b1 - H * (0.1 + r() * 0.12), H * 0.14]);
    const epaules = (pics, base) => { for (const p of pics.slice()) for (const s of [-1, 1]) { const u = 0.3 + r() * 0.34, hh = (base - p[1]) * (1 - u) * (0.86 + r() * 0.22); pics.push([p[0] + s * p[2] * u, base - hh, Math.max(p[2] * (0.34 + r() * 0.2), hh * 0.55)]); } };
    epaules(pics0, b0); epaules(pics1, b1);
    const loin = new Calque(LW, LH); massif(loin, 0, pics0, b0, 9, 101);
    const milieu = new Calque(LW, LH); massif(milieu, 1, pics1, b1, 11, 202);

    // Les bancs de brume entre les plans, sur une bande qui tourne.
    const NW = LW + 160, bandeH = Math.round(H * 0.2), brume = new Calque(NW, bandeH), nbB = Math.max(4, Math.round(NW / 90));
    for (let i = 0; i < nbB; i++) { const w = Math.round(70 + r() * 110); nuage(brume, Math.round(((i + r() * 0.8) / nbB) * NW), Math.round(bandeH * (0.35 + r() * 0.6)), w, Math.round(5 + r() * 7), P.nuage, r, -0.3); }

    // Les collines boisées : pentes de neige, sapins en rangs.
    const sapin = (cal, x, base, h, cs, neige, etages) => {
      const n = etages || Math.max(2, Math.round(h / 5)), pas = h / (n + 0.6);
      cal.rect(x, base - Math.max(1, Math.round(h * 0.12)), h > 30 ? 3 : 1, Math.max(1, Math.round(h * 0.12)) + 1, P.tronc);
      for (let j = n - 1; j >= 0; j--) {
        const y0 = base - h + j * pas, th = pas * 1.75, tw = (h * 0.42 * (j + 1.3)) / (n + 0.3);
        for (let yy = 0; yy <= th; yy++) {
          const half = (yy / th) * tw;
          for (let dx = -Math.ceil(half); dx <= half; dx++) {
            if (yy > th - 1.6 - Math.abs(Math.sin(dx * 0.9 + j)) * (h > 24 ? 2.4 : 1) && h > 9) continue;
            const X = Math.round(x + dx + (h > 30 ? 1 : 0)), Y = Math.round(y0 + yy), bordH = yy - (Math.abs(dx) / tw) * th;
            const blanc = neige && bordH < (dx < 0 ? 1.2 + h * 0.02 : 0.6 + h * 0.008) + hach(X * 3 + j, 6) * 1.2 && Math.abs(dx) < half - 0.2;
            if (blanc) cal.pt(X, Y, dx < half * 0.2 ? neige[neige.length - 1] : neige[neige.length - 3]);
            else cal.pt(X, Y, cs[Math.min(cs.length - 1, Math.max(0, Math.round((dx < 0 ? 1.6 : 0.5) + (h > 24 ? (hach(X * 7 + Y * 3, 2) - 0.3) * 1.6 : 0) - (yy / th) * 0.9 + (cs.length > 2 ? 0.6 : 0))))]);
          }
        }
      }
    };
    const pres = new Calque(LW, LH), fp = fbm1(303, 4), RS = rampe(P.sol), gs = fbm2(77, 3);
    const yp = (x) => M + H * 0.775 - fp(x / 70) * H * 0.1 + Math.pow(Math.abs((x - M) / W - 0.5) * 2, 2) * -H * 0.03;
    { const fq = fbm1(404, 4), yq = (x) => M + H * 0.74 - fq(x / 50) * H * 0.07;
      crete(pres, yq, (x, y, d) => (d < 1 ? P.neige[2][3] : RS(0.42 + (gs(x / 20, y / 6) - 0.5) * 0.4, x, y)));
      for (let x = -3; x < LW; x += 2 + ((r() * 3) | 0)) { const y = Math.round(yq(x)); if (gs(x / 24, 9) > 0.46 && r() < 0.6) { const h = 4 + ((r() * 4) | 0), b = y + 1 + ((r() * 4) | 0); for (let j = 0; j < h; j++) pres.rect(x - Math.round(j * 0.45), b - h + j, 1 + 2 * Math.round(j * 0.45), 1, P.sapinLoin[j < 2 ? 1 : 0]); } } }
    crete(pres, yp, (x, y, d) => RS(0.86 - d / 210 + (gs(x / 26, y / 7) - 0.5) * 0.5 - (gs((x + d) / 9, y / 22) > 0.6 ? 0.25 : 0), x, y));
    { const liste = []; for (let i = 0; i < LW / 5.5; i++) { const x = Math.round(r() * LW), dy = r() * r() * H * 0.1; if (gs(x / 30 + 4, dy / 20) > 0.34) liste.push([x, Math.round(yp(x) + 3 + dy), 9 + r() * 8 + dy * 0.22]); }
      liste.sort((a, b) => a[1] - b[1]); for (const [x, y, h] of liste) sapin(pres, x, y, h, P.sapin, P.sol); }

    // Le premier plan : congères, grands sapins chargés de neige dans les coins.
    const avant = new Calque(LW, LH), fa2 = fbm1(505, 3);
    const ya = (x) => LH - 40 + (fa2(x / 60) - 0.5) * 22 + Math.pow(Math.abs((x - M) / W - 0.5) * 2, 2.4) * -16;
    crete(avant, ya, (x, y, d) => RS(0.96 - d / 70 - (gs((x + d * 1.5) / 30, y / 9) > 0.56 ? 0.3 : 0) + (gs(x / 9, y / 4) - 0.5) * 0.2 + (d < 2 ? 0.1 : 0), x, y));
    for (let i = 0; i < W / 26; i++) { const x = Math.round(r() * LW), y = Math.round(ya(x) + 6 + r() * 30); avant.rect(x, y, 2 + ((r() * 3) | 0), 1, P.sol[1]); if (r() < 0.4) { avant.pt(x + 1, y - 1, P.tronc); avant.pt(x + 1, y - 2, P.tronc); avant.pt(x + 2, y - 3, P.tronc); avant.pt(x, y - 3, P.tronc); } }
    const grands = etroit ? [[0.03, 150, 30], [0.98, 170, 20], [0.2, 84, 10], [0.84, 96, 6]] : [[0.035, 190, 20], [0.115, 128, 6], [0.97, 210, 24], [0.9, 140, 8], [0.2, 84, 0], [0.815, 96, 2], [0.29, 56, -4], [0.72, 60, -2]];
    grands.sort((a, b) => a[1] - b[1]);
    for (const [u, h, dy] of grands) { const x = Math.round(M + W * u); sapin(avant, x, Math.round(ya(x)) + 8 + dy, h * Math.min(1, H / 360), P.sapin, P.sol, Math.round(h / 13)); }

    // Ce qui bouge : flocons, aigle, aurore.
    const flocons = [];
    for (let i = 0; i < Math.round(borne((W * H) / 1500, 50, 240)); i++) flocons.push({ x: r() * (W + 20), y: r() * (H + 20), v: 5 + r() * 9, a: 2 + r() * 5, f: 0.3 + r() * 0.5, p: r() * 6.28, g: r() < 0.3 });
    E = { W, H, N, P, LW, LH, NW, bandeH, ciel: ciel.fin(), loin: loin.fin(), milieu: milieu.fin(), brume: brume.fin(), pres: pres.fin(), avant: avant.fin(), flocons, aigle: aigles() };
  }

  function aigles() {
    const pal = { d: hex("#2c2028"), m: hex("#4c3830"), w: hex("#ffffff"), j: hex("#f2c230") };
    const poses = [
      ["dd...............dd", ".dddd.........dddd.", "...dddddmdmddddd...", "......wwdmmdww.....", "........ddd........"],
      [".....................", "...ddddd....ddddd....", ".dddddddmdmddddddd.".padEnd(21, "."), "dd....wwdmmdww....dd.", "........ddd.........."],
      ["...................", "......ddd.ddd......", "....dddddmddddd....", "..ddd.wwdmmdww.ddd.", "dd......ddd......dd", "d................d."],
    ];
    return poses.map((l) => { const c = new Calque(22, 7); c.motif(l, pal, 0, 0, false); return c.fin(); });
  }

  const FACT = [0.5, 1, 1.8, 3, 5.5];
  function dessiner(ctx, t, s) {
    if (!E) return;
    ctx.imageSmoothingEnabled = false;
    const { P, N, W, H, LW } = E, ts = t / 1000;
    const ox = FACT.map((f) => Math.round(-s.x * f) - M), oy = FACT.map((f) => Math.round(-s.y * f * 0.35) - M);
    ctx.drawImage(E.ciel, ox[0], oy[0]);
    if (N) aurore(ctx, ts, ox[0] + M, oy[0] + M);
    ctx.drawImage(E.loin, ox[1], oy[1]);
    const yb = Math.round(M + H * 0.5);
    let dn = Math.floor(t * 0.0022) % E.NW;
    ctx.globalAlpha = N ? 0.7 : 0.9; ctx.drawImage(E.brume, ox[1] - dn, oy[1] + yb); ctx.drawImage(E.brume, ox[1] - dn + E.NW, oy[1] + yb); ctx.globalAlpha = 1;
    if (!N) { // l'aigle plane en larges cercles, et bat des ailes de loin en loin
      const a = ts * 0.085, x = Math.round(W * 0.5 + Math.cos(a) * W * 0.4 + Math.sin(a * 2.3) * 12) + ox[1] + M, y = Math.round(H * 0.2 + Math.sin(a) * H * 0.075 + Math.sin(a * 3.1) * 4) + oy[1] + M;
      const cyc = (ts % 11) / 11, k = cyc > 0.86 ? (Math.sin((cyc - 0.86) * 90) > 0 ? 2 : 1) : Math.sin(ts * 0.4) > 0.6 ? 1 : 0;
      ctx.drawImage(E.aigle[k], x - 10, y - 3);
    }
    ctx.drawImage(E.milieu, ox[2], oy[2]);
    dn = Math.floor(t * 0.0034 + 300) % E.NW; const yb2 = Math.round(M + H * 0.59);
    ctx.globalAlpha = N ? 0.6 : 0.85; ctx.drawImage(E.brume, ox[2] - dn, oy[2] + yb2); ctx.drawImage(E.brume, ox[2] - dn + E.NW, oy[2] + yb2); ctx.globalAlpha = 1;
    neige(ctx, ts, false, ox[2] + M, oy[2] + M);
    ctx.drawImage(E.pres, ox[3], oy[3]);
    ctx.drawImage(E.avant, ox[4], oy[4]);
    neige(ctx, ts, true, ox[4] + M, oy[4] + M);
  }
  function neige(ctx, ts, gros, ox, oy) {
    const { W, H, P } = E; ctx.fillStyle = P.flocon;
    for (const f of E.flocons) {
      if (f.g !== gros) continue;
      const y = Math.round(((f.y + ts * f.v * (gros ? 1.5 : 1)) % (H + 20)) - 10) + oy, x = Math.round((((f.x + Math.sin(ts * f.f + f.p) * f.a - ts * 1.6) % (W + 20)) + W + 20) % (W + 20)) - 10 + ox;
      ctx.globalAlpha = P.floconA * (gros ? 1 : 0.75);
      ctx.fillRect(x, y, 1, 1); if (gros) ctx.fillRect(x, y + 1, 1, 1);
    }
    ctx.globalAlpha = 1;
  }
  // L'aurore : deux rideaux de colonnes de deux cases, dont la base et la hauteur ondulent très lentement.
  function aurore(ctx, ts, ox, oy) {
    const { W, H } = E;
    const rideaux = [[0.2, 0.2, "#7c5cd8", "#3cc8a0", "#a8ffd0", 0], [0.33, 0.15, "#5868e0", "#48b8d8", "#b8f4ff", 2.4]];
    for (const [yu, hu, c0, c1, c2, ph] of rideaux) {
      const bandes = [[c0, 0.13, 1, 0.45], [c0, 0.2, 0.72, 0.4], [c1, 0.24, 0.46, 0.34], [c1, 0.36, 0.22, 0.2], [c2, 0.5, 0.045, 0.045]];
      for (const [c, al, deb, ep] of bandes) {
        ctx.fillStyle = c; ctx.globalAlpha = al;
        for (let x = -2; x < W + 2; x += 2) {
          const base = H * yu + Math.sin(x * 0.011 + ts * 0.05 + ph) * H * 0.05 + Math.sin(x * 0.029 - ts * 0.037 + ph * 2) * H * 0.022;
          const force = 0.5 + 0.5 * Math.sin(x * 0.017 + ts * 0.041 + ph * 3), raie = 0.62 + 0.38 * Math.sin(x * 0.83 + Math.sin(x * 0.11 + ph) * 3 + ts * 0.11);
          const h = H * hu * Math.pow(force, 1.6) * 1.15 * raie; if (h < 3) continue;
          ctx.fillRect(x + ox, Math.round(base - h * deb) + oy, 2, Math.max(1, Math.round(h * ep)));
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  (window.FONDS = window.FONDS || []).push({ id: "p4-sommets", nom: "Les sommets", famille: "paysage", credit: null, monter, dessiner });
})();
