/**
 * Les règles de l'onglet « Gaulois de la semaine » de la Direction (`DirectionWeeklyPick.tsx`) : la liste des pseudos à
 * choisir, la recherche à chaque lettre, ce que l'écran dit du pseudo tapé, et l'état de la semaine avec sa couleur. Rien
 * n'est décidé ici : le serveur vérifie le rang et le pseudo (`save_weekly_pick`, migration
 * `20261109000200_gaulois_de_la_semaine.sql`). Ces règles ne font qu'annoncer ce qu'il répondra, et ce que l'accueil
 * montrera (`WeeklyPickCard.tsx`).
 */
import type { WeeklyPick } from "./news";
import { WEEKLY_PICK_NOTE_MAX, pickWeekLabel } from "./news";

export type PickTone = "ok" | "warn" | "danger" | "ally" | "muted";

/** Un pseudo de la liste publique. `twin` : plusieurs membres le portent, à la casse près ; le serveur refuse alors le choix. */
export interface PickChoice {
  name: string;
  twin: boolean;
}

/**
 * Sans accent ni majuscule, pour la recherche : « ela » trouve « Élan ». Copie de `plain` d'`admin-members.ts` (onglet
 * Comptes, 13 novembre 2026), gardée ici pendant le chantier des onglets de la Direction, où chacun ne touche qu'à ses
 * fichiers : elle sera mise en commun à la fusion.
 */
const plain = (text: string): string =>
  text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();

/** Comme le serveur compare les pseudos : `lower(username) = lower(btrim(p_player))`, accents compris. */
const lower = (text: string) => text.toLowerCase();

/**
 * La liste publique des membres (`/data/members.json`), telle que la page la reçoit. `null` : elle n'a pas pu être lue
 * (réponse refusée, panne du réseau, fichier illisible). Comme `WeeklyPickCard`, qui fait la même lecture.
 */
export async function readMembersList(src: string, fetcher: typeof fetch = fetch): Promise<unknown> {
  try {
    const res = await fetcher(src);
    return res.ok ? ((await res.json()) as unknown) : null;
  } catch {
    return null;
  }
}

/** Les membres de la liste lue, ou `null` si elle n'en a pas la forme. */
function membersIn(list: unknown): readonly unknown[] | null {
  if (typeof list !== "object" || list === null) return null;
  const members = (list as { members?: unknown }).members;
  return Array.isArray(members) ? members : null;
}

/**
 * Les pseudos de la liste publique, une fois chacun, dans l'ordre alphabétique, à l'orthographe exacte de la liste (c'est
 * elle que le serveur enregistre). Un membre sans pseudo n'y est pas. `twin` compte chaque membre, comme le serveur.
 * `null` : la liste n'a pas pu être lue, ou elle ne nomme personne ; le champ reste alors libre, et le serveur vérifie.
 */
export function pickChoices(list: unknown): PickChoice[] | null {
  const members = membersIn(list);
  if (!members) return null;
  const bearers = new Map<string, number>();
  const names = new Set<string>();
  for (const member of members) {
    const name = typeof member === "object" && member !== null ? (member as { username?: unknown }).username : undefined;
    if (typeof name !== "string" || name.trim() === "") continue;
    names.add(name);
    bearers.set(lower(name), (bearers.get(lower(name)) ?? 0) + 1);
  }
  if (names.size === 0) return null;
  return [...names].sort((a, b) => a.localeCompare(b, "fr")).map((name) => ({ name, twin: (bearers.get(lower(name)) ?? 0) > 1 }));
}

/** La recherche, à chaque lettre, sans accent ni majuscule : les pseudos qui commencent par le texte d'abord, puis ceux qui le contiennent. */
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

/**
 * Ce que l'écran dit du texte tapé. `free` : la liste n'a pas pu être lue, le champ reste libre et le serveur vérifie.
 * `listed` : le texte est un pseudo de la liste. `twin` : un pseudo porté par plusieurs membres. `searching` : le texte
 * n'est pas (encore) un pseudo, mais la recherche trouve des membres ; l'écran n'en dit rien, le compte suffit.
 * `unlisted` : la recherche ne trouve plus aucun membre.
 */
export type TypedState = "empty" | "free" | "listed" | "twin" | "searching" | "unlisted";

export function typedState(choices: readonly PickChoice[] | null, typed: string): TypedState {
  if (typed.trim() === "") return "empty";
  if (choices === null) return "free";
  const found = findChoice(choices, typed);
  if (found) return found.twin ? "twin" : "listed";
  return searchChoices(choices, typed).length > 0 ? "searching" : "unlisted";
}

/** Le mot sous le champ, et sa couleur. Rien pendant la recherche : un jaune à chaque lettre serait du bruit. */
export const TYPED_LABELS: Partial<Record<TypedState, { tone: PickTone; label: string }>> = {
  listed: { tone: "ok", label: "Dans la liste" },
  twin: { tone: "warn", label: "Porté par plusieurs membres : le serveur le refuse" },
  unlisted: { tone: "warn", label: "Pas dans la liste" },
};

/** L'aperçu ne montre qu'un choix que le serveur peut accepter : un pseudo de la liste, ou n'importe quel texte sans liste. */
export const showsPreview = (state: TypedState): boolean => state === "listed" || state === "free";

/**
 * Le mot tel que l'accueil le montrera : le serveur ôte les espaces des deux bouts (`btrim`) et n'enregistre pas un mot
 * vide ; l'accueil ne montre pas un mot fait seulement de blancs, et pas plus de 300 caractères (`weeklyPickOf`).
 */
export function previewNote(note: string): string | null {
  const kept = note.replace(/^ +| +$/g, "");
  return kept.trim() === "" ? null : kept.slice(0, WEEKLY_PICK_NOTE_MAX);
}

/**
 * L'état de la semaine. `chosen` : un Gaulois est choisi pour cette semaine. `previous` : rien pour cette semaine, l'accueil
 * montre encore celui de la semaine passée. `none` : rien. `unread` : le serveur n'a pas répondu, on ne sait pas.
 * `thisWeek` est le lundi de la semaine en cours à Paris (`currentPickWeek`). Un choix daté d'après lui (horloge de
 * l'appareil en retard sur celle du serveur, autour de minuit le dimanche) est celui de la semaine en cours du serveur.
 */
export type WeekState = "chosen" | "previous" | "none" | "unread";

export function weekState(shown: WeeklyPick | null, thisWeek: string, readFailed: boolean): WeekState {
  if (readFailed) return "unread";
  if (!shown) return "none";
  return shown.week >= thisWeek ? "chosen" : "previous";
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
 * L'accueil montre-t-il ce choix ? La règle de `WeeklyPickCard`, sur la même liste lue (`readMembersList`) : il le tait
 * quand le joueur n'est plus dans la liste publique à l'orthographe exacte (parti, ou pseudo changé), et le montre, sans
 * lien, quand la liste n'a pas pu être lue. Un test fait tourner les deux sur les mêmes cas.
 */
export function shownOnHome(list: unknown, player: string): boolean {
  const members = membersIn(list);
  if (!members) return true;
  try {
    // Comme `WeeklyPickCard` : une entrée de la liste qui n'a pas la forme attendue y fait tomber sur « sans lien ».
    const same = (members as { username?: string | null }[]).filter((m) => m.username?.toLocaleLowerCase("fr") === player.toLocaleLowerCase("fr"));
    return same.some((m) => m.username === player);
  } catch {
    return true;
  }
}

/** « 311 membres », « 12 sur 311 », « 1 membre ». */
export function countLabel(found: number, total: number, query: string): string {
  if (plain(query) !== "") return `${found} sur ${total}`;
  return total === 1 ? "1 membre" : `${total} membres`;
}
