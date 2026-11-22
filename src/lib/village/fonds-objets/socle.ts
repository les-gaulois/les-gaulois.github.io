/**
 * Les fonds d'objets (demande du pilote, 22 novembre 2026 : « un fond, une bannière pour chaque item, pour chaque cosmétique
 * du jeu, pour chaque familier, pour qu'il y ait un fond derrière qui soit propre », dessin par Claude Fable 5.2) : la petite
 * scène en pixels posée derrière un objet, un familier ou un Gaulois unique, sur sa carte (cases du vestiaire et de la
 * boutique, marché, face des boosters). À ne pas confondre avec les « fonds du jeu » (`src/lib/jeu/fonds-du-jeu.ts`), les
 * paysages derrière tout l'écran, ni avec les bannières, fonds de /gaulois qui s'achètent.
 *
 * Ici, le socle commun à toutes les scènes : leurs paramètres, la liste des scènes (le contrat entre les dessins et la table
 * qui les attribue), et des outils de dessin partagés. Tout est calculé : la même clé et la même taille donnent toujours le
 * même dessin, sans `Math.random`.
 *
 * Une scène se dessine à toute taille, de 24 × 20 à 128 × 88 cases : elle reçoit la planche, déjà à la bonne taille, et la
 * remplit tout entière (aucune case vide). Elle reste claire : le pilote n'aime pas les cartes de cosmétiques sombres, et les
 * objets ont un contour presque noir qui doit se détacher. Le milieu reste calme : l'objet s'y pose.
 */
import { Planche, alea } from "../decor";
import { melanger } from "../lumiere";

export { Planche, alea, melanger };

/** Le plus petit et le plus grand fond qu'une scène doit savoir dessiner, en cases. */
export const TAILLE_MIN = { largeur: 24, hauteur: 20 } as const;
export const TAILLE_MAX = { largeur: 128, hauteur: 88 } as const;

/** La luminance moyenne au-dessous de laquelle un fond est trop sombre (le test la vérifie, rang par rang). */
export const LUMINANCE_MIN = 0.4;

/** Un rectangle, en cases. */
export interface Zone {
  x: number;
  y: number;
  largeur: number;
  hauteur: number;
}

/** Ce qu'une scène reçoit pour se dessiner. */
export interface ParametresDuFond {
  largeur: number;
  hauteur: number;
  /** Un entier 32 bits tiré de la clé de l'objet : sa variante (place des nuages, des arbres, des étoiles…). */
  graine: number;
  /** « #rrggbb » : la couleur propre de l'objet, pour teinter un détail de la scène (fanion, reflet, tenture…). */
  accent: string;
  /** Le rang de la rareté : 1 commun, 2 peu commun, 3 épique, 4 mystique, 5 légendaire (et de saison), 6 divin. */
  rang: number;
  /** La place de l'objet posé devant : à garder calme (peu de contraste, aucun détail fin). */
  zone: Zone;
  /** La rangée du sol, sous l'objet : un familier ou un Gaulois unique y a les pieds ; un objet flotte au-dessus. */
  sol: number;
}

/** Une scène : son identifiant (celui du catalogue), son nom et son dessin. */
export interface SceneDeFond {
  id: IdDeScene;
  nom: string;
  peindre: (p: Planche, o: ParametresDuFond) => void;
}

/**
 * Le catalogue des scènes : l'identifiant, le lot qui la dessine (un fichier `scenes-<lot>.ts`) et ce qu'elle montre. La
 * table d'attribution (`attribution.ts`) choisit l'une d'elles pour chaque objet, familier et Gaulois unique.
 */
export const CATALOGUE_DES_SCENES = {
  // Lot A : la campagne gauloise.
  prairie: { lot: "a", nom: "La prairie", montre: "herbe verte, collines douces, ciel bleu clair, quelques fleurs et nuages" },
  "champ-de-ble": { lot: "a", nom: "Le champ de blé", montre: "épis dorés, meules de foin, ciel d'été" },
  potager: { lot: "a", nom: "Le potager", montre: "rangs de choux et de courges, clôture de piquets, terre brune claire" },
  ferme: { lot: "a", nom: "La ferme", montre: "grange de bois, barrière, bottes de foin, cour en terre" },
  "foret-de-chenes": { lot: "a", nom: "La forêt de chênes", montre: "sous-bois clair, troncs, feuillage, rais de lumière" },
  "bord-de-riviere": { lot: "a", nom: "Le bord de rivière", montre: "eau claire, roseaux, galets, petit ponton" },
  "jardin-fleuri": { lot: "a", nom: "Le jardin fleuri", montre: "massifs de fleurs, ruche de paille, papillons, haie" },
  // Lot B : le front, le feu et le métal.
  forge: { lot: "b", nom: "La forge", montre: "mur de pierre clair, enclume, braises orangées, outils pendus" },
  armurerie: { lot: "b", nom: "L'armurerie", montre: "râtelier d'armes, boucliers au mur, planches de bois" },
  remparts: { lot: "b", nom: "Les remparts", montre: "palissade de rondins, tour de guet, ciel clair" },
  "camp-militaire": { lot: "b", nom: "Le camp militaire", montre: "tentes kaki, sacs de sable, caisses, poteau radio" },
  "champ-de-bataille": { lot: "b", nom: "Le champ de bataille", montre: "plaine au soleil couchant clair, étendards au loin, fumées légères" },
  mine: { lot: "b", nom: "La mine", montre: "galerie aux étais de bois, lanternes, filons qui brillent, roche claire" },
  tournoi: { lot: "b", nom: "Le tournoi", montre: "lice, tentes rayées, fanions, tribune" },
  // Lot C : mers, monts et saisons.
  "bord-de-mer": { lot: "c", nom: "Le bord de mer", montre: "plage de sable, vagues, voile au loin, mouettes" },
  port: { lot: "c", nom: "Le port", montre: "quai de bois, barques, filets, bittes d'amarrage" },
  "montagne-enneigee": { lot: "c", nom: "La montagne enneigée", montre: "sommets blancs, sapins, flocons" },
  "lac-gele": { lot: "c", nom: "Le lac gelé", montre: "glace bleutée, rives enneigées, ciel d'hiver pâle" },
  "automne-pluvieux": { lot: "c", nom: "L'automne pluvieux", montre: "feuilles rousses, pluie fine, flaques" },
  "ciel-d-orage": { lot: "c", nom: "Le ciel d'orage", montre: "gros nuages gris clair, éclair, pluie en biais" },
  marais: { lot: "c", nom: "Le marais", montre: "nénuphars, joncs, eau verte claire, brume légère" },
  // Lot D : le village en fête.
  cuisine: { lot: "d", nom: "La cuisine", montre: "chaudron sur le feu, étagères de pots, jambons pendus" },
  fournil: { lot: "d", nom: "Le fournil", montre: "four à pain voûté, pains sur claies, sacs de farine" },
  taverne: { lot: "d", nom: "La taverne", montre: "tonneaux, chopes, poutres, lumière chaude" },
  "fete-du-village": { lot: "d", nom: "La fête du village", montre: "guirlandes de fanions, lampions, confettis" },
  chantier: { lot: "d", nom: "Le chantier", montre: "échafaudage, cônes, tas de pierres, grue de bois" },
  "chambre-douillette": { lot: "d", nom: "La chambre douillette", montre: "lit, tapis, bougie, fenêtre sur la lune" },
  "scene-de-theatre": { lot: "d", nom: "La scène de théâtre", montre: "rideaux, planches, projecteurs, étoiles de papier" },
  // Lot E : légendes et trésors.
  "salle-du-tresor": { lot: "e", nom: "La salle du trésor", montre: "tas de statères, coffres ouverts, éclats d'or" },
  palais: { lot: "e", nom: "Le palais", montre: "colonnes, tentures, tapis, trône au fond" },
  "cercle-de-pierres": { lot: "e", nom: "Le cercle de pierres", montre: "menhirs, gui, crépuscule mauve clair, lucioles" },
  "foret-enchantee": { lot: "e", nom: "La forêt enchantée", montre: "champignons lumineux, brume, lueurs" },
  "antre-du-dragon": { lot: "e", nom: "L'antre du dragon", montre: "roches chaudes, coulées de lave claires, os, braises" },
  "ciel-des-dieux": { lot: "e", nom: "Le ciel des dieux", montre: "nuages dorés, rayons, soleil" },
  "nuit-etoilee": { lot: "e", nom: "La nuit étoilée", montre: "ciel bleu-mauve clair, étoiles, lune, colline" },
  // Lot F : le divin et les étoiles.
  "sans-texture": { lot: "f", nom: "Le monde sans texture", montre: "damier magenta et gris, grille de fil de fer, pixels perdus" },
  "pre-des-vaches": { lot: "f", nom: "Le pré des vaches", montre: "alpage, clôture, cloches, vaches au loin" },
  "zone-contaminee": { lot: "f", nom: "La zone contaminée", montre: "bandes jaunes et noires, fûts, lueur verte, sas" },
  "pas-de-tir": { lot: "f", nom: "Le pas de tir", montre: "tour de lancement, fusée au loin, vapeur, ciel clair" },
  espace: { lot: "f", nom: "L'espace", montre: "ciel violet clair, étoiles, planète à anneau, lune" },
  "salle-de-controle": { lot: "f", nom: "La salle de contrôle", montre: "pupitres, écrans, voyants, carte du monde" },
} as const satisfies Record<string, { lot: "a" | "b" | "c" | "d" | "e" | "f"; nom: string; montre: string }>;

export type IdDeScene = keyof typeof CATALOGUE_DES_SCENES;
export const IDS_DES_SCENES = Object.keys(CATALOGUE_DES_SCENES) as readonly IdDeScene[];

// ---------------------------------------------------------------------------------------------------------------------
// Outils de dessin partagés.
// ---------------------------------------------------------------------------------------------------------------------

/** Un tirage de 0 à 1 qui suit la graine : à appeler toujours dans le même ordre pour le même dessin. */
export function hasard(graine: number): () => number {
  let a = graine >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Un entier de `min` à `max` compris, tiré par `h`. */
export const entre = (h: () => number, min: number, max: number): number => min + Math.floor(h() * (max - min + 1));

/** Un nombre de 32 bits tiré d'un texte (FNV-1a) : la graine d'une clé. */
export function graineDe(texte: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < texte.length; i++) {
    h ^= texte.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

const lireHex = (c: string): [number, number, number] => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
const ecrireHex = (r: number, v: number, b: number): string =>
  `#${[r, v, b].map((n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0")).join("")}`;

/** Une couleur éclaircie vers le blanc, `part` de 0 à 1. */
export const eclaircir = (c: string, part: number): string => melanger(c, "#ffffff", part);
/** Une couleur assombrie vers le bleu nuit du site, `part` de 0 à 1. */
export const assombrir = (c: string, part: number): string => melanger(c, "#0a1230", part);

/** La luminance relative d'une couleur (sRGB), de 0 (noir) à 1 (blanc). */
export function luminance(c: string): number {
  const [r, v, b] = lireHex(c).map((n) => {
    const s = n / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * v + 0.0722 * b;
}

/** La luminance moyenne d'un dessin, cases vides ignorées. */
export function luminanceMoyenne(cases: readonly (string | null)[]): number {
  let somme = 0;
  let n = 0;
  for (const c of cases) {
    if (!c) continue;
    somme += luminance(c);
    n++;
  }
  return n ? somme / n : 0;
}

/** Une couleur ramenée vers le gris, `part` de 0 (inchangée) à 1 (gris de même clarté). */
export function adoucir(c: string, part: number): string {
  const [r, v, b] = lireHex(c);
  const g = 0.3 * r + 0.59 * v + 0.11 * b;
  return ecrireHex(r + (g - r) * part, v + (g - v) * part, b + (g - b) * part);
}

/** La matrice de Bayer 4 × 4 : une trame ordonnée, propre, jamais du bruit. */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5] as const;

/** Vrai si la case (x, y) prend la seconde couleur d'une trame à `part` (0 : jamais, 1 : toujours). */
export const trame = (x: number, y: number, part: number): boolean => BAYER[(y & 3) * 4 + (x & 3)]! < Math.round(part * 16);

/**
 * Un dégradé vertical tramé de `haut` à `bas` sur les rangées y0 à y1 (comprises), en `paliers` couleurs mélangées : des
 * bandes nettes, tramées à leur jonction.
 */
export function degrade(p: Planche, y0: number, y1: number, haut: string, bas: string, paliers = 4): void {
  const n = Math.max(1, y1 - y0);
  for (let y = y0; y <= y1; y++) {
    const t = ((y - y0) / n) * (paliers - 1);
    const i = Math.floor(t);
    const f = t - i;
    const a = melanger(haut, bas, i / Math.max(1, paliers - 1));
    const b = melanger(haut, bas, Math.min(paliers - 1, i + 1) / Math.max(1, paliers - 1));
    for (let x = 0; x < p.largeur; x++) p.poser(x, y, trame(x, y, f) ? b : a);
  }
}

/**
 * Une ligne de crête : pour chaque colonne, la hauteur d'une colline douce (somme de deux ondes décalées par la graine),
 * entre `base - ampleur` et `base`. Pour poser des collines, des dunes, des toits de forêt.
 */
export function crete(largeur: number, base: number, ampleur: number, h: () => number): number[] {
  const f1 = 0.6 + h() * 0.8;
  const f2 = 1.6 + h() * 1.6;
  const d1 = h() * Math.PI * 2;
  const d2 = h() * Math.PI * 2;
  const ys: number[] = [];
  for (let x = 0; x < largeur; x++) {
    const t = x / Math.max(1, largeur - 1);
    const v = 0.65 * Math.sin(t * Math.PI * f1 + d1) + 0.35 * Math.sin(t * Math.PI * f2 + d2);
    ys.push(Math.round(base - ampleur * (0.5 + 0.5 * v)));
  }
  return ys;
}

/** Remplit sous une crête jusqu'au bas de la planche, d'une couleur ou case par case. */
export function remplirSous(p: Planche, ys: readonly number[], couleur: string | ((x: number, y: number, profondeur: number) => string | null)): void {
  for (let x = 0; x < p.largeur; x++) {
    const y0 = ys[x] ?? p.hauteur;
    for (let y = Math.max(0, y0); y < p.hauteur; y++) {
      const c = typeof couleur === "string" ? couleur : couleur(x, y, y - y0);
      if (c !== null) p.poser(x, y, c);
    }
  }
}

/** Un nuage arrondi, en trois bosses, de largeur `l` : un corps clair et une ombre en bas. */
export function nuage(p: Planche, x: number, y: number, l: number, clair: string, ombre: string): void {
  const r = Math.max(1, Math.round(l / 5));
  p.rect(x, y, l, r + 1, clair);
  p.disque(x + r, y, r, clair);
  p.disque(x + Math.round(l / 2), y - Math.round(r * 0.6), r + 1, clair);
  p.disque(x + l - r - 1, y, r, clair);
  p.rect(x + 1, y + r, l - 2, 1, ombre);
}

/** Le rectangle de la planche entière. */
export const toute = (p: { largeur: number; hauteur: number }): Zone => ({ x: 0, y: 0, largeur: p.largeur, hauteur: p.hauteur });
