/**
 * La bannière du clan, « La flotte de nuit » : le fond de la ligne [GAL] du classement des clans (demande du pilote,
 * 17 novembre 2026 : « une bannière dans le même type que pour les Gaulois, mais créée uniquement pour ça, comme ça on se
 * distingue des autres clans » ; choisie par lui parmi dix, la neuvième). Dessin original de Claude Fable 5.2 pour le
 * clan [GAL], sans emprunt à une œuvre existante ni aux images d'OpenFront.
 *
 * Une bande de 240 cases sur 20, qui se raccorde bord à bord : la page la répète sur toute la largeur de la ligne
 * (`.ligne-clan` de `src/styles/feuilles/01-socle.css`). Toujours la même : ni l'heure ni le hasard n'y changent rien.
 * Publiée sous `/banniere-clan.png` par `src/pages/banniere-clan.png.ts`. Elle n'est ni un objet du village ni une
 * bannière de Gaulois : personne ne l'achète ni ne la choisit.
 */

/** La bande, en cases. */
export const LARGEUR_DE_LA_BANDE = 240;
export const HAUTEUR_DE_LA_BANDE = 20;
/** L'adresse de l'image publiée, sous la racine du site. */
export const IMAGE_DE_LA_BANNIERE_DU_CLAN = "/banniere-clan.png";

const W = LARGEUR_DE_LA_BANDE;
const H = HAUTEUR_DE_LA_BANDE;

const hex = (n: number): string => Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, "0");
const rvb = (c: string): [number, number, number] => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
function melanger(a: string, b: string, part: number): string {
  const [ra, ga, ba] = rvb(a);
  const [rb, gb, bb] = rvb(b);
  const t = Math.min(1, Math.max(0, part));
  return `#${hex(ra + (rb - ra) * t)}${hex(ga + (gb - ga) * t)}${hex(ba + (bb - ba) * t)}`;
}
/** La colonne ramenée dans la bande : ce qui sort à droite rentre à gauche, d'où le raccord. */
const tour = (x: number): number => ((x % W) + W) % W;
/** Un tirage fixe par case, de 0 à 1. */
function tirage(x: number, y: number): number {
  let h = Math.imul(tour(x) + 17, 374761393) ^ Math.imul(y + 31, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (((h ^ (h >>> 16)) >>> 0) % 10000) / 10000;
}
const TRAME = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const trame = (x: number, y: number): number => ((TRAME[(y & 3) * 4 + (tour(x) & 3)] ?? 0) + 0.5) / 16;
/** Une couleur d'une suite de paliers, tramée entre deux voisins. */
function palier(couleurs: readonly string[], part: number, x: number, y: number): string {
  const u = Math.min(0.9999, Math.max(0, part)) * (couleurs.length - 1);
  const i = Math.floor(u);
  return (u - i > trame(x, y) ? couleurs[i + 1] : couleurs[i]) ?? "#000000";
}
/** Une onde qui se raccorde : `tours` tours sur la largeur de la bande. */
const onde = (x: number, tours: number, phase = 0): number => Math.sin((2 * Math.PI * tours * x) / W + phase);

class Bande {
  readonly cases: string[] = [];
  constructor(fond: (x: number, y: number) => string) {
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) this.cases.push(fond(x, y));
  }
  poser(x: number, y: number, couleur: string | undefined): void {
    if (couleur && Number.isInteger(y) && y >= 0 && y < H) this.cases[y * W + tour(x)] = couleur;
  }
  lire(x: number, y: number): string {
    return this.cases[Math.min(H - 1, Math.max(0, y)) * W + tour(x)] ?? "#000000";
  }
  /** Une grille de lettres : « . » laisse la case, chaque autre lettre prend sa couleur dans `couleurs`. */
  grille(x: number, y: number, lignes: readonly string[], couleurs: Readonly<Record<string, string>>): void {
    lignes.forEach((ligne, dy) => {
      for (let dx = 0; dx < ligne.length; dx++) this.poser(x + dx, y + dy, couleurs[ligne[dx] ?? "."]);
    });
  }
  /** Mêle une couleur à ce qui est déjà là. */
  voile(x: number, y: number, couleur: string, part: number): void {
    if (part > 0 && y >= 0 && y < H) this.poser(x, y, melanger(this.lire(x, y), couleur, part));
  }
  /** Une lueur ronde, en cinq crans tramés. */
  lueur(cx: number, cy: number, rayon: number, couleur: string, force: number): void {
    for (let y = 0; y < H; y++) {
      for (let x = cx - rayon; x <= cx + rayon; x++) {
        const d = Math.hypot(x - cx, y - cy);
        if (d < rayon) this.voile(x, y, couleur, Math.min(1, Math.floor((1 - d / rayon) * 5 + trame(x, y)) / 5) * force);
      }
    }
  }
}

/** La colonne de la lune, et la rangée de l'horizon : le ciel au-dessus, la mer à partir d'elle. */
const LUNE = 60;
const HORIZON = 9;

const NAVIRE = [
  "........m........",
  "....vvvvmvvvv....",
  "....abababab.....",
  "....abababab.....",
  "....abababab.....",
  "....abababab.....",
  "....vvvvmvvvv....",
  "p.......m.......p",
  "pp......m......pp",
  ".hrhbhghrhbhghrh.",
  "..hhhhhhhhhhhhh..",
] as const;
/** Les quatre navires : colonne, rangée, et la couleur des rayures de la voile (bleu ou rouge, avec le blanc). */
const NAVIRES = [
  { x: 14, y: 3, voile: "#0b5fff" },
  { x: 108, y: 4, voile: "#d91228" },
  { x: 158, y: 3, voile: "#0b5fff" },
  { x: 212, y: 4, voile: "#d91228" },
] as const;

/** Les cases de la bannière du clan, rangée par rangée : 240 × 20 couleurs « #rrggbb », aucune vide. */
export function casesDeLaBanniereDuClan(): string[] {
  const b = new Bande((x, y) =>
    y < HORIZON
      ? palier(["#040820", "#08123c", "#101e58", "#1b2e78", "#2a4296"], y / 8.5, x, y)
      : palier(["#0f2e78", "#0b2462", "#081b4e", "#05123a"], (y - HORIZON) / 10, x, y),
  );
  // les étoiles
  for (let y = 0; y < 8; y++) for (let x = 0; x < W; x++) if (tirage(x, y) > 0.972) b.poser(x, y, tirage(x, y + 30) > 0.55 ? "#f1f5ff" : "#8494d0");
  // la lune et son halo
  b.lueur(LUNE, 4, 11, "#9db4ff", 0.4);
  for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) if (Math.hypot(dx, dy) < 3.5) b.poser(LUNE + dx, 4 + dy, dx + dy > 2 ? "#cfcba8" : "#f6f3da");
  b.poser(LUNE - 1, 3, "#cfcba8");
  b.poser(LUNE + 1, 5, "#b8b490");
  // la côte au loin
  for (let x = 0; x < W; x++) {
    const haut = Math.round(1.2 * Math.max(0, onde(x, 2, 3)) + 0.8 * Math.max(0, onde(x, 5, 1)));
    for (let y = HORIZON - haut; y < HORIZON; y++) b.poser(x, y, "#070d2c");
  }
  // les vagues
  for (let y = HORIZON; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const v = onde(x, 12, y * 1.5) + onde(x, 5, y * 0.8 + 1) + onde(x, 23, y * 2.2);
      if (v > 1.75) b.poser(x, y, "#a9c4ff");
      else if (v > 1.2) b.poser(x, y, "#3f6fd8");
      else if (v < -1.7) b.poser(x, y, "#040d2c");
    }
  }
  // le reflet de la lune, en traits qui s'élargissent
  for (let y = HORIZON + 1; y < H; y += 2) {
    const demi = Math.round(1 + (y - HORIZON) * 0.45);
    for (let dx = -demi; dx <= demi; dx++) {
      if (tirage(LUNE + dx, y) > 0.2) b.poser(LUNE + dx + (y % 4 ? 1 : -1), y, Math.abs(dx) < demi - 1 ? "#f6f3da" : "#9db4ff");
    }
  }
  // les navires, leur lanterne et leur ombre sur l'eau
  for (const navire of NAVIRES) {
    b.grille(navire.x, navire.y, NAVIRE, { m: "#2a1a0c", v: "#5a3a1c", a: navire.voile, b: "#f1f3fa", p: "#3a2412", h: "#1c110a", r: "#d91228", g: "#f2b632" });
    b.poser(navire.x, navire.y + 6, "#ffd23a");
    b.lueur(navire.x, navire.y + 6, 5, "#ffb347", 0.5);
    for (let dx = 2; dx < 15; dx++) for (let dy = 11; dy < 14; dy++) if ((dx + dy) % 2 === 0) b.voile(navire.x + dx, navire.y + dy, "#030a24", 0.6);
  }
  return b.cases;
}
