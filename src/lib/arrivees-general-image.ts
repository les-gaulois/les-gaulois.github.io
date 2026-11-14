/**
 * L'image du salut du salon général (`arrivees-general.ts`) : « Ho ! Un nouveau membre : », le nom du nouveau venu, quatre
 * conseils pour commencer, puis le village qui salue.
 *
 * Elle part en même temps que l'étendard du salon « nouveaux » (`arrivees-image.ts`), pour la même personne : le pilote a
 * refusé qu'elle lui ressemble (« ça doit être différent, sinon ça fait doublon », 14 novembre 2026). Tout y est donc
 * autre chose, dans la même famille, celle du poste de commandement :
 * - le fond est la table des cartes des images du robot, pas le drapeau bleu et son écharpe ;
 * - la photo est dans un carré aux coins de viseur, pas dans un médaillon rond ;
 * - le titre est en onciale de cases avec sa lettrine rouge, comme le titre d'une page du site ;
 * - le nom est moyen et blanc, sans décalage tricolore : ici, ce sont les conseils qui prennent la place ;
 * - les conseils sont quatre étapes sur le chemin de terre du village, chacune un bouclier rond et son icône en pixels : le
 *   pilote n'a pas aimé les quatre cases colorées du premier essai, et a choisi ce dessin parmi cinq ;
 * - le guerrier du logo n'est plus un filigrane : c'est un petit sceau, en haut à droite.
 * La couleur tirée pour l'étendard (`decor`) n'est pas reprise : les deux images ne doivent pas s'accorder. Les six couleurs
 * de l'étendard donnent donc la même image ici.
 *
 * Le même jour, le pilote a demandé « le thème gaulois, le village » et « les Gaulois déjà enregistrés qu'ils lui disent
 * coucou, avec leurs personnages, et leur pseudo légèrement écrit au-dessus, discret ». En bas de l'image, donc, une bande du
 * village : la palissade, des huttes derrière, le feu de camp, le chemin de terre, et jusqu'à `GENERAL_GAULOIS_MAX` Gaulois
 * de membres, dans leur tenue du village, sous une bulle « Coucou ! ». Ce n'est pas du temps réel et l'image ne le dit pas :
 * c'est le village qui salue. Sans Gaulois, la bande reste : une hutte de plus prend la place de la bulle. Les formes de la
 * bande sont dessinées ici, à la main, dans des tons de bois et de chaume ; les huttes et le feu sont les icônes du site
 * (`icones-parties.ts`), les Gaulois ceux de `gaulois.ts`, posés par `gaulois-sprite.ts`, jamais modifiés.
 *
 * Trois temps, comme les autres images du robot : `generalLayout` décide quoi écrire et où, et se teste sans police ;
 * `generalSvg` assemble le dessin ; `renderGeneral` le rend en PNG et y pose les Gaulois. Chaque lettre devient un tracé. Rien
 * n'est dit du joueur : son nom, sa photo, et c'est tout.
 */
import sharp from "sharp";
import { initialOf, phraseParts, tidyName, type Decor } from "./arrivees";
import { GENERAL_COMMAND, GENERAL_PHRASE, type GeneralTip } from "./arrivees-general";
import { avatarDataUri, fitName, type WarriorAssets } from "./arrivees-image";
import { lireTenue, type Tenue } from "./gaulois";
import { placeSprite, spriteLayers, spriteRect, type SpritePlacement } from "./gaulois-sprite";
import { CARD_COLORS as C, drawnWidth, fitted, lettrineOf, STAGES, tableSvg, type CardFont, type CardText, type GazetteFonts, type Measure } from "./gazette-image";
import { traceIcone, ICONES_PARTIES, type IconePartieNom } from "./icones-parties";
import { wrapWords } from "./lignes-icones-image";

export const GENERAL_WIDTH = 1200;
/** 1,56 fois plus large que haute : Discord la montre dans 545 pixels de large et 350 de haut, presque toute sa place. */
export const GENERAL_HEIGHT = 770;

/** Combien de Gaulois l'image peut accueillir, côte à côte devant la palissade. */
export const GENERAL_GAULOIS_MAX = 5;

/** Un Gaulois d'un membre du clan, qui salue : son pseudo et sa tenue du village. */
export interface GeneralGaulois {
  nom: string;
  tenue: Tenue;
}

export interface GeneralImage {
  /** Le nom tel qu'il se dessine : voir `drawnName` (`arrivees.ts`). */
  name: string;
  /** La couleur tirée pour l'image de « nouveaux ». Elle ne change rien ici : voir l'en-tête du fichier. */
  decor: Decor;
  tips: readonly GeneralTip[];
  siteUrl: string;
  /** De 0 à `GENERAL_GAULOIS_MAX` Gaulois, déjà choisis, dans l'ordre où les poser. Les suivants ne sont pas dessinés. */
  gaulois?: readonly GeneralGaulois[];
}

/* ---------- Les mesures ---------- */

const MARGIN = 36;
const RIGHT = GENERAL_WIDTH - MARGIN;
/** L'espace insécable du texte source. */
const NBSP = String.fromCharCode(0xa0);

/** La photo : un carré aux coins de 8 pixels, à la place du badge des autres images du robot. */
export const GENERAL_AVATAR = { x: MARGIN + 12, y: 44, side: 172, radius: 8 } as const;
/** Le fond du carré, sous une photo transparente ou derrière l'initiale. */
const PLAQUE = C.SURFACE_2;
/** Le sceau du guerrier, en haut à droite. */
export const GENERAL_SEAL = { side: 100, x: RIGHT - 100, y: 32 } as const;

/** La colonne du texte, à droite de la photo. */
const TEXT_X = GENERAL_AVATAR.x + GENERAL_AVATAR.side + 12 + 36;
const HEAD = { tribar: 32, invite: 70, title: 124, nameTop: 144, nameBottom: 222 } as const;
const INVITE_SIZE = 23;
/** Le titre, et ses espaces en part de sa taille : entre deux mots, et la fine devant « ! » et « : ». */
export const GENERAL_TITLE = { max: 44, min: 30, space: 0.5, fine: 0.24 } as const;
/** Le nom : sur une ligne tant qu'il y tient à 46 pixels au moins, sinon sur deux lignes de 44. */
export const GENERAL_NAME = { max: 88, oneLineMin: 46, twoLines: 44 } as const;

/** La place des conseils, entre l'en-tête et le village. */
export const GENERAL_ZONE = { x: MARGIN, y: 248, width: RIGHT - MARGIN, height: 292 } as const;
const Z = GENERAL_ZONE;

/**
 * La bande du village : la ligne des pseudos, le haut des pieux, le sol où se tiennent les Gaulois, puis le chemin de terre,
 * où s'écrit l'adresse du site.
 */
export const GENERAL_VILLAGE = { names: 592, stakes: 670, ground: 736, address: 761, nameSize: 23, nameWidth: 160, step: 170, center: 600, scale: 2 } as const;
const V = GENERAL_VILLAGE;

/** Les tons du village : le bois de la palissade, le chaume des huttes, la terre du chemin, le feu, la bulle et son encre. */
const VILLAGE = {
  bois: "#7B4F2C",
  boisAutre: "#6C4426",
  boisClair: "#A87440",
  boisSombre: "#4B2E18",
  creux: "#2A190C",
  corde: "#CDA869",
  chaume: "#C99A4B",
  chaumeSombre: "#5C3A1E",
  terre: "#3A2819",
  terreClaire: "#5E432B",
  feu: "#FFB23E",
  braise: "#E5482A",
  encre: "#2B1A0C",
  creme: "#F6E8C8",
} as const;

/**
 * Les couleurs des quatre boucliers, dans l'ordre : les scènes du site (`01-socle.css` : `.stage-blue`, `.stage-indigo`,
 * `.stage-wine`) et un bleu acier foncé, proche de celui de l'étendard (`#31476E`) sans être le même.
 */
export const GENERAL_SCENES: readonly { color: string; to: string }[] = [STAGES.blue, STAGES.indigo, { color: "#2F4A78", to: "#141F38" }, { color: "#8A1230", to: "#2A1048" }];

/* ---------- Quoi écrire et où ---------- */

/** Une icône en pixels : son nom, son coin haut gauche et le côté d'une case, en pixels entiers ; ses deux teintes. */
export interface GeneralIcon {
  name: IconePartieNom;
  x: number;
  y: number;
  cell: number;
  full: string;
  half: string;
  /** L'opacité de la demi-teinte : 1 sans elle. */
  halfOpacity?: number;
}

/** La place d'un conseil, une colonne : tout son texte et son icône y tiennent. */
export interface GeneralTile {
  x: number;
  y: number;
  width: number;
  height: number;
  /** La couleur de son bouclier. */
  scene: { color: string; to: string };
  icon: GeneralIcon;
}

export interface GeneralLayout {
  /** L'invite, le titre, les conseils et l'adresse du site : ce que l'image dit. */
  texts: CardText[];
  /** Le nom, sur une ou deux lignes. */
  name: CardText[];
  /** Ce qui s'écrit en plus, dans le village : « Coucou ! ». */
  extras: CardText[];
  /** Le pseudo de chaque Gaulois, au-dessus de lui, dans le même ordre que `gaulois`. */
  pseudos: CardText[];
  /** Les Gaulois qui saluent, à poser sur le PNG (`spriteLayers`). */
  gaulois: SpritePlacement[];
  tiles: GeneralTile[];
  /** Le filet tricolore et le curseur de l'invite. */
  marks: { x: number; y: number; width: number; height: number; color: string }[];
  /** Le sceau du guerrier est-il dessiné ? Le titre lui laisse alors sa place. */
  seal: boolean;
  /** Le dessin des conseils et celui du village, sous les textes. */
  decor: { defs: string; body: string };
}

/** Le nom : le plus grand possible sur une ligne ; sinon sur deux, coupé entre deux mots ou après un signe ; jamais coupé sans points de suspension. */
export function generalName(name: string, maxWidth: number, measure: Measure): { lines: string[]; size: number } {
  for (let size: number = GENERAL_NAME.max; size >= GENERAL_NAME.oneLineMin; size -= 2) if (measure(name, "name", size) <= maxWidth) return { lines: [name], size };
  return fitName(name, "name", maxWidth, measure, GENERAL_NAME.twoLines);
}

/** L'adresse du site telle qu'elle s'écrit : sans « https:// » ni barre finale. */
const addressOf = (siteUrl: string): string => siteUrl.replace(/^https?:\/\//, "").replace(/\/$/, "");

const n = (value: number): string => String(Math.round(value * 100) / 100);

/* ---------- Les conseils : les textes ---------- */

interface TipsParts {
  tiles: GeneralTile[];
  texts: CardText[];
  defs: string;
  body: string;
}

/** Le côté d'une icône, en pixels. */
const iconSide = (name: IconePartieNom, cell: number): number => ICONES_PARTIES[name].length * cell;

/** La taille commune des titres : la plus grande où le plus long tient dans `inner`. */
function titleSizeOf(tips: readonly GeneralTip[], inner: number, max: number, min: number, measure: Measure): number {
  let size = max;
  while (size > min && tips.some((tip) => measure(tip.titre, "strong", size) > inner)) size -= 1;
  return size;
}

/** La taille commune des phrases et leurs lignes : la plus grande taille où chacune tient en `maxLines` lignes ; sinon la plus petite, sur les lignes qu'il faut. Un mot ne se coupe jamais. */
function wrapTips(tips: readonly GeneralTip[], inner: number, sizes: readonly number[], maxLines: number, measure: Measure): { size: number; lines: string[][] } {
  const at = (size: number) => tips.map((tip) => wrapWords(tip.texte, "body", size, inner, measure));
  const size = sizes.find((s) => at(s).every((lines) => lines.length <= maxLines)) ?? sizes[sizes.length - 1] ?? 24;
  return { size, lines: at(size) };
}

const lineOf = (size: number): number => Math.round(size * 1.24);
/** La hauteur d'un titre et de ses lignes, du haut des capitales au bas de la dernière ligne. */
const stackHeight = (titleSize: number, textSize: number, lines: number): number => titleSize * 0.74 + 14 + textSize * 0.74 + Math.max(0, lines - 1) * lineOf(textSize);

/** Le titre d'un conseil et sa phrase dessous, à partir de `top`, au milieu de sa colonne. */
function stack(tip: GeneralTip, lines: readonly string[], x: number, top: number, titleSize: number, textSize: number, inner: number, measure: Measure): CardText[] {
  const titleY = Math.round(top + titleSize * 0.74);
  return [
    { ...fitted(tip.titre, "strong", titleSize, 23, inner, measure), x, y: titleY, font: "strong", color: C.WHITE, anchor: "middle" },
    ...lines.map((line, i): CardText => ({ ...fitted(line, "body", textSize, 23, inner, measure), x, y: Math.round(titleY + 14 + textSize * 0.74 + i * lineOf(textSize)), font: "body", color: C.MUTED, anchor: "middle" })),
  ];
}

/** Un dégradé en long, d'un point à l'autre. */
const gradient = (id: string, x1: number, y1: number, x2: number, y2: number, from: string, to: string): string =>
  `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${n(x1)}" y1="${n(y1)}" x2="${n(x2)}" y2="${n(y2)}"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient>`;

/* ---------- Les conseils : un chemin de terre et quatre boucliers ---------- */

/** Un bouclier rond : son bord de bois, sa couleur, son umbo derrière l'icône. */
function shieldSvg(cx: number, cy: number, r: number, id: string, scene: { color: string; to: string }): { defs: string; body: string } {
  return {
    defs: gradient(id, cx - r, cy - r, cx + r, cy + r, scene.color, scene.to),
    body:
      `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}" fill="${VILLAGE.boisSombre}"/>` +
      `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r - 3)}" fill="${VILLAGE.boisClair}"/>` +
      `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r - 9)}" fill="url(#${id})"/>`,
  };
}

/**
 * Le chemin de terre du village passe par quatre boucliers, de la porte de la palissade jusqu'au cor : quatre étapes, dans
 * l'ordre. Sous chaque bouclier, son titre et sa phrase, au milieu de sa colonne.
 */
function pathTips(tips: readonly GeneralTip[], measure: Measure): TipsParts {
  const count = Math.max(1, tips.length);
  const column = Z.width / count;
  const inner = column - 24;
  const r = 52;
  const cell = 5;
  const titleSize = titleSizeOf(tips, inner, 31, 26, measure);
  const text = wrapTips(tips, inner, [26, 25, 24], 3, measure);
  const most = Math.max(1, ...text.lines.map((lines) => lines.length));
  const block = 2 * r + 20 + stackHeight(titleSize, text.size, most);
  const top = Z.y + Math.max(0, (Z.height - block) / 2);
  const cy = top + r;
  const tiles: GeneralTile[] = [];
  const texts: CardText[] = [];
  let defs = "";
  // Le chemin : il entre par la gauche, ondule d'un bouclier à l'autre et sort à droite.
  const centers = tips.map((_, i) => Z.x + column * (i + 0.5));
  let d = `M${Z.x} ${n(cy + 10)}`;
  [...centers, Z.x + Z.width].forEach((x, i) => {
    const from = i === 0 ? Z.x : centers[i - 1]!;
    const bend = i % 2 === 0 ? -16 : 16;
    d += `Q${n((from + x) / 2)} ${n(cy + bend)} ${n(x)} ${n(i === centers.length ? cy - 6 : cy)}`;
  });
  let body =
    `<path d="${d}" fill="none" stroke="${VILLAGE.terre}" stroke-width="30" stroke-linecap="round"/>` +
    `<path d="${d}" fill="none" stroke="${VILLAGE.terreClaire}" stroke-width="22" stroke-linecap="round"/>` +
    `<path d="${d}" fill="none" stroke="${VILLAGE.corde}" stroke-opacity="0.55" stroke-width="4" stroke-dasharray="10 16"/>`;
  tips.forEach((tip, i) => {
    const cx = centers[i]!;
    const scene = GENERAL_SCENES[i % GENERAL_SCENES.length]!;
    const shield = shieldSvg(cx, cy, r, `gs${i}`, scene);
    defs += shield.defs;
    body += shield.body;
    tiles.push({ x: Z.x + i * column, y: Z.y, width: column, height: Z.height, scene, icon: { name: tip.icone, x: Math.round(cx - iconSide(tip.icone, cell) / 2), y: Math.round(cy - iconSide(tip.icone, cell) / 2), cell, full: C.WHITE, half: C.WHITE, halfOpacity: 0.55 } });
    texts.push(...stack(tip, text.lines[i] ?? [], cx, top + 2 * r + 20, titleSize, text.size, inner, measure));
  });
  return { tiles, texts, defs, body };
}

/* ---------- Le village qui salue ---------- */

/** Un pseudo libre, réduit à ce que la police dessine. Vide s'il n'en reste ni lettre ni chiffre : ce Gaulois n'est alors pas posé. */
export function pseudoOf(nom: string, draws: (char: string) => boolean): string {
  const kept = [...tidyName(nom)]
    .filter((char) => char === " " || draws(char))
    .join("")
    .replace(/ +/g, " ")
    .trim();
  return /[\p{L}\p{N}]/u.test(kept) ? kept : "";
}

/** Un nombre entre 0 et 1, toujours le même pour un même rang : la hauteur inégale des pieux. */
const uneven = (i: number): number => ((i * 37 + 11) % 7) / 6;

interface VillageParts {
  body: string;
  gaulois: SpritePlacement[];
  pseudos: CardText[];
  extras: CardText[];
}

/**
 * La bande du village, en bas de l'image : des huttes derrière la palissade, le feu de camp, le chemin de terre. Devant, les
 * Gaulois qui saluent, côte à côte et centrés, chacun sous son pseudo, discret ; à leur gauche, la bulle « Coucou ! ». Un
 * Gaulois dont le pseudo ne s'écrit pas, ou dont la tenue ne se lit pas, n'est pas posé.
 */
function villageParts(crowd: readonly GeneralGaulois[], measure: Measure, draws: (char: string) => boolean): VillageParts {
  const shown = crowd.flatMap((one) => {
    const pseudo = pseudoOf(one.nom, draws);
    if (!pseudo) return [];
    try {
      const tenue = lireTenue(one.tenue);
      const sprite = tenue ? placeSprite(tenue, { axis: 0, bottom: V.ground, scale: V.scale }) : null;
      return sprite ? [{ pseudo, sprite }] : [];
    } catch {
      return [];
    }
  });
  const kept = shown.slice(0, GENERAL_GAULOIS_MAX);
  const gaulois: SpritePlacement[] = [];
  const pseudos: CardText[] = [];
  const extras: CardText[] = [];
  const first = V.center - ((kept.length - 1) * V.step) / 2;
  kept.forEach(({ pseudo, sprite }, i) => {
    const axis = Math.round(first + i * V.step);
    gaulois.push({ ...sprite, x: sprite.x + axis });
    pseudos.push({ ...fitted(pseudo, "body", V.nameSize, V.nameSize, V.nameWidth, measure), x: axis, y: V.names, font: "body", color: C.MUTED, anchor: "middle" });
  });

  const icon = (name: IconePartieNom, x: number, y: number, cell: number, full: string, half: string): string => iconSvg({ name, x, y, cell, full, half });
  // Les huttes, derrière la palissade : leur toit de chaume dépasse des pieux. Sans Gaulois, une de plus à gauche.
  const hut = (x: number): string => icon("hutte", x, V.ground - 36 - 12 * 7, 7, VILLAGE.chaume, VILLAGE.chaumeSombre);
  let body = [...(kept.length === 0 ? [70] : []), 330, 640, 1084].map(hut).join("");
  // La palissade : des pieux taillés en pointe, de hauteurs un peu inégales, liés par une corde.
  const stake = 22;
  body += `<rect x="0" y="${V.stakes + 14}" width="${GENERAL_WIDTH}" height="${V.ground - V.stakes - 14}" fill="${VILLAGE.creux}"/>`;
  let wood = "";
  let other = "";
  let light = "";
  for (let i = 0, x = -6; x < GENERAL_WIDTH; i++, x += stake + 2) {
    const top = V.stakes + Math.round(uneven(i) * 8);
    const d = `M${x} ${top + 10}L${x + stake / 2} ${top}L${x + stake} ${top + 10}V${V.ground}H${x}Z`;
    if (i % 2 === 0) wood += d;
    else other += d;
    light += `M${x + 3} ${top + 12}h3V${V.ground}h-3Z`;
  }
  body +=
    `<path d="${wood}" fill="${VILLAGE.bois}"/><path d="${other}" fill="${VILLAGE.boisAutre}"/><path d="${light}" fill="${VILLAGE.boisClair}" fill-opacity="0.6"/>` +
    `<rect x="0" y="${V.stakes + 30}" width="${GENERAL_WIDTH}" height="5" fill="${VILLAGE.corde}"/><rect x="0" y="${V.stakes + 35}" width="${GENERAL_WIDTH}" height="2" fill="${VILLAGE.boisSombre}"/>` +
    // Le chemin de terre, où s'écrit l'adresse du site.
    `<rect x="0" y="${V.ground}" width="${GENERAL_WIDTH}" height="${GENERAL_HEIGHT - V.ground}" fill="${VILLAGE.terre}"/>` +
    `<rect x="0" y="${V.ground}" width="${GENERAL_WIDTH}" height="4" fill="${VILLAGE.terreClaire}"/>` +
    // Le feu de camp, devant la palissade.
    icon("feu", 1012, V.ground - 12 * 5 + 2, 5, VILLAGE.feu, VILLAGE.braise);

  // La bulle, à gauche du premier Gaulois, sa pointe vers lui.
  if (kept.length > 0) {
    const bubble = { width: 148, height: 46, y: 628 };
    const x = Math.round(first - 62 - bubble.width);
    body +=
      `<g shape-rendering="crispEdges"><rect x="${x}" y="${bubble.y}" width="${bubble.width}" height="${bubble.height}" fill="${VILLAGE.creme}"/>` +
      `<rect x="${x + bubble.width}" y="${bubble.y + 26}" width="8" height="10" fill="${VILLAGE.creme}"/><rect x="${x + bubble.width + 8}" y="${bubble.y + 32}" width="8" height="6" fill="${VILLAGE.creme}"/></g>`;
    extras.push({ text: `Coucou${NBSP}!`, x: x + bubble.width / 2, y: bubble.y + 32, size: 25, font: "strong", color: VILLAGE.encre, anchor: "middle" });
  }
  return { body, gaulois, pseudos, extras };
}

/* ---------- La mise en page entière ---------- */

/**
 * Quoi écrire et où. `seal` : le sceau du guerrier sera dessiné, le titre s'arrête avant lui. `draws` : la police sait-elle
 * écrire ce caractère d'un pseudo ? Sans elle, tout s'écrit.
 */
export function generalLayout(image: GeneralImage, measure: Measure, seal = false, draws: (char: string) => boolean = () => true): GeneralLayout {
  const texts: CardText[] = [];
  const marks: GeneralLayout["marks"] = [];
  const room = RIGHT - TEXT_X;

  // Le filet tricolore, puis l'invite et son curseur rouge, comme au-dessus du titre d'une page du site.
  [C.BLUE, C.WHITE, C.RED].forEach((color, i) => marks.push({ x: TEXT_X + i * 33, y: HEAD.tribar, width: 30, height: 5, color }));
  const invite: { text: string; font: CardFont; color: string }[] = [
    { text: "gal@clan", font: "monoStrong", color: C.BLUE_TEXT },
    { text: ":~$ ", font: "mono", color: C.MUTED },
    { text: GENERAL_COMMAND, font: "mono", color: C.WHITE },
  ];
  let at = TEXT_X;
  for (const part of invite) {
    texts.push({ ...part, x: at, y: HEAD.invite, size: INVITE_SIZE });
    at += measure(part.text, part.font, INVITE_SIZE);
  }
  marks.push({ x: Math.round(at + INVITE_SIZE * 0.4), y: Math.round(HEAD.invite - INVITE_SIZE * 0.92), width: Math.round(INVITE_SIZE * 0.6), height: Math.round(INVITE_SIZE * 1.15), color: C.RED });

  // Le titre du modèle du pilote, en onciale de cases : ce n'est pas un pseudo.
  // Morceau après morceau : l'onciale de cases a une espace étroite, qui collait « Ho ! » à « Un », et la police réduit
  // l'espace insécable devant « ! » et « : » à presque rien. Chaque espace est donc posée ici : une entière entre deux mots, une
  // fine à la place de l'insécable.
  const pieces = phraseParts(GENERAL_PHRASE)
    .avant.split(" ")
    .filter(Boolean)
    .flatMap((word) =>
      word
        .split(NBSP)
        .filter(Boolean)
        .map((text, i) => ({ text, gap: i === 0 ? GENERAL_TITLE.space : GENERAL_TITLE.fine })),
    );
  const titleRoom = room - (seal ? GENERAL_SEAL.side + 28 : 0);
  const pieceAt = (text: string, i: number, size: number): Pick<CardText, "text" | "font" | "size" | "lettrine"> => ({ text, font: "cases", size, ...(i === 0 && lettrineOf(text) ? { lettrine: C.RED } : {}) });
  const titleWidth = (size: number) => pieces.reduce((sum, piece, i) => sum + (i > 0 ? piece.gap * size : 0) + drawnWidth(pieceAt(piece.text, i, size), measure), 0);
  let titleSize: number = GENERAL_TITLE.max;
  while (titleSize > GENERAL_TITLE.min && titleWidth(titleSize) > titleRoom) titleSize -= 1;
  at = TEXT_X;
  pieces.forEach((piece, i) => {
    if (i > 0) at += piece.gap * titleSize;
    const item = pieceAt(piece.text, i, titleSize);
    texts.push({ ...item, x: at, y: HEAD.title, color: C.WHITE });
    at += drawnWidth(item, measure);
  });

  // Le nom, au milieu de la place qui reste à côté de la photo.
  const fit = generalName(image.name, room, measure);
  const name: CardText[] = [];
  const nameHeight = HEAD.nameBottom - HEAD.nameTop;
  if (fit.lines.length === 1) name.push({ text: fit.lines[0] ?? "", x: TEXT_X, y: Math.round(HEAD.nameTop + (nameHeight + fit.size * 0.72) / 2), size: fit.size, font: "name", color: C.WHITE });
  else fit.lines.forEach((line, i) => name.push({ text: line, x: TEXT_X, y: Math.round(HEAD.nameTop + fit.size * 0.8 + i * fit.size * 1.08), size: fit.size, font: "name", color: C.WHITE }));

  // Les conseils, puis le village.
  const tips = pathTips(image.tips, measure);
  texts.push(...tips.texts);
  const village = villageParts(image.gaulois ?? [], measure, draws);

  // L'adresse du site, en chasse fixe, sur le chemin de terre.
  const address = addressOf(image.siteUrl);
  if (address) texts.push({ ...fitted(address, "monoStrong", 23, 23, RIGHT - MARGIN, measure), x: MARGIN, y: V.address, font: "monoStrong", color: VILLAGE.creme });

  return {
    texts,
    name,
    extras: village.extras,
    pseudos: village.pseudos,
    gaulois: village.gaulois,
    tiles: tips.tiles,
    marks,
    seal,
    decor: { defs: tips.defs, body: tips.body + village.body },
  };
}

/* ---------- Le dessin ---------- */

/** Une icône en pixels nets : ses cases pleines, puis sa demi-teinte. */
function iconSvg({ name, x, y, cell, full, half, halfOpacity = 1 }: GeneralIcon): string {
  const { plein, demi } = traceIcone(name);
  return (
    `<g transform="translate(${x} ${y}) scale(${cell})" shape-rendering="crispEdges">` +
    (demi ? `<path d="${demi}" fill="${half}"${halfOpacity < 1 ? ` fill-opacity="${halfOpacity}"` : ""}/>` : "") +
    (plein ? `<path d="${plein}" fill="${full}"/>` : "") +
    `</g>`
  );
}

/**
 * La photo dans son carré, ou l'initiale du nom. Autour, quatre coins de viseur en pixels : bleus à gauche, rouges à droite,
 * et le bord blanc du carré entre eux, le tricolore du clan.
 */
function avatarSvg(avatar: string | null, initial: string, text: (item: CardText) => string): { defs: string; body: string } {
  const { x, y, side, radius } = GENERAL_AVATAR;
  const letter = () => {
    try {
      return text({ text: initial, x: x + side / 2, y: y + side * 0.69, size: side * 0.6, font: "name", color: C.WHITE, anchor: "middle" });
    } catch {
      // Une initiale que la police ne sait pas écrire : le carré reste uni.
      return "";
    }
  };
  const face = avatar ? `<image href="${avatar}" x="${x}" y="${y}" width="${side}" height="${side}" preserveAspectRatio="xMidYMid slice" clip-path="url(#g-photo)"/>` : letter();
  // Chaque coin : une équerre de 6 pixels d'épaisseur, à 12 pixels du carré.
  const out = 12;
  const arm = 36;
  const thick = 6;
  const corner = (cx: number, cy: number, dx: number, dy: number) => `M${cx} ${cy}h${dx * arm}v${dy * thick}h${-dx * (arm - thick)}v${dy * (arm - thick)}h${-dx * thick}z`;
  const left = corner(x - out, y - out, 1, 1) + corner(x - out, y + side + out, 1, -1);
  const right = corner(x + side + out, y - out, -1, 1) + corner(x + side + out, y + side + out, -1, -1);
  return {
    defs: `<clipPath id="g-photo"><rect x="${x}" y="${y}" width="${side}" height="${side}" rx="${radius}"/></clipPath>`,
    body:
      `<rect x="${x}" y="${y}" width="${side}" height="${side}" rx="${radius}" fill="${PLAQUE}"/>` +
      face +
      `<rect x="${x}" y="${y}" width="${side}" height="${side}" rx="${radius}" fill="none" stroke="${C.WHITE}" stroke-width="3"/>` +
      `<g shape-rendering="crispEdges"><path d="${left}" fill="${C.BLUE}"/><path d="${right}" fill="${C.RED}"/></g>`,
  };
}

/** Le sceau : le guerrier du logo du clan, en bleu clair dans un rond bordé. Rien sans le logo. */
function sealSvg(warriorMask: string | null): { defs: string; body: string } {
  if (!warriorMask) return { defs: "", body: "" };
  const { x, y, side } = GENERAL_SEAL;
  const c = side / 2;
  return {
    defs:
      `<clipPath id="g-sceau"><circle cx="${x + c}" cy="${y + c}" r="${c - 3}"/></clipPath>` +
      `<mask id="g-guerrier" maskUnits="userSpaceOnUse" x="${x}" y="${y}" width="${side}" height="${side}"><image href="${warriorMask}" x="${x - 6}" y="${y - 2}" width="${side + 12}" height="${side + 12}"/></mask>`,
    body:
      `<circle cx="${x + c}" cy="${y + c}" r="${c - 1}" fill="${C.SURFACE}" stroke="${C.LINE_STRONG}" stroke-width="2"/>` +
      `<g clip-path="url(#g-sceau)"><rect x="${x}" y="${y}" width="${side}" height="${side}" fill="${C.BLUE_TEXT}" mask="url(#g-guerrier)"/></g>`,
  };
}

export interface GeneralAssets {
  /** La photo de profil, déjà carrée (adresse `data:`), ou `null` : l'initiale du nom la remplace. */
  avatar: string | null;
  /** Le guerrier du logo en masque (adresse `data:`), ou `null` sans logo : voir `WarriorAssets`. */
  warriorMask: string | null;
}

/** Ce qui écrit : les tracés et les largeurs, et, si elle le dit, ce que la police sait dessiner (les pseudos des Gaulois). */
export type GeneralFonts = Pick<GazetteFonts, "paths" | "width"> & Partial<Pick<GazetteFonts, "draws">>;

const layoutOf = (image: GeneralImage, fonts: GeneralFonts, seal: boolean): GeneralLayout => generalLayout(image, fonts.width, seal, fonts.draws ? (char) => fonts.draws?.(char, "body") ?? true : undefined);

function svgOf(image: GeneralImage, layout: GeneralLayout, fonts: GeneralFonts, assets: GeneralAssets): string {
  const text = (item: CardText) => fonts.paths(item);
  const table = tableSvg(GENERAL_WIDTH, GENERAL_HEIGHT);
  const face = avatarSvg(assets.avatar, initialOf(image.name), text);
  const seal = sealSvg(assets.warriorMask);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${GENERAL_WIDTH}" height="${GENERAL_HEIGHT}" viewBox="0 0 ${GENERAL_WIDTH} ${GENERAL_HEIGHT}">` +
    `<defs>${table.defs}` +
    layout.decor.defs +
    face.defs +
    seal.defs +
    `</defs>` +
    table.body +
    layout.decor.body +
    layout.tiles.map((tile) => iconSvg(tile.icon)).join("") +
    layout.marks.map((mark) => `<rect x="${n(mark.x)}" y="${n(mark.y)}" width="${n(mark.width)}" height="${n(mark.height)}" fill="${mark.color}"/>`).join("") +
    face.body +
    seal.body +
    [...layout.texts, ...layout.extras, ...layout.pseudos, ...layout.name].map(text).join("") +
    `</svg>`
  );
}

/**
 * Le dessin entier, en SVG, sans les Gaulois, qui sont posés sur le PNG (`renderGeneral`) : leur place et leurs pseudos y
 * sont. Se teste sans fichier : `fonts` peut être remplacé par ce qui écrit des tracés.
 */
export function generalSvg(image: GeneralImage, fonts: GeneralFonts, assets: GeneralAssets): string {
  return svgOf(image, layoutOf(image, fonts, assets.warriorMask !== null), fonts, assets);
}

/* ---------- Le PNG ---------- */

/** Dessine l'image en PNG. `avatar` : la photo de profil telle que Discord la donne, ou `null` pour l'initiale du nom. */
export async function renderGeneral(image: GeneralImage, fonts: GazetteFonts, warrior: WarriorAssets, avatar: Buffer | null): Promise<Buffer> {
  let face: string | null = null;
  if (avatar) {
    try {
      face = await avatarDataUri(avatar, PLAQUE);
    } catch {
      // Une photo illisible ne retient pas l'image : l'initiale la remplace.
      face = null;
    }
  }
  const assets = { ...(await warrior.load()), avatar: face };
  const layout = layoutOf(image, fonts, assets.warriorMask !== null);
  // Les Gaulois, case par case et sans lissage, par-dessus le dessin.
  return sharp(Buffer.from(svgOf(image, layout, fonts, assets)))
    .composite(spriteLayers(layout.gaulois, GENERAL_WIDTH, GENERAL_HEIGHT))
    .png({ compressionLevel: 9 })
    .toBuffer();
}

/** La place d'un Gaulois posé, en pixels : pour les tests. */
export const gauloisRect = spriteRect;
