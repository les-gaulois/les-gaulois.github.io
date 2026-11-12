/**
 * L'image de bienvenue qui remplace le message d'arrivée de Discord : le nom du nouveau venu en grand, sa photo de profil dans
 * un médaillon, une phrase dans le thème du clan, et un des six décors de `arrivees-decors.ts`.
 *
 * Trois temps, comme les autres images du robot : `arrivalLayout` décide quoi écrire et où, et se teste sans police ;
 * `arrivalSvg` assemble le dessin ; `renderArrival` le rend en PNG. Chaque lettre devient un tracé, pour ne pas dépendre des
 * polices de la machine. Sans le logo du guerrier (`public/brand/tete.*`), l'image se dessine quand même, sans lui.
 */
import { join } from "node:path";
import sharp from "sharp";
import { FALLBACK_NAME, initialOf, MAX_AVATAR_BYTES, phraseParts, sentence, type Decor, type Phrase } from "./arrivees";
import { arc, decorParts, HEIGHT, INK, WIDTH, type DecorAssets, type DecorFrame } from "./arrivees-decors";
import { brandFile } from "./brand";
import { fitted, type CardFont, type CardText, type GazetteFonts, type Measure } from "./gazette-image";
import { logoMatrice, type LogoMatriceData } from "./logo-matrice";

export interface ArrivalImage {
  decor: Decor;
  /** Le tirage du décor : le même redonne la même image. */
  seed: number;
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
  /** Le curseur en pavé après le nom, dans le décor en chasse fixe. */
  cursor: { x: number; y: number; width: number; height: number } | null;
  top: number;
  bottom: number;
}

const KICKER_SIZE = 23;
const KICKER_GAP = 18;
const FOOTER_SIZE = 22;
const FOOTER_GAP = 20;
/** Les tailles de la phrase, de la plus grande à la plus petite, et celle sous laquelle elle ne descend que par nécessité. */
const PHRASE_SIZES = {
  title: { all: [42, 38, 34, 30], comfort: 34 },
  mono: { all: [32, 29, 26, 23], comfort: 26 },
} as const;

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
 * Quoi écrire et où, dans la colonne que le décor laisse au texte : l'invite de la machine, le début de la phrase, le nom en
 * grand, la fin de la phrase, puis « [ OK ] Bienvenue chez les Gaulois ». Le bloc se centre entre les bords du décor ; le nom
 * rapetisse si le tout ne tient pas. `siteUrl` : l'adresse du site, écrite au bout de la dernière ligne si elle y tient.
 */
export function arrivalLayout(image: ArrivalImage, frame: DecorFrame, siteUrl: string, measure: Measure): ArrivalLayout {
  const { x, width, top, bottom } = frame.text;
  const phraseFont: CardFont = frame.mono ? "monoStrong" : "title";
  const nameFont: CardFont = frame.mono ? "monoStrong" : "name";
  const upper = (text: string) => text.toLocaleUpperCase("fr");
  const { avant, apres } = phraseParts(image.phrase);

  // La phrase : le moins de lignes possible, puis la plus grande taille. Elle ne descend sous sa taille de confort que si elle
  // dépasse trois lignes.
  const sizes = frame.mono ? PHRASE_SIZES.mono : PHRASE_SIZES.title;
  const options = sizes.all.map((size) => ({ size, before: wrapped(upper(avant), phraseFont, size, width, measure), after: wrapped(upper(apres), phraseFont, size, width, measure) }));
  const count = (option: (typeof options)[number]) => option.before.length + option.after.length;
  const comfortable = options.filter((option) => option.size >= sizes.comfort && count(option) <= 3);
  const { size: phraseSize, before, after } = (comfortable.length > 0 ? comfortable : options).reduce((best, option) => (count(option) < count(best) ? option : best));
  const fit = (line: string) => fitted(line, phraseFont, phraseSize, phraseSize - 6, width, measure);

  // Dans la console, le nom suit un « > », comme une réponse de la machine.
  const markWidth = (size: number) => (frame.mono ? measure(">", nameFont, size) + size * 0.3 : 0);
  const phraseLine = phraseSize * 1.18;
  const height = (nameSize: number, nameLines: number) =>
    KICKER_SIZE + KICKER_GAP + before.length * phraseLine + (before.length > 0 ? phraseSize * 0.08 : 0) + nameLines * nameSize * 1.02 + nameSize * 0.14 + after.length * phraseLine + FOOTER_GAP + FOOTER_SIZE;

  let maxSize: number = frame.mono ? 96 : NAME_SIZE.max;
  let name = fitName(image.name, nameFont, width - markWidth(maxSize), measure, maxSize);
  while (height(name.size, name.lines.length) > bottom - top && maxSize > NAME_SIZE.twoLinesMin) {
    maxSize -= 6;
    name = fitName(image.name, nameFont, width - markWidth(maxSize), measure, maxSize);
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
        { text: frame.prompt.dir, color: INK.blueText },
        { text: "$ ", color: INK.muted },
        { text: frame.prompt.command, color: INK.white },
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
    texts.push({ ...fit(line), x, y: y + phraseSize * 0.86, font: phraseFont, color: INK.white });
    y += phraseLine;
  }
  if (before.length > 0) y += phraseSize * 0.08;

  const nameTexts: CardText[] = [];
  const indent = markWidth(name.size);
  name.lines.forEach((line, i) => {
    const baseline = y + name.size * 0.8;
    if (i === 0 && frame.mono) texts.push({ text: ">", x, y: baseline, size: name.size, font: nameFont, color: INK.green });
    nameTexts.push({ text: line, x: x + indent, y: baseline, size: name.size, font: nameFont, color: INK.white });
    y += name.size * 1.02;
  });
  const lastLine = nameTexts.at(-1);
  const cursor =
    frame.mono && lastLine
      ? { x: lastLine.x + measure(lastLine.text, nameFont, name.size) + name.size * 0.1, y: lastLine.y - name.size * 0.74, width: name.size * 0.52, height: name.size * 0.86 }
      : null;
  y += name.size * 0.14;

  for (const line of after) {
    texts.push({ ...fit(line), x, y: y + phraseSize * 0.86, font: phraseFont, color: INK.white });
    y += phraseLine;
  }

  // La réponse de la machine, et l'adresse du site si elle tient au bout de la ligne.
  y += FOOTER_GAP;
  const footer: { text: string; color: string }[] = [
    { text: "[ OK ]", color: INK.green },
    { text: ` ${WELCOME_LINE}`, color: INK.muted },
  ];
  const address = siteUrl.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const withAddress = [...footer, { text: " · ", color: INK.lineStrong }, { text: address, color: INK.blueText }];
  const fits = (parts: typeof footer, size: number) => measure(parts.map((p) => p.text).join(""), "mono", size) <= width;
  // Dans une colonne étroite, la ligne rapetisse un peu plutôt que de déborder.
  let footerSize = FOOTER_SIZE;
  while (footerSize > FOOTER_SIZE - 6 && !fits(footer, footerSize)) footerSize--;
  texts.push(...segments(address && fits(withAddress, FOOTER_SIZE) ? withAddress : footer, x, y + FOOTER_SIZE * 0.82, footerSize, "mono", measure));
  y += FOOTER_SIZE;

  return { texts, name: nameTexts, cursor, top: blockTop, bottom: y };
}

/** Ce que l'image dit, pour un lecteur d'écran : Discord le lit comme description du fichier. `fullName` : le nom entier. */
export function arrivalAlt(phrase: Phrase, fullName: string, tag: string): string {
  return `Image de bienvenue du clan [${tag}]. ${sentence(phrase, fullName || FALLBACK_NAME)} ${WELCOME_LINE}.`.slice(0, 1024);
}

/* ---------- Le dessin ---------- */

export interface ArrivalAssets extends Omit<DecorAssets, "text"> {
  /** La photo de profil, déjà carrée (adresse `data:`), ou `null` : l'initiale du nom la remplace. */
  avatar: string | null;
}

const n = (value: number): string => String(Math.round(value * 100) / 100);

/** Le médaillon : la photo de profil, ou l'initiale du nom, dans le cadre que demande le décor. */
function medallion(frame: DecorFrame, assets: ArrivalAssets, initial: string, text: (item: CardText) => string): { defs: string; body: string } {
  const { cx, cy, r, shape } = frame.avatar;
  const clip = shape === "carre" ? `<rect x="${cx - r}" y="${cy - r}" width="${2 * r}" height="${2 * r}" rx="6"/>` : `<circle cx="${cx}" cy="${cy}" r="${r}"/>`;
  const defs = `<clipPath id="av-clip">${clip}</clipPath><radialGradient id="av-halo" cx="0.5" cy="0.5" r="0.5"><stop offset="0.45" stop-color="${INK.blue}" stop-opacity="0.5"/><stop offset="1" stop-color="${INK.blue}" stop-opacity="0"/></radialGradient>`;
  const letter = () => {
    try {
      return text({ text: initial, x: cx, y: cy + r * 0.36, size: r * 1.05, font: "name", color: INK.white, anchor: "middle" });
    } catch {
      // Une initiale que la police ne sait pas écrire en capitale : le médaillon reste uni.
      return "";
    }
  };
  const face = assets.avatar
    ? `<image href="${assets.avatar}" x="${cx - r}" y="${cy - r}" width="${2 * r}" height="${2 * r}" preserveAspectRatio="xMidYMid slice" clip-path="url(#av-clip)"/>`
    : letter();
  const plate = `<g clip-path="url(#av-clip)"><rect x="${cx - r}" y="${cy - r}" width="${2 * r}" height="${2 * r}" fill="${INK.surface2}"/></g>`;

  if (shape === "bouclier") {
    // Le cœur du bouclier : la photo y tient la place de la bosse de métal.
    return {
      defs,
      body:
        `<circle cx="${cx}" cy="${cy}" r="${r + 13}" fill="#061033"/>` +
        plate +
        face +
        `<circle cx="${cx}" cy="${cy}" r="${r + 5}" fill="none" stroke="url(#b-steel)" stroke-width="10"/>` +
        `<circle cx="${cx}" cy="${cy}" r="${r + 12}" fill="none" stroke="#061033" stroke-width="3"/>`,
    };
  }

  if (shape === "carre") {
    // Une fenêtre de la console : un cadre net, et des repères de viseur aux quatre coins.
    const reach = r + 16;
    let sight = "";
    for (const [sx, sy] of [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ] as const) {
      sight += `M${cx + sx * reach} ${cy + sy * (reach - 26)}V${cy + sy * reach}H${cx + sx * (reach - 26)}`;
    }
    return {
      defs,
      body:
        `<rect x="${cx - r - 60}" y="${cy - r - 60}" width="${2 * r + 120}" height="${2 * r + 120}" fill="url(#av-halo)" opacity="0.6"/>` +
        plate +
        face +
        `<rect x="${cx - r}" y="${cy - r}" width="${2 * r}" height="${2 * r}" rx="6" fill="none" stroke="${INK.lineStrong}" stroke-width="2"/>` +
        `<path d="${sight}" fill="none" stroke="${INK.green}" stroke-width="3"/>`,
    };
  }

  // L'anneau du logo du clan : bleu à gauche, blanc en haut, rouge à droite, ouvert en bas.
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
      `<circle cx="${cx}" cy="${cy}" r="${r + 22}" fill="${INK.navy}" fill-opacity="0.92"/>` +
      plate +
      face +
      `<g fill="none" stroke-width="10">` +
      `<path d="${arc(cx, cy, ring, 133, 222)}" stroke="${INK.blue}"/>` +
      `<path d="${arc(cx, cy, ring, 228, 312)}" stroke="${INK.white}"/>` +
      `<path d="${arc(cx, cy, ring, 318, 407)}" stroke="${INK.red}"/>` +
      `</g>` +
      `<path d="${arc(cx, cy, ring, 55, 125)}" fill="none" stroke="${INK.white}" stroke-opacity="0.55" stroke-width="3"/>` +
      `<path d="${ticks}" fill="none" stroke="${INK.blueText}" stroke-opacity="0.5" stroke-width="1.5"/>`,
  };
}

/** Le dessin entier, en SVG. Se teste sans fichier : `fonts` peut être remplacé par ce qui écrit des tracés. */
export function arrivalSvg(image: ArrivalImage, siteUrl: string, fonts: Pick<GazetteFonts, "paths" | "width">, assets: ArrivalAssets): string {
  const text = (item: CardText) => fonts.paths(item);
  const decor = decorParts(image.decor, image.seed, { ...assets, text });
  const layout = arrivalLayout(image, decor.frame, siteUrl, fonts.width);
  const face = medallion(decor.frame, assets, initialOf(image.name), text);

  // Le nom : un halo, puis le tricolore vu à travers un écran, bleu d'un côté, rouge de l'autre, et le blanc par-dessus.
  const size = layout.name[0]?.size ?? 0;
  const shift = Math.max(2, size * 0.026);
  const outline = layout.name.map((line) => fonts.paths({ ...line, color: "currentColor" })).join("");
  const name =
    `<use href="#nm" color="${INK.blueText}" filter="url(#nm-glow)" opacity="0.5"/>` +
    `<use href="#nm" color="${INK.blue}" transform="translate(${n(-shift)} 0)"/>` +
    `<use href="#nm" color="${INK.red}" transform="translate(${n(shift)} 0)"/>` +
    `<use href="#nm" color="${INK.white}"/>`;
  const cursor = layout.cursor ? `<rect x="${n(layout.cursor.x)}" y="${n(layout.cursor.y)}" width="${n(layout.cursor.width)}" height="${n(layout.cursor.height)}" fill="${INK.green}"/>` : "";
  // Un voile sombre derrière le texte : il se lit sur n'importe quel décor.
  const veil = `<rect x="${n(decor.frame.text.x - 60)}" y="${n(layout.top - 40)}" width="${n(decor.frame.text.width + 120)}" height="${n(layout.bottom - layout.top + 80)}" fill="url(#tx-veil)"/>`;

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">` +
    `<defs>${decor.defs}${face.defs}` +
    `<g id="nm">${outline}</g>` +
    `<filter id="nm-glow" x="-10%" y="-40%" width="120%" height="180%"><feGaussianBlur stdDeviation="${n(Math.max(6, size * 0.09))}"/></filter>` +
    `<radialGradient id="tx-veil" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="${INK.night}" stop-opacity="0.62"/><stop offset="0.7" stop-color="${INK.night}" stop-opacity="0.36"/><stop offset="1" stop-color="${INK.night}" stop-opacity="0"/></radialGradient>` +
    `</defs>` +
    decor.under +
    veil +
    face.body +
    layout.texts.map(text).join("") +
    name +
    cursor +
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

/** Le côté du guerrier préparé pour l'étendard, et celui de sa version en couleurs. */
const WARRIOR_MASK_SIZE = 660;
const WARRIOR_COLOR_SIZE = 300;
/** Les colonnes du guerrier en caractères. Ses cases ont la forme d'un caractère : 0,6 fois plus larges que hautes. */
const MATRIX_COLUMNS = 66;
const MATRIX_COLUMNS_SMALL = 46;

/**
 * Le logo du guerrier, préparé une fois pour toutes les images d'un passage : détouré de son fond sombre (ce qui est clair ou
 * vif reste, le marine et les contours partent), en masque gris, en couleurs, et en caractères. `null` s'il n'a pas été déposé.
 */
export class WarriorAssets {
  private prepared: Promise<Omit<ArrivalAssets, "avatar">> | undefined;

  constructor(private readonly root: string) {}

  load(): Promise<Omit<ArrivalAssets, "avatar">> {
    this.prepared ??= this.prepare();
    return this.prepared;
  }

  private async prepare(): Promise<Omit<ArrivalAssets, "avatar">> {
    const file = brandFile("tete");
    if (!file) return { warriorMask: null, warriorColor: null, matrix: null, matrixSmall: null };
    const path = join(this.root, "public", file);
    const side = WARRIOR_MASK_SIZE;
    const { data, info } = await sharp(path).resize(side, side, { fit: "cover" }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const mask = Buffer.alloc(side * side);
    const color = Buffer.alloc(side * side * 4);
    for (let i = 0, p = 0; i < side * side; i++, p += info.channels) {
      const r = data[p] ?? 0;
      const g = data[p + 1] ?? 0;
      const b = data[p + 2] ?? 0;
      const alpha = Math.round(smooth((Math.max(r, g, b) - 84) / 96) * 255);
      mask[i] = alpha;
      color[i * 4] = r;
      color[i * 4 + 1] = g;
      color[i * 4 + 2] = b;
      color[i * 4 + 3] = alpha;
    }
    const inCharacters = async (columns: number): Promise<LogoMatriceData> => {
      const grid = await sharp(path)
        .resize(columns, Math.round(columns * 0.6), { fit: "fill" })
        .removeAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      return logoMatrice(grid.data, grid.info.width, grid.info.height, grid.info.channels);
    };
    return {
      warriorMask: dataUri(await sharp(mask, { raw: { width: side, height: side, channels: 1 } }).png().toBuffer()),
      warriorColor: dataUri(await sharp(color, { raw: { width: side, height: side, channels: 4 } }).resize(WARRIOR_COLOR_SIZE, WARRIOR_COLOR_SIZE).png().toBuffer()),
      matrix: await inCharacters(MATRIX_COLUMNS),
      matrixSmall: await inCharacters(MATRIX_COLUMNS_SMALL),
    };
  }
}

/** La photo de profil, recadrée en carré sur un fond uni (une photo peut être transparente). Lève une erreur si elle ne se lit pas. */
export async function avatarDataUri(data: Buffer): Promise<string> {
  if (data.length === 0 || data.length > MAX_AVATAR_BYTES) throw new Error("taille inattendue");
  const png = await sharp(data, { limitInputPixels: 4096 * 4096 }).resize(256, 256, { fit: "cover" }).flatten({ background: INK.surface2 }).png().toBuffer();
  return dataUri(png);
}

/** Dessine l'image en PNG. `avatar` : la photo de profil telle que Discord la donne, ou `null` pour l'initiale du nom. */
export async function renderArrival(image: ArrivalImage, siteUrl: string, fonts: GazetteFonts, warrior: WarriorAssets, avatar: Buffer | null): Promise<Buffer> {
  let face: string | null = null;
  if (avatar) {
    try {
      face = await avatarDataUri(avatar);
    } catch {
      // Une photo illisible ne retient pas l'image : l'initiale la remplace.
      face = null;
    }
  }
  const svg = arrivalSvg(image, siteUrl, fonts, { ...(await warrior.load()), avatar: face });
  return sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
}
