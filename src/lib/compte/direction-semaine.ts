/**
 * Les règles de l'onglet « Gaulois de la semaine » de la Direction (`DirectionWeeklyPick.tsx`) : la liste des pseudos à
 * choisir, la recherche à chaque lettre, et l'état de la semaine avec sa couleur. Rien n'est décidé ici : le serveur vérifie
 * le rang et le pseudo (`save_weekly_pick`). Ces règles ne font qu'annoncer ce qu'il répondra, et ce que l'accueil montrera
 * (`WeeklyPickCard.tsx`).
 */
import type { WeeklyPick } from "./news";
import { pickWeekLabel } from "./news";

export type PickTone = "ok" | "warn" | "danger" | "ally" | "muted";

/** Un pseudo de la liste publique. `twin` : plusieurs membres le portent, à la casse près ; le serveur refuse alors le choix. */
export interface PickChoice {
  name: string;
  twin: boolean;
}

/** Sans accent ni majuscule, pour la recherche. */
const plain = (text: string) =>
  text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();

/** Comme le serveur compare les pseudos : `lower(username)`. */
const lower = (text: string) => text.trim().toLowerCase();

/** Les pseudos de la liste publique, une fois chacun, dans l'ordre alphabétique. Un membre sans pseudo n'y est pas. */
export function pickChoices(members: readonly { username?: string | null }[]): PickChoice[] {
  const bearers = new Map<string, number>();
  const names = new Set<string>();
  for (const member of members) {
    const name = typeof member.username === "string" ? member.username.trim() : "";
    if (!name) continue;
    names.add(name);
    bearers.set(lower(name), (bearers.get(lower(name)) ?? 0) + 1);
  }
  return [...names].sort((a, b) => a.localeCompare(b, "fr")).map((name) => ({ name, twin: (bearers.get(lower(name)) ?? 0) > 1 }));
}

/** La recherche, à chaque lettre : les pseudos qui commencent par le texte d'abord, puis ceux qui le contiennent. */
export function searchChoices(choices: readonly PickChoice[], query: string): PickChoice[] {
  const q = plain(query);
  if (!q) return [...choices];
  const starts: PickChoice[] = [];
  const holds: PickChoice[] = [];
  for (const choice of choices) {
    const name = plain(choice.name);
    if (name.startsWith(q)) starts.push(choice);
    else if (name.includes(q)) holds.push(choice);
  }
  return [...starts, ...holds];
}

/** Le pseudo de la liste que désigne le texte tapé, à la casse près comme sur le serveur ; l'orthographe exacte d'abord. */
export function findChoice(choices: readonly PickChoice[], typed: string): PickChoice | null {
  const wanted = typed.trim();
  if (!wanted) return null;
  return choices.find((c) => c.name === wanted) ?? choices.find((c) => lower(c.name) === lower(wanted)) ?? null;
}

/** Ce que l'écran dit du texte tapé. `free` : la liste n'a pas pu être lue, le champ reste libre et le serveur vérifie. */
export type TypedState = "empty" | "free" | "listed" | "twin" | "unlisted";

export function typedState(choices: readonly PickChoice[] | null, typed: string): TypedState {
  if (typed.trim() === "") return "empty";
  if (choices === null) return "free";
  const found = findChoice(choices, typed);
  if (!found) return "unlisted";
  return found.twin ? "twin" : "listed";
}

export const TYPED_LABELS: Record<Exclude<TypedState, "empty" | "free">, { tone: PickTone; label: string }> = {
  listed: { tone: "ok", label: "Dans la liste" },
  twin: { tone: "warn", label: "Porté par plusieurs membres : le serveur le refuse" },
  unlisted: { tone: "warn", label: "Pas dans la liste" },
};

/**
 * L'état de la semaine. `chosen` : un Gaulois est choisi pour cette semaine. `previous` : rien pour cette semaine, l'accueil
 * montre encore celui de la semaine passée. `none` : rien. `unread` : le serveur n'a pas répondu, on ne sait pas.
 */
export type WeekState = "chosen" | "previous" | "none" | "unread";

export function weekState(shown: WeeklyPick | null, thisWeek: string, readFailed: boolean): WeekState {
  if (readFailed) return "unread";
  if (!shown) return "none";
  return shown.week === thisWeek ? "chosen" : "previous";
}

export const WEEK_STATE_LABELS: Record<WeekState, { tone: PickTone; label: string }> = {
  chosen: { tone: "ok", label: "Choisi" },
  previous: { tone: "warn", label: "Pas encore choisi" },
  none: { tone: "warn", label: "Pas encore choisi" },
  unread: { tone: "danger", label: "Illisible" },
};

/** « semaine du 9 nov. au 15 nov. » : la semaine, à côté de la pastille d'état. */
export const weekShort = (week: string) => pickWeekLabel(week).replace(/^la /, "");

/**
 * L'accueil ne nomme plus un joueur absent de la liste publique (`WeeklyPickCard`, à l'orthographe exacte). `null` : la liste
 * n'a pas pu être lue, on ne sait pas.
 */
export function shownOnHome(choices: readonly PickChoice[] | null, player: string): boolean | null {
  if (choices === null) return null;
  return choices.some((c) => c.name === player);
}

/** « 311 membres », « 12 sur 311 », « 1 membre ». */
export function countLabel(found: number, total: number, searching: boolean): string {
  if (searching) return `${found} sur ${total}`;
  return total === 1 ? "1 membre" : `${total} membres`;
}
