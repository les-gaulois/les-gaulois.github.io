/**
 * La mise en forme de Discord, pour l'aperçu des messages de l'espace Direction et pour la barre d'outils du formulaire.
 * L'aperçu lit le texte comme Discord, en plus simple : gras, italique, souligné, barré, spoiler, code, bloc de code,
 * citation, titres, sous-texte, listes, liens, mentions, heures et emojis du serveur. Rien n'est inséré tel quel dans
 * la page : le texte devient des morceaux que la page affiche comme du texte.
 *
 * Où Discord lit quoi : tout dans le texte du message ; dans un embed, la description lit tout, la valeur d'un champ tout
 * sauf les titres (choix de Discord : le champ a déjà un nom), le titre et le nom d'un champ ne lisent que le style
 * (ni lien, ni mention, ni heure), et l'auteur et le pied de page aucune mise en forme.
 */

export type TimeStyle = "t" | "T" | "d" | "D" | "f" | "F" | "R";
export const TIME_STYLES: readonly { style: TimeStyle; label: string }[] = [
  { style: "f", label: "Date et heure" },
  { style: "F", label: "Jour, date et heure" },
  { style: "D", label: "Date" },
  { style: "d", label: "Date courte" },
  { style: "t", label: "Heure" },
  { style: "T", label: "Heure et secondes" },
  { style: "R", label: "Temps relatif (dans 2 heures)" },
];

export type Inline =
  | { t: "text"; v: string }
  | { t: "br" }
  | { t: "b" | "i" | "u" | "s" | "spoiler"; c: Inline[] }
  | { t: "code"; v: string }
  | { t: "link"; href: string; c: Inline[] }
  | { t: "mention"; kind: "user" | "role" | "channel"; id: string }
  | { t: "everyone" | "here" }
  | { t: "time"; unix: number; style: TimeStyle }
  | { t: "emoji"; name: string };

export type Block =
  | { t: "p"; c: Inline[] }
  | { t: "h"; level: 1 | 2 | 3; c: Inline[] }
  | { t: "sub"; c: Inline[] }
  | { t: "quote"; c: Block[] }
  | { t: "pre"; lang: string; v: string }
  | { t: "list"; ordered: boolean; start: number; items: { depth: number; c: Inline[] }[] };

/** Ce qu'un endroit du message lit : `rich`, les liens, mentions et heures ; `headings`, les titres. */
export interface ReadOptions {
  rich: boolean;
  headings: boolean;
}
export const READ_CONTENT: ReadOptions = { rich: true, headings: true };
export const READ_DESCRIPTION: ReadOptions = { rich: true, headings: true };
export const READ_FIELD_VALUE: ReadOptions = { rich: true, headings: false };
export const READ_TITLE: ReadOptions = { rich: false, headings: false };

/* ---------- Dans une ligne ---------- */

type Rule = { re: RegExp; rich?: boolean; make: (m: RegExpExecArray, opts: ReadOptions, before: string) => Inline | null };

const nest = (t: "b" | "i" | "u" | "s" | "spoiler") => (m: RegExpExecArray, opts: ReadOptions): Inline => ({ t, c: parseInline(m[1] ?? "", opts) });

const RULES: Rule[] = [
  // Un signe précédé d'une barre oblique s'affiche tel quel.
  { re: /\\([^0-9A-Za-z\s])/y, make: (m) => ({ t: "text", v: m[1] ?? "" }) },
  { re: /(`+)([\s\S]*?[^`])\1(?!`)/y, make: (m) => ({ t: "code", v: m[2] ?? "" }) },
  { re: /\|\|([\s\S]+?)\|\|/y, make: nest("spoiler") },
  { re: /\*\*([\s\S]+?)\*\*(?!\*)/y, make: nest("b") },
  { re: /__([\s\S]+?)__(?!_)/y, make: nest("u") },
  { re: /\*(?=\S)([\s\S]*?\S)\*(?!\*)/y, make: nest("i") },
  // `_italique_` seulement entre deux mots : un nom_de_fichier reste tel quel.
  { re: /_(?=\S)([\s\S]*?\S)_(?![0-9A-Za-z_])/y, make: (m, opts, before) => (/[0-9A-Za-z]$/.test(before) ? null : { t: "i", c: parseInline(m[1] ?? "", opts) }) },
  { re: /~~([\s\S]+?)~~/y, make: nest("s") },
  { re: /\[([^[\]\n]+)\]\(\s*<?(https?:\/\/[^\s()<>]+)>?\s*\)/y, rich: true, make: (m, opts) => ({ t: "link", href: m[2] ?? "", c: parseInline(m[1] ?? "", opts) }) },
  { re: /<(https?:\/\/[^\s>]+)>/y, rich: true, make: (m) => ({ t: "link", href: m[1] ?? "", c: [{ t: "text", v: m[1] ?? "" }] }) },
  { re: /https?:\/\/[^\s<]*[^\s<.,:;"')\]!?*_~|]/y, rich: true, make: (m) => ({ t: "link", href: m[0], c: [{ t: "text", v: m[0] }] }) },
  { re: /<@!?([0-9]{17,20})>/y, rich: true, make: (m) => ({ t: "mention", kind: "user", id: m[1] ?? "" }) },
  { re: /<@&([0-9]{17,20})>/y, rich: true, make: (m) => ({ t: "mention", kind: "role", id: m[1] ?? "" }) },
  { re: /<#([0-9]{17,20})>/y, rich: true, make: (m) => ({ t: "mention", kind: "channel", id: m[1] ?? "" }) },
  { re: /@(everyone|here)\b/y, rich: true, make: (m) => ({ t: m[1] === "here" ? "here" : "everyone" }) },
  { re: /<t:(-?[0-9]{1,13})(?::([tTdDfFR]))?>/y, rich: true, make: (m) => ({ t: "time", unix: Number(m[1]), style: (m[2] ?? "f") as TimeStyle }) },
  { re: /<a?:([A-Za-z0-9_]{2,32}):[0-9]{17,20}>/y, make: (m) => ({ t: "emoji", name: m[1] ?? "" }) },
];

/** Le texte ordinaire : tout ce qui ne peut pas commencer une mise en forme, d'un seul tenant. */
const PLAIN = /[^\\`|*_~[<@h\n]+/y;

/** Une ligne (ou plusieurs, avec leurs retours) lue en morceaux. */
export function parseInline(text: string, opts: ReadOptions): Inline[] {
  const out: Inline[] = [];
  const push = (node: Inline) => {
    const last = out[out.length - 1];
    if (node.t === "text" && last?.t === "text") last.v += node.v;
    else out.push(node);
  };
  let i = 0;
  while (i < text.length) {
    if (text[i] === "\n") {
      out.push({ t: "br" });
      i++;
      continue;
    }
    let matched = false;
    for (const rule of RULES) {
      if (rule.rich && !opts.rich) continue;
      rule.re.lastIndex = i;
      const m = rule.re.exec(text);
      if (!m) continue;
      const node = rule.make(m, opts, text.slice(0, i));
      if (node === null) continue;
      push(node);
      i += m[0].length;
      matched = true;
      break;
    }
    if (matched) continue;
    PLAIN.lastIndex = i;
    const plain = PLAIN.exec(text);
    const v = plain ? plain[0] : (text[i] ?? "");
    push({ t: "text", v });
    i += v.length;
  }
  return out;
}

/* ---------- Les blocs ---------- */

const FENCE = /```(?:([A-Za-z0-9_+.#-]{1,20})\n)?\n*([\s\S]*?)\n*```/g;
const HEADING = /^(#{1,3}) +(\S.*)$/;
const SUBTEXT = /^-# +(\S.*)$/;
const BULLET = /^( *)[-*] +(\S.*)$/;
const NUMBER = /^( *)([0-9]{1,9})\. +(\S.*)$/;

function linesToBlocks(text: string, opts: ReadOptions, inQuote: boolean): Block[] {
  const blocks: Block[] = [];
  const lines = text.split("\n");
  let para: string[] = [];
  const flush = () => {
    if (para.length > 0) {
      blocks.push({ t: "p", c: parseInline(para.join("\n"), opts) });
      para = [];
    }
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (!inQuote && line.startsWith(">>> ")) {
      flush();
      blocks.push({ t: "quote", c: linesToBlocks([line.slice(4), ...lines.slice(i + 1)].join("\n"), opts, true) });
      return blocks;
    }
    if (!inQuote && (line.startsWith("> ") || line === ">")) {
      flush();
      const quoted: string[] = [];
      while (i < lines.length && ((lines[i] ?? "").startsWith("> ") || lines[i] === ">")) {
        quoted.push((lines[i] ?? "").slice(2));
        i++;
      }
      i--;
      blocks.push({ t: "quote", c: linesToBlocks(quoted.join("\n"), opts, true) });
      continue;
    }
    const heading = opts.headings ? HEADING.exec(line) : null;
    if (heading) {
      flush();
      blocks.push({ t: "h", level: (heading[1]?.length ?? 1) as 1 | 2 | 3, c: parseInline(heading[2] ?? "", opts) });
      continue;
    }
    const sub = SUBTEXT.exec(line);
    if (sub) {
      flush();
      blocks.push({ t: "sub", c: parseInline(sub[1] ?? "", opts) });
      continue;
    }
    const bullet = BULLET.exec(line);
    const number = bullet ? null : NUMBER.exec(line);
    if (bullet || number) {
      flush();
      const ordered = number !== null;
      const depth = Math.min(2, Math.floor(((bullet ?? number)?.[1]?.length ?? 0) / 2));
      const content = bullet ? (bullet[2] ?? "") : (number?.[3] ?? "");
      const last = blocks[blocks.length - 1];
      if (last?.t === "list" && last.ordered === ordered) last.items.push({ depth, c: parseInline(content, opts) });
      else blocks.push({ t: "list", ordered, start: ordered ? Number(number?.[2] ?? 1) : 1, items: [{ depth, c: parseInline(content, opts) }] });
      continue;
    }
    para.push(line);
  }
  flush();
  return blocks;
}

/** Un texte entier, lu en blocs : les blocs de code d'abord, puis le reste ligne à ligne. */
export function parseBlocks(text: string, opts: ReadOptions): Block[] {
  const source = text.replace(/\r\n?/g, "\n");
  const blocks: Block[] = [];
  let last = 0;
  for (const m of source.matchAll(FENCE)) {
    const before = source.slice(last, m.index).replace(/\n$/, "");
    if (before.trim() !== "") blocks.push(...linesToBlocks(before, opts, false));
    blocks.push({ t: "pre", lang: m[1] ?? "", v: m[2] ?? "" });
    last = m.index + m[0].length;
  }
  const rest = source.slice(last).replace(/^\n/, "");
  if (rest.trim() !== "") blocks.push(...linesToBlocks(rest, opts, false));
  return blocks;
}

/* ---------- Les heures ---------- */

/** Une heure de Discord (`<t:…:F>`), écrite comme Discord l'affiche à chacun, à l'heure de son appareil, en français. */
export function formatDiscordTime(unix: number, style: TimeStyle, now: number, timeZone?: string): string {
  const date = new Date(unix * 1000);
  if (!Number.isFinite(date.getTime())) return "date invalide";
  const write = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("fr-FR", { ...o, timeZone }).format(date);
  switch (style) {
    case "t":
      return write({ hour: "2-digit", minute: "2-digit" });
    case "T":
      return write({ hour: "2-digit", minute: "2-digit", second: "2-digit" });
    case "d":
      return write({ day: "2-digit", month: "2-digit", year: "numeric" });
    case "D":
      return write({ day: "numeric", month: "long", year: "numeric" });
    case "f":
      return write({ day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
    case "F":
      return write({ weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
    case "R": {
      const seconds = (date.getTime() - now) / 1000;
      const abs = Math.abs(seconds);
      const rtf = new Intl.RelativeTimeFormat("fr", { numeric: "always" });
      if (abs < 60) return rtf.format(Math.round(seconds), "second");
      if (abs < 3_600) return rtf.format(Math.round(seconds / 60), "minute");
      if (abs < 86_400) return rtf.format(Math.round(seconds / 3_600), "hour");
      if (abs < 30 * 86_400) return rtf.format(Math.round(seconds / 86_400), "day");
      if (abs < 365 * 86_400) return rtf.format(Math.round(seconds / (30 * 86_400)), "month");
      return rtf.format(Math.round(seconds / (365 * 86_400)), "year");
    }
  }
}

/** Le code d'une heure de Discord, pour une date choisie. */
export const timeCode = (date: Date, style: TimeStyle): string => `<t:${Math.floor(date.getTime() / 1000)}:${style}>`;

/* ---------- La barre d'outils ---------- */

/** Le texte d'un champ et ce qui y est sélectionné. */
export interface Selection {
  value: string;
  start: number;
  end: number;
}

/** Un changement : remplacer `from`…`to` par `text`, puis sélectionner `selStart`…`selEnd`. */
export interface Edit {
  from: number;
  to: number;
  text: string;
  selStart: number;
  selEnd: number;
}

/** Applique un changement à un texte : pour les tests, et quand le navigateur ne sait pas l'insérer lui-même. */
export const applyEditTo = (value: string, edit: Edit): string => value.slice(0, edit.from) + edit.text + value.slice(edit.to);

/**
 * Entoure la sélection d'une marque (`**` pour le gras), ou la retire si elle l'entoure déjà, dedans ou juste autour.
 * Sans sélection, insère la marque autour d'un mot à remplacer, déjà sélectionné.
 */
export function wrapEdit({ value, start, end }: Selection, before: string, after = before, placeholder = "texte"): Edit {
  const selected = value.slice(start, end);
  const outside = value.slice(start - before.length, start) === before && value.slice(end, end + after.length) === after;
  // Une étoile seule qui fait partie de « ** » est du gras, pas de l'italique : on n'y touche pas.
  const single = before.length === 1 && before === after;
  const doubled = single && (value[start - before.length - 1] === before || value[end + after.length] === after);
  if (start >= before.length && outside && !doubled) {
    return { from: start - before.length, to: end + after.length, text: selected, selStart: start - before.length, selEnd: end - before.length };
  }
  if (selected.length >= before.length + after.length && selected.startsWith(before) && selected.endsWith(after) && !(single && (selected[1] === before || selected[selected.length - 2] === after))) {
    const inner = selected.slice(before.length, selected.length - after.length);
    return { from: start, to: end, text: inner, selStart: start, selEnd: start + inner.length };
  }
  const inner = selected === "" ? placeholder : selected;
  return { from: start, to: end, text: before + inner + after, selStart: start + before.length, selEnd: start + before.length + inner.length };
}

const BLOCK_PREFIX = /^(?:#{1,3} |-# |> |[-*] |[0-9]{1,9}\. )/;

/**
 * Met chaque ligne touchée par la sélection en citation, titre, sous-texte ou liste. Si toutes l'ont déjà, la retire.
 * Une autre marque de début de ligne est remplacée : un titre devient une citation, pas une citation de titre.
 */
export function linesEdit({ value, start, end }: Selection, prefix: (index: number) => string, already: RegExp): Edit {
  const from = value.lastIndexOf("\n", start - 1) + 1;
  const stop = end > start && value[end - 1] === "\n" ? end - 1 : end;
  const next = value.indexOf("\n", stop);
  const to = next === -1 ? value.length : next;
  const lines = value.slice(from, to).split("\n");
  const all = lines.every((line) => already.test(line));
  const changed = all ? lines.map((line) => line.replace(already, "")) : lines.map((line, i) => prefix(i) + line.replace(BLOCK_PREFIX, ""));
  const text = changed.join("\n");
  const caret = start === end;
  return { from, to, text, selStart: caret ? from + text.length : from, selEnd: from + text.length };
}

/** Un bloc de code autour de la sélection, sur ses propres lignes. */
export function codeBlockEdit({ value, start, end }: Selection): Edit {
  const selected = value.slice(start, end);
  const lead = start > 0 && value[start - 1] !== "\n" ? "\n" : "";
  const trail = end < value.length && value[end] !== "\n" ? "\n" : "";
  const text = `${lead}\`\`\`\n${selected}\n\`\`\`${trail}`;
  const selStart = start + lead.length + 4;
  return { from: start, to: end, text, selStart, selEnd: selStart + selected.length };
}

/** Un lien masqué : `[texte](https://…)`. Une adresse sélectionnée devient le lien ; sinon, l'adresse est à coller. */
export function linkEdit({ value, start, end }: Selection): Edit {
  const selected = value.slice(start, end).trim();
  if (/^https?:\/\/\S+$/.test(selected)) {
    const text = `[texte du lien](${selected})`;
    return { from: start, to: end, text, selStart: start + 1, selEnd: start + 1 + "texte du lien".length };
  }
  const label = selected === "" ? "texte du lien" : selected;
  const text = `[${label}](https://)`;
  const selStart = start + label.length + 3;
  return { from: start, to: end, text, selStart, selEnd: selStart + "https://".length };
}

/** Insère un morceau (une mention, une heure) à la place de la sélection, le curseur après lui. */
export function insertEdit({ start, end }: Selection, text: string): Edit {
  return { from: start, to: end, text, selStart: start + text.length, selEnd: start + text.length };
}

/** Les mentions qu'on peut écrire : un identifiant de rôle, de membre ou de salon, copié dans Discord en mode développeur. */
export type MentionKind = "role" | "user" | "channel" | "everyone" | "here";
export function mentionCode(kind: MentionKind, id: string): string | null {
  if (kind === "everyone") return "@everyone";
  if (kind === "here") return "@here";
  const digits = /^(?:<(?:@&|@!?|#))?([0-9]{17,20})>?$/.exec(id.trim())?.[1];
  if (!digits) return null;
  return kind === "role" ? `<@&${digits}>` : kind === "user" ? `<@${digits}>` : `<#${digits}>`;
}
