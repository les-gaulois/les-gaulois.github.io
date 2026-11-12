/**
 * Le décor de l'image de bienvenue (`arrivees-image.ts`) : l'étendard du clan, en six couleurs.
 *
 * Le 12 novembre 2026 au soir, le pilote a gardé ce seul décor (« que ce style image et non les 6 preset »), puis demandé de le
 * décliner : « tu gardes les mêmes formes, mêmes paramètres, mais tu modifies les couleurs […] pour les différencier, mais qu'il
 * reste cohérent ». Les formes ne changent donc jamais : l'écharpe tricolore, le guerrier en filigrane, la trame de la table des
 * cartes, le médaillon, la place du texte. Seules changent les couleurs : le fond, les lueurs, le guerrier, les reflets, et les
 * touches claires assorties (halo du nom, graduations et fond du médaillon, dossier de l'invite, adresse du site), prises dans
 * les scènes du site (`global.css` : bleu royal, indigo, lie-de-vin, nuit) et dans le bleu acier d'un bouclier. L'écharpe,
 * l'anneau du médaillon et le nom gardent le tricolore du drapeau dans toutes : c'est l'identité du clan.
 *
 * Purement décoratif : aucune donnée du clan. Les formes sont dessinées ici, à la main ; le guerrier est le logo du clan
 * (`public/brand/tete.*`). Les cinq autres décors du premier jour (matrice, bouclier, forêt, carte, terminal) sont dans
 * l'historique du dépôt, au commit 0b13ca7.
 */
import type { Decor } from "./arrivees";

export const WIDTH = 1200;
export const HEIGHT = 480;

/** Les jetons de `docs/DESIGN.md`, et le vert de terminal du QG. */
export const INK = {
  navy: "#050B1F",
  night: "#020614",
  surface: "#0A1433",
  surface2: "#13214D",
  line: "#1B2B5E",
  lineStrong: "#5469AE",
  blue: "#0B5FFF",
  blueLight: "#4C86F5",
  blueText: "#9DBCFF",
  red: "#FF1A2E",
  redLight: "#FF5A68",
  muted: "#C0C9E2",
  white: "#FFFFFF",
  green: "#4ADE80",
} as const;

/** Les couleurs d'une variante de l'étendard. Tout le reste est commun aux six. */
export interface Palette {
  /** Le nom de la variante, que l'aperçu écrit (`npm run arrivees:apercu`). */
  nom: string;
  /** Le fond, du centre (côté médaillon) au bord. */
  fond: readonly [string, string, string];
  /** La lueur derrière le médaillon, et sa force. */
  lueur: string;
  lueurForce: number;
  /** Le reflet du coin bas droit, et sa force. */
  reflet: string;
  refletForce: number;
  /** Le guerrier en filigrane : son dégradé, et sa force. */
  guerrier: readonly [string, string];
  guerrierForce: number;
  /** Le clair de la variante : croix de la trame, graduations du médaillon, lueur du nom, dossier de l'invite, adresse du site. */
  clair: string;
  /** Le halo autour du médaillon. */
  halo: string;
  /** Le voile sous le texte : il se lit sur n'importe quel fond. */
  voile: string;
  /** Le rond sombre sous l'anneau du médaillon. */
  socle: string;
  /** Le fond du médaillon, sous une photo transparente ou derrière l'initiale. */
  plaque: string;
}

/**
 * Les six variantes. La première est l'étendard tel que le pilote l'a montré le 12 novembre 2026 (« ça fonctionne ») ; les
 * autres en reprennent tout, sauf les couleurs.
 *
 * Contrastes mesurés le 12 novembre 2026 sur le fond rendu sans texte, contre le plus clair des 5 % de pixels sous chaque ligne :
 * le vert et le gris des petites lignes (invite, « [ OK ] Bienvenue chez les Gaulois ») gardent au moins 5,2:1 dans les six
 * couleurs (7,5:1 sur l'étendard), et un test le vérifie au-dessus de 4,5:1. Le bleu royal a été assombri pour cela : son premier
 * essai descendait à 3,4:1. L'adresse du site, au bout de la dernière ligne près du reflet rouge, descend à 3:1 sur l'étendard
 * approuvé, jusqu'à 4,6:1 ailleurs : elle redit l'adresse du site, rien de plus.
 */
export const PALETTES: Record<Decor, Palette> = {
  etendard: {
    nom: "Étendard, le bleu du clan",
    fond: ["#11286A", "#081338", "#020614"],
    lueur: "#0B5FFF",
    lueurForce: 0.42,
    reflet: "#FF1A2E",
    refletForce: 0.34,
    guerrier: ["#4B74E0", "#1B3A9A"],
    guerrierForce: 0.5,
    clair: "#9DBCFF",
    halo: "#0B5FFF",
    voile: "#020614",
    socle: "#050B1F",
    plaque: "#13214D",
  },
  royal: {
    nom: "Bleu royal, comme la scène du classement",
    fond: ["#1C4CC0", "#0B2266", "#040E32"],
    lueur: "#4F82F5",
    lueurForce: 0.34,
    reflet: "#FF1A2E",
    refletForce: 0.3,
    guerrier: ["#B5CBFF", "#3A6BE8"],
    guerrierForce: 0.45,
    clair: "#DCE7FF",
    halo: "#4F82F5",
    voile: "#051545",
    socle: "#071A55",
    plaque: "#2147B8",
  },
  indigo: {
    nom: "Indigo, comme la scène des Gaulois de la semaine",
    fond: ["#34359E", "#161A5A", "#06071F"],
    lueur: "#7A6BFF",
    lueurForce: 0.45,
    reflet: "#FF3D6E",
    refletForce: 0.3,
    guerrier: ["#A3A0FF", "#3F40B0"],
    guerrierForce: 0.42,
    clair: "#C9C5FF",
    halo: "#7A6BFF",
    voile: "#08092A",
    socle: "#0C0D33",
    plaque: "#2A2B8C",
  },
  vin: {
    nom: "Lie-de-vin, le rouge mène et le bleu répond",
    fond: ["#8A1230", "#3A0F3C", "#12040F"],
    lueur: "#FF1A2E",
    lueurForce: 0.4,
    reflet: "#0B5FFF",
    refletForce: 0.3,
    guerrier: ["#F07A8E", "#8A1230"],
    guerrierForce: 0.4,
    clair: "#FFB3C0",
    halo: "#FF3D52",
    voile: "#1A0510",
    socle: "#22060B",
    plaque: "#501A23",
  },
  nuit: {
    nom: "Nuit, le guerrier en argent",
    fond: ["#0B1430", "#050A1C", "#010208"],
    lueur: "#5469AE",
    lueurForce: 0.3,
    reflet: "#FF1A2E",
    refletForce: 0.22,
    guerrier: ["#DCE3F5", "#5469AE"],
    guerrierForce: 0.26,
    clair: "#C0C9E2",
    halo: "#5469AE",
    voile: "#010309",
    socle: "#020614",
    plaque: "#0A1433",
  },
  acier: {
    nom: "Acier, le bleu d'un bouclier",
    fond: ["#31476E", "#141F38", "#060A16"],
    lueur: "#8FB3E8",
    lueurForce: 0.32,
    reflet: "#FF1A2E",
    refletForce: 0.28,
    guerrier: ["#D3E0F5", "#56709E"],
    guerrierForce: 0.38,
    clair: "#D6E2F5",
    halo: "#8FB3E8",
    voile: "#070C1A",
    socle: "#0A1122",
    plaque: "#2B3B5C",
  },
};

export interface DecorAssets {
  /** Le guerrier du logo en gris sur noir, pour servir de masque (adresse `data:`), ou `null` sans logo. */
  warriorMask: string | null;
}

/** Où l'étendard laisse la place au médaillon et au texte : la même dans les six couleurs. */
export interface DecorFrame {
  avatar: { cx: number; cy: number; r: number };
  /** La colonne du texte, et les bords entre lesquels il se centre. */
  text: { x: number; width: number; top: number; bottom: number };
  /** Le dossier et la commande de l'invite, comme au-dessus des titres du site : `gal@clan:~$ ./accueillir`. */
  prompt: { dir: string; command: string };
}

export const FRAME: DecorFrame = {
  avatar: { cx: 196, cy: 240, r: 110 },
  text: { x: 366, width: 770, top: 44, bottom: 436 },
  prompt: { dir: "~", command: "./accueillir" },
};

export interface DecorParts {
  defs: string;
  /** Sous le médaillon et le texte. */
  under: string;
  /** Par-dessus tout. */
  over: string;
}

const n = (value: number): string => String(Math.round(value * 100) / 100);

/** Un arc de cercle, de `from` à `to` degrés (0 à droite, sens des aiguilles d'une montre). */
export function arc(cx: number, cy: number, radius: number, from: number, to: number): string {
  const point = (deg: number) => {
    const rad = (deg * Math.PI) / 180;
    return `${n(cx + radius * Math.cos(rad))} ${n(cy + radius * Math.sin(rad))}`;
  };
  const large = Math.abs(to - from) > 180 ? 1 : 0;
  return `M${point(from)}A${n(radius)} ${n(radius)} 0 ${large} 1 ${point(to)}`;
}

/** La table des cartes du site : une trame au pas des cases de conquête (28 px), une croix toutes les quatre cases. */
function mapGrid(cross: string): string {
  let lines = "";
  for (let x = 28; x < WIDTH; x += 28) lines += `M${x} 0V${HEIGHT}`;
  for (let y = 28; y < HEIGHT; y += 28) lines += `M0 ${y}H${WIDTH}`;
  let crosses = "";
  for (let x = 56; x < WIDTH; x += 112) for (let y = 16; y < HEIGHT; y += 112) crosses += `M${x - 6} ${y}h12M${x} ${y - 6}v12`;
  return `<path d="${lines}" stroke="${INK.white}" stroke-opacity="0.03" fill="none"/><path d="${crosses}" stroke="${cross}" stroke-opacity="0.3" stroke-width="1.5" fill="none"/>`;
}

/**
 * L'étendard dans la couleur demandée : le fond en lueur, la trame, le guerrier en filigrane, l'écharpe tricolore (une fois
 * floue, une fois nette) et les coins assombris.
 */
export function decorParts(decor: Decor, assets: DecorAssets): DecorParts {
  const p = PALETTES[decor];
  const ring = (blur: boolean) =>
    `<g transform="rotate(-17 640 262)" fill="none" ${blur ? 'filter="url(#e-blur)" opacity="0.55"' : ""}>` +
    `<ellipse cx="640" cy="262" rx="788" ry="372" stroke="${INK.blue}" stroke-width="${blur ? 30 : 20}"/>` +
    `<ellipse cx="640" cy="262" rx="762" ry="346" stroke="${INK.white}" stroke-width="${blur ? 22 : 15}"/>` +
    `<ellipse cx="640" cy="262" rx="738" ry="322" stroke="${INK.red}" stroke-width="${blur ? 30 : 20}"/>` +
    `</g>`;
  const glow = (id: string, color: string, force: number) =>
    `<radialGradient id="${id}" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="${color}" stop-opacity="${force}"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></radialGradient>`;
  const warrior = assets.warriorMask ? `<rect x="640" y="-90" width="660" height="660" fill="url(#e-wm)" mask="url(#e-mask)" opacity="${p.guerrierForce}"/>` : "";
  return {
    defs:
      `<radialGradient id="e-bg" cx="0.34" cy="0.5" r="0.85"><stop offset="0" stop-color="${p.fond[0]}"/><stop offset="0.5" stop-color="${p.fond[1]}"/><stop offset="1" stop-color="${p.fond[2]}"/></radialGradient>` +
      glow("e-lueur", p.lueur, p.lueurForce) +
      glow("e-reflet", p.reflet, p.refletForce) +
      `<linearGradient id="e-wm" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${p.guerrier[0]}"/><stop offset="1" stop-color="${p.guerrier[1]}"/></linearGradient>` +
      `<filter id="e-blur" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="14"/></filter>` +
      (assets.warriorMask ? `<mask id="e-mask" maskUnits="userSpaceOnUse" x="640" y="-90" width="660" height="660"><image href="${assets.warriorMask}" x="640" y="-90" width="660" height="660"/></mask>` : "") +
      `<radialGradient id="e-vig" cx="0.5" cy="0.5" r="0.75"><stop offset="0.55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.55"/></radialGradient>`,
    under:
      `<rect width="${WIDTH}" height="${HEIGHT}" fill="url(#e-bg)"/>` +
      `<ellipse cx="170" cy="250" rx="520" ry="380" fill="url(#e-lueur)"/>` +
      `<ellipse cx="1130" cy="470" rx="520" ry="330" fill="url(#e-reflet)"/>` +
      mapGrid(p.clair) +
      warrior +
      ring(true) +
      ring(false),
    over: `<rect width="${WIDTH}" height="${HEIGHT}" fill="url(#e-vig)"/>`,
  };
}
