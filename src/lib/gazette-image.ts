/**
 * L'image de la semaine, dessinée par le robot pour le message Discord.
 *
 * Deux temps : `gazetteCard` décide quoi écrire et où, à partir de l'édition seule, et se teste sans police.
 * `renderGazetteCard` la dessine : chaque lettre devient un tracé, pour ne pas dépendre des polices de la machine.
 * Tout vient de l'édition. Ce qui manque n'est pas dessiné, jamais remplacé par un zéro.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { create, type Font } from "fontkit";
import sharp from "sharp";
import { brandFile } from "./brand";
import { fmtCount, fmtDay, fmtInt, fmtPct, fmtPoints, fmtRank } from "./format";
import { comparisonSentence, playersPeriod, rankWords, type GazetteEdition, weekLabel } from "./gazette";
import type { WeekPlayer } from "./week-players";

const WIDTH = 1200;
const HEIGHT = 744;
const MARGIN = 36;

/** Les jetons de `docs/DESIGN.md`. */
const NAVY = "#0A1230";
const SURFACE = "#121C3F";
const SURFACE_2 = "#1A2650";
const BLUE = "#0B5FFF";
const BLUE_TEXT = "#9DBCFF";
const RED = "#FF1A2E";
const MUTED = "#C0C9E2";
const WHITE = "#FFFFFF";
const LOSS = "#D9742E";

export type CardFont = "title" | "strong" | "body";

export interface CardText {
  text: string;
  x: number;
  /** La ligne de base. */
  y: number;
  size: number;
  font: CardFont;
  color: string;
  anchor?: "start" | "middle" | "end";
}

export interface CardRect {
  x: number;
  y: number;
  width: number;
  height: number;
  radius: number;
  color: string;
}

export interface GazetteCard {
  width: number;
  height: number;
  rects: CardRect[];
  texts: CardText[];
  logo: { x: number; y: number; size: number };
}

/** La largeur d'un texte : donnée par la vraie police au dessin, et par une approximation dans les tests. */
export type Measure = (text: string, font: CardFont, size: number) => number;

/** Réduit un texte pour qu'il tienne, puis le coupe s'il dépasse encore à la plus petite taille. */
function fitted(text: string, font: CardFont, size: number, minSize: number, maxWidth: number, measure: Measure): { text: string; size: number } {
  for (let s = size; s >= minSize; s--) if (measure(text, font, s) <= maxWidth) return { text, size: s };
  let cut = [...text];
  while (cut.length > 1 && measure(`${cut.join("")}…`, font, minSize) > maxWidth) cut = cut.slice(0, -1);
  return { text: `${cut.join("")}…`, size: minSize };
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

const signedInt = (n: number) => (n === 0 ? "autant" : `${n > 0 ? "+" : "−"}${fmtInt(Math.abs(n))}`);
const deltaColor = (n: number) => (n < 0 ? LOSS : BLUE_TEXT);

interface Stat {
  value: string;
  label: string;
  delta: { text: string; color: string } | null;
}

function weekStats({ totals, previous }: GazetteEdition): Stat[] {
  const before = previous && previous.games > 0 ? previous : null;
  // L'écart se calcule sur les taux tels qu'ils s'affichent, comme sur la page.
  const shown = (rate: number) => Math.round(rate * 10) / 10;
  const rateGap = before && before.winRate !== null && totals.winRate !== null ? shown(totals.winRate) - shown(before.winRate) : null;
  return [
    { value: fmtInt(totals.wins), label: totals.wins > 1 ? "victoires" : "victoire", delta: before && { text: signedInt(totals.wins - before.wins), color: deltaColor(totals.wins - before.wins) } },
    { value: fmtInt(totals.games), label: totals.games > 1 ? "parties" : "partie", delta: before && { text: signedInt(totals.games - before.games), color: deltaColor(totals.games - before.games) } },
    { value: fmtPct(totals.winRate), label: "de victoires", delta: rateGap === null ? null : { text: rateGap === 0 ? "autant" : fmtPoints(rateGap).replace(/\s*points?$/, " pts"), color: deltaColor(rateGap) } },
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

/** Quoi écrire et où. Le titre du podium dit sa période : voir `playersPeriod`. */
export function gazetteCard(edition: GazetteEdition, tag: string, siteUrl: string, measure: Measure): GazetteCard {
  const rects: CardRect[] = [{ x: 0, y: 0, width: WIDTH, height: HEIGHT, radius: 0, color: NAVY }];
  const texts: CardText[] = [];
  const third = WIDTH / 3;
  rects.push({ x: 0, y: 0, width: third, height: 8, radius: 0, color: BLUE }, { x: third, y: 0, width: third, height: 8, radius: 0, color: WHITE }, { x: 2 * third, y: 0, width: third, height: 8, radius: 0, color: RED });

  // L'en-tête.
  const logo = { x: MARGIN, y: 26, size: 104 };
  const headerX = logo.x + logo.size + 20;
  const title = fitted(`LA GAZETTE DE [${tag}]`, "title", 60, 40, WIDTH - headerX - MARGIN, measure);
  texts.push({ ...title, x: headerX, y: 80, font: "title", color: WHITE });
  texts.push({ text: `Semaine ${weekLabel(edition)}`, x: headerX, y: 124, size: 34, font: "body", color: MUTED });

  // Les trois grands chiffres.
  const stats = weekStats(edition);
  const gap = 16;
  const tileWidth = (WIDTH - 2 * MARGIN - 2 * gap) / 3;
  const statsTop = 148;
  stats.forEach((stat, i) => {
    const x = MARGIN + i * (tileWidth + gap);
    rects.push({ x, y: statsTop, width: tileWidth, height: 200, radius: 20, color: SURFACE });
    const value = fitted(stat.value, "title", 88, 56, tileWidth - 48, measure);
    texts.push({ ...value, x: x + 24, y: statsTop + 88, font: "title", color: WHITE });
    texts.push({ text: stat.label, x: x + 24, y: statsTop + 134, size: 32, font: "body", color: MUTED });
    if (stat.delta) texts.push({ text: stat.delta.text, x: x + 24, y: statsTop + 176, size: 30, font: "strong", color: stat.delta.color });
  });
  const hasDelta = stats.some((stat) => stat.delta);
  if (hasDelta) texts.push({ text: "Écarts par rapport à la semaine d'avant", x: MARGIN, y: statsTop + 232, size: 24, font: "body", color: MUTED });

  // La carte, le classement et les arrivées, à gauche. Les joueurs, à droite.
  const players: readonly WeekPlayer[] = edition.players ?? [];
  const period = playersPeriod(edition);
  const hasPlayers = players.length > 0 && period !== null;
  const columnTop = statsTop + 248;
  const rows = infoRows(edition);
  const leftWidth = hasPlayers ? 556 : WIDTH - 2 * MARGIN;
  rows.forEach((row, i) => {
    const y = columnTop + i * 100;
    rects.push({ x: MARGIN, y, width: leftWidth, height: 90, radius: 16, color: SURFACE });
    // La date de l'étiquette passe d'abord : c'est le détail qui se réduit.
    texts.push({ text: row.label, x: MARGIN + 24, y: y + 34, size: 26, font: "body", color: MUTED });
    if (row.detail) {
      const room = leftWidth - 48 - measure(row.label, "body", 26) - 16;
      const shown = measure(row.detail.text, "strong", 20) <= room || !row.detail.short ? row.detail.text : row.detail.short;
      const detail = fitted(shown, "strong", 24, 20, room, measure);
      texts.push({ ...detail, x: MARGIN + leftWidth - 24, y: y + 34, font: "strong", color: row.detail.color, anchor: "end" });
    }
    const value = fitted(row.value, "title", 38, 28, leftWidth - 48, measure);
    texts.push({ ...value, x: MARGIN + 24, y: y + 74, font: "title", color: WHITE });
  });

  if (hasPlayers) {
    const x = MARGIN + leftWidth + 24;
    const width = WIDTH - MARGIN - x;
    const heading = fitted(`Le plus de victoires ${period}`, "strong", 30, 22, width, measure);
    texts.push({ ...heading, x, y: columnTop + 24, font: "strong", color: WHITE });
    const base = HEIGHT - 44;
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
        rects.push({ x: stepX, y: top, width: stepWidth, height, radius: 14, color: first ? BLUE : SURFACE_2 });
        const center = stepX + stepWidth / 2;
        texts.push({ text: fmtRank(player.place), x: center, y: top + 40, size: 34, font: "title", color: first ? WHITE : MUTED, anchor: "middle" });
        const name = nameLines(player.username, "strong", 27, stepWidth - 16, measure);
        name.lines.forEach((line, n) => texts.push({ text: line, x: center, y: top + 78 + n * 31, size: name.size, font: "strong", color: WHITE, anchor: "middle" }));
        const wins = fitted(fmtCount(player.wins, "victoire"), "body", 25, 19, stepWidth - 16, measure);
        texts.push({ ...wins, x: center, y: base - 16, font: "body", color: first ? WHITE : MUTED, anchor: "middle" });
      });
    } else {
      // Trop d'égalités pour un podium : une liste, sans en écarter aucune.
      players.forEach((player, i) => {
        const y = columnTop + 72 + i * 44;
        texts.push({ text: fmtRank(player.place), x, y, size: 28, font: "title", color: MUTED });
        const name = fitted(player.username, "strong", 28, 22, width - 70 - 190, measure);
        texts.push({ ...name, x: x + 70, y, font: "strong", color: WHITE });
        texts.push({ text: fmtCount(player.wins, "victoire"), x: x + width, y, size: 26, font: "body", color: MUTED, anchor: "end" });
      });
    }
    texts.push({ text: "Compte d'abord le temps de jeu, pas le niveau.", x: WIDTH - MARGIN, y: HEIGHT - 14, size: 22, font: "body", color: MUTED, anchor: "end" });
  }
  texts.push({ text: `${siteUrl.replace(/^https?:\/\//, "").replace(/\/$/, "")}/gazette`, x: MARGIN, y: HEIGHT - 14, size: 26, font: "strong", color: BLUE_TEXT });
  return { width: WIDTH, height: HEIGHT, rects, texts, logo };
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
    parts.push(`Le plus de victoires ${period} : ${names}. Cela compte d'abord le temps de jeu, pas le niveau.`);
  }
  return parts.join(" ").slice(0, 1024);
}

/* ---------- Le dessin ---------- */

/** Les polices du site, en versions fixes : la bibliothèque de dessin ne sait pas lire une police variable compressée en woff2. */
const SUBSETS = { title: ["latin", "latin-ext"], text: ["latin", "latin-ext", "cyrillic", "greek"] };
const FONT_FILES: Record<CardFont, string[]> = {
  title: SUBSETS.title.map((subset) => `@fontsource/outfit/files/outfit-${subset}-800-normal.woff`),
  strong: SUBSETS.text.map((subset) => `@fontsource/inter/files/inter-${subset}-700-normal.woff`),
  body: SUBSETS.text.map((subset) => `@fontsource/inter/files/inter-${subset}-500-normal.woff`),
};

/** Les espaces insécables des nombres français. L'espace fine les remplace si la police la connaît, sinon l'espace ordinaire : le rendu reste le même partout. */
const NUMBER_SPACES = new RegExp(`[${String.fromCodePoint(0xa0, 0x202f)}]`, "g");
const THIN_SPACE = String.fromCodePoint(0x2009);

export class GazetteFonts {
  private readonly loaded = new Map<CardFont, Font[]>();

  constructor(private readonly root: string) {}

  private fontsOf(font: CardFont): Font[] {
    let fonts = this.loaded.get(font);
    if (!fonts) {
      fonts = FONT_FILES[font].map((file) => create(readFileSync(join(this.root, "node_modules", file))) as Font);
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

  width: Measure = (text, font, size) => this.runs(text, font).reduce((sum, run) => sum + (run.font.layout(run.text).advanceWidth * size) / run.font.unitsPerEm, 0);

  paths(item: CardText): string {
    const total = this.width(item.text, item.font, item.size);
    let x = item.anchor === "end" ? item.x - total : item.anchor === "middle" ? item.x - total / 2 : item.x;
    let out = "";
    for (const part of this.runs(item.text, item.font)) {
      const run = part.font.layout(part.text);
      const scale = item.size / part.font.unitsPerEm;
      run.glyphs.forEach((glyph, i) => {
        const position = run.positions[i];
        const data = glyph.path.toSVG();
        if (data) out += `<path transform="translate(${(x + (position?.xOffset ?? 0) * scale).toFixed(2)} ${item.y}) scale(${scale.toFixed(5)} ${(-scale).toFixed(5)})" d="${data}"/>`;
        x += (position?.xAdvance ?? 0) * scale;
      });
    }
    return `<g fill="${item.color}">${out}</g>`;
  }
}

/** Le badge du clan, en rond, ou rien s'il n'a pas été déposé. */
async function logoLayer(root: string, size: number): Promise<Buffer | null> {
  const badge = brandFile("badge");
  if (!badge) return null;
  const mask = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}"/></svg>`);
  return sharp(join(root, "public", badge)).trim().resize(size, size, { fit: "cover" }).composite([{ input: mask, blend: "dest-in" }]).png().toBuffer();
}

/** Dessine la carte en PNG. `root` est la racine du dépôt, où se trouvent les polices et le badge. */
export async function renderGazetteCard(card: GazetteCard, fonts: GazetteFonts, root: string): Promise<Buffer> {
  const rects = card.rects.map((r) => `<rect x="${r.x}" y="${r.y}" width="${r.width}" height="${r.height}" rx="${r.radius}" fill="${r.color}"/>`).join("");
  const texts = card.texts.map((t) => fonts.paths(t)).join("");
  const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${card.width}" height="${card.height}" viewBox="0 0 ${card.width} ${card.height}">${rects}${texts}</svg>`);
  const logo = await logoLayer(root, card.logo.size);
  const image = sharp(svg);
  if (logo) image.composite([{ input: logo, left: card.logo.x, top: card.logo.y }]);
  return image.png({ compressionLevel: 9 }).toBuffer();
}
