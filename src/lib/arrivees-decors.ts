/**
 * Les décors de l'image de bienvenue (`arrivees-image.ts`) : six ambiances, toutes aux couleurs du clan, entre le village
 * gaulois et la machine du site. Chacun rend du SVG, sans réseau ni fichier : le même tirage redonne la même image.
 *
 * Purement décoratif : aucun décor n'affiche une donnée du clan. Les formes sont dessinées ici, à la main : ni image reprise
 * d'ailleurs, ni personnage d'un autre univers. Le guerrier est le logo du clan (`public/brand/tete.*`).
 */
import type { Decor } from "./arrivees";
import type { CardText } from "./gazette-image";
import { aleatoire, LOGO_GLYPHES, type LogoMatriceData } from "./logo-matrice";

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
  amber: "#FFC857",
  ember: "#D9742E",
} as const;

export interface DecorAssets {
  /** Le guerrier du logo en gris sur noir, pour servir de masque (adresse `data:`), ou `null` sans logo. */
  warriorMask: string | null;
  /** Le guerrier détouré, dans ses couleurs (adresse `data:`), ou `null` sans logo. */
  warriorColor: string | null;
  /** Le guerrier en caractères, ou `null` sans logo. */
  matrix: LogoMatriceData | null;
  /** Le même en moins de colonnes, pour le dessiner en petit : ses caractères restent lisibles. */
  matrixSmall: LogoMatriceData | null;
  /** Un texte en tracés, dans une police du site. */
  text: (item: CardText) => string;
}

/** Où le décor laisse la place au médaillon et au texte. */
export interface DecorFrame {
  avatar: { cx: number; cy: number; r: number; shape: "rond" | "carre" | "bouclier" };
  /** La colonne du texte, et les bords entre lesquels il se centre. */
  text: { x: number; width: number; top: number; bottom: number };
  /** Le dossier et la commande de l'invite, comme au-dessus des titres du site : `gal@clan:~/village$ ./ouvrir`. */
  prompt: { dir: string; command: string };
  /** La phrase et le nom en chasse fixe, comme dans une console. */
  mono: boolean;
}

export interface DecorParts {
  defs: string;
  /** Sous le médaillon et le texte. */
  under: string;
  /** Par-dessus tout. */
  over: string;
  frame: DecorFrame;
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

/* ---------- Des pièces communes ---------- */

/** La table des cartes du site : une trame au pas des cases de conquête (28 px), une croix toutes les quatre cases. */
function mapGrid(lineOpacity: number, crossOpacity: number): string {
  let lines = "";
  for (let x = 28; x < WIDTH; x += 28) lines += `M${x} 0V${HEIGHT}`;
  for (let y = 28; y < HEIGHT; y += 28) lines += `M0 ${y}H${WIDTH}`;
  let crosses = "";
  for (let x = 56; x < WIDTH; x += 112) for (let y = 16; y < HEIGHT; y += 112) crosses += `M${x - 6} ${y}h12M${x} ${y - 6}v12`;
  return `<path d="${lines}" stroke="${INK.white}" stroke-opacity="${lineOpacity}" fill="none"/><path d="${crosses}" stroke="${INK.blueText}" stroke-opacity="${crossOpacity}" stroke-width="1.5" fill="none"/>`;
}

/** Les coins assombris, pour ramener l'œil au centre. */
function vignette(id: string, strength: number): { defs: string; body: string } {
  return {
    defs: `<radialGradient id="${id}" cx="0.5" cy="0.5" r="0.75"><stop offset="0.55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="${strength}"/></radialGradient>`,
    body: `<rect width="${WIDTH}" height="${HEIGHT}" fill="url(#${id})"/>`,
  };
}

/** Les lignes d'écran du style Terminal : une ligne sombre tous les trois pixels. */
function scanlines(id: string, opacity: number): { defs: string; body: string } {
  return {
    defs: `<pattern id="${id}" width="3" height="3" patternUnits="userSpaceOnUse"><rect width="3" height="1" fill="#000" fill-opacity="${opacity}"/></pattern>`,
    body: `<rect width="${WIDTH}" height="${HEIGHT}" fill="url(#${id})"/>`,
  };
}

/** Les caractères du logo Matrix, dessinés une fois à 100 px, puis posés à l'échelle : `<use href="#gl-0">`. */
function glyphDefs(assets: DecorAssets): string {
  return [...new Set(LOGO_GLYPHES)].map((char) => `<g id="gl-${char}">${assets.text({ text: char, x: 0, y: 0, size: 100, font: "monoStrong", color: "currentColor" })}</g>`).join("");
}

/** Un caractère posé : `size` est sa taille de police, `x` son bord gauche, `y` sa ligne de base. */
const glyph = (char: string, x: number, y: number, size: number, color: string, opacity: number): string =>
  `<use href="#gl-${char}" transform="translate(${n(x)} ${n(y)}) scale(${n(size / 100)})" color="${color}" opacity="${n(opacity)}"/>`;

const GLYPHS = [...LOGO_GLYPHES];

/** La chasse de la police à chasse fixe : 0,6 fois sa taille. */
const MONO_ADVANCE = 0.6;

/**
 * Le guerrier en caractères, comme sur l'accueil du site : chaque case du logo devient un 0, un 1 ou une lettre du tag, de
 * la couleur de sa case. `width` : sa largeur dans l'image ; les cases ont la forme d'un caractère.
 */
function matrixWarrior(matrix: LogoMatriceData, x: number, y: number, width: number, opacity: number, rand: () => number): string {
  const cell = width / matrix.colonnes;
  const row = cell / MONO_ADVANCE;
  const tint = { w: INK.white, b: "#3D7DFF", r: "#FF3D4E" } as const;
  let out = "";
  for (const suite of matrix.suites) {
    [...suite.texte].forEach((char, i) => {
      out += glyph(char, x + (suite.x + i) * cell, y + (suite.y + 0.86) * row, row * 0.98, tint[suite.teinte], opacity * (0.62 + rand() * 0.38));
    });
  }
  return out;
}

/** La hauteur du guerrier en caractères, pour une largeur donnée. */
export const matrixHeight = (matrix: LogoMatriceData, width: number): number => (matrix.lignes * width) / matrix.colonnes / MONO_ADVANCE;

/** Une pluie de caractères : des colonnes qui tombent, la tête claire, la traîne qui s'efface. */
function rain(rand: () => number, zone: { x0: number; x1: number; step: number; size: number }, strength: (x: number) => number): string {
  let out = "";
  const line = zone.size * 1.28;
  const rows = Math.ceil(HEIGHT / line) + 1;
  for (let x = zone.x0; x < zone.x1; x += zone.step) {
    const force = strength(x);
    if (force <= 0) continue;
    const drops = rand() < 0.35 ? 2 : 1;
    for (let d = 0; d < drops; d++) {
      const head = Math.floor(rand() * (rows + 8));
      const length = 5 + Math.floor(rand() * 12);
      const pick = rand();
      const tail = pick < 0.14 ? INK.redLight : pick < 0.26 ? INK.white : INK.blueLight;
      for (let j = 0; j < length; j++) {
        const r = head - j;
        if (r < 0 || r > rows) continue;
        const fade = (1 - j / length) ** 1.6;
        const char = GLYPHS[Math.floor(rand() * GLYPHS.length)] ?? "0";
        out += glyph(char, x, r * line, zone.size, j === 0 ? "#EAF2FF" : tail, force * (j === 0 ? 1 : 0.85 * fade));
      }
    }
  }
  return out;
}

/* ---------- 1. L'étendard : les couleurs du clan, comme sa bannière ---------- */

function etendard(assets: DecorAssets): DecorParts {
  const v = vignette("e-vig", 0.55);
  const ring = (blur: boolean) =>
    `<g transform="rotate(-17 640 262)" fill="none" ${blur ? 'filter="url(#e-blur)" opacity="0.55"' : ""}>` +
    `<ellipse cx="640" cy="262" rx="788" ry="372" stroke="${INK.blue}" stroke-width="${blur ? 30 : 20}"/>` +
    `<ellipse cx="640" cy="262" rx="762" ry="346" stroke="${INK.white}" stroke-width="${blur ? 22 : 15}"/>` +
    `<ellipse cx="640" cy="262" rx="738" ry="322" stroke="${INK.red}" stroke-width="${blur ? 30 : 20}"/>` +
    `</g>`;
  const warrior = assets.warriorMask
    ? `<rect x="640" y="-90" width="660" height="660" fill="url(#e-wm)" mask="url(#e-mask)" opacity="0.5"/>`
    : "";
  return {
    defs:
      `<radialGradient id="e-bg" cx="0.34" cy="0.5" r="0.85"><stop offset="0" stop-color="#11286A"/><stop offset="0.5" stop-color="#081338"/><stop offset="1" stop-color="${INK.night}"/></radialGradient>` +
      `<radialGradient id="e-red" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="${INK.red}" stop-opacity="0.34"/><stop offset="1" stop-color="${INK.red}" stop-opacity="0"/></radialGradient>` +
      `<radialGradient id="e-blue" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="${INK.blue}" stop-opacity="0.42"/><stop offset="1" stop-color="${INK.blue}" stop-opacity="0"/></radialGradient>` +
      `<linearGradient id="e-wm" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4B74E0"/><stop offset="1" stop-color="#1B3A9A"/></linearGradient>` +
      `<filter id="e-blur" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="14"/></filter>` +
      (assets.warriorMask ? `<mask id="e-mask" maskUnits="userSpaceOnUse" x="640" y="-90" width="660" height="660"><image href="${assets.warriorMask}" x="640" y="-90" width="660" height="660"/></mask>` : "") +
      v.defs,
    under:
      `<rect width="${WIDTH}" height="${HEIGHT}" fill="url(#e-bg)"/>` +
      `<ellipse cx="170" cy="250" rx="520" ry="380" fill="url(#e-blue)"/>` +
      `<ellipse cx="1130" cy="470" rx="520" ry="330" fill="url(#e-red)"/>` +
      mapGrid(0.03, 0.3) +
      warrior +
      ring(true) +
      ring(false),
    over: v.body,
    frame: { avatar: { cx: 196, cy: 240, r: 110, shape: "rond" }, text: { x: 366, width: 770, top: 44, bottom: 436 }, prompt: { dir: "~", command: "./accueillir" }, mono: false },
  };
}

/* ---------- 2. La matrice : le guerrier en caractères, sous la pluie ---------- */

function matrice(assets: DecorAssets, rand: () => number): DecorParts {
  const v = vignette("m-vig", 0.6);
  const s = scanlines("m-scan", 0.2);
  const warriorWidth = 400;
  const warriorX = 776;
  const warrior = assets.matrix ? matrixWarrior(assets.matrix, warriorX, (HEIGHT - matrixHeight(assets.matrix, warriorWidth)) / 2, warriorWidth, 1, rand) : "";
  // La pluie se tait derrière le texte et derrière le guerrier : ils se lisent d'abord.
  const strength = (x: number) => (x < 330 ? 0.85 : x < 760 ? 0.2 : 0.16);
  return {
    defs:
      glyphDefs(assets) +
      `<radialGradient id="m-bg" cx="0.5" cy="0.5" r="0.8"><stop offset="0" stop-color="#071236"/><stop offset="1" stop-color="${INK.night}"/></radialGradient>` +
      `<radialGradient id="m-halo" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="${INK.blue}" stop-opacity="0.34"/><stop offset="1" stop-color="${INK.blue}" stop-opacity="0"/></radialGradient>` +
      v.defs +
      s.defs,
    under:
      `<rect width="${WIDTH}" height="${HEIGHT}" fill="url(#m-bg)"/>` +
      rain(rand, { x0: 6, x1: WIDTH, step: 22, size: 17 }, strength) +
      `<ellipse cx="${warriorX + warriorWidth / 2}" cy="240" rx="300" ry="270" fill="url(#m-halo)"/>` +
      warrior,
    over: s.body + v.body,
    frame: { avatar: { cx: 178, cy: 240, r: 104, shape: "rond" }, text: { x: 338, width: 424, top: 44, bottom: 436 }, prompt: { dir: "~", command: "./accueillir" }, mono: false },
  };
}

/* ---------- 3. Le bouclier : le nouveau venu au cœur d'un bouclier gaulois ---------- */

/** Une spirale à trois branches, motif celte : trois spirales qui partent du centre, à 120° l'une de l'autre. */
function triskele(cx: number, cy: number, size: number): string {
  let out = "";
  for (let branch = 0; branch < 3; branch++) {
    const base = (branch * 2 * Math.PI) / 3;
    // Chaque branche part du centre, s'écarte, puis s'enroule sur elle-même.
    const hub = { x: cx + size * 0.5 * Math.cos(base), y: cy + size * 0.5 * Math.sin(base) };
    let d = `M${n(cx)} ${n(cy)}`;
    const turns = 1.6;
    const steps = 48;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const angle = base + Math.PI + t * turns * 2 * Math.PI;
      const radius = size * 0.5 * (1 - t * 0.86);
      d += `L${n(hub.x + radius * Math.cos(angle))} ${n(hub.y + radius * Math.sin(angle))}`;
    }
    out += `<path d="${d}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
  }
  return out;
}

/** Une tresse : deux brins qui se croisent, comme un torque. `y` : son axe. */
function braid(x0: number, x1: number, y: number, amplitude: number, period: number): string {
  const strand = (phase: number) => {
    let d = "";
    for (let x = x0; x <= x1; x += 4) d += `${x === x0 ? "M" : "L"}${n(x)} ${n(y + amplitude * Math.sin(((x - x0) / period) * 2 * Math.PI + phase))}`;
    return d;
  };
  return `<path d="${strand(0)}" fill="none"/><path d="${strand(Math.PI)}" fill="none"/>`;
}

/** Une lance : une hampe et un fer en feuille, de `(x0, y0)` à `(x1, y1)`. */
function spear(x0: number, y0: number, x1: number, y1: number): string {
  const angle = (Math.atan2(y1 - y0, x1 - x0) * 180) / Math.PI;
  const length = Math.hypot(x1 - x0, y1 - y0);
  return (
    `<g transform="translate(${n(x0)} ${n(y0)}) rotate(${n(angle)})">` +
    `<rect x="0" y="-3.5" width="${n(length - 58)}" height="7" rx="3.5" fill="#6E5A44"/>` +
    `<rect x="0" y="-3.5" width="${n(length - 58)}" height="2.4" rx="1.2" fill="#A58C6C" opacity="0.7"/>` +
    `<rect x="${n(length - 70)}" y="-6" width="16" height="12" rx="2" fill="${INK.lineStrong}"/>` +
    `<path d="M${n(length - 56)} 0C${n(length - 44)} -15 ${n(length - 22)} -12 ${n(length)} 0C${n(length - 22)} 12 ${n(length - 44)} 15 ${n(length - 56)} 0Z" fill="#DCE5FA"/>` +
    `<path d="M${n(length - 56)} 0H${n(length)}" stroke="#8FA0C8" stroke-width="1.6"/>` +
    `</g>`
  );
}

/** Le contour du bouclier, long hexagone aux angles adoucis, centré sur `(cx, cy)`. */
export function shieldPath(cx: number, cy: number, halfWidth: number, halfHeight: number): string {
  const shoulder = halfHeight * 0.62;
  const pts: [number, number][] = [
    [0, -halfHeight],
    [halfWidth, -shoulder],
    [halfWidth, shoulder],
    [0, halfHeight],
    [-halfWidth, shoulder],
    [-halfWidth, -shoulder],
  ];
  // Chaque angle est arrondi : on s'arrête un peu avant le sommet, et une courbe le contourne.
  const round = 18;
  let d = "";
  pts.forEach((p, i) => {
    const prev = pts[(i + pts.length - 1) % pts.length]!;
    const next = pts[(i + 1) % pts.length]!;
    const toward = (a: [number, number], b: [number, number]) => {
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      return [a[0] + ((b[0] - a[0]) * round) / len, a[1] + ((b[1] - a[1]) * round) / len];
    };
    const enter = toward(p, prev);
    const leave = toward(p, next);
    d += `${i === 0 ? "M" : "L"}${n(cx + enter[0]!)} ${n(cy + enter[1]!)}Q${n(cx + p[0])} ${n(cy + p[1])} ${n(cx + leave[0]!)} ${n(cy + leave[1]!)}`;
  });
  return `${d}Z`;
}

function bouclier(): DecorParts {
  const v = vignette("b-vig", 0.5);
  const cx = 190;
  const cy = 240;
  const halfWidth = 132;
  const halfHeight = 214;
  const shield = shieldPath(cx, cy, halfWidth, halfHeight);
  const inner = shieldPath(cx, cy, halfWidth - 16, halfHeight - 20);
  let rivets = "";
  for (const [dx, dy] of [
    [0, -188],
    [0, 188],
    [102, -112],
    [102, 112],
    [-102, -112],
    [-102, 112],
    [112, 0],
    [-112, 0],
  ] as const) {
    rivets += `<circle cx="${cx + dx}" cy="${cy + dy}" r="5" fill="#E8EEFF"/><circle cx="${cx + dx - 1.2}" cy="${cy + dy - 1.2}" r="2" fill="#FFFFFF"/>`;
  }
  return {
    defs:
      `<linearGradient id="b-bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0C1D52"/><stop offset="0.55" stop-color="#070F2E"/><stop offset="1" stop-color="#1B0714"/></linearGradient>` +
      `<radialGradient id="b-red" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="${INK.red}" stop-opacity="0.28"/><stop offset="1" stop-color="${INK.red}" stop-opacity="0"/></radialGradient>` +
      `<radialGradient id="b-blue" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="${INK.blue}" stop-opacity="0.5"/><stop offset="1" stop-color="${INK.blue}" stop-opacity="0"/></radialGradient>` +
      `<linearGradient id="b-left" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2B74FF"/><stop offset="1" stop-color="#0A3FB8"/></linearGradient>` +
      `<linearGradient id="b-right" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FF4354"/><stop offset="1" stop-color="#B40E22"/></linearGradient>` +
      `<linearGradient id="b-steel" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#9FB0D8"/><stop offset="0.5" stop-color="#FFFFFF"/><stop offset="1" stop-color="#9FB0D8"/></linearGradient>` +
      `<clipPath id="b-clip"><path d="${shield}"/></clipPath>` +
      `<filter id="b-shadow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="16"/></filter>` +
      v.defs,
    under:
      `<rect width="${WIDTH}" height="${HEIGHT}" fill="url(#b-bg)"/>` +
      `<ellipse cx="${cx}" cy="${cy}" rx="430" ry="360" fill="url(#b-blue)"/>` +
      `<ellipse cx="1120" cy="430" rx="480" ry="320" fill="url(#b-red)"/>` +
      mapGrid(0.028, 0.22) +
      // Le motif celte, en filigrane à droite.
      `<g stroke="${INK.blueText}" stroke-opacity="0.11" stroke-width="20">${triskele(1010, 236, 300)}</g>` +
      // Les tresses, en haut et en bas.
      `<g stroke="${INK.lineStrong}" stroke-opacity="0.7" stroke-width="3">${braid(0, WIDTH, 22, 7, 44)}${braid(0, WIDTH, HEIGHT - 22, 7, 44)}</g>` +
      // Deux lances croisées derrière le bouclier.
      spear(cx + 150, 470, cx - 118, 12) +
      spear(cx - 150, 470, cx + 118, 12) +
      // Le bouclier : son ombre, ses deux moitiés, son bord, son arête.
      `<path d="${shield}" fill="#000" opacity="0.55" filter="url(#b-shadow)" transform="translate(0 10)"/>` +
      `<g clip-path="url(#b-clip)"><rect x="${cx - halfWidth}" y="${cy - halfHeight}" width="${halfWidth}" height="${2 * halfHeight}" fill="url(#b-left)"/><rect x="${cx}" y="${cy - halfHeight}" width="${halfWidth}" height="${2 * halfHeight}" fill="url(#b-right)"/>` +
      `<g stroke="#FFFFFF" stroke-opacity="0.16" stroke-width="9">${triskele(cx - 62, cy - 128, 78)}${triskele(cx + 62, cy + 128, 78)}</g></g>` +
      `<path d="${shield}" fill="none" stroke="url(#b-steel)" stroke-width="9"/>` +
      `<path d="${inner}" fill="none" stroke="#FFFFFF" stroke-opacity="0.35" stroke-width="2"/>` +
      `<rect x="${cx - 7}" y="${cy - halfHeight + 6}" width="14" height="${2 * halfHeight - 12}" rx="7" fill="url(#b-steel)"/>` +
      rivets,
    over: v.body,
    frame: { avatar: { cx, cy, r: 86, shape: "bouclier" }, text: { x: 372, width: 766, top: 52, bottom: 428 }, prompt: { dir: "~", command: "./lever-le-bouclier" }, mono: false },
  };
}

/* ---------- 4. La forêt : le village la nuit, derrière sa palissade ---------- */

/** Une ligne de collines boisées : des houppiers ronds le long d'une crête. */
function treeLine(rand: () => number, baseY: number, wave: number, crown: number): string {
  let d = `M0 ${HEIGHT}V${n(baseY)}`;
  let x = 0;
  const phase = rand() * 6;
  while (x < WIDTH + crown) {
    const y = baseY + Math.sin(x / 190 + phase) * wave + Math.sin(x / 67 + phase * 2) * wave * 0.35;
    const radius = crown * (0.7 + rand() * 0.6);
    d += `L${n(x)} ${n(y)}A${n(radius)} ${n(radius * (0.9 + rand() * 0.5))} 0 0 1 ${n(x + radius * 2)} ${n(y)}`;
    x += radius * 2 - 3;
  }
  return `${d}V${HEIGHT}Z`;
}

/** La palissade : de gros pieux taillés en pointe, de hauteurs inégales, et une lisse qui les tient. */
function palisade(rand: () => number, top: number): string {
  let stakes = "";
  let edges = "";
  let x = -12;
  while (x < WIDTH) {
    const width = 30 + Math.floor(rand() * 11);
    const y = top + rand() * 20;
    const point = 20;
    stakes += `M${n(x)} ${HEIGHT}V${n(y + point)}L${n(x + width / 2)} ${n(y)}L${n(x + width)} ${n(y + point)}V${HEIGHT}Z`;
    // Le côté éclairé du pieu : son bord gauche et le pan gauche de sa pointe.
    edges += `M${n(x + 1.5)} ${HEIGHT}V${n(y + point)}L${n(x + width / 2)} ${n(y + 1.5)}`;
    x += width + 2;
  }
  return (
    `<path d="${stakes}" fill="#060D2B"/>` +
    `<path d="${edges}" fill="none" stroke="#3C59AD" stroke-width="2" stroke-opacity="0.85" stroke-linejoin="round"/>` +
    `<rect x="0" y="${top + 48}" width="${WIDTH}" height="10" fill="#030820"/><rect x="0" y="${top + 48}" width="${WIDTH}" height="2" fill="#3C59AD" opacity="0.7"/>`
  );
}

/** Une maison ronde du village : son toit de chaume en cône, dont le bas disparaît derrière la palissade, et un filet de fumée. */
function hut(rand: () => number, x: number, base: number, width: number, height: number): string {
  const eave = base - height * 0.3;
  const top = base - height;
  const roof =
    `M${n(x - width / 2)} ${n(eave)}Q${n(x - width * 0.14)} ${n(base - height * 0.72)} ${n(x)} ${n(top)}` +
    `Q${n(x + width * 0.14)} ${n(base - height * 0.72)} ${n(x + width / 2)} ${n(eave)}Z`;
  const lit = `M${n(x - width / 2)} ${n(eave)}Q${n(x - width * 0.14)} ${n(base - height * 0.72)} ${n(x)} ${n(top)}`;
  const sway = 10 + rand() * 10;
  const smoke = `M${n(x)} ${n(top - 2)}C${n(x - sway)} ${n(top - 22)} ${n(x + sway)} ${n(top - 40)} ${n(x - sway * 0.4)} ${n(top - 64)}`;
  return (
    `<path d="${smoke}" fill="none" stroke="#DCE8FF" stroke-opacity="0.16" stroke-width="5" stroke-linecap="round"/>` +
    `<rect x="${n(x - width * 0.36)}" y="${n(eave - 2)}" width="${n(width * 0.72)}" height="${n(height * 0.34)}" fill="#0A1741"/>` +
    `<path d="${roof}" fill="url(#f-thatch)"/>` +
    `<path d="${lit}" fill="none" stroke="#E9C98A" stroke-opacity="0.55" stroke-width="2" stroke-linecap="round"/>`
  );
}

/** Une torche plantée devant la palissade : sa hampe, sa flamme, sa lueur. */
function torch(x: number, y: number): string {
  return (
    `<ellipse cx="${x}" cy="${y - 18}" rx="170" ry="150" fill="url(#f-fire)"/>` +
    `<rect x="${x - 3.5}" y="${y}" width="7" height="${HEIGHT - y}" fill="#3A2C22"/>` +
    `<rect x="${x - 8}" y="${y - 4}" width="16" height="10" rx="2" fill="#5A4636"/>` +
    `<path d="M${x} ${y - 46}C${x + 15} ${y - 28} ${x + 13} ${y - 10} ${x} ${y - 4}C${x - 13} ${y - 10} ${x - 15} ${y - 28} ${x} ${y - 46}Z" fill="${INK.ember}"/>` +
    `<path d="M${x} ${y - 32}C${x + 8} ${y - 21} ${x + 7} ${y - 10} ${x} ${y - 6}C${x - 7} ${y - 10} ${x - 8} ${y - 21} ${x} ${y - 32}Z" fill="${INK.amber}"/>` +
    `<path d="M${x} ${y - 21}C${x + 3.5} ${y - 15} ${x + 3} ${y - 10} ${x} ${y - 8}C${x - 3} ${y - 10} ${x - 3.5} ${y - 15} ${x} ${y - 21}Z" fill="#FFF6DC"/>`
  );
}

function foret(assets: DecorAssets, rand: () => number): DecorParts {
  const v = vignette("f-vig", 0.5);
  // Le ciel : des étoiles, et des 0 et des 1 parmi elles.
  let sky = "";
  for (let i = 0; i < 64; i++) {
    const x = rand() * WIDTH;
    const y = rand() * 270;
    sky += `<circle cx="${n(x)}" cy="${n(y)}" r="${n(0.6 + rand() * 1.3)}" fill="#DCE8FF" opacity="${n(0.25 + rand() * 0.6)}"/>`;
  }
  for (let i = 0; i < 46; i++) {
    const char = rand() < 0.5 ? "0" : "1";
    sky += glyph(char, rand() * WIDTH, 14 + rand() * 250, 10 + rand() * 6, INK.blueText, 0.14 + rand() * 0.3);
  }
  // La lune : l'anneau tricolore du logo, le guerrier dedans.
  const moon = { cx: 1094, cy: 92, r: 62 };
  const warrior = assets.warriorColor ? `<image href="${assets.warriorColor}" x="${moon.cx - 74}" y="${moon.cy - 74}" width="148" height="148" opacity="0.92"/>` : "";
  // Des braises qui montent des torches : de petits points chauds, de plus en plus pâles.
  let embers = "";
  for (const [tx, ty] of [
    [330, 364],
    [1166, 362],
  ] as const) {
    for (let i = 0; i < 9; i++) {
      const rise = 26 + rand() * 120;
      embers += `<circle cx="${n(tx + (rand() - 0.5) * 56)}" cy="${n(ty - 30 - rise)}" r="${n(0.9 + rand() * 1.5)}" fill="${INK.amber}" opacity="${n(0.75 * (1 - rise / 160))}"/>`;
    }
  }
  // Le village : quatre toits de chaume qui dépassent de la palissade.
  const huts = [
    [452, 132, 96],
    [628, 156, 112],
    [826, 138, 98],
    [1010, 150, 106],
  ] as const;
  return {
    defs:
      glyphDefs(assets) +
      `<linearGradient id="f-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#03081C"/><stop offset="0.5" stop-color="#0A1A4C"/><stop offset="0.78" stop-color="#1B3680"/><stop offset="1" stop-color="#2A4C9E"/></linearGradient>` +
      `<radialGradient id="f-moon" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#9DBCFF" stop-opacity="0.4"/><stop offset="1" stop-color="#9DBCFF" stop-opacity="0"/></radialGradient>` +
      `<radialGradient id="f-fire" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="${INK.amber}" stop-opacity="0.5"/><stop offset="0.4" stop-color="${INK.ember}" stop-opacity="0.2"/><stop offset="1" stop-color="${INK.ember}" stop-opacity="0"/></radialGradient>` +
      `<radialGradient id="f-hearth" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="${INK.amber}" stop-opacity="0.5"/><stop offset="0.5" stop-color="${INK.ember}" stop-opacity="0.22"/><stop offset="1" stop-color="${INK.ember}" stop-opacity="0"/></radialGradient>` +
      `<linearGradient id="f-thatch" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#2B3A7C"/><stop offset="0.5" stop-color="#16265F"/><stop offset="1" stop-color="#0B1742"/></linearGradient>` +
      `<linearGradient id="f-mist" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5B7FD6" stop-opacity="0"/><stop offset="1" stop-color="#5B7FD6" stop-opacity="0.32"/></linearGradient>` +
      v.defs,
    under:
      `<rect width="${WIDTH}" height="${HEIGHT}" fill="url(#f-sky)"/>` +
      sky +
      `<circle cx="${moon.cx}" cy="${moon.cy}" r="190" fill="url(#f-moon)"/>` +
      `<circle cx="${moon.cx}" cy="${moon.cy}" r="${moon.r + 4}" fill="#07102F"/>` +
      warrior +
      // La forêt, de la plus lointaine à la plus proche, et la brume entre ses rangs.
      `<path d="${treeLine(rand, 322, 14, 24)}" fill="#16307A"/>` +
      `<rect x="0" y="300" width="${WIDTH}" height="90" fill="url(#f-mist)"/>` +
      `<path d="${treeLine(rand, 352, 10, 32)}" fill="#0E2060"/>` +
      `<rect x="0" y="340" width="${WIDTH}" height="80" fill="url(#f-mist)" opacity="0.6"/>` +
      // Le feu du village, derrière la palissade.
      `<ellipse cx="560" cy="446" rx="330" ry="112" fill="url(#f-hearth)"/>` +
      `<ellipse cx="920" cy="450" rx="300" ry="104" fill="url(#f-hearth)"/>` +
      huts.map(([x, width, height]) => hut(rand, x, 452, width, height)).join("") +
      palisade(rand, 400) +
      torch(330, 364) +
      torch(1166, 362) +
      embers,
    over: v.body,
    frame: { avatar: { cx: 188, cy: 206, r: 104, shape: "rond" }, text: { x: 356, width: 720, top: 24, bottom: 350 }, prompt: { dir: "~/village", command: "./ouvrir-la-porte" }, mono: false },
  };
}

/* ---------- 5. La carte : un nouveau territoire sur la table des cartes ---------- */

const CELL = 28;

/** Un territoire de cases, comme dans le jeu : il part d'une case et grandit de proche en proche, sans sortir de sa zone. */
function territory(rand: () => number, start: [number, number], count: number, zone: { c0: number; c1: number; r0: number; r1: number }): Set<string> {
  const key = (c: number, r: number) => `${c},${r}`;
  const cells = new Set<string>([key(start[0], start[1])]);
  const frontier: [number, number][] = [start];
  let guard = 0;
  while (cells.size < count && frontier.length > 0 && guard++ < 5000) {
    const from = frontier[Math.floor(rand() * frontier.length)]!;
    const [dc, dr] = ([[1, 0], [-1, 0], [0, 1], [0, -1]] as const)[Math.floor(rand() * 4)]!;
    const c = from[0] + dc;
    const r = from[1] + dr;
    if (c < zone.c0 || c > zone.c1 || r < zone.r0 || r > zone.r1 || cells.has(key(c, r))) continue;
    cells.add(key(c, r));
    frontier.push([c, r]);
  }
  return cells;
}

/** Les cases d'un territoire, et sa frontière : un trait le long de chaque bord qui ne touche pas une autre de ses cases. */
function territoryShape(cells: Set<string>, fill: string, fillOpacity: number, stroke: string, strokeOpacity: number): string {
  let squares = "";
  let border = "";
  for (const cell of cells) {
    const [c = 0, r = 0] = cell.split(",").map(Number);
    const x = c * CELL;
    const y = r * CELL;
    squares += `M${x} ${y}h${CELL}v${CELL}h-${CELL}Z`;
    if (!cells.has(`${c},${r - 1}`)) border += `M${x} ${y}h${CELL}`;
    if (!cells.has(`${c},${r + 1}`)) border += `M${x} ${y + CELL}h${CELL}`;
    if (!cells.has(`${c - 1},${r}`)) border += `M${x} ${y}v${CELL}`;
    if (!cells.has(`${c + 1},${r}`)) border += `M${x + CELL} ${y}v${CELL}`;
  }
  return `<path d="${squares}" fill="${fill}" fill-opacity="${fillOpacity}"/><path d="${border}" fill="none" stroke="${stroke}" stroke-opacity="${strokeOpacity}" stroke-width="2" stroke-linecap="square"/>`;
}

function carte(rand: () => number): DecorParts {
  const v = vignette("c-vig", 0.55);
  const cx = 196;
  const cy = 238;
  const ours = territory(rand, [7, 8], 92, { c0: 0, c1: 12, r0: 0, r1: 17 });
  const theirs = territory(rand, [39, 15], 34, { c0: 30, c1: 43, r0: 14, r1: 17 });
  const others = territory(rand, [38, 1], 22, { c0: 31, c1: 43, r0: 0, r1: 2 });
  // Les repères du viseur, autour du médaillon.
  const reach = 146;
  const corner = 26;
  let sight = "";
  for (const [sx, sy] of [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ] as const) {
    sight += `M${cx + sx * reach} ${cy + sy * (reach - corner)}V${cy + sy * reach}H${cx + sx * (reach - corner)}`;
  }
  // La règle, en bas : un cran par case, un plus long toutes les quatre cases.
  let ruler = "";
  for (let x = 0; x <= WIDTH; x += CELL) ruler += `M${x} ${HEIGHT}v-${x % (4 * CELL) === 0 ? 12 : 6}`;
  // La rose des vents.
  const rose = { x: 1126, y: 84 };
  return {
    defs:
      `<radialGradient id="c-bg" cx="0.3" cy="0.5" r="0.9"><stop offset="0" stop-color="#0B1B4C"/><stop offset="0.6" stop-color="#060E2C"/><stop offset="1" stop-color="${INK.night}"/></radialGradient>` +
      `<radialGradient id="c-halo" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="${INK.blue}" stop-opacity="0.45"/><stop offset="1" stop-color="${INK.blue}" stop-opacity="0"/></radialGradient>` +
      v.defs,
    under:
      `<rect width="${WIDTH}" height="${HEIGHT}" fill="url(#c-bg)"/>` +
      mapGrid(0.06, 0.5) +
      territoryShape(others, INK.white, 0.05, INK.muted, 0.3) +
      territoryShape(theirs, INK.red, 0.2, INK.redLight, 0.75) +
      territoryShape(ours, INK.blue, 0.3, INK.blueLight, 0.95) +
      `<ellipse cx="${cx}" cy="${cy}" rx="300" ry="270" fill="url(#c-halo)"/>` +
      `<path d="M0 ${cy}H${WIDTH}M${cx} 0V${HEIGHT}" stroke="${INK.blueText}" stroke-opacity="0.16" stroke-dasharray="3 7" fill="none"/>` +
      `<path d="${sight}" fill="none" stroke="${INK.white}" stroke-opacity="0.85" stroke-width="3"/>` +
      `<path d="${ruler}" stroke="${INK.blueText}" stroke-opacity="0.55" stroke-width="1.5" fill="none"/>` +
      `<g transform="translate(${rose.x} ${rose.y})"><circle r="34" fill="none" stroke="${INK.blueText}" stroke-opacity="0.4" stroke-width="1.5"/><circle r="26" fill="none" stroke="${INK.blueText}" stroke-opacity="0.2" stroke-dasharray="2 5"/>` +
      `<path d="M0 -30L7 -7L30 0L7 7L0 30L-7 7L-30 0L-7 -7Z" fill="${INK.blueText}" fill-opacity="0.22"/><path d="M0 -30L7 -7L0 0L-7 -7Z" fill="${INK.red}"/><path d="M0 30L7 7L0 0L-7 7Z" fill="${INK.white}" fill-opacity="0.8"/></g>`,
    over: v.body,
    frame: { avatar: { cx, cy, r: 104, shape: "rond" }, text: { x: 380, width: 690, top: 40, bottom: 440 }, prompt: { dir: "~/carte", command: "./nouveau-point" }, mono: false },
  };
}

/* ---------- 6. Le terminal : la fenêtre de la machine du site ---------- */

function terminal(assets: DecorAssets, rand: () => number): DecorParts {
  const s = scanlines("t-scan", 0.26);
  const v = vignette("t-vig", 0.45);
  const bar = 46;
  const warriorWidth = 272;
  const warriorX = 890;
  const warrior = assets.matrixSmall ? matrixWarrior(assets.matrixSmall, warriorX, 16 + bar + (HEIGHT - 32 - bar - matrixHeight(assets.matrixSmall, warriorWidth)) / 2, warriorWidth, 0.95, rand) : "";
  const title = assets.text({ text: "accueil.log", x: 600, y: 45, size: 18, font: "mono", color: INK.muted, anchor: "middle" });
  return {
    defs:
      glyphDefs(assets) +
      `<linearGradient id="t-bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#060F2C"/><stop offset="1" stop-color="#02061A"/></linearGradient>` +
      `<radialGradient id="t-halo" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="${INK.green}" stop-opacity="0.16"/><stop offset="1" stop-color="${INK.green}" stop-opacity="0"/></radialGradient>` +
      s.defs +
      v.defs,
    under:
      `<rect width="${WIDTH}" height="${HEIGHT}" fill="${INK.night}"/>` +
      `<rect x="16" y="16" width="${WIDTH - 32}" height="${HEIGHT - 32}" fill="url(#t-bg)"/>` +
      `<ellipse cx="300" cy="250" rx="520" ry="330" fill="url(#t-halo)"/>` +
      // La barre de titre, ses trois carrés tricolores.
      `<rect x="16" y="16" width="${WIDTH - 32}" height="${bar}" fill="${INK.surface}"/>` +
      `<rect x="16" y="${16 + bar}" width="${WIDTH - 32}" height="2" fill="${INK.line}"/>` +
      `<rect x="36" y="31" width="16" height="16" fill="${INK.blue}"/><rect x="60" y="31" width="16" height="16" fill="${INK.white}"/><rect x="84" y="31" width="16" height="16" fill="${INK.red}"/>` +
      title +
      warrior,
    over:
      s.body +
      // Le cadre en traits doubles du style Terminal.
      `<rect x="16" y="16" width="${WIDTH - 32}" height="${HEIGHT - 32}" fill="none" stroke="${INK.lineStrong}" stroke-width="2"/>` +
      `<rect x="9" y="9" width="${WIDTH - 18}" height="${HEIGHT - 18}" fill="none" stroke="${INK.line}" stroke-width="2"/>` +
      v.body,
    frame: { avatar: { cx: 176, cy: 262, r: 104, shape: "carre" }, text: { x: 326, width: 552, top: 84, bottom: 444 }, prompt: { dir: "~", command: "./accueillir --nouveau" }, mono: true },
  };
}

/** Le décor demandé, dessiné à partir d'un tirage : le même tirage redonne le même décor. */
export function decorParts(decor: Decor, seed: number, assets: DecorAssets): DecorParts {
  const rand = aleatoire(seed);
  switch (decor) {
    case "etendard":
      return etendard(assets);
    case "matrice":
      return matrice(assets, rand);
    case "bouclier":
      return bouclier();
    case "foret":
      return foret(assets, rand);
    case "carte":
      return carte(rand);
    case "terminal":
      return terminal(assets, rand);
  }
}
