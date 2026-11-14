/**
 * L'image de la semaine, dessinée par le robot pour le message Discord, et le dessin commun à toutes ses images.
 *
 * Deux temps : `gazetteCard` décide quoi écrire et où, à partir de l'édition seule, et se teste sans police.
 * `renderGazetteCard` la dessine : chaque lettre devient un tracé, pour ne pas dépendre des polices de la machine.
 * Tout vient de l'édition. Ce qui manque n'est pas dessiné, jamais remplacé par un zéro.
 *
 * Les images ont l'allure du site, « le poste de commandement » de docs/DESIGN.md : la table des cartes la nuit (l'encre,
 * une croix toutes les quatre cases, des coins assombris), l'invite de la machine au-dessus du titre, celle de la page où
 * mène le bouton (`gal@clan:~/actu$ ./gazette`), le titre dans l'onciale de cases avec sa lettrine rouge, les chiffres clés
 * comme des instruments, et des coins nets. Le pilote l'a demandé le 12 novembre 2026, le soir où le site a pris ce style :
 * « remettre les alertes etc. webhooks au design du jour du site ».
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { create, type Font } from "fontkit";
import sharp, { type OverlayOptions } from "sharp";
import { brandFile } from "./brand";
import { fmtCount, fmtDay, fmtInt, fmtPct, fmtPoints, fmtRank } from "./format";
import { AUCUN_GAULOIS, type GauloisParJoueur } from "./gaulois-joueurs";
import { BUST_CUT, placeSprite, spriteLayers, tenueOf, type SpritePlacement } from "./gaulois-sprite";
import { comparisonSentence, DATA_SOURCE, playersPeriod, PODIUM_METHOD, rankWords, type GazetteEdition, weekLabel } from "./gazette";
import { invite } from "./nav";
import { POLICES_ONCIALE, policeOnciale } from "./police/fabrique";
import { LETTRINE_TITRE, lettrineDe } from "./police/largeur";
import type { WeekPlayer } from "./week-players";

const WIDTH = 1200;
const HEIGHT = 784;
/** Le bord de chaque image. */
export const MARGIN = 36;

/** Les jetons de `docs/DESIGN.md` : l'encre du poste de commandement. */
const NAVY = "#050B1F";
const SURFACE = "#0A1433";
const SURFACE_2 = "#13214D";
const LINE = "#1B2B5E";
const LINE_STRONG = "#5469AE";
const BLUE = "#0B5FFF";
const BLUE_TEXT = "#9DBCFF";
const RED = "#FF1A2E";
/** Le rouge plein, sous un texte blanc (5,3:1) : le bouton principal du thème rouge de la Direction. Le rouge vif n'y suffit pas. */
const RED_FILL = "#D4132F";
const MUTED = "#C0C9E2";
const WHITE = "#FFFFFF";
const LOSS = "#D9742E";
/** Le texte secondaire posé sur une scène colorée (`--stage-muted`). */
const STAGE_MUTED = "#DBE2F7";
/** Le filet qui sépare deux groupes posés sur le décor (`--hairline`). */
const HAIRLINE = "rgba(255,255,255,0.18)";

/** Les mêmes couleurs, pour les autres images du robot. `WIN` : le bleu des victoires dans les graphiques. */
export const CARD_COLORS = { NAVY, SURFACE, SURFACE_2, LINE, LINE_STRONG, BLUE, BLUE_TEXT, RED, RED_FILL, MUTED, WHITE, LOSS, WIN: "#4C86F5", STAGE_MUTED, HAIRLINE } as const;

/** Les scènes du site, en dégradé : le bleu royal (`.stage-blue`) et l'indigo (`.stage-indigo`). */
export const STAGES = {
  blue: { color: "#0F46C4", to: "#0B2169" },
  indigo: { color: "#2A2B8C", to: "#12174F" },
} as const;

/**
 * `cases` : l'onciale de cases des grands titres et des chiffres clés, chaque case visible ; `onciale` : la même, taillée, pour
 * les rangs, les badges et les chiffres moyens. `mono` et `monoStrong` : la chasse fixe de la machine (invite, libellés,
 * adresse). `title` et `name` : les capitales d'Outfit, celles des images de bienvenue (`arrivees-image.ts`) ; `name` est
 * relayée par Inter pour le cyrillique et le grec. Le texte courant et les pseudos restent en Inter (`body`, `strong`).
 */
export type CardFont = "title" | "strong" | "body" | "mono" | "monoStrong" | "name" | "cases" | "onciale";

export interface CardText {
  text: string;
  x: number;
  /** La ligne de base. */
  y: number;
  size: number;
  font: CardFont;
  color: string;
  anchor?: "start" | "middle" | "end";
  /** Une lueur bleue autour du texte, comme les chiffres clés du site. */
  glow?: boolean;
  /** La couleur de la lettrine : la première lettre agrandie de `LETTRINE_TITRE`, comme le titre d'une page du site. */
  lettrine?: string;
  /** L'approche, en em : les libellés de la machine, en capitales, s'écrivent un peu espacés. */
  tracking?: number;
}

export interface CardRect {
  x: number;
  y: number;
  width: number;
  height: number;
  radius: number;
  color: string;
  /** Un dégradé à 135°, de `color` à cette couleur, comme les scènes du site. */
  to?: string;
  /** Le coin haut droit coupé de cette taille, souligné d'un trait de lumière : une scène du site, un dossier d'état-major. */
  cut?: number;
  /** Un contour de deux pixels. */
  stroke?: string;
}

export interface GazetteCard {
  width: number;
  height: number;
  rects: CardRect[];
  texts: CardText[];
  logo: { x: number; y: number; size: number };
  /** Les Gaulois du village posés sur l'image (`gaulois-sprite.ts`). Absent : aucun, l'image est celle d'avant. */
  gaulois?: SpritePlacement[];
}

/** La largeur d'un texte : donnée par la vraie police au dessin, et par une approximation dans les tests. */
export type Measure = (text: string, font: CardFont, size: number) => number;

/** Réduit un texte pour qu'il tienne, puis le coupe s'il dépasse encore à la plus petite taille. */
export function fitted(text: string, font: CardFont, size: number, minSize: number, maxWidth: number, measure: Measure): { text: string; size: number } {
  for (let s = size; s >= minSize; s--) if (measure(text, font, s) <= maxWidth) return { text, size: s };
  let cut = [...text];
  while (cut.length > 1 && measure(`${cut.join("")}…`, font, minSize) > maxWidth) cut = cut.slice(0, -1);
  return { text: `${cut.join("")}…`, size: minSize };
}

/** Ce que la lettrine agrandit au début d'un texte : sa première lettre, avec la ponctuation qui la touche. Rien s'il commence par un signe. */
export function lettrineOf(text: string): string {
  return /^\p{L}/u.test(text) ? lettrineDe(text) : "";
}

/** La largeur d'un texte tel qu'il se dessine : sa lettrine et son approche comprises. */
export function drawnWidth(item: Pick<CardText, "text" | "font" | "size" | "lettrine" | "tracking">, measure: Measure): number {
  const head = item.lettrine ? lettrineOf(item.text) : "";
  const rest = item.text.slice(head.length);
  let width = measure(rest, item.font, item.size) + (head ? measure(head, item.font, item.size * LETTRINE_TITRE) : 0);
  if (item.tracking) width += item.tracking * item.size * Math.max(0, [...item.text].length - 1);
  return width;
}

/** Comme `fitted`, pour un texte avec sa lettrine ou son approche. */
export function fittedDrawn(item: Pick<CardText, "text" | "font" | "lettrine" | "tracking">, size: number, minSize: number, maxWidth: number, measure: Measure): { text: string; size: number } {
  const width: Measure = (text, font, s) => drawnWidth({ ...item, text, font, size: s }, measure);
  return fitted(item.text, item.font, size, minSize, maxWidth, width);
}

/**
 * Un pseudo sur une ligne si possible, un peu réduit au besoin. Sinon sur deux lignes, coupé à un point, un espace ou un tiret.
 * En dernier recours, coupé là où la ligne s'arrête, et la fin remplacée par des points de suspension.
 */
function nameLines(name: string, font: CardFont, size: number, maxWidth: number, measure: Measure): { lines: string[]; size: number } {
  const smallest = size - 7;
  for (let s = size; s >= smallest; s--) if (measure(name, font, s) <= maxWidth) return { lines: [name], size: s };
  const chars = [...name];
  for (let s = size; s >= smallest; s--) {
    for (let i = chars.length - 1; i > 0; i--) {
      if (!/[.\s_-]/.test(chars[i] ?? "")) continue;
      const first = chars.slice(0, i).join("").trim();
      const second = chars.slice(i).join("").trim();
      if (first && second && measure(first, font, s) <= maxWidth && measure(second, font, s) <= maxWidth) return { lines: [first, second], size: s };
    }
  }
  let split = chars.length - 1;
  while (split > 1 && measure(chars.slice(0, split).join(""), font, smallest) > maxWidth) split--;
  const rest = fitted(chars.slice(split).join("").trim(), font, smallest, smallest, maxWidth, measure);
  return { lines: [chars.slice(0, split).join("").trim(), rest.text], size: smallest };
}

/* ---------- Les morceaux communs à toutes les images ---------- */

/** Les rectangles et les textes d'un morceau d'image. */
export interface CardParts {
  rects: CardRect[];
  texts: CardText[];
  /** Les Gaulois du village de ce morceau. Absent : aucun. */
  gaulois?: SpritePlacement[];
}

/** Le badge du clan, en haut à gauche de chaque image, et la colonne de l'en-tête à sa droite. */
export const LOGO = { x: MARGIN, y: 30, size: 104 } as const;
export const HEAD_X = LOGO.x + LOGO.size + 28;
/** Les lignes de l'en-tête : la bande tricolore, l'invite, le titre, ce que l'image compte, sa période. */
const HEAD = { tribar: 30, invite: 64, title: 134, kicker: 38, period: 34, after: 24 } as const;
const INVITE_SIZE = 21;
const TITLE_SIZE = 52;

/** Le filet tricolore repris de la bande du logo (`.tribar`), au-dessus de l'invite. */
function tribar(x: number, y: number): CardRect[] {
  const segment = 30;
  return [BLUE, WHITE, RED].map((color, i) => ({ x: x + i * (segment + 3), y, width: segment, height: 5, radius: 0, color }));
}

/**
 * L'invite du poste de commandement, comme au-dessus du titre de la page `path` : `gal@clan:~/actu$ ./gazette`, puis le
 * curseur rouge, qui ne clignote pas. Décorative : elle ne dit que la page où mène le bouton du message.
 */
export function promptParts(path: string, x: number, y: number, size: number, measure: Measure): CardParts {
  const { dossier, commande } = invite(path);
  const parts: { text: string; font: CardFont; color: string }[] = [
    { text: "gal@clan", font: "monoStrong", color: BLUE_TEXT },
    { text: `:${dossier}$ `, font: "mono", color: MUTED },
    { text: `./${commande}`, font: "mono", color: WHITE },
  ];
  const texts: CardText[] = [];
  let at = x;
  for (const part of parts) {
    texts.push({ ...part, x: at, y, size });
    at += measure(part.text, part.font, size);
  }
  return { rects: [{ x: Math.round(at + size * 0.4), y: Math.round(y - size * 0.92), width: Math.round(size * 0.6), height: Math.round(size * 1.15), radius: 0, color: RED }], texts };
}

export interface PageHead {
  /** La page du site où mène l'image : son invite s'écrit au-dessus du titre, comme sur cette page. */
  path: string;
  title: string;
  /** Ce que l'image compte, sous le titre. */
  kicker?: string | null;
  /** Sa couleur : le bleu des liens, ou l'orange d'une place perdue. */
  kickerColor?: string;
  /** La période, ou l'heure du relevé. */
  period?: string | null;
  /** Le titre est un pseudo : en Inter, qui sait écrire le cyrillique, et sans lettrine (un nom s'écrit tel quel). */
  name?: boolean;
}

/**
 * L'en-tête d'une image, comme le haut d'une page du site : la bande tricolore, l'invite, le titre en onciale de cases et sa
 * lettrine rouge, puis ce que l'image compte, en bleu, et sa période. Le badge du clan se pose à gauche. `right` : la place
 * gardée à droite du titre, pour un badge. `bottom` : le haut du contenu.
 */
export function pageHead(head: PageHead, measure: Measure, right = 0): CardParts & { bottom: number } {
  const x = HEAD_X;
  const room = WIDTH - MARGIN - x;
  const prompt = promptParts(head.path, x, HEAD.invite, INVITE_SIZE, measure);
  const texts: CardText[] = [...prompt.texts];
  if (head.name) texts.push({ ...fitted(head.title, "strong", TITLE_SIZE + 6, 32, room - right, measure), x, y: HEAD.title, font: "strong", color: WHITE });
  else {
    const lettrine = lettrineOf(head.title) ? RED : undefined;
    texts.push({ ...fittedDrawn({ text: head.title, font: "cases", lettrine }, TITLE_SIZE, 32, room - right, measure), x, y: HEAD.title, font: "cases", color: WHITE, lettrine });
  }
  let y = HEAD.title;
  if (head.kicker) {
    y += HEAD.kicker;
    texts.push({ ...fitted(head.kicker, "strong", 26, 19, room, measure), x, y, font: "strong", color: head.kickerColor ?? BLUE_TEXT });
  }
  if (head.period) {
    y += HEAD.period;
    texts.push({ ...fitted(head.period, "body", 24, 17, room, measure), x, y, font: "body", color: MUTED });
  }
  return { rects: [...tribar(x, HEAD.tribar), ...prompt.rects], texts, bottom: y + HEAD.after };
}

/** L'adresse d'une page, sans « https:// », telle que l'image l'écrit : son chemin donne l'invite. */
export const pathOf = (address: string) => {
  const slash = address.indexOf("/");
  return slash < 0 ? "/" : address.slice(slash);
};

/** Le bas d'une image : l'adresse du site en chasse fixe, à gauche, et la note à droite, réduite pour tenir à côté. */
export function pageFoot(address: string, note: string, baseline: number, measure: Measure, width = WIDTH): CardParts {
  const size = 24;
  const texts: CardText[] = [{ text: address, x: MARGIN, y: baseline, size, font: "monoStrong", color: BLUE_TEXT }];
  if (note) texts.push({ ...fitted(note, "body", 22, 15, width - 2 * MARGIN - measure(address, "monoStrong", size) - 28, measure), x: width - MARGIN, y: baseline, font: "body", color: MUTED, anchor: "end" });
  return { rects: [], texts };
}

export interface Kpi {
  /** En capitales, dans la voix de la machine, au-dessus du chiffre. */
  label: string;
  value: string;
  /** Sous le chiffre : ce qu'il compte, ou son écart, dans sa couleur. */
  hint?: { text: string; color?: string; strong?: boolean } | null;
}

/** La hauteur d'un chiffre clé, de son libellé au bas de sa ligne d'explication, ou de son chiffre s'il n'en a pas. */
export const kpiHeight = (valueSize: number, withHint = true) => Math.round(36 + valueSize * 0.72 + (withHint ? 54 : 16));

/**
 * Des chiffres clés côte à côte, comme ceux du site : un filet à gauche avec son repère blanc en haut, le libellé de la machine
 * en capitales, le chiffre en onciale de cases avec sa lueur bleue, puis ce qu'il compte. Sans case : ils se posent sur le décor.
 */
export function kpiParts(kpis: readonly Kpi[], box: { x: number; y: number; width: number; gap?: number; valueSize?: number; minValueSize?: number; muted?: string }, measure: Measure): CardParts & { bottom: number } {
  const { x, y, width, gap = 24, valueSize = 80, minValueSize = 40, muted = MUTED } = box;
  const rects: CardRect[] = [];
  const texts: CardText[] = [];
  const columnWidth = (width - (kpis.length - 1) * gap) / kpis.length;
  const height = kpiHeight(valueSize, kpis.some((kpi) => kpi.hint));
  const tracked: Measure = (text, font, size) => drawnWidth({ text, font, size, tracking: 0.06 }, measure);
  kpis.forEach((kpi, i) => {
    const left = x + i * (columnWidth + gap);
    rects.push({ x: left, y, width: 2, height, radius: 0, color: HAIRLINE }, { x: left, y, width: 2, height: 26, radius: 0, color: WHITE });
    const inner = left + 22;
    const room = columnWidth - 26;
    texts.push({ ...fitted(kpi.label.toLocaleUpperCase("fr"), "monoStrong", 23, 15, room, tracked), x: inner, y: y + 21, font: "monoStrong", color: muted, tracking: 0.06 });
    const value = fitted(kpi.value, "cases", valueSize, minValueSize, room, measure);
    const valueBaseline = Math.round(y + 36 + valueSize * 0.72 + 4);
    texts.push({ ...value, x: inner, y: valueBaseline, font: "cases", color: WHITE, glow: true });
    if (kpi.hint) {
      const font: CardFont = kpi.hint.strong ? "strong" : "body";
      texts.push({ ...fitted(kpi.hint.text, font, kpi.hint.strong ? 28 : 26, 17, room, measure), x: inner, y: valueBaseline + 42, font, color: kpi.hint.color ?? muted });
    }
  });
  return { rects, texts, bottom: y + height };
}

/* ---------- La gazette ---------- */

const signedInt = (n: number) => (n === 0 ? "autant" : `${n > 0 ? "+" : "−"}${fmtInt(Math.abs(n))}`);
const deltaColor = (n: number) => (n < 0 ? LOSS : BLUE_TEXT);

function weekStats({ totals, previous }: GazetteEdition): Kpi[] {
  const before = previous && previous.games > 0 ? previous : null;
  // L'écart se calcule sur les taux tels qu'ils s'affichent, comme sur la page.
  const shown = (rate: number) => Math.round(rate * 10) / 10;
  const rateGap = before && before.winRate !== null && totals.winRate !== null ? shown(totals.winRate) - shown(before.winRate) : null;
  const delta = (n: number) => ({ text: signedInt(n), color: deltaColor(n), strong: true });
  return [
    { label: totals.wins > 1 ? "Victoires" : "Victoire", value: fmtInt(totals.wins), hint: before && delta(totals.wins - before.wins) },
    { label: totals.games > 1 ? "Parties" : "Partie", value: fmtInt(totals.games), hint: before && delta(totals.games - before.games) },
    {
      label: "Taux de victoire",
      value: fmtPct(totals.winRate),
      hint: rateGap === null ? null : { text: rateGap === 0 ? "autant" : fmtPoints(rateGap).replace(/\s*points?$/, " pts"), color: deltaColor(rateGap), strong: true },
    },
  ];
}

interface InfoRow {
  label: string;
  value: string;
  /** `short` remplace `text` s'il ne reste pas assez de place à côté de l'étiquette. */
  detail: { text: string; short?: string; color: string } | null;
}

function infoRows({ standing, territory, arrivals }: GazetteEdition): InfoRow[] {
  const rows: InfoRow[] = [];
  if (territory?.end.final) {
    const { start, end } = territory;
    // Un écart depuis un relevé fait dans la journée serait démenti par le film suivant, et l'image ne se corrige pas.
    const from = start?.final ? start : null;
    const change = from ? end.pixels - from.pixels : null;
    rows.push({
      label: `Carte, le ${fmtDay(end.date)}`,
      value: end.rank === null ? `${fmtInt(end.pixels)} pixels` : `${fmtRank(end.rank)} avec ${fmtInt(end.pixels)} pixels`,
      detail: from && change !== null ? { text: `${signedInt(change)} depuis le ${fmtDay(from.date)}`, short: signedInt(change), color: deltaColor(change) } : null,
    });
  }
  if (standing) {
    rows.push({
      label: `Classement, le ${fmtDay(standing.end.date)}`,
      value: rankWords(standing.end.rank),
      detail: { text: "officiel, sur 90 jours", color: MUTED },
    });
  }
  if (arrivals) rows.push({ label: "Arrivées", value: fmtInt(arrivals.count), detail: { text: "encore dans le clan", color: MUTED } });
  return rows;
}

/** Le côté d'une case du Gaulois posé derrière une marche du podium. */
const PODIUM_SPRITE_SCALE = 2;

/** La réserve qui accompagne toujours le podium des victoires. */
export const PODIUM_NOTE = "Compte d'abord le temps de jeu, pas le niveau.";

/**
 * Le podium des Gaulois de la semaine, dans une colonne de `width` à partir de `x` : le premier au milieu et le plus haut,
 * sur des marches posées sur `base`. Plus de trois lignes à cause d'égalités : une liste à partir de `listTop`, sans écarter
 * personne. Sert à l'image de la gazette et à celle de l'accueil. La marche du premier est une scène bleue, au coin coupé.
 * Le Gaulois d'un joueur qui a créé le sien se tient derrière sa marche, en buste, sans dépasser `ceiling` : le bas de ce qui
 * est écrit au-dessus du podium. La liste des égalités, aux lignes trop serrées, n'en porte pas.
 */
export function podiumParts(
  players: readonly WeekPlayer[],
  { x, width, base, listTop, ceiling = listTop }: { x: number; width: number; base: number; listTop: number; ceiling?: number },
  measure: Measure,
  gaulois: GauloisParJoueur = AUCUN_GAULOIS,
): CardParts {
  const rects: CardRect[] = [];
  const texts: CardText[] = [];
  const sprites: SpritePlacement[] = [];
  if (players.length <= 3) {
    // Le premier au milieu, comme sur un podium. À égalité, les marches ont la même hauteur.
    const stepGap = 10;
    const stepWidth = (width - 2 * stepGap) / 3;
    const slots = [1, 0, 2];
    const stepHeight = (place: number) => (place === 1 ? 228 : place === 2 ? 198 : 172);
    players.forEach((player, i) => {
      const slot = slots[i] ?? i;
      const stepX = x + slot * (stepWidth + stepGap);
      const height = stepHeight(player.place);
      const top = base - height;
      const first = player.place === 1;
      rects.push(first ? { x: stepX, y: top, width: stepWidth, height, radius: 6, ...STAGES.blue, cut: 18 } : { x: stepX, y: top, width: stepWidth, height, radius: 6, color: SURFACE_2, stroke: LINE });
      const center = stepX + stepWidth / 2;
      const tenue = tenueOf(gaulois, player.id);
      const sprite = tenue && placeSprite(tenue, { axis: center, bottom: top, scale: PODIUM_SPRITE_SCALE, cut: BUST_CUT, room: top - ceiling });
      if (sprite) sprites.push(sprite);
      texts.push({ text: fmtRank(player.place), x: center, y: top + 44, size: 36, font: "onciale", color: first ? WHITE : MUTED, anchor: "middle" });
      const name = nameLines(player.username, "strong", 27, stepWidth - 16, measure);
      name.lines.forEach((line, n) => texts.push({ text: line, x: center, y: top + 84 + n * 31, size: name.size, font: "strong", color: WHITE, anchor: "middle" }));
      const wins = fitted(fmtCount(player.wins, "victoire"), "body", 25, 19, stepWidth - 16, measure);
      texts.push({ ...wins, x: center, y: base - 16, font: "body", color: first ? STAGE_MUTED : MUTED, anchor: "middle" });
    });
  } else {
    // Trop d'égalités pour un podium : une liste, sans en écarter aucune. Le pseudo prend la place que laissent ses victoires.
    players.forEach((player, i) => {
      const y = listTop + i * 44;
      texts.push({ text: fmtRank(player.place), x, y, size: 28, font: "onciale", color: MUTED });
      const wins = fmtCount(player.wins, "victoire");
      const name = fitted(player.username, "strong", 28, 22, width - 70 - measure(wins, "body", 26) - 24, measure);
      texts.push({ ...name, x: x + 70, y, font: "strong", color: WHITE });
      texts.push({ text: wins, x: x + width, y, size: 26, font: "body", color: MUTED, anchor: "end" });
    });
  }
  return sprites.length > 0 ? { rects, texts, gaulois: sprites } : { rects, texts };
}

/** Quoi écrire et où. Le titre du podium dit sa période : voir `playersPeriod`. */
export function gazetteCard(edition: GazetteEdition, tag: string, siteUrl: string, measure: Measure, gaulois: GauloisParJoueur = AUCUN_GAULOIS): GazetteCard {
  const head = pageHead({ path: "/gazette", title: `La gazette de [${tag}]`, period: `Semaine ${weekLabel(edition)}` }, measure);
  const rects: CardRect[] = [...head.rects];
  const texts: CardText[] = [...head.texts];
  const sprites: SpritePlacement[] = [];

  // Les trois grands chiffres, puis d'où partent leurs écarts.
  const stats = weekStats(edition);
  const kpis = kpiParts(stats, { x: MARGIN, y: head.bottom, width: WIDTH - 2 * MARGIN, valueSize: 80 }, measure);
  rects.push(...kpis.rects);
  texts.push(...kpis.texts);
  const hasDelta = stats.some((stat) => stat.hint);
  if (hasDelta) texts.push({ text: "Écarts par rapport à la semaine d'avant", x: MARGIN, y: kpis.bottom + 30, size: 22, font: "body", color: MUTED });

  // La carte, le classement et les arrivées, à gauche. Les joueurs, à droite.
  const players: readonly WeekPlayer[] = edition.players ?? [];
  const period = playersPeriod(edition);
  const hasPlayers = players.length > 0 && period !== null;
  const columnTop = kpis.bottom + 50;
  const rows = infoRows(edition);
  const leftWidth = hasPlayers ? 556 : WIDTH - 2 * MARGIN;
  rows.forEach((row, i) => {
    const y = columnTop + i * 100;
    rects.push({ x: MARGIN, y, width: leftWidth, height: 90, radius: 8, color: SURFACE, stroke: LINE });
    // La date de l'étiquette passe d'abord : c'est le détail qui se réduit.
    texts.push({ text: row.label, x: MARGIN + 22, y: y + 34, size: 26, font: "body", color: MUTED });
    if (row.detail) {
      const room = leftWidth - 44 - measure(row.label, "body", 26) - 16;
      const shown = measure(row.detail.text, "strong", 20) <= room || !row.detail.short ? row.detail.text : row.detail.short;
      const detail = fitted(shown, "strong", 24, 19, room, measure);
      texts.push({ ...detail, x: MARGIN + leftWidth - 22, y: y + 34, font: "strong", color: row.detail.color, anchor: "end" });
    }
    const value = fitted(row.value, "onciale", 35, 24, leftWidth - 44, measure);
    texts.push({ ...value, x: MARGIN + 22, y: y + 75, font: "onciale", color: WHITE });
  });

  if (hasPlayers) {
    const x = MARGIN + leftWidth + 24;
    const width = WIDTH - MARGIN - x;
    const heading = fitted(`Le plus de victoires ${period}`, "onciale", 26, 18, width, measure);
    texts.push({ ...heading, x, y: columnTop + 24, font: "onciale", color: WHITE });
    // Un buste ne monte pas dans le titre du podium, juste au-dessus.
    const podium = podiumParts(players, { x, width, base: HEIGHT - 58, listTop: columnTop + 72, ceiling: columnTop + 34 }, measure, gaulois);
    rects.push(...podium.rects);
    texts.push(...podium.texts);
    sprites.push(...(podium.gaulois ?? []));
  }
  const foot = pageFoot(`${siteUrl.replace(/^https?:\/\//, "").replace(/\/$/, "")}/gazette`, hasPlayers ? PODIUM_NOTE : "", HEIGHT - 20, measure);
  texts.push(...foot.texts);
  return { width: WIDTH, height: HEIGHT, rects, texts, logo: LOGO, ...(sprites.length > 0 ? { gaulois: sprites } : {}) };
}

/** Ce que l'image dit, pour un lecteur d'écran : Discord le lit comme description du fichier. */
export function gazetteImageAlt(edition: GazetteEdition, tag: string): string {
  const { totals } = edition;
  const parts = [`La gazette de [${tag}], semaine ${weekLabel(edition)}.`, `${fmtCount(totals.wins, "victoire")} sur ${fmtCount(totals.games, "partie")}, soit ${fmtPct(totals.winRate)}.`];
  const comparison = comparisonSentence(edition);
  if (comparison) parts.push(comparison);
  for (const row of infoRows(edition)) {
    const sentence = `${row.label} : ${row.value}${row.detail ? `, ${row.detail.text}` : ""}`;
    parts.push(sentence.endsWith(".") ? sentence : `${sentence}.`);
  }
  const players = edition.players ?? [];
  const period = playersPeriod(edition);
  if (players.length > 0 && period) {
    const names = players.map((p) => `${p.username}, ${fmtCount(p.wins, "victoire")}`).join(" ; ");
    // Le message n'a plus de texte : la description garde ce que compte le podium, que l'image n'a pas la place d'écrire.
    parts.push(`Le plus de victoires ${period} : ${names}. ${PODIUM_METHOD} Cela compte d'abord le temps de jeu, pas le niveau.`);
  }
  parts.push(DATA_SOURCE);
  return parts.join(" ").slice(0, 1024);
}

/* ---------- Le dessin ---------- */

/** Les polices du site, en versions fixes : la bibliothèque de dessin ne sait pas lire une police variable compressée en woff2. */
const SUBSETS = { title: ["latin", "latin-ext"], text: ["latin", "latin-ext", "cyrillic", "greek"] };
const OUTFIT = SUBSETS.title.map((subset) => `@fontsource/outfit/files/outfit-${subset}-800-normal.woff`);
/** Une police à lire dans node_modules, ou l'une des deux onciales, fabriquées à la demande (`police/fabrique.ts`). */
type FontSource = string | { onciale: "taillee" | "cases" };
const FONT_FILES: Record<CardFont, FontSource[]> = {
  title: OUTFIT,
  strong: SUBSETS.text.map((subset) => `@fontsource/inter/files/inter-${subset}-700-normal.woff`),
  body: SUBSETS.text.map((subset) => `@fontsource/inter/files/inter-${subset}-500-normal.woff`),
  mono: SUBSETS.text.map((subset) => `@fontsource/jetbrains-mono/files/jetbrains-mono-${subset}-500-normal.woff`),
  monoStrong: SUBSETS.text.map((subset) => `@fontsource/jetbrains-mono/files/jetbrains-mono-${subset}-700-normal.woff`),
  name: [...OUTFIT, ...["cyrillic", "greek"].map((subset) => `@fontsource/inter/files/inter-${subset}-800-normal.woff`)],
  // Ce que l'onciale n'a pas s'écrit en Outfit, comme sur le site.
  cases: [{ onciale: "cases" }, ...OUTFIT],
  onciale: [{ onciale: "taillee" }, ...OUTFIT],
};

/** Les deux onciales, fabriquées une fois par passage du robot. */
const oncialeFonts = new Map<"taillee" | "cases", Font>();
function oncialeFont(forme: "taillee" | "cases"): Font {
  let font = oncialeFonts.get(forme);
  if (!font) {
    const police = POLICES_ONCIALE.find((p) => ("joint" in p.forme) === (forme === "cases"));
    if (!police) throw new Error("onciale introuvable");
    font = create(Buffer.from(policeOnciale(police.famille, police.forme).toArrayBuffer())) as Font;
    oncialeFonts.set(forme, font);
  }
  return font;
}

/** Les espaces insécables des nombres français. L'espace fine les remplace si la police la connaît, sinon l'espace ordinaire : le rendu reste le même partout. */
const NUMBER_SPACES = new RegExp(`[${String.fromCodePoint(0xa0, 0x202f)}]`, "g");
/** Les mêmes, un par un : `runs` les remplace avant de chercher une police. */
const NUMBER_SPACE_CHARS = new Set([String.fromCodePoint(0xa0), String.fromCodePoint(0x202f)]);
const THIN_SPACE = String.fromCodePoint(0x2009);
/** Les réglages OpenType qui coupent les ligatures : voir `shape`. */
const NO_LIGATURES = { liga: false, clig: false, calt: false };

export class GazetteFonts {
  private readonly loaded = new Map<CardFont, Font[]>();

  constructor(private readonly root: string) {}

  private fontsOf(font: CardFont): Font[] {
    let fonts = this.loaded.get(font);
    if (!fonts) {
      fonts = FONT_FILES[font].map((source) => (typeof source === "string" ? (create(readFileSync(join(this.root, "node_modules", source))) as Font) : oncialeFont(source.onciale)));
      this.loaded.set(font, fonts);
    }
    return fonts;
  }

  /** Le texte, découpé selon la police qui sait écrire chaque caractère. Si aucune ne sait, l'image est abandonnée : le message part alors sans elle. */
  private runs(text: string, font: CardFont): { font: Font; text: string }[] {
    const fonts = this.fontsOf(font);
    const clean = text.replace(NUMBER_SPACES, fonts[0]?.hasGlyphForCodePoint(0x2009) ? THIN_SPACE : " ");
    const runs: { font: Font; text: string }[] = [];
    for (const char of clean) {
      const chosen = fonts.find((f) => f.hasGlyphForCodePoint(char.codePointAt(0) ?? 0));
      if (!chosen) throw new Error("un caractère ne peut pas être dessiné");
      const last = runs.at(-1);
      if (last?.font === chosen) last.text += char;
      else runs.push({ font: chosen, text: char });
    }
    return runs;
  }

  /**
   * Les glyphes d'un texte dans une police. La chasse fixe s'écrit sans ligature, comme dans un terminal : « -- » y reste deux
   * tirets. Ses ligatures passent d'ailleurs par des glyphes vides que la bibliothèque de dessin ne sait pas lire : « -- »,
   * « :: » ou « != » feraient échouer l'image.
   */
  private shape(font: Font, text: string, kind: CardFont) {
    return kind === "mono" || kind === "monoStrong" ? font.layout(text, NO_LIGATURES) : font.layout(text);
  }

  width: Measure = (text, font, size) => this.runs(text, font).reduce((sum, run) => sum + (this.shape(run.font, run.text, font).advanceWidth * size) / run.font.unitsPerEm, 0);

  /** Une police du site sait-elle dessiner ce caractère ? Pour retirer d'un nom libre ce qui ne se dessine pas. */
  draws(char: string, font: CardFont): boolean {
    return NUMBER_SPACE_CHARS.has(char) || this.fontsOf(font).some((f) => f.hasGlyphForCodePoint(char.codePointAt(0) ?? 0));
  }

  /**
   * Le texte, dont chaque caractère qu'aucune police du site ne sait dessiner (émoji, idéogramme…) devient « ? ». Pour un nom
   * libre, comme celui d'un joueur dans une partie : l'image se dessine quand même, et sa description garde le nom entier.
   */
  drawable(text: string, font: CardFont): string {
    const fonts = this.fontsOf(font);
    return [...text].map((char) => (NUMBER_SPACE_CHARS.has(char) || fonts.some((f) => f.hasGlyphForCodePoint(char.codePointAt(0) ?? 0)) ? char : "?")).join("");
  }

  /** Les tracés d'un morceau de texte à partir de `x`, et la position après lui. L'approche s'ajoute après chaque caractère. */
  private glyphs(text: string, font: CardFont, size: number, x: number, y: number, tracking: number): { d: string; x: number } {
    let out = "";
    let at = x;
    for (const part of this.runs(text, font)) {
      const run = this.shape(part.font, part.text, font);
      const scale = size / part.font.unitsPerEm;
      run.glyphs.forEach((glyph, i) => {
        const position = run.positions[i];
        const data = glyph.path.toSVG();
        if (data) out += `<path transform="translate(${(at + (position?.xOffset ?? 0) * scale).toFixed(2)} ${y}) scale(${scale.toFixed(5)} ${(-scale).toFixed(5)})" d="${data}"/>`;
        at += (position?.xAdvance ?? 0) * scale + tracking * size;
      });
    }
    return { d: out, x: at };
  }

  /** Le texte en tracés. `color` : une autre couleur pour tout le texte, lettrine comprise (la lueur d'un chiffre). */
  paths(item: CardText, color?: string): string {
    const total = drawnWidth(item, this.width);
    const x = item.anchor === "end" ? item.x - total : item.anchor === "middle" ? item.x - total / 2 : item.x;
    const tracking = item.tracking ?? 0;
    const head = item.lettrine ? lettrineOf(item.text) : "";
    let out = "";
    let at = x;
    if (head) {
      const drawn = this.glyphs(head, item.font, item.size * LETTRINE_TITRE, at, item.y, tracking);
      out += `<g fill="${color ?? item.lettrine}">${drawn.d}</g>`;
      at = drawn.x;
    }
    out += `<g fill="${color ?? item.color}">${this.glyphs(item.text.slice(head.length), item.font, item.size, at, item.y, tracking).d}</g>`;
    return out;
  }
}

/** Le badge du clan, en rond, ou rien s'il n'a pas été déposé. Préparé une fois par taille : la construction du site dessine une image par fiche. */
const logos = new Map<string, Promise<Buffer | null>>();
function logoLayer(root: string, size: number): Promise<Buffer | null> {
  const key = `${root}|${size}`;
  let layer = logos.get(key);
  if (!layer) {
    const badge = brandFile("badge");
    const mask = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}"/></svg>`);
    layer = badge ? sharp(join(root, "public", badge)).trim().resize(size, size, { fit: "cover" }).composite([{ input: mask, blend: "dest-in" }]).png().toBuffer() : Promise.resolve(null);
    // Un échec n'est pas gardé : l'image suivante réessaie.
    layer.catch(() => logos.delete(key));
    logos.set(key, layer);
  }
  return layer;
}

const num = (value: number): string => String(Math.round(value * 100) / 100);

/**
 * La table des cartes, comme le fond du site : l'encre, une lueur bleue en haut à droite et un reflet rouge à gauche, une
 * croix toutes les quatre cases de conquête sur une trame à peine visible, plus marquée en haut, puis des coins assombris.
 * Purement décorative : aucune donnée n'y est dessinée.
 */
export function tableSvg(width: number, height: number): { defs: string; body: string } {
  const cell = 112;
  const arm = 9;
  const defs =
    `<pattern id="table-grille" width="${cell}" height="${cell}" patternUnits="userSpaceOnUse" x="${num((width / 2) % cell)}" y="0">` +
    `<path d="M0 1H${cell}M1 0V${cell}" fill="none" stroke="#5B8CFF" stroke-opacity="0.08" stroke-width="2"/>` +
    `<path d="M0 1h${arm}M${cell - arm} 1h${arm}M1 0v${arm}M1 ${cell - arm}v${arm}" fill="none" stroke="#C6D6FF" stroke-opacity="0.34" stroke-width="2"/>` +
    `</pattern>` +
    `<radialGradient id="table-haut" cx="0.5" cy="0" r="1" gradientTransform="translate(0.5 0) scale(1.2 0.9) translate(-0.5 0)">` +
    `<stop offset="0.3" stop-color="#fff"/><stop offset="0.92" stop-color="#000"/></radialGradient>` +
    `<mask id="table-masque"><rect width="${width}" height="${height}" fill="url(#table-haut)"/></mask>` +
    `<radialGradient id="table-lueur" gradientUnits="userSpaceOnUse" cx="${num(width * 0.88)}" cy="-128" r="1120" gradientTransform="translate(${num(width * 0.88)} -128) scale(1 0.6) translate(${num(-width * 0.88)} 128)">` +
    `<stop offset="0" stop-color="#0B5FFF" stop-opacity="0.3"/><stop offset="0.7" stop-color="#0B5FFF" stop-opacity="0"/></radialGradient>` +
    `<radialGradient id="table-reflet" gradientUnits="userSpaceOnUse" cx="${num(-width * 0.08)}" cy="384" r="768" gradientTransform="translate(${num(-width * 0.08)} 384) scale(1 0.625) translate(${num(width * 0.08)} -384)">` +
    `<stop offset="0" stop-color="#FF1A2E" stop-opacity="0.09"/><stop offset="0.7" stop-color="#FF1A2E" stop-opacity="0"/></radialGradient>` +
    `<radialGradient id="table-coins" cx="0.5" cy="0.3" r="1" gradientTransform="translate(0.5 0.3) scale(1.25 0.95) translate(-0.5 -0.3)">` +
    `<stop offset="0.58" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.4"/></radialGradient>`;
  const body =
    `<rect width="${width}" height="${height}" fill="${NAVY}"/>` +
    `<rect width="${width}" height="${height}" fill="url(#table-lueur)"/>` +
    `<rect width="${width}" height="${height}" fill="url(#table-reflet)"/>` +
    `<rect width="${width}" height="${height}" fill="url(#table-grille)" mask="url(#table-masque)"/>` +
    `<rect width="${width}" height="${height}" fill="url(#table-coins)"/>`;
  return { defs, body };
}

/** Le contour d'un rectangle : coins arrondis de `radius`, et le coin haut droit coupé de `cut`. */
function shapePath({ x, y, width: w, height: h, radius, cut = 0 }: CardRect): string {
  const r = Math.min(radius, w / 2, h / 2);
  const c = Math.min(cut, w / 2, h / 2);
  const right = x + w;
  const bottom = y + h;
  const topRight = c > 0 ? `H${num(right - c)}L${num(right)} ${num(y + c)}` : `H${num(right - r)}Q${num(right)} ${num(y)} ${num(right)} ${num(y + r)}`;
  return `M${num(x + r)} ${num(y)}${topRight}V${num(bottom - r)}Q${num(right)} ${num(bottom)} ${num(right - r)} ${num(bottom)}H${num(x + r)}Q${num(x)} ${num(bottom)} ${num(x)} ${num(bottom - r)}V${num(y + r)}Q${num(x)} ${num(y)} ${num(x + r)} ${num(y)}Z`;
}

/**
 * Un rectangle en SVG. Une scène (`cut`) garde, comme sur le site, le trait de lumière de son coin coupé et une trame de carte
 * allumée dans son haut, de ce côté.
 */
function rectSvg(r: CardRect, id: number): { defs: string; body: string } {
  let defs = "";
  let fill = r.color;
  if (r.to) {
    defs += `<linearGradient id="d${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${r.color}"/><stop offset="0.75" stop-color="${r.to}"/></linearGradient>`;
    fill = `url(#d${id})`;
  }
  const stroke = r.stroke ? ` stroke="${r.stroke}" stroke-width="2"` : "";
  if (!r.cut) return { defs, body: `<rect x="${num(r.x)}" y="${num(r.y)}" width="${num(r.width)}" height="${num(r.height)}" rx="${r.radius}" fill="${fill}"${stroke}/>` };
  const d = shapePath(r);
  const right = r.x + r.width;
  defs +=
    `<clipPath id="c${id}"><path d="${d}"/></clipPath>` +
    `<radialGradient id="m${id}" gradientUnits="userSpaceOnUse" cx="${num(right)}" cy="${num(r.y)}" r="${num(r.width * 0.55)}" gradientTransform="translate(${num(right)} ${num(r.y)}) scale(1 ${num((r.height * 0.75) / (r.width * 0.55))}) translate(${num(-right)} ${num(-r.y)})">` +
    `<stop offset="0" stop-color="#fff"/><stop offset="0.8" stop-color="#000"/></radialGradient>` +
    `<mask id="k${id}"><rect x="${num(r.x)}" y="${num(r.y)}" width="${num(r.width)}" height="${num(r.height)}" fill="url(#m${id})"/></mask>`;
  const grid =
    `<g clip-path="url(#c${id})" mask="url(#k${id})">` +
    `<rect x="${num(r.x)}" y="${num(r.y)}" width="${num(r.width)}" height="${num(r.height)}" fill="url(#scene-trame)"/></g>`;
  const line = `<path d="M${num(right - r.cut)} ${num(r.y)}L${num(right)} ${num(r.y + r.cut)}" stroke="${r.stroke ?? "rgba(255,255,255,0.45)"}" stroke-width="3"/>`;
  return { defs, body: `<path d="${d}" fill="${fill}"${stroke}/>${grid}${line}` };
}

/** La trame de carte des scènes (`.stage::after`) : une case de 28 pixels, en traits à peine visibles. */
const SCENE_TRAME = `<pattern id="scene-trame" width="30" height="30" patternUnits="userSpaceOnUse"><path d="M0 0.75H30M0.75 0V30" fill="none" stroke="#fff" stroke-opacity="0.08" stroke-width="1.5"/></pattern>`;
/** La lueur des chiffres clés (`.kpi-value`) : un flou bleu sous le chiffre. */
const GLOW = { filter: `<filter id="lueur" x="-25%" y="-60%" width="150%" height="220%"><feGaussianBlur stdDeviation="12"/></filter>`, color: "#3D7FFF", opacity: 0.55 };

/**
 * Le dessin entier, en SVG : la table des cartes, les rectangles, puis les textes. `table: false` : sans la table, sur un fond
 * transparent, pour la poser sur la table déjà dessinée (`renderGazetteCard`).
 */
export function cardSvg(card: GazetteCard, fonts: Pick<GazetteFonts, "paths">, { table = true }: { table?: boolean } = {}): string {
  const decor = table ? tableSvg(card.width, card.height) : { defs: "", body: "" };
  const shapes = card.rects.map((r, i) => rectSvg(r, i));
  const glows = card.texts
    .filter((t) => t.glow)
    .map((t) => fonts.paths(t, GLOW.color))
    .join("");
  const texts = card.texts.map((t) => fonts.paths(t)).join("");
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${card.width}" height="${card.height}" viewBox="0 0 ${card.width} ${card.height}">` +
    `<defs>${decor.defs}${SCENE_TRAME}${GLOW.filter}${shapes.map((s) => s.defs).join("")}</defs>` +
    decor.body +
    shapes.map((s) => s.body).join("") +
    (glows ? `<g filter="url(#lueur)" opacity="${GLOW.opacity}">${glows}</g>` : "") +
    texts +
    `</svg>`
  );
}

/** La table des cartes, dessinée une fois par taille d'image : la construction du site dessine une image par fiche de membre. */
const tables = new Map<string, Promise<Buffer>>();
function tableLayer(width: number, height: number): Promise<Buffer> {
  const key = `${width}×${height}`;
  let layer = tables.get(key);
  if (!layer) {
    const { defs, body } = tableSvg(width, height);
    layer = sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><defs>${defs}</defs>${body}</svg>`))
      .png()
      .toBuffer();
    // Un échec n'est pas gardé : l'image suivante réessaie, comme pour le logo.
    layer.catch(() => tables.delete(key));
    tables.set(key, layer);
  }
  return layer;
}

/**
 * Dessine la carte en PNG. `root` est la racine du dépôt, où se trouvent les polices et le badge. `layers` : des images posées
 * par-dessus le fond, comme la vignette de la carte d'une victoire (`victoires-image.ts`).
 */
export async function renderGazetteCard(card: GazetteCard, fonts: GazetteFonts, root: string, layers: OverlayOptions[] = []): Promise<Buffer> {
  const svg = Buffer.from(cardSvg(card, fonts, { table: false }));
  // Une taille nulle : une image sans badge, comme les billets de la tombola (tombola-image.ts).
  const logo = card.logo.size > 0 ? await logoLayer(root, card.logo.size) : null;
  // Les Gaulois du village, case par case et sans lissage, juste au-dessus du dessin.
  const overlays: OverlayOptions[] = [{ input: svg, left: 0, top: 0 }, ...spriteLayers(card.gaulois, card.width, card.height), ...layers, ...(logo ? [{ input: logo, left: card.logo.x, top: card.logo.y }] : [])];
  return sharp(await tableLayer(card.width, card.height))
    .composite(overlays)
    .png({ compressionLevel: 9 })
    .toBuffer();
}
