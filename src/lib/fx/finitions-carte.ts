/**
 * Les finitions animées des cartes du podium de l'accueil (demande du pilote, 17 novembre 2026 : « pourquoi il n'y a pas
 * une seule des animations que tu m'as créées ? »). Chaque finition se dessine en pixels sur deux toiles de 96 × 160
 * cases : une derrière le Gaulois (`fond`), une devant lui (`devant`). Le dessin ne dépend que du temps `t`, en secondes :
 * il ne lit ni ne change aucune donnée. Le script `src/scripts/cartes-podium.ts` efface les toiles puis appelle la finition.
 *
 * Trois finitions pour l'instant, une par place du podium (`finitionDuMetal` de `cartes-podium.ts`) ; les autres maquettes
 * montrées au pilote viendront avec le rayon « Cartes » de la boutique.
 */

export const LARGEUR_DE_TOILE = 96;
export const HAUTEUR_DE_TOILE = 160;

export type FinitionDeCarte = "champignon" | "piratage" | "artifice";

/** Ce que les finitions demandent à une toile : un sous-ensemble du contexte 2D d'un canvas. */
export type Toile = Pick<
  CanvasRenderingContext2D,
  "globalAlpha" | "fillStyle" | "strokeStyle" | "lineWidth" | "font" | "fillRect" | "clearRect" | "beginPath" | "arc" | "ellipse" | "fill" | "stroke" | "fillText"
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

export const FINITIONS: Readonly<Record<FinitionDeCarte, (fond: Toile, devant: Toile, t: number) => void>> = { champignon, piratage, artifice };
