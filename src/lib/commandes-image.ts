/**
 * Les images des commandes du robot sur Discord (docs/DIRECTION.md, « Les commandes du robot ») : /records, /carte, /guide
 * et /rival. Le même dessin que les autres images du robot (`salon-image.ts`) ; elles se dessinent à la construction du site
 * (`src/pages/commandes/[nom].png.ts`), et la fonction `code-discord` ne fait que les montrer. Rien n'est recalculé ici :
 * chaque chiffre vient d'un calcul déjà publié sur le site, et chaque phrase du guide, de son chapitre.
 * Ce fichier dit quoi écrire et où ; il se teste sans police.
 */
import { fmtCount, fmtDateTime, fmtDec1, fmtGap, fmtInt, fmtPct, fmtRank, fmtScore, NO_DATA } from "./format";
import { CARD_COLORS as C, type CardFont, type CardRect, type CardText, type GazetteCard, type Measure } from "./gazette-image";
import type { ClanFigures } from "./compare";
import type { FaceOff } from "./games";
import { morceauxGras } from "./guide";
import { POSTE } from "./guide-clan";
import { RECORD_KEYS } from "./records-battus";
import { RECORD_KICKER, RECORD_LABELS, recordCollected, recordMark, recordScope } from "./records-discord";
import type { ClanRecords } from "./results";
import { shownAddress } from "./salon-discord";
import { assembleCard, CARD_MARGIN, CARD_WIDTH, factParts, factsCard, FOOTER_HEIGHT, footParts, headParts, type CardFact } from "./salon-image";
import { OPENFRONT_CREDIT } from "./victoires-discord";

const CONTENT_WIDTH = CARD_WIDTH - 2 * CARD_MARGIN;

/* ---------- /records ---------- */

/** Les records du clan, ceux de la page Records : la marque et la date de chacun. */
export function recordsCard(records: ClanRecords, tag: string, siteUrl: string, archiveStart: string, coveredUntil: string, measure: Measure): GazetteCard {
  return factsCard(
    {
      kicker: RECORD_KICKER,
      title: `Les records de [${tag}]`,
      period: recordScope(archiveStart),
      facts: RECORD_KEYS.map((key) => ({ label: RECORD_LABELS[key], value: recordMark(key, records), detail: null })),
      address: shownAddress(siteUrl, "/records"),
      note: recordCollected(coveredUntil),
    },
    measure,
  );
}

export function recordsImageAlt(records: ClanRecords, tag: string, archiveStart: string, coveredUntil: string): string {
  const lines = RECORD_KEYS.map((key) => `${RECORD_LABELS[key]} : ${recordMark(key, records)}.`);
  return [`Les records de [${tag}].`, ...lines, `${RECORD_KICKER}. ${recordScope(archiveStart)}. ${recordCollected(coveredUntil)}.`].join(" ").slice(0, 1024);
}

/* ---------- /rival ---------- */

/** Ce que la page Nos rivaux écrit sous le comparateur, mot pour mot. */
export const RATE_NOTE = "Un taux dépend surtout du format et du nombre de joueurs : il ne dit pas qui joue le mieux.";
export const RIVAL_KICKER = "Classement officiel des clans, sur 90 jours";

const both = (mine: ClanFigures, theirs: ClanFigures, value: (f: ClanFigures) => string) => `[${mine.tag}] ${value(mine)}, [${theirs.tag}] ${value(theirs)}`;
const perGame = (f: ClanFigures) => (f.playersPerGame === null ? NO_DATA : fmtDec1(f.playersPerGame));

/** Les faits du comparateur de clans, dans le même ordre et avec les mêmes calculs (`compare.ts`, `ClanCompare.tsx`). */
export function rivalFacts(mine: ClanFigures, theirs: ClanFigures, faceOff: FaceOff | null): CardFact[] {
  const facts: CardFact[] = [
    { label: "Rang", value: both(mine, theirs, (f) => fmtRank(f.rank)), detail: null },
    { label: "Score", value: both(mine, theirs, (f) => fmtScore(f.score)), detail: `${fmtGap(mine.score - theirs.score)} pour [${mine.tag}]` },
    { label: "Parties", value: both(mine, theirs, (f) => fmtInt(f.games)), detail: null },
    { label: "Taux de victoire", value: both(mine, theirs, (f) => fmtPct(f.rate)), detail: null },
    { label: "Joueurs du clan par partie", value: both(mine, theirs, perGame), detail: null },
  ];
  if (faceOff) {
    // Les mots du comparateur (`ClanCompare.tsx`) : c'est l'équipe qui gagne, dont le clan peut n'être qu'une partie.
    facts.push({
      label: `Face-à-face, sur ${fmtCount(faceOff.meetings, "partie")} dont le détail est lu`,
      value: `L'équipe de [${mine.tag}] gagne ${fmtInt(faceOff.ours)} fois, celle de [${theirs.tag}] ${fmtInt(faceOff.theirs)} fois, une autre équipe ${fmtInt(faceOff.others)} fois`,
      detail: null,
    });
  }
  return facts;
}

/** Les faits du comparateur, puis, sur sa propre ligne pour être lue en entier, la réserve sur le taux. */
export function rivalCard(mine: ClanFigures, theirs: ClanFigures, faceOff: FaceOff | null, listedAt: string, siteUrl: string, measure: Measure): GazetteCard {
  const address = shownAddress(siteUrl, "/rivaux");
  const head = headParts({ kicker: RIVAL_KICKER, title: `[${mine.tag}] face à [${theirs.tag}]`, period: `Liste arrêtée au ${fmtDateTime(listedAt)}` }, measure, address);
  const facts = factParts(rivalFacts(mine, theirs, faceOff), head.bottom, measure);
  const note: CardText = { ...fittedLine(RATE_NOTE, "body", 24, 16, CONTENT_WIDTH, measure), x: CARD_MARGIN, y: facts.bottom + 40, font: "body", color: C.MUTED };
  const height = facts.bottom + 56 + FOOTER_HEIGHT;
  return assembleCard(height, [
    head,
    facts,
    { rects: [], texts: [note] },
    footParts(address, "", height, measure),
  ]);
}

export function rivalImageAlt(mine: ClanFigures, theirs: ClanFigures, faceOff: FaceOff | null, listedAt: string): string {
  const lines = rivalFacts(mine, theirs, faceOff).map((f) => `${f.label} : ${f.value}${f.detail ? ` (${f.detail})` : ""}.`);
  return [`[${mine.tag}] face à [${theirs.tag}]. ${RIVAL_KICKER}, liste arrêtée au ${fmtDateTime(listedAt)}.`, ...lines, RATE_NOTE].join(" ").slice(0, 1024);
}

/* ---------- /carte ---------- */

export interface MapFacts {
  /** La place de GAL sur la carte, au nombre de pixels : ce n'est pas le classement des clans. */
  rank: number;
  clans: number;
  pixels: number;
  /** L'heure de l'image : celle de son dernier événement. */
  at: string;
  /** La couleur de GAL sur la carte, en « #rrggbb ». */
  color: string;
}

/** La taille de l'image de la carte finale (`scripts/generate-clanmap.ts`), posée sur toute la largeur. */
export interface MapShape {
  width: number;
  height: number;
}

export const MAP_KICKER = "Carte des clans d'OpenFront";
export const MAP_NOTE = "Le territoire en pixels, pas le classement des clans";
/** Le crédit que demande la licence du fond de carte, écrit sur l'image : le message n'a pas de texte. */
export const MAP_CREDIT = `Carte : ${OPENFRONT_CREDIT}, CC BY-SA 4.0. Fond Giant World Map réduit et assombri, territoires dessinés par le site, même licence.`;
export const MAP_SOURCES = "github.com/openfrontio/OpenFrontIO/tree/main/resources/maps/giantworldmap · creativecommons.org/licenses/by-sa/4.0";

export interface MapCard extends GazetteCard {
  /** Où poser l'image de la carte : elle s'ajoute au dessin comme une couche (`renderGazetteCard`). */
  map: { left: number; top: number; width: number; height: number };
}

export function mapCard(facts: MapFacts, tag: string, siteUrl: string, shape: MapShape, measure: Measure): MapCard {
  const address = shownAddress(siteUrl, "/carte");
  const head = headParts({ kicker: MAP_KICKER, title: `Le territoire de [${tag}]`, period: `Image du ${fmtDateTime(facts.at)}` }, measure, address);
  const map = { left: CARD_MARGIN, top: head.bottom, width: CONTENT_WIDTH, height: Math.round((CONTENT_WIDTH * shape.height) / shape.width) };
  const legendY = map.top + map.height + 40;
  const legend: { rects: CardRect[]; texts: CardText[] } = {
    rects: [{ x: CARD_MARGIN, y: legendY - 22, width: 28, height: 28, radius: 6, color: facts.color }],
    texts: [{ text: `La couleur de [${tag}] sur la carte`, x: CARD_MARGIN + 44, y: legendY, size: 24, font: "body", color: C.MUTED }],
  };
  const factList = factParts(
    [
      { label: "Place sur la carte, au nombre de pixels", value: `${fmtRank(facts.rank)} sur ${fmtCount(facts.clans, "clan")}`, detail: null },
      { label: `Territoire de [${tag}]`, value: fmtCount(facts.pixels, "pixel"), detail: null },
    ],
    legendY + 28,
    measure,
  );
  const credit = { text: MAP_CREDIT, size: 20 };
  const sources = { text: MAP_SOURCES, size: 18 };
  const creditTexts: CardText[] = [
    { ...fittedLine(credit.text, "body", credit.size, 14, CONTENT_WIDTH, measure), x: CARD_MARGIN, y: factList.bottom + 40, font: "body", color: C.MUTED },
    { ...fittedLine(sources.text, "body", sources.size, 12, CONTENT_WIDTH, measure), x: CARD_MARGIN, y: factList.bottom + 70, font: "body", color: C.MUTED },
  ];
  const height = factList.bottom + 70 + FOOTER_HEIGHT;
  const card = assembleCard(height, [
    head,
    { rects: [{ x: map.left, y: map.top, width: map.width, height: map.height, radius: 0, color: C.SURFACE }], texts: [] },
    legend,
    factList,
    { rects: [], texts: creditTexts },
    footParts(address, MAP_NOTE, height, measure),
  ]);
  return { ...card, map };
}

export function mapImageAlt(facts: MapFacts, tag: string): string {
  return [
    `Le territoire de [${tag}] sur la carte des clans d'OpenFront, image du ${fmtDateTime(facts.at)} : ${fmtRank(facts.rank)} sur ${fmtCount(facts.clans, "clan")} au nombre de pixels, avec ${fmtCount(facts.pixels, "pixel")}.`,
    `${MAP_NOTE}.`,
    MAP_CREDIT,
  ].join(" ");
}

/**
 * Un texte sur une ligne, réduit pour tenir. Les adresses du crédit ne se coupent jamais : à la plus petite taille, elles
 * débordent plutôt que de perdre leur fin, et un test vérifie qu'elles tiennent.
 */
function fittedLine(text: string, font: CardFont, size: number, minSize: number, maxWidth: number, measure: Measure): { text: string; size: number } {
  for (let s = size; s >= minSize; s--) if (measure(text, font, s) <= maxWidth) return { text, size: s };
  return { text, size: minSize };
}

/* ---------- /guide ---------- */

export interface GuideChapter {
  /** Le nom du fichier, sans « .md » : « 03-attaque ». */
  id: string;
  order: number;
  title: string;
  court: string;
  chapeau?: string | undefined;
  essentiel: readonly string[];
  /** Le bloc du chapitre : un essai à faire sur le site, ou des repères (`points`). */
  bloc?: string | undefined;
  blocTitre?: string | undefined;
  blocTexte?: string | undefined;
  points: readonly { titre: string; texte: string; marque?: string | undefined }[];
  retenir?: { titre: string; texte: string } | undefined;
  /** Un aide-mémoire, dont tout est dans un tableau du texte : il n'a pas d'image, et /guide ne le propose pas. */
  ouvert: boolean;
}

export const GUIDE_KICKER = "Guide du clan";
const GUIDE_TEXT = { size: 28, line: 38, pad: 24, gap: 14 } as const;

interface Segment {
  text: string;
  font: CardFont;
  color: string;
}

/**
 * Des morceaux de texte, gras compris, posés en lignes qui tiennent dans `width` : un mot ne se coupe jamais, et les mots
 * voisins de même police restent un seul texte. `bottom` : la ligne de base de la dernière ligne.
 */
export function paragraph(segments: readonly Segment[], x: number, firstBaseline: number, width: number, size: number, lineHeight: number, measure: Measure): { texts: CardText[]; bottom: number } {
  const texts: CardText[] = [];
  let line: Segment[] = [];
  let used = 0;
  let baseline = firstBaseline;
  const flush = () => {
    let left = x;
    for (const part of line) {
      const text = part.text.trimEnd();
      if (text !== "") texts.push({ text, x: left, y: baseline, size, font: part.font, color: part.color });
      left += measure(part.text, part.font, size);
    }
    line = [];
    used = 0;
  };
  for (const segment of segments) {
    for (const word of segment.text.split(/(?<=\s)/)) {
      const ink = measure(word.trimEnd(), segment.font, size);
      if (line.length > 0 && used + ink > width) {
        flush();
        baseline += lineHeight;
      }
      if (line.length === 0 && word.trim() === "") continue;
      const last = line.at(-1);
      if (last && last.font === segment.font && last.color === segment.color) last.text += word;
      else line.push({ text: word, font: segment.font, color: segment.color });
      used += measure(word, segment.font, size);
    }
  }
  if (line.length > 0) flush();
  return { texts, bottom: baseline };
}

/** Une phrase du guide en morceaux : le gras en police forte, le reste en texte courant. */
const segmentsOf = (phrase: string, color: string): Segment[] => morceauxGras(phrase).map((m) => ({ text: m.texte, font: m.gras ? "strong" : "body", color }));

/** Le texte d'une phrase du guide, sans la marque du gras, pour la description de l'image. */
export const plainPhrase = (phrase: string): string => morceauxGras(phrase).map((m) => m.texte).join("");

/**
 * Les valeurs que la page écrit sous chaque repère du poste de défense (`GuideBloc.astro`), dans l'ordre de ses lignes :
 * portée, pertes, vitesse. En mots : le pilote lit « multipliées par 5 », pas « ×5 ».
 */
export const POSTE_EN_MOTS = [`${POSTE.portee} tuiles`, `multipliées par ${POSTE.pertes}`, `multiplié par ${POSTE.vitesse}`] as const;

/** Le titre d'un repère, avec sa valeur s'il en a une, et ce qui le sépare de sa phrase : rien après un « ? ». */
function pointHead(chapter: GuideChapter, index: number): string {
  const point = chapter.points[index];
  const valeur = chapter.bloc === "poste" ? POSTE_EN_MOTS[index] : undefined;
  const titre = valeur ? `${point?.titre}, ${valeur}` : (point?.titre ?? "");
  return titre.endsWith("?") ? `${titre} ` : `${titre} : `;
}

/** Une phrase terminée par un point, sans en ajouter un second. */
const withPeriod = (text: string): string => (/[.!?…]$/.test(text.trim()) ? text.trim() : `${text.trim()}.`);

/** Un repère du bloc, comme sur la page : son titre en gras, sa phrase, et sa conséquence entre parenthèses s'il en a une. */
const pointSegments = (chapter: GuideChapter, index: number): Segment[] => {
  const point = chapter.points[index];
  return [
    { text: pointHead(chapter, index), font: "strong", color: C.WHITE },
    ...segmentsOf(point?.texte ?? "", C.WHITE),
    ...(point?.marque ? [{ text: ` (${point.marque})`, font: "strong" as const, color: C.BLUE_TEXT }] : []),
  ];
};

/**
 * Un chapitre du guide : son nom, sa phrase d'entrée, l'essentiel en cases, le bloc (ses repères, ou l'essai à faire sur le
 * site), puis l'encadré. Chaque phrase est celle du chapitre.
 */
export function guideCard(chapter: GuideChapter, siteUrl: string, measure: Measure): GazetteCard {
  const t = GUIDE_TEXT;
  const inner = CONTENT_WIDTH - 2 * t.pad;
  const rects: CardRect[] = [];
  const texts: CardText[] = [];
  const address = shownAddress(siteUrl, "/debuter");
  const head = headParts({ kicker: `${GUIDE_KICKER}, chapitre ${chapter.order}`, title: chapter.court, period: chapter.chapeau ?? chapter.title }, measure, address);
  let top = head.bottom;
  /** Une case de texte sur toute la largeur ; `accent` : celle de l'encadré, plus claire, avec un trait bleu à gauche. */
  const box = (segments: readonly Segment[], accent = false) => {
    const indent = accent ? 8 : 0;
    const body = paragraph(segments, CARD_MARGIN + t.pad + indent, top + t.pad + t.size - 4, inner - indent, t.size, t.line, measure);
    const height = body.bottom - top + t.pad + 8;
    rects.push(accent ? { x: CARD_MARGIN, y: top, width: CONTENT_WIDTH, height, radius: 8, color: C.SURFACE_2, stroke: C.LINE_STRONG } : { x: CARD_MARGIN, y: top, width: CONTENT_WIDTH, height, radius: 8, color: C.SURFACE, stroke: C.LINE });
    if (accent) rects.push({ x: CARD_MARGIN, y: top, width: 8, height, radius: 0, color: C.BLUE });
    texts.push(...body.texts);
    top += height + t.gap;
  };
  /** Une ligne sans case, entre deux groupes : le titre du bloc, ou l'essai à faire sur le site. */
  const line = (segments: readonly Segment[]) => {
    const body = paragraph(segments, CARD_MARGIN, top + t.size + 6, CONTENT_WIDTH, t.size, t.line, measure);
    texts.push(...body.texts);
    top = body.bottom + 18;
  };
  for (const phrase of chapter.essentiel) box(segmentsOf(phrase, C.WHITE));
  if (chapter.points.length > 0) {
    if (chapter.blocTitre) line([{ text: chapter.blocTitre, font: "strong", color: C.BLUE_TEXT }]);
    if (chapter.blocTexte) box(segmentsOf(chapter.blocTexte, C.WHITE));
    chapter.points.forEach((_, index) => box(pointSegments(chapter, index)));
  } else if (chapter.blocTitre) {
    line([
      { text: "À essayer sur le site : ", font: "strong", color: C.BLUE_TEXT },
      { text: chapter.blocTitre, font: "body", color: C.MUTED },
    ]);
    if (chapter.blocTexte) box(segmentsOf(chapter.blocTexte, C.WHITE));
  }
  if (chapter.retenir) box([{ text: `${chapter.retenir.titre} : `, font: "strong", color: C.BLUE_TEXT }, ...segmentsOf(chapter.retenir.texte, C.WHITE)], true);
  const height = top - t.gap + FOOTER_HEIGHT;
  return assembleCard(height, [
    head,
    { rects, texts },
    // Le titre complet en bas, sauf s'il est déjà écrit en haut, à la place d'une phrase d'entrée : rien alors.
    footParts(address, chapter.chapeau ? chapter.title : "", height, measure),
  ]);
}

export function guideImageAlt(chapter: GuideChapter): string {
  const parts = [`${GUIDE_KICKER}, chapitre ${chapter.order} : ${chapter.title}.`];
  if (chapter.chapeau) parts.push(chapter.chapeau);
  parts.push(...chapter.essentiel.map(plainPhrase));
  if (chapter.points.length > 0) {
    if (chapter.blocTitre) parts.push(`${chapter.blocTitre} :`);
    if (chapter.blocTexte) parts.push(withPeriod(plainPhrase(chapter.blocTexte)));
    parts.push(...chapter.points.map((p, index) => (p.marque ? `${pointHead(chapter, index)}${withPeriod(`${plainPhrase(p.texte)} (${p.marque})`)}` : `${pointHead(chapter, index)}${withPeriod(plainPhrase(p.texte))}`)));
  } else if (chapter.blocTitre) {
    parts.push(`À essayer sur le site : ${withPeriod(chapter.blocTitre)}`);
    if (chapter.blocTexte) parts.push(withPeriod(plainPhrase(chapter.blocTexte)));
  }
  if (chapter.retenir) parts.push(`${chapter.retenir.titre} : ${withPeriod(plainPhrase(chapter.retenir.texte))}`);
  return parts.join(" ").slice(0, 1024);
}
