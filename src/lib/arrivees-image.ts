/**
 * L'image de bienvenue qui remplace le message d'arrivée de Discord : le nom du nouveau venu en grand, sa photo de profil dans
 * un médaillon, une phrase dans le thème du clan, sur l'étendard du clan dans une de ses six couleurs (`arrivees-decors.ts`).
 *
 * Trois temps, comme les autres images du robot : `arrivalLayout` décide quoi écrire et où, et se teste sans police ;
 * `arrivalSvg` assemble le dessin ; `renderArrival` le rend en PNG. Chaque lettre devient un tracé, pour ne pas dépendre des
 * polices de la machine. Sans le logo du guerrier (`public/brand/tete.*`), l'image se dessine quand même, sans lui.
 */
import { join } from "node:path";
import sharp from "sharp";
import { FALLBACK_NAME, initialOf, MAX_AVATAR_BYTES, phraseParts, sentence, type Decor, type Phrase } from "./arrivees";
import { arc, decorParts, FRAME, HEIGHT, INK, PALETTES, WIDTH, type Palette } from "./arrivees-decors";
import { brandFile } from "./brand";
import { fitted, type CardFont, type CardText, type GazetteFonts, type Measure } from "./gazette-image";

export interface ArrivalImage {
  /** La couleur de l'étendard. */
  decor: Decor;
  phrase: Phrase;
  /** Le nom tel qu'il se dessine : voir `drawnName`. */
  name: string;
}

/** La dernière ligne de l'image, comme une réponse de la machine du site. */
export const WELCOME_LINE = "Bienvenue chez les Gaulois";

/* ---------- Quoi écrire et où ---------- */

/** Coupe un texte en lignes, entre deux mots seulement. Une espace insécable ne se coupe jamais. */
export function wrapped(text: string, font: CardFont, size: number, maxWidth: number, measure: Measure): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(" ").filter(Boolean)) {
    const attempt = line ? `${line} ${word}` : word;
    if (line && measure(attempt, font, size) > maxWidth) {
      lines.push(line);
      line = word;
    } else line = attempt;
  }
  if (line) lines.push(line);
  return lines;
}

const NAME_SIZE = { max: 132, oneLineMin: 62, twoLinesMax: 78, twoLinesMin: 44 } as const;

/**
 * Le nom, aussi grand que possible : sur une ligne d'abord ; sinon sur deux, coupé à une espace ou après un signe, au plus
 * près du milieu ; en dernier recours, coupé là où la ligne s'arrête, la fin remplacée par des points de suspension.
 */
export function fitName(name: string, font: CardFont, maxWidth: number, measure: Measure, maxSize: number = NAME_SIZE.max): { lines: string[]; size: number } {
  for (let size = maxSize; size >= NAME_SIZE.oneLineMin; size -= 2) if (measure(name, font, size) <= maxWidth) return { lines: [name], size };
  const chars = [...name];
  for (let size = Math.min(maxSize, NAME_SIZE.twoLinesMax); size >= NAME_SIZE.twoLinesMin; size -= 2) {
    let best: [string, string] | null = null;
    let bestGap = Number.POSITIVE_INFINITY;
    for (let i = 1; i < chars.length; i++) {
      if (chars[i] !== " " && !/[\s._\-|/\])]/.test(chars[i - 1] ?? "")) continue;
      const first = chars.slice(0, i).join("").trim();
      const second = chars.slice(i).join("").trim();
      if (!first || !second) continue;
      const w1 = measure(first, font, size);
      const w2 = measure(second, font, size);
      if (w1 > maxWidth || w2 > maxWidth) continue;
      if (Math.abs(w1 - w2) < bestGap) {
        best = [first, second];
        bestGap = Math.abs(w1 - w2);
      }
    }
    if (best) return { lines: best, size };
  }
  const size = Math.min(maxSize, NAME_SIZE.twoLinesMin);
  if (measure(name, font, size) <= maxWidth) return { lines: [name], size };
  let split = chars.length - 1;
  while (split > 1 && measure(chars.slice(0, split).join(""), font, size) > maxWidth) split--;
  const rest = fitted(chars.slice(split).join("").trim(), font, size, size, maxWidth, measure);
  return { lines: [chars.slice(0, split).join("").trim(), rest.text], size };
}

export interface ArrivalLayout {
  /** L'invite, la phrase et la dernière ligne. */
  texts: CardText[];
  /** Le nom, sur une ou deux lignes : dessiné à part, avec son décalage tricolore. */
  name: CardText[];
  top: number;
  bottom: number;
}

const KICKER_SIZE = 23;
const KICKER_GAP = 18;
const FOOTER_SIZE = 22;
const FOOTER_GAP = 20;
/** Les tailles de la phrase, de la plus grande à la plus petite, et celle sous laquelle elle ne descend que par nécessité. */
const PHRASE_SIZES = { all: [42, 38, 34, 30], comfort: 34 } as const;

/** Des morceaux de texte de couleurs différentes, à la suite sur une ligne. */
function segments(parts: readonly { text: string; color: string }[], x: number, y: number, size: number, font: CardFont, measure: Measure): CardText[] {
  const out: CardText[] = [];
  let at = x;
  for (const part of parts) {
    out.push({ text: part.text, x: at, y, size, font, color: part.color });
    at += measure(part.text, font, size);
  }
  return out;
}

/**
 * Quoi écrire et où, dans la colonne que l'étendard laisse au texte : l'invite de la machine, le début de la phrase, le nom en
 * grand, la fin de la phrase, puis « [ OK ] Bienvenue chez les Gaulois ». Le bloc se centre entre les bords de la colonne ; le
 * nom rapetisse si le tout ne tient pas. `siteUrl` : l'adresse du site, écrite au bout de la dernière ligne si elle y tient.
 * La place est la même dans les six couleurs : seul le clair de la couleur change.
 */
export function arrivalLayout(image: ArrivalImage, siteUrl: string, measure: Measure): ArrivalLayout {
  const { x, width, top, bottom } = FRAME.text;
  const clair = PALETTES[image.decor].clair;
  const upper = (text: string) => text.toLocaleUpperCase("fr");
  const { avant, apres } = phraseParts(image.phrase);

  // La phrase : le moins de lignes possible, puis la plus grande taille. Elle ne descend sous sa taille de confort que si elle
  // dépasse trois lignes.
  const options = PHRASE_SIZES.all.map((size) => ({ size, before: wrapped(upper(avant), "title", size, width, measure), after: wrapped(upper(apres), "title", size, width, measure) }));
  const count = (option: (typeof options)[number]) => option.before.length + option.after.length;
  const comfortable = options.filter((option) => option.size >= PHRASE_SIZES.comfort && count(option) <= 3);
  const { size: phraseSize, before, after } = (comfortable.length > 0 ? comfortable : options).reduce((best, option) => (count(option) < count(best) ? option : best));
  const fit = (line: string) => fitted(line, "title", phraseSize, phraseSize - 6, width, measure);

  const phraseLine = phraseSize * 1.18;
  const height = (nameSize: number, nameLines: number) =>
    KICKER_SIZE + KICKER_GAP + before.length * phraseLine + (before.length > 0 ? phraseSize * 0.08 : 0) + nameLines * nameSize * 1.02 + nameSize * 0.14 + after.length * phraseLine + FOOTER_GAP + FOOTER_SIZE;

  let maxSize: number = NAME_SIZE.max;
  let name = fitName(image.name, "name", width, measure, maxSize);
  while (height(name.size, name.lines.length) > bottom - top && maxSize > NAME_SIZE.twoLinesMin) {
    maxSize -= 6;
    name = fitName(image.name, "name", width, measure, maxSize);
  }

  const total = height(name.size, name.lines.length);
  let y = top + Math.max(0, (bottom - top - total) / 2);
  const blockTop = y;
  const texts: CardText[] = [];

  // L'invite : gal@clan:~$ ./accueillir, comme au-dessus des titres du site.
  texts.push(
    ...segments(
      [
        { text: "gal@clan", color: INK.green },
        { text: ":", color: INK.muted },
        { text: FRAME.prompt.dir, color: clair },
        { text: "$ ", color: INK.muted },
        { text: FRAME.prompt.command, color: INK.white },
      ],
      x,
      y + KICKER_SIZE * 0.82,
      KICKER_SIZE,
      "mono",
      measure,
    ),
  );
  y += KICKER_SIZE + KICKER_GAP;

  for (const line of before) {
    texts.push({ ...fit(line), x, y: y + phraseSize * 0.86, font: "title", color: INK.white });
    y += phraseLine;
  }
  if (before.length > 0) y += phraseSize * 0.08;

  const nameTexts: CardText[] = [];
  for (const line of name.lines) {
    nameTexts.push({ text: line, x, y: y + name.size * 0.8, size: name.size, font: "name", color: INK.white });
    y += name.size * 1.02;
  }
  y += name.size * 0.14;

  for (const line of after) {
    texts.push({ ...fit(line), x, y: y + phraseSize * 0.86, font: "title", color: INK.white });
    y += phraseLine;
  }

  // La réponse de la machine, et l'adresse du site si elle tient au bout de la ligne.
  y += FOOTER_GAP;
  const footer: { text: string; color: string }[] = [
    { text: "[ OK ]", color: INK.green },
    { text: ` ${WELCOME_LINE}`, color: INK.muted },
  ];
  const address = siteUrl.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const withAddress = [...footer, { text: " · ", color: INK.lineStrong }, { text: address, color: clair }];
  const fits = (parts: typeof footer) => measure(parts.map((p) => p.text).join(""), "mono", FOOTER_SIZE) <= width;
  texts.push(...segments(address && fits(withAddress) ? withAddress : footer, x, y + FOOTER_SIZE * 0.82, FOOTER_SIZE, "mono", measure));
  y += FOOTER_SIZE;

  return { texts, name: nameTexts, top: blockTop, bottom: y };
}

/** Ce que l'image dit, pour un lecteur d'écran : Discord le lit comme description du fichier. `fullName` : le nom entier. */
export function arrivalAlt(phrase: Phrase, fullName: string, tag: string): string {
  return `Image de bienvenue du clan [${tag}]. ${sentence(phrase, fullName || FALLBACK_NAME)} ${WELCOME_LINE}.`.slice(0, 1024);
}

/* ---------- Le dessin ---------- */

export interface ArrivalAssets {
  /** Le guerrier du logo en masque (adresse `data:`), ou `null` sans logo : voir `WarriorAssets`. */
  warriorMask: string | null;
  /** La photo de profil, déjà carrée (adresse `data:`), ou `null` : l'initiale du nom la remplace. */
  avatar: string | null;
}

const n = (value: number): string => String(Math.round(value * 100) / 100);

/**
 * Le médaillon : la photo de profil, ou l'initiale du nom, dans l'anneau du logo du clan, bleu à gauche, blanc en haut, rouge à
 * droite, ouvert en bas. L'anneau garde le tricolore dans toutes les couleurs ; le halo, les graduations et le fond suivent la
 * couleur.
 */
function medallion(palette: Palette, avatar: string | null, initial: string, text: (item: CardText) => string): { defs: string; body: string } {
  const { cx, cy, r } = FRAME.avatar;
  const defs =
    `<clipPath id="av-clip"><circle cx="${cx}" cy="${cy}" r="${r}"/></clipPath>` +
    `<radialGradient id="av-halo" cx="0.5" cy="0.5" r="0.5"><stop offset="0.45" stop-color="${palette.halo}" stop-opacity="0.5"/><stop offset="1" stop-color="${palette.halo}" stop-opacity="0"/></radialGradient>`;
  const letter = () => {
    try {
      return text({ text: initial, x: cx, y: cy + r * 0.36, size: r * 1.05, font: "name", color: INK.white, anchor: "middle" });
    } catch {
      // Une initiale que la police ne sait pas écrire en capitale : le médaillon reste uni.
      return "";
    }
  };
  const face = avatar ? `<image href="${avatar}" x="${cx - r}" y="${cy - r}" width="${2 * r}" height="${2 * r}" preserveAspectRatio="xMidYMid slice" clip-path="url(#av-clip)"/>` : letter();
  const ring = r + 13;
  let ticks = "";
  for (let deg = 0; deg < 360; deg += 6) {
    const long = deg % 30 === 0;
    const rad = (deg * Math.PI) / 180;
    const r0 = r + (long ? 27 : 29);
    const r1 = r + (long ? 38 : 34);
    ticks += `M${n(cx + r0 * Math.cos(rad))} ${n(cy + r0 * Math.sin(rad))}L${n(cx + r1 * Math.cos(rad))} ${n(cy + r1 * Math.sin(rad))}`;
  }
  return {
    defs,
    body:
      `<circle cx="${cx}" cy="${cy}" r="${r + 96}" fill="url(#av-halo)"/>` +
      `<circle cx="${cx}" cy="${cy}" r="${r + 22}" fill="${palette.socle}" fill-opacity="0.92"/>` +
      `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${palette.plaque}"/>` +
      face +
      `<g fill="none" stroke-width="10">` +
      `<path d="${arc(cx, cy, ring, 133, 222)}" stroke="${INK.blue}"/>` +
      `<path d="${arc(cx, cy, ring, 228, 312)}" stroke="${INK.white}"/>` +
      `<path d="${arc(cx, cy, ring, 318, 407)}" stroke="${INK.red}"/>` +
      `</g>` +
      `<path d="${arc(cx, cy, ring, 55, 125)}" fill="none" stroke="${INK.white}" stroke-opacity="0.55" stroke-width="3"/>` +
      `<path d="${ticks}" fill="none" stroke="${palette.clair}" stroke-opacity="0.5" stroke-width="1.5"/>`,
  };
}

/** Le dessin entier, en SVG. Se teste sans fichier : `fonts` peut être remplacé par ce qui écrit des tracés. */
export function arrivalSvg(image: ArrivalImage, siteUrl: string, fonts: Pick<GazetteFonts, "paths" | "width">, assets: ArrivalAssets): string {
  const text = (item: CardText) => fonts.paths(item);
  const palette = PALETTES[image.decor];
  const decor = decorParts(image.decor, assets);
  const layout = arrivalLayout(image, siteUrl, fonts.width);
  const face = medallion(palette, assets.avatar, initialOf(image.name), text);

  // Le nom : un halo de la couleur, puis le tricolore vu à travers un écran, bleu d'un côté, rouge de l'autre, et le blanc
  // par-dessus.
  const size = layout.name[0]?.size ?? 0;
  const shift = Math.max(2, size * 0.026);
  const outline = layout.name.map((line) => fonts.paths({ ...line, color: "currentColor" })).join("");
  const name =
    `<use href="#nm" color="${palette.clair}" filter="url(#nm-glow)" opacity="0.5"/>` +
    `<use href="#nm" color="${INK.blue}" transform="translate(${n(-shift)} 0)"/>` +
    `<use href="#nm" color="${INK.red}" transform="translate(${n(shift)} 0)"/>` +
    `<use href="#nm" color="${INK.white}"/>`;
  // Un voile sombre derrière le texte : il se lit sur n'importe quelle couleur.
  const veil = `<rect x="${n(FRAME.text.x - 60)}" y="${n(layout.top - 40)}" width="${n(FRAME.text.width + 120)}" height="${n(layout.bottom - layout.top + 80)}" fill="url(#tx-veil)"/>`;

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">` +
    `<defs>${decor.defs}${face.defs}` +
    `<g id="nm">${outline}</g>` +
    `<filter id="nm-glow" x="-10%" y="-40%" width="120%" height="180%"><feGaussianBlur stdDeviation="${n(Math.max(6, size * 0.09))}"/></filter>` +
    `<radialGradient id="tx-veil" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="${palette.voile}" stop-opacity="0.62"/><stop offset="0.7" stop-color="${palette.voile}" stop-opacity="0.36"/><stop offset="1" stop-color="${palette.voile}" stop-opacity="0"/></radialGradient>` +
    `</defs>` +
    decor.under +
    veil +
    face.body +
    layout.texts.map(text).join("") +
    name +
    decor.over +
    `</svg>`
  );
}

/* ---------- Les fichiers : le logo du guerrier, la photo de profil, le PNG ---------- */

const smooth = (t: number): number => {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
};

const dataUri = (png: Buffer): string => `data:image/png;base64,${png.toString("base64")}`;

/** Le côté du guerrier préparé pour l'étendard. */
const WARRIOR_MASK_SIZE = 660;

/**
 * Le logo du guerrier, préparé une fois pour toutes les images d'un passage : détouré de son fond sombre (ce qui est clair ou
 * vif reste, le marine et les contours partent), en masque gris, que chaque couleur remplit de son dégradé. `null` s'il n'a pas
 * été déposé.
 */
export class WarriorAssets {
  private prepared: Promise<{ warriorMask: string | null }> | undefined;

  constructor(private readonly root: string) {}

  load(): Promise<{ warriorMask: string | null }> {
    this.prepared ??= this.prepare();
    return this.prepared;
  }

  private async prepare(): Promise<{ warriorMask: string | null }> {
    const file = brandFile("tete");
    if (!file) return { warriorMask: null };
    const side = WARRIOR_MASK_SIZE;
    const { data, info } = await sharp(join(this.root, "public", file)).resize(side, side, { fit: "cover" }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const mask = Buffer.alloc(side * side);
    for (let i = 0, p = 0; i < side * side; i++, p += info.channels) {
      mask[i] = Math.round(smooth((Math.max(data[p] ?? 0, data[p + 1] ?? 0, data[p + 2] ?? 0) - 84) / 96) * 255);
    }
    return { warriorMask: dataUri(await sharp(mask, { raw: { width: side, height: side, channels: 1 } }).png().toBuffer()) };
  }
}

/**
 * La photo de profil, recadrée en carré sur un fond uni (une photo peut être transparente) : `background`, le fond du médaillon
 * de la couleur. Lève une erreur si elle ne se lit pas.
 */
export async function avatarDataUri(data: Buffer, background: string = INK.surface2): Promise<string> {
  if (data.length === 0 || data.length > MAX_AVATAR_BYTES) throw new Error("taille inattendue");
  const png = await sharp(data, { limitInputPixels: 4096 * 4096 }).resize(256, 256, { fit: "cover" }).flatten({ background }).png().toBuffer();
  return dataUri(png);
}

/** Dessine l'image en PNG. `avatar` : la photo de profil telle que Discord la donne, ou `null` pour l'initiale du nom. */
export async function renderArrival(image: ArrivalImage, siteUrl: string, fonts: GazetteFonts, warrior: WarriorAssets, avatar: Buffer | null): Promise<Buffer> {
  let face: string | null = null;
  if (avatar) {
    try {
      face = await avatarDataUri(avatar, PALETTES[image.decor].plaque);
    } catch {
      // Une photo illisible ne retient pas l'image : l'initiale la remplace.
      face = null;
    }
  }
  const svg = arrivalSvg(image, siteUrl, fonts, { ...(await warrior.load()), avatar: face });
  return sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
}
