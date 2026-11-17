/**
 * Les finitions animées des cartes du podium de l'accueil (demande du pilote, 17 novembre 2026 : « pourquoi il n'y a pas
 * une seule des animations que tu m'as créées ? »). Chaque finition se dessine en pixels sur deux toiles de 96 × 160
 * cases : une derrière le Gaulois (`fond`), une devant lui (`devant`). Le dessin ne dépend que du temps `t`, en secondes :
 * il ne lit ni ne change aucune donnée. Le script `src/scripts/cartes-mouvement.ts` efface les toiles puis appelle la finition.
 *
 * Vingt-trois finitions, celles des maquettes montrées au pilote : leur nom, leur rareté et leur prix sont dans
 * `src/lib/village/cartes.ts`, le rayon « Cartes » de la boutique. `mx` et `my`, de -1 à 1, sont l'inclinaison de la carte.
 */

export const LARGEUR_DE_TOILE = 96;
export const HAUTEUR_DE_TOILE = 160;

export const FINITIONS_ANIMEES = [
  "confettis",
  "averse",
  "bulles",
  "tube-neon",
  "pluie-de-code",
  "radar",
  "feu-d-artifice",
  "blizzard",
  "boule-a-facettes",
  "bain-de-canards",
  "piratage",
  "foudre",
  "coulee-de-lave",
  "vitesse-lumiere",
  "lancement",
  "pluie-de-stateres",
  "trou-noir",
  "portail",
  "voile-boreal",
  "plasma",
  "champignon-atomique",
  "explosion",
  "supernova",
] as const;
export type FinitionDeCarte = (typeof FINITIONS_ANIMEES)[number];

/** Comment la toile du fond se mêle à la bannière : en lumière ajoutée (par défaut), telle quelle, ou en reflet vif. */
export type FusionDeToile = "screen" | "normal" | "color-dodge";
const TELLES_QUELLES: readonly FinitionDeCarte[] = ["pluie-de-code", "radar", "piratage", "foudre", "vitesse-lumiere", "portail", "trou-noir", "champignon-atomique", "explosion"];
export const fusionDeLaFinition = (finition: FinitionDeCarte): FusionDeToile => (finition === "plasma" ? "color-dodge" : TELLES_QUELLES.includes(finition) ? "normal" : "screen");

export type Dessin = (fond: Toile, devant: Toile, t: number, mx: number, my: number) => void;

/** Ce que les finitions demandent à une toile : un sous-ensemble du contexte 2D d'un canvas. */
export type Toile = Pick<
  CanvasRenderingContext2D,
  | "globalAlpha"
  | "globalCompositeOperation"
  | "fillStyle"
  | "strokeStyle"
  | "lineWidth"
  | "font"
  | "textAlign"
  | "fillRect"
  | "clearRect"
  | "beginPath"
  | "moveTo"
  | "lineTo"
  | "arc"
  | "ellipse"
  | "fill"
  | "stroke"
  | "fillText"
  | "strokeText"
  | "save"
  | "restore"
  | "translate"
  | "rotate"
  | "scale"
>;

const W = LARGEUR_DE_TOILE;
const H = HAUTEUR_DE_TOILE;
const TOUR = Math.PI * 2;

/** Un hasard qui redonne toujours le même nombre pour le même rang : les dessins ne sautent pas d'une image à l'autre. */
const hasard = (n: number): number => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};
const borne = (v: number) => Math.max(0, Math.min(1, v));
const elan = (q: number) => 1 - (1 - q) * (1 - q);
const reste = (a: number, n: number) => ((a % n) + n) % n;
const teinte = (h: number, clarte = 65) => `hsl(${Math.floor(reste(h, 360))} 100% ${clarte}%)`;

const pave = (c: Toile, x: number, y: number, couleur: string, alpha = 1, l = 1, h = 1) => {
  c.globalAlpha = borne(alpha);
  c.fillStyle = couleur;
  c.fillRect(Math.round(x), Math.round(y), l, h);
};
const disque = (c: Toile, x: number, y: number, rayon: number, couleur: string, alpha = 1) => {
  c.globalAlpha = borne(alpha);
  c.fillStyle = couleur;
  c.beginPath();
  c.arc(x, y, Math.max(0.1, rayon), 0, TOUR);
  c.fill();
};
const anneau = (c: Toile, x: number, y: number, rx: number, ry: number, couleur: string, alpha = 1, trait = 1) => {
  c.globalAlpha = borne(alpha);
  c.strokeStyle = couleur;
  c.lineWidth = trait;
  c.beginPath();
  c.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), 0, 0, TOUR);
  c.stroke();
};

const trait = (c: Toile, x1: number, y1: number, x2: number, y2: number, couleur: string, alpha = 1, epaisseur = 1) => {
  c.globalAlpha = borne(alpha);
  c.strokeStyle = couleur;
  c.lineWidth = epaisseur;
  c.beginPath();
  c.moveTo(x1, y1);
  c.lineTo(x2, y2);
  c.stroke();
};
/** Un 0 ou un 1 de trois cases sur cinq, de la couleur déjà posée. */
const chiffre = (c: Toile, x: number, y: number, un: boolean) => {
  if (un) {
    c.fillRect(x + 1, y, 1, 5);
    c.fillRect(x, y + 1, 1, 1);
    c.fillRect(x, y + 4, 3, 1);
  } else {
    c.fillRect(x, y, 3, 1);
    c.fillRect(x, y + 4, 3, 1);
    c.fillRect(x, y, 1, 5);
    c.fillRect(x + 2, y, 1, 5);
  }
};

/** Le champignon atomique : un éclair, puis la colonne et le chapeau montent, et le nuage se dissipe. Neuf secondes. */
function champignon(fond: Toile, devant: Toile, t: number): void {
  const p = t % 9;
  const cx = W / 2;
  const sol = H - 34;
  const pousse = elan(borne((p - 0.3) / 3.2));
  const fondu = p > 7 ? 1 - (p - 7) / 2 : 1;
  pave(fond, 0, 0, "#1c0a02", 0.45 * fondu, W, H);
  disque(fond, cx, sol - 40, 80, "#ff8a1f", 0.35 * fondu);
  if (p > 0.3) {
    const haut = sol - pousse * 98;
    const rx = pousse * 39 + 4;
    const ry = pousse * 19 + 3;
    for (let y = 0; y < sol - haut; y += 2) {
      const l = 6 + Math.sin(y * 0.3 - t * 3) * 1.5 + (y < 12 ? (12 - y) * 1.8 : 0) + (sol - haut - y < 10 ? 4 : 0);
      pave(fond, cx - l, sol - y, "#7a5240", fondu, l * 2, 2);
      pave(fond, cx - l * 0.5, sol - y, "#ff9a2e", fondu, l, 2);
      pave(fond, cx - l * 0.2, sol - y, "#ffe08a", fondu, l * 0.4 + 1, 2);
    }
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * TOUR;
      disque(fond, cx + Math.cos(a) * rx * 0.75, haut + Math.sin(a) * ry * 0.62, rx * 0.36 * (0.85 + 0.25 * Math.sin(t * 1.5 + i * 2)), i % 2 ? "#6b4a3e" : "#8a6250", fondu);
    }
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TOUR + t * 0.4;
      disque(fond, cx + Math.cos(a) * rx * 0.42, haut - 1 + Math.sin(a) * ry * 0.35, rx * 0.26, "#ff7a1f", fondu);
    }
    disque(fond, cx, haut - 1, rx * 0.3, "#ffe08a", fondu);
    anneau(fond, cx, haut + ry * 0.75, rx * 0.55, ry * 0.28, "#c9a48f", fondu * 0.9, 2);
    for (let i = 0; i < 14; i++) disque(fond, cx + (i - 6.5) * 7 * pousse, sol + 2 + Math.sin(i * 3) * 2, 5 + hasard(i) * 4, "#8f7566", fondu * 0.85);
    anneau(fond, cx, sol, (p - 0.3) * 46, (p - 0.3) * 10, "#fff1d6", (1 - (p - 0.3) / 2.4) * fondu, 2);
    // Des braises montent devant le Gaulois.
    for (let i = 0; i < 22; i++) pave(devant, hasard(i) * W, H - reste(hasard(i + 5) * H + t * (14 + hasard(i) * 16), H), i % 2 ? "#ffb02e" : "#ffe08a", 0.85 * fondu * pousse);
  }
  // L'éclair : une seule fois par tour de neuf secondes, derrière le Gaulois seulement.
  if (p < 0.5) pave(fond, 0, 0, "#fff1d6", (1 - p / 0.5) * 0.7, W, H);
}

/** Le piratage : un écran de terminal vert qui s'écrit, des lignes de balayage, et de brèves bandes de parasites. */
function piratage(fond: Toile, devant: Toile, t: number): void {
  pave(fond, 0, 0, "#020a06", 0.62, W, H);
  for (let y = 0; y < H; y += 3) pave(fond, 0, y, "#35e06a", 0.1, W, 1);
  const lignes = ["> gal --top3", "connexion...", "ACCES OK", "> briller"];
  const ecrits = Math.floor((t % 9) * 9);
  let avant = 0;
  fond.globalAlpha = 1;
  fond.fillStyle = "#5dff8a";
  fond.font = "8px ui-monospace, Consolas, monospace";
  lignes.forEach((ligne, i) => {
    fond.fillText(ligne.slice(0, Math.max(0, ecrits - avant)), 4, 30 + i * 9);
    avant += ligne.length;
  });
  // Le pavé du terminal, allumé une demi-seconde sur deux.
  if (Math.floor(t * 2) % 2) pave(fond, 4, 30 + 3 * 9 + 3, "#5dff8a", 1, 5, 2);
  const depuis = t % 2.3;
  const graine = Math.floor(t / 2.3);
  if (depuis < 0.4) {
    for (let i = 0; i < 7; i++) {
      const y = hasard(graine + i) * H;
      pave(devant, hasard(graine + i + 9) * 20 - 10, y, i % 2 ? "#ff2bd6" : "#22e6ff", 0.55, W, 2 + hasard(graine + i + 3) * 6);
      pave(fond, (hasard(graine + i + 5) - 0.5) * 30, y + 8, "#5dff8a", 0.4, W, 2);
    }
  }
}

/** Le feu d'artifice : trois fusées décalées montent puis éclatent en gerbes de couleur, certaines devant le Gaulois. */
function artifice(fond: Toile, devant: Toile, t: number): void {
  const DUREE = 3.2;
  for (let j = 0; j < 3; j++) {
    const temps = t + j * 1.07;
    const p = (temps % DUREE) / DUREE;
    const graine = Math.floor(temps / DUREE) * 7 + j;
    const cx = 15 + hasard(graine) * 66;
    const cy = 18 + hasard(graine + 1) * 55;
    const couleur = hasard(graine + 2) * 360;
    if (p < 0.25) {
      pave(fond, cx, H - (H - cy) * (p / 0.25), "#fff3c0", 1, 1, 3);
      continue;
    }
    const q = (p - 0.25) / 0.75;
    const e = elan(q);
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * TOUR + hasard(graine + i);
      const portee = (0.45 + hasard(graine + i * 3) * 0.55) * 40;
      pave(i % 4 ? fond : devant, cx + Math.cos(a) * portee * e, cy + Math.sin(a) * portee * e + q * q * 18, teinte(couleur + hasard(i) * 50, 72), 1 - q, 2, 2);
    }
  }
}

const confettis: Dessin = (fond, devant, t) => {
  for (let i = 0; i < 46; i++) pave(i % 4 ? fond : devant, hasard(i) * W + Math.sin(t * 1.5 + i) * 4, reste(hasard(i + 50) * H + t * (14 + hasard(i + 9) * 18), H), teinte(hasard(i + 3) * 360, 60), 1, 2, 1 + Math.floor(Math.abs(Math.sin(t * 4 + i)) * 2));
};

const averse: Dessin = (fond, devant, t) => {
  for (let i = 0; i < 80; i++) {
    const y = reste(hasard(i + 7) * H + t * (120 + hasard(i) * 70), H);
    const x = reste(hasard(i) * W * 1.4 - y * 0.22, W);
    pave(i % 5 ? fond : devant, x, y, "#bfe2ff", 0.75, 1, 5);
    if (y > H - 8) pave(fond, x - 1, H - 3, "#e8f6ff", 0.8, 3, 1);
  }
};

const bulles: Dessin = (fond, devant, t) => {
  for (let i = 0; i < 18; i++) {
    const rayon = 2 + hasard(i) * 5;
    const y = H + 10 - reste(hasard(i + 2) * H + t * (8 + hasard(i) * 14), H + 20);
    const x = hasard(i + 5) * W + Math.sin(t + i) * 3;
    const c = i % 3 ? fond : devant;
    anneau(c, x, y, rayon, rayon, teinte(180 + hasard(i) * 140, 82), 0.9);
    pave(c, x - rayon * 0.4, y - rayon * 0.5, "#e8f6ff", 0.9);
  }
};

/** Deux lumières font le tour de la carte, comme dans un tube. */
const tubeNeon: Dessin = (_fond, devant, t) => {
  const tourDeCarte = 2 * (W + H) - 24;
  const point = (pas: number): [number, number] => {
    const s = reste(pas, tourDeCarte);
    const l = W - 6;
    const h = H - 6;
    return s < l ? [3 + s, 3] : s < l + h ? [W - 3, 3 + s - l] : s < 2 * l + h ? [W - 3 - (s - l - h), H - 3] : [3, H - 3 - (s - 2 * l - h)];
  };
  for (let j = 0; j < 2; j++) {
    for (let k = 0; k < 70; k++) {
      const [x, y] = point(t * 60 + (j * tourDeCarte) / 2 - k * 1.4);
      pave(devant, x - 1, y - 1, teinte(t * 40 + j * 180 + k * 2, k < 3 ? 92 : 62), 1 - k / 70, 2, 2);
    }
  }
};

const pluieDeCode: Dessin = (fond, _devant, t) => {
  pave(fond, 0, 0, "#00140a", 0.74, W, H);
  for (let colonne = 0; colonne < 16; colonne++) {
    const tete = reste(t * (30 + hasard(colonne) * 50) + hasard(colonne + 3) * H * 2, H + 70);
    for (let k = 0; k < 11; k++) {
      const y = Math.floor((tete - k * 8) / 8) * 8;
      fond.globalAlpha = 1 - k / 11;
      fond.fillStyle = k ? "#35e06a" : "#e4ffea";
      chiffre(fond, colonne * 6 + 1, y, hasard(colonne * 31 + y + Math.floor(t * 3)) > 0.5);
    }
  }
};

const radar: Dessin = (fond, _devant, t) => {
  const cx = W / 2;
  const cy = H * 0.5;
  const angle = t * 1.2;
  pave(fond, 0, 0, "#001a12", 0.72, W, H);
  for (const rayon of [18, 36, 54, 72]) anneau(fond, cx, cy, rayon, rayon, "#3dff9a", 0.45);
  trait(fond, cx, 0, cx, H, "#3dff9a", 0.3);
  trait(fond, 0, cy, W, cy, "#3dff9a", 0.3);
  for (let k = 0; k < 44; k++) trait(fond, cx, cy, cx + Math.cos(angle - k * 0.025) * 90, cy + Math.sin(angle - k * 0.025) * 90, "#7dffbd", (1 - k / 44) * 0.5, 2);
  for (let i = 0; i < 7; i++) {
    const a = hasard(i) * TOUR;
    const r = 14 + hasard(i + 9) * 55;
    disque(fond, cx + Math.cos(a) * r, cy + Math.sin(a) * r, 2, i % 3 ? "#b6ffd8" : "#ff5a5a", 1 - reste(angle - a, TOUR) / 4);
  }
};

const blizzard: Dessin = (fond, devant, t, mx) => {
  for (let i = 0; i < 100; i++) {
    const taille = i % 3 === 0 ? 2 : 1;
    pave(i % 4 ? fond : devant, reste(hasard(i) * W + t * (18 + hasard(i + 1) * 30) * (1 + mx), W), reste(hasard(i + 2) * H + t * (20 + hasard(i + 4) * 40), H), "#e8f6ff", 0.9, taille, taille);
  }
};

const bouleAFacettes: Dessin = (fond, _devant, t) => {
  fond.globalCompositeOperation = "lighter";
  for (let i = 0; i < 12; i++) disque(fond, W / 2 + Math.cos(t * 0.7 + i * 0.63) * (18 + hasard(i) * 40), H * 0.48 + Math.sin(t * 0.9 + i * 1.3) * (30 + hasard(i + 1) * 45), 4 + hasard(i + 2) * 5, teinte(i * 30 + t * 30, 60), 0.55);
  fond.globalCompositeOperation = "source-over";
  trait(fond, W / 2, 0, W / 2, 8, "#d5dcef", 1);
  disque(fond, W / 2, 13, 6, "#c9d3ee");
  // Les facettes changent deux fois par seconde.
  for (let i = 0; i < 8; i++) pave(fond, W / 2 - 5 + hasard(i + Math.floor(t * 2)) * 10, 9 + hasard(i * 3 + Math.floor(t * 2)) * 8, "#f4f7ff", 1, 2, 2);
};

/** Le Gaulois a les pieds dans l'eau, et trois canards passent devant lui. */
const bainDeCanards: Dessin = (fond, devant, t) => {
  const niveau = H - 58;
  for (let x = 0; x < W; x += 2) {
    const y = niveau + Math.sin(x * 0.18 + t * 1.6) * 2;
    pave(fond, x, y, "#3aa0ff", 0.65, 2, H - y);
    pave(devant, x, y + 7, "#6cc0ff", 0.5, 2, H - 30 - y - 7);
    pave(devant, x, y + 7, "#e8f6ff", 0.8, 2, 1);
  }
  for (let i = 0; i < 3; i++) {
    const x = reste(t * 7 + i * 38, W + 16) - 10;
    const y = niveau + 2 + Math.sin(t * 1.6 + i * 2) * 2;
    pave(devant, x, y, "#ffd92e", 1, 8, 5);
    pave(devant, x + 5, y - 4, "#ffd92e", 1, 4, 4);
    pave(devant, x + 9, y - 2, "#ff8a1f", 1, 2, 1);
    pave(devant, x + 7, y - 3, "#0a1230");
    pave(devant, x + 1, y + 1, "#f0b800", 1, 4, 2);
  }
};

const foudre: Dessin = (fond, _devant, t) => {
  pave(fond, 0, 0, "#0a1040", 0.55, W, H);
  const DUREE = 2.6;
  for (let j = 0; j < 2; j++) {
    const temps = t + j * 1.4;
    const p = temps % DUREE;
    const graine = Math.floor(temps / DUREE) * 13 + j;
    if (p >= 0.45) continue;
    pave(fond, 0, 0, "#cfdcff", (0.45 - p) * 0.9, W, H);
    let x = 18 + hasard(graine) * 60;
    let y = 0;
    let pas = 0;
    while (y < H * 0.85) {
      pas++;
      const nx = x + (hasard(graine + pas) - 0.5) * 16;
      const ny = y + 5 + hasard(graine + pas + 40) * 5;
      trait(fond, x, y, nx, ny, "#8fb0ff", 0.5, 4);
      trait(fond, x, y, nx, ny, "#f4f7ff", 1, 1.5);
      if (hasard(graine + pas + 80) > 0.8) trait(fond, nx, ny, nx + (hasard(graine + pas) - 0.5) * 30, ny + 12, "#dfe8ff", 0.8, 1);
      x = nx;
      y = ny;
    }
  }
};

const couleeDeLave: Dessin = (fond, _devant, t) => {
  for (let y = Math.floor(H * 0.4); y < H; y += 3) {
    for (let x = 0; x < W; x += 3) {
      const v = Math.sin(x * 0.12 + t) + Math.sin(y * 0.1 - t * 1.3) + Math.sin((x + y) * 0.07 + t * 0.7) + ((y - H * 0.4) / (H * 0.6)) * 2.4 - 1.2;
      if (v > 1) pave(fond, x, y, v > 2.3 ? "#fff1a8" : v > 1.6 ? "#ffb02e" : "#e2401a", 1, 3, 3);
    }
  }
  for (let i = 0; i < 14; i++) pave(fond, hasard(i) * W, H - reste(hasard(i + 3) * H + t * (20 + hasard(i) * 20), H * 0.8), "#ffd27a", 0.9);
};

const vitesseLumiere: Dessin = (fond, _devant, t, mx, my) => {
  const cx = W / 2 + mx * 10;
  const cy = H * 0.45 + my * 10;
  pave(fond, 0, 0, "#040824", 0.78, W, H);
  for (let i = 0; i < 90; i++) {
    const a = hasard(i) * TOUR;
    const d = (hasard(i + 1) + t * (0.3 + hasard(i + 2) * 0.5)) % 1;
    const r = d * d * 120;
    const l = 1 + d * 12;
    trait(fond, cx + Math.cos(a) * r, cy + Math.sin(a) * r, cx + Math.cos(a) * (r - l), cy + Math.sin(a) * (r - l), i % 5 ? "#dfe8ff" : teinte(hasard(i) * 360, 75), d, 1 + d);
  }
};

/** Trois fusées montent avec leur fumée ; celle du milieu passe devant le Gaulois. */
const lancement: Dessin = (fond, devant, t) => {
  const DUREE = 5.2;
  for (let j = 0; j < 3; j++) {
    const p = reste(t + j * 1.8, DUREE) / DUREE;
    const depart = 14 + j * 32 + Math.sin(j * 5) * 6;
    const c = j === 1 ? devant : fond;
    for (let k = 1; k < 30; k++) {
      const q = p - k * 0.012;
      if (q < 0) break;
      disque(c, depart + q * 16 + Math.sin(k * 2 + j) * 1.5, H + 18 - q * (H + 50), 1 + k * 0.16, k < 4 ? "#ffb02e" : "#d8dcec", (1 - k / 30) * 0.6);
    }
    const x = depart + p * 16;
    const y = H + 12 - p * (H + 50);
    pave(c, x - 1, y - 4, "#f2f4fa", 1, 3, 8);
    pave(c, x, y - 6, "#e0263a", 1, 1, 2);
    pave(c, x - 1, y - 1, "#e0263a", 1, 3, 1);
    pave(c, x - 2, y + 2, "#8c93aa", 1, 5, 2);
    pave(c, x - 1, y + 4, Math.floor(t * 12) % 2 ? "#ffe08a" : "#ff7a1f", 1, 3, 3);
  }
};

const pluieDeStateres: Dessin = (fond, devant, t) => {
  for (let i = 0; i < 16; i++) {
    const c = i % 3 ? fond : devant;
    const x = hasard(i) * W;
    const y = reste(hasard(i + 1) * H + t * (25 + hasard(i + 2) * 25), H + 12) - 6;
    const l = Math.abs(Math.cos(t * 3 + i)) * 6 + 1;
    pave(c, x - l / 2 - 1, y - 3, "#9a6a08", 1, l + 2, 7);
    pave(c, x - l / 2, y - 3, "#ffcf4a", 1, l, 6);
    if (l > 3) pave(c, x - l / 2 + 1, y - 2, "#fff3b0", 1, 1, 3);
  }
};

const trouNoir: Dessin = (fond, _devant, t) => {
  const cx = W / 2;
  const cy = H * 0.42;
  pave(fond, 0, 0, "#06001a", 0.82, W, H);
  for (let i = 0; i < 170; i++) {
    const d = (hasard(i + 1) + t * 0.1) % 1;
    const r = (1 - d) * 72 + 7;
    const a = hasard(i) * TOUR + 3 / (r * 0.05 + 0.3) + t * 0.5;
    const taille = d > 0.7 ? 2 : 1;
    pave(fond, cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.42, teinte(280 - d * 250, 50 + d * 40), 0.3 + d * 0.7, taille, taille);
  }
  disque(fond, cx, cy, 13, "#ffd9a0", 0.25);
  disque(fond, cx, cy, 9, "#000000");
  anneau(fond, cx, cy, 10, 10, "#ffe6bd", 0.95, 1.5);
  anneau(fond, cx, cy, 17, 5, "#ffb86b", 0.8, 1.5);
};

const portail: Dessin = (fond, _devant, t, mx, my) => {
  const cx = W / 2 + mx * 6;
  const cy = H * 0.45 + my * 6;
  pave(fond, 0, 0, "#0c0030", 0.72, W, H);
  for (let k = 0; k < 16; k++) {
    const r = (k / 16 + t * 0.14) % 1;
    anneau(fond, cx, cy, r * r * 100, r * r * 125, teinte(k * 24 + t * 60, 62), r, 1 + r * 4);
  }
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TOUR + t * 0.3;
    trait(fond, cx, cy, cx + Math.cos(a) * 120, cy + Math.sin(a) * 150, "#e8f6ff", 0.12);
  }
  disque(fond, cx, cy, 5, "#f4f7ff", 0.9);
};

const voileBoreal: Dessin = (fond, _devant, t) => {
  for (let i = 0; i < 40; i++) pave(fond, hasard(i) * W, hasard(i + 60) * H * 0.6, "#f4f7ff", 0.4 + 0.5 * Math.sin(t + i));
  for (let j = 0; j < 3; j++) {
    for (let x = 0; x < W; x += 2) {
      const haut = 22 + j * 20 + Math.sin(x * 0.07 + t * 0.6 + j * 2) * 10 + Math.sin(x * 0.19 - t * 0.4) * 4;
      const couleur = teinte(140 + j * 50 + Math.sin(t * 0.3 + x * 0.02) * 30, 66);
      for (let y = 0; y < 30; y += 2) pave(fond, x, haut + y, couleur, (1 - y / 30) * 0.6, 2, 2);
    }
  }
};

const plasma: Dessin = (fond, _devant, t, mx) => {
  for (let y = 0; y < H; y += 4) {
    for (let x = 0; x < W; x += 4) {
      const v = Math.sin(x * 0.09 + t) + Math.sin(y * 0.07 - t * 0.8) + Math.sin((x + y) * 0.05 + t * 0.5) + Math.sin(Math.hypot(x - 48 - mx * 20, y - 80) * 0.11 - t * 1.2);
      pave(fond, x, y, teinte(v * 70 + t * 30, 55), 0.7, 4, 4);
    }
  }
};

/** L'explosion part de derrière le Gaulois : boule de feu, ondes, fumée, éclats devant lui et un « BOUM ». Quatre secondes. */
const explosion: Dessin = (fond, devant, t) => {
  const DUREE = 4;
  const p = (t % DUREE) / DUREE;
  const graine = Math.floor(t / DUREE) * 17;
  const cx = W / 2;
  const cy = H * 0.5;
  const e = elan(borne(p * 4));
  const alpha = 1 - borne((p - 0.3) / 0.5);
  for (let k = 0; k < 2; k++) anneau(fond, cx, cy, p * 130 - k * 14, p * 130 - k * 14, "#fff1d6", (1 - p) * 0.9, 3 - k);
  const couches: readonly (readonly [string, number])[] = [
    ["#8f1a0c", 1],
    ["#ff6a1f", 0.72],
    ["#ffd24a", 0.45],
    ["#fff8d0", 0.22],
  ];
  for (const [couleur, part] of couches) {
    for (let i = 0; i < 16; i++) {
      const a = hasard(graine + i) * TOUR;
      const d = hasard(graine + i + 20) * 26 * e;
      disque(fond, cx + Math.cos(a) * d, cy + Math.sin(a) * d, (9 + hasard(i) * 11) * e * part * (1 - p * 0.4), couleur, alpha);
    }
  }
  for (let i = 0; i < 12; i++) disque(fond, cx + (hasard(graine + i + 60) - 0.5) * 50, cy - p * 50 - hasard(i) * 20, 6 + p * 10, "#4a4250", borne((p - 0.25) * 3) * (1 - p) * 0.8);
  for (let i = 0; i < 30; i++) {
    const a = hasard(graine + i + 90) * TOUR;
    const portee = (0.4 + hasard(graine + i + 7)) * 80;
    pave(devant, cx + Math.cos(a) * portee * p, cy + Math.sin(a) * portee * p + p * p * 70, i % 3 ? "#ffb02e" : "#2a2230", 1 - p, 2, 2);
  }
  if (p < 0.1) pave(fond, 0, 0, "#fff1d6", (1 - p / 0.1) * 0.7, W, H);
  if (p > 0.03 && p < 0.4) {
    const taille = Math.min(1, (p - 0.03) * 12);
    devant.save();
    devant.translate(60, 26);
    devant.rotate(-0.18);
    devant.scale(taille, taille);
    devant.globalAlpha = 1;
    devant.font = "bold 16px Impact, system-ui, sans-serif";
    devant.textAlign = "center";
    devant.lineWidth = 4;
    devant.strokeStyle = "#b3200f";
    devant.strokeText("BOUM", 0, 0);
    devant.fillStyle = "#ffe45c";
    devant.fillText("BOUM", 0, 0);
    devant.restore();
  }
};

const supernova: Dessin = (fond, _devant, t) => {
  const cx = W / 2;
  const cy = H * 0.4;
  fond.globalCompositeOperation = "lighter";
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * TOUR + t * 0.15;
    const ouverture = 0.05 + 0.03 * Math.sin(t + i);
    fond.globalAlpha = 0.32;
    fond.fillStyle = teinte(i * 15 + t * 40, 68);
    fond.beginPath();
    fond.moveTo(cx, cy);
    fond.lineTo(cx + Math.cos(a - ouverture) * 170, cy + Math.sin(a - ouverture) * 170);
    fond.lineTo(cx + Math.cos(a + ouverture) * 170, cy + Math.sin(a + ouverture) * 170);
    fond.fill();
  }
  const q = (t % 3) / 3;
  anneau(fond, cx, cy, q * 90, q * 90, "#f4f7ff", (1 - q) * 0.8, 2);
  disque(fond, cx, cy, 16 + Math.sin(t * 2) * 2, "#ffd9f5", 0.5);
  disque(fond, cx, cy, 9 + Math.sin(t * 2) * 1.5, "#f4f7ff");
  trait(fond, cx - 60, cy, cx + 60, cy, "#f4f7ff", 0.8);
  trait(fond, cx, cy - 70, cx, cy + 70, "#f4f7ff", 0.8);
  fond.globalCompositeOperation = "source-over";
};

export const FINITIONS: Readonly<Record<FinitionDeCarte, Dessin>> = {
  confettis,
  averse,
  bulles,
  "tube-neon": tubeNeon,
  "pluie-de-code": pluieDeCode,
  radar,
  "feu-d-artifice": artifice,
  blizzard,
  "boule-a-facettes": bouleAFacettes,
  "bain-de-canards": bainDeCanards,
  piratage,
  foudre,
  "coulee-de-lave": couleeDeLave,
  "vitesse-lumiere": vitesseLumiere,
  lancement,
  "pluie-de-stateres": pluieDeStateres,
  "trou-noir": trouNoir,
  portail,
  "voile-boreal": voileBoreal,
  plasma,
  "champignon-atomique": champignon,
  explosion,
  supernova,
};

/** Une finition animée connue du dessin, ou `null` (une finition de reflet, sans toile, ou un nom inconnu). */
export const finitionAnimee = (nom: string | null | undefined): FinitionDeCarte | null => (nom && Object.hasOwn(FINITIONS, nom) ? (nom as FinitionDeCarte) : null);

/**
 * Les étincelles du champion de la semaine (demande du pilote, 17 novembre 2026 : « une finition prêtée au champion de la
 * semaine », qui se gagne et ne s'achète pas) : des étincelles d'or montent le long de la carte du premier du podium,
 * par-dessus sa finition, quelle qu'elle soit. La couronne, elle, est posée sur la tête du Gaulois
 * (`src/components/CouronneDuChampion.astro`).
 */
export function etincellesDuChampion(devant: Toile, t: number): void {
  for (let i = 0; i < 14; i++) {
    const cote = i % 2 ? 5 + hasard(i) * 9 : W - 5 - hasard(i) * 9;
    const haut = H - reste(hasard(i + 20) * H + t * (9 + hasard(i + 5) * 9), H);
    const gros = i % 4 === 0 ? 2 : 1;
    pave(devant, cote + Math.sin(t + i) * 1.5, haut, i % 3 ? "#ffcf4a" : "#fff3b0", 0.35 + 0.5 * Math.abs(Math.sin(t * 1.3 + i)), gros, gros);
  }
}
