/**
 * L'image fixe d'une finition de carte (rayon « Cartes », `cartes.ts`) : la carte sans le Gaulois, devant une bannière ou
 * le fond marine, avec la finition posée une fois. Elle sert aux cases du livre de la boutique
 * (`src/components/village/Cartes.tsx`) et, dessinée d'avance par `scripts/atelier-cartes.ts` dans
 * `src/lib/village/cartes-vignettes/`, à l'annonce des achats sur Discord (`src/lib/achats-discord.ts`), où il n'y a pas de
 * navigateur. Ce fichier ne tourne que dans un navigateur : il dessine sur des toiles.
 */
import { FINITIONS, HAUTEUR_DE_TOILE, LARGEUR_DE_TOILE, finitionAnimee, fusionDeLaFinition, type FinitionDeCarte } from "../fx/finitions-carte";
import type { FinitionDuRayon } from "./cartes";

/** L'instant où chaque animation est la plus parlante, en secondes : l'image fixe de sa case. Les autres sont prises à 2,4 s. */
export const INSTANT_DE_LA_VIGNETTE: Partial<Record<FinitionDeCarte, number>> = {
  "champignon-atomique": 4.2,
  explosion: 0.8,
  "feu-d-artifice": 1.9,
  foudre: 0.12,
  piratage: 4,
  lancement: 2.6,
  supernova: 1,
};

const ARC_EN_CIEL = ["#ff5a8a", "#ffd24a", "#5aff9e", "#4ad2ff", "#a56bff", "#ff5a8a"];
const hasard = (n: number): number => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};

/** L'image fixe d'un reflet, pour sa case : le même dessin que la feuille de style, posé une fois sur la toile. */
function peindreLeReflet(c: CanvasRenderingContext2D, id: string): void {
  const W = LARGEUR_DE_TOILE;
  const H = HAUTEUR_DE_TOILE;
  const degrade = (x0: number, y0: number, x1: number, y1: number, arrets: readonly (readonly [number, string])[]): CanvasGradient => {
    const g = c.createLinearGradient(x0, y0, x1, y1);
    for (const [p, couleur] of arrets) g.addColorStop(p, couleur);
    return g;
  };
  const halo = (x: number, y: number, rayon: number, couleur: string): void => {
    const g = c.createRadialGradient(x, y, 0, x, y, rayon);
    g.addColorStop(0, couleur);
    g.addColorStop(1, "transparent");
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);
  };
  const points = (n: number, couleur: string, dans: (x: number, y: number) => boolean): void => {
    c.fillStyle = couleur;
    for (let i = 0; i < n; i++) {
      const x = hasard(i) * W;
      const y = hasard(i + 400) * H;
      if (dans(x, y)) c.fillRect(Math.round(x), Math.round(y), i % 4 ? 1 : 2, i % 4 ? 1 : 2);
    }
  };
  c.globalCompositeOperation = "screen";
  if (id === "arc-en-ciel" || id === "prisme") {
    c.globalAlpha = 0.5;
    if (id === "prisme" && typeof c.createConicGradient === "function") {
      const g = c.createConicGradient(0.6, W / 2, H * 0.62);
      ARC_EN_CIEL.forEach((couleur, i) => g.addColorStop(i / (ARC_EN_CIEL.length - 1), couleur));
      c.fillStyle = g;
    } else {
      c.fillStyle = degrade(
        0,
        0,
        W,
        H * 0.7,
        ARC_EN_CIEL.map((couleur, i) => [i / (ARC_EN_CIEL.length - 1), couleur] as const),
      );
    }
    c.fillRect(0, 0, W, H);
  } else if (id === "tricolore") {
    c.globalAlpha = 0.75;
    c.fillStyle = degrade(0, H * 0.2, W, H * 0.5, [
      [0.1, "transparent"],
      [0.32, "#2b6bff"],
      [0.5, "#f4f7ff"],
      [0.68, "#ff3b4d"],
      [0.9, "transparent"],
    ]);
    c.fillRect(0, 0, W, H);
  } else if (id === "pluie-d-eclats") {
    c.globalAlpha = 0.5;
    c.fillStyle = degrade(0, 0, W, H, [
      [0, "#ff8ad0"],
      [0.5, "#8ad0ff"],
      [1, "#b8ff8a"],
    ]);
    c.fillRect(0, 0, W, H);
    c.globalAlpha = 1;
    points(260, "#f4f7ff", (x, y) => Math.abs(x + y * 0.5 - W * 0.9) < 34);
  } else if (id === "cristal") {
    c.globalAlpha = 0.28;
    c.fillStyle = "#f4f7ff";
    for (let y = 0; y < H; y += 12) for (let x = (y / 12) % 2 ? 12 : 0; x < W; x += 24) c.fillRect(x, y, 12, 12);
    c.globalAlpha = 0.4;
    c.fillStyle = degrade(0, 0, W, H, [
      [0, "#8af3ff"],
      [0.4, "#f4f7ff"],
      [0.65, "#c9a8ff"],
      [1, "#8af3ff"],
    ]);
    c.fillRect(0, 0, W, H);
  } else if (id === "braise") {
    c.globalAlpha = 0.95;
    halo(W / 2, H * 1.08, H * 0.75, "#ff8a2e");
    halo(W / 2, H * 1.1, H * 0.4, "#ffd27a");
    points(60, "#ffd27a", (_x, y) => y > H * 0.45);
  } else if (id === "feuille-d-or") {
    c.globalAlpha = 0.45;
    c.fillStyle = degrade(0, 0, W * 0.4, H, [
      [0, "#ffd75e"],
      [1, "#b97a12"],
    ]);
    c.fillRect(0, 0, W, H);
    c.globalAlpha = 0.85;
    c.fillStyle = degrade(0, H * 0.25, W, H * 0.6, [
      [0.25, "transparent"],
      [0.45, "#fff3b0"],
      [0.5, "#ffcf4a"],
      [0.55, "#fff3b0"],
      [0.75, "transparent"],
    ]);
    c.fillRect(0, 0, W, H);
  } else if (id === "hologramme") {
    c.globalAlpha = 0.45;
    c.fillStyle = "#78dcff";
    for (let y = 0; y < H; y += 4) c.fillRect(0, y, W, 1);
    c.globalAlpha = 0.7;
    c.fillStyle = degrade(0, H * 0.3, 0, H * 0.6, [
      [0, "transparent"],
      [0.5, "#78dcff"],
      [1, "transparent"],
    ]);
    c.fillRect(0, 0, W, H);
  } else if (id === "aurore") {
    c.globalAlpha = 0.7;
    halo(W * 0.2, H * 0.25, W * 0.8, "#3dffb0");
    halo(W * 0.85, H * 0.45, W * 0.9, "#4ab8ff");
    halo(W * 0.4, H * 0.9, W * 0.9, "#b06bff");
  } else if (id === "cosmos") {
    c.globalAlpha = 0.6;
    halo(W * 0.6, H * 0.3, W * 0.9, "#ff6bd6");
    halo(W * 0.3, H * 0.8, W, "#4a6bff");
    c.globalAlpha = 1;
    points(110, "#f4f7ff", () => true);
  }
  c.globalAlpha = 1;
  c.globalCompositeOperation = "source-over";
}

let toilesDeTravail: [CanvasRenderingContext2D, CanvasRenderingContext2D] | null = null;
/** Deux toiles hors de la page, les mêmes pour toutes les cases : le fond et le devant d'une animation, le temps de les poser. */
function travail(): [CanvasRenderingContext2D, CanvasRenderingContext2D] | null {
  if (toilesDeTravail) return toilesDeTravail;
  const faire = (): CanvasRenderingContext2D | null => {
    const toile = document.createElement("canvas");
    toile.width = LARGEUR_DE_TOILE;
    toile.height = HAUTEUR_DE_TOILE;
    return toile.getContext("2d");
  };
  const fond = faire();
  const devant = faire();
  toilesDeTravail = fond && devant ? [fond, devant] : null;
  return toilesDeTravail;
}

/**
 * L'image d'une finition, pour sa case du livre et son vol : la carte sans le Gaulois, devant la bannière du membre (ou le
 * fond marine), avec la finition en image fixe. Rien ne bouge dans les cases : la finition s'anime une fois dressée.
 */
export function peindreLaVignette(toile: HTMLCanvasElement, finition: FinitionDuRayon, banniere: HTMLImageElement | null): void {
  const c = toile.getContext("2d");
  if (!c) return;
  const W = LARGEUR_DE_TOILE;
  const H = HAUTEUR_DE_TOILE;
  c.globalAlpha = 1;
  c.globalCompositeOperation = "source-over";
  c.imageSmoothingEnabled = false;
  if (banniere && banniere.naturalWidth > 0) {
    // La bannière remplit la carte, comme sur l'accueil : rognée sur les côtés, jamais déformée.
    const echelle = Math.max(W / banniere.naturalWidth, H / banniere.naturalHeight);
    const l = banniere.naturalWidth * echelle;
    const h = banniere.naturalHeight * echelle;
    c.drawImage(banniere, (W - l) / 2, (H - h) / 2, l, h);
  } else {
    const g = c.createLinearGradient(0, 0, W * 0.4, H);
    g.addColorStop(0, "#2148b8");
    g.addColorStop(0.72, "#0a1230");
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);
  }
  const nom = finitionAnimee(finition.id);
  if (!nom) {
    peindreLeReflet(c, finition.id);
    return;
  }
  const t = travail();
  if (!t) return;
  const [fond, devant] = t;
  for (const x of t) {
    x.globalAlpha = 1;
    x.globalCompositeOperation = "source-over";
    x.clearRect(0, 0, W, H);
  }
  FINITIONS[nom](fond, devant, INSTANT_DE_LA_VIGNETTE[nom] ?? 2.4, 0.3, -0.15);
  const fusion = fusionDeLaFinition(nom);
  c.globalCompositeOperation = fusion === "normal" ? "source-over" : fusion;
  c.drawImage(fond.canvas, 0, 0);
  c.globalCompositeOperation = "source-over";
  c.drawImage(devant.canvas, 0, 0);
}
