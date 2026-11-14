/**
 * Les règles de l'onglet Fondateur de la Direction : à qui le rôle peut être transmis, comment la liste se filtre, comment
 * deux membres du même nom se distinguent, quand le nom retapé confirme le choix, et ce que dit l'écran une fois le rôle
 * transmis.
 *
 * Le serveur décide (`transfer_founder`) : il refuse un compte qui n'est pas validé, et le fondateur lui-même. L'écran ne
 * propose donc que les comptes validés qui ne sont pas fondateur ; un choix que le serveur refuserait n'y paraît pas.
 */
import { ROLE_RANK } from "./admin-members";
import { ROLE_LABELS, type MemberRow, type Role } from "./types";

type Candidat = Pick<MemberRow, "user_id" | "name" | "role" | "status">;

const parNom = new Intl.Collator("fr", { sensitivity: "base", numeric: true });

/** L'espace insécable : « n° » ne se sépare pas de son numéro en fin de ligne. */
const NBSP = String.fromCharCode(0xa0);

/** Les comptes à qui le rôle peut être transmis : l'encadrement d'abord (admins, puis officiers), puis les membres, par nom. */
export function heirs<T extends Candidat>(rows: readonly T[]): T[] {
  return rows.filter((m) => m.status === "validated" && m.role !== "founder").sort((a, b) => ROLE_RANK[b.role] - ROLE_RANK[a.role] || parNom.compare(a.name, b.name));
}

/** Le fondateur du moment, lu dans la même liste : son nom sert à dire ce qu'il devient. Absent si la liste est coupée. */
export function currentFounder<T extends Pick<MemberRow, "role">>(rows: readonly T[]): T | null {
  return rows.find((m) => m.role === "founder") ?? null;
}

export type HeirFilter = "all" | "admin" | "officer" | "member";

export const HEIR_FILTERS: readonly { id: HeirFilter; label: string }[] = [
  { id: "all", label: "Tous" },
  { id: "admin", label: "Admins" },
  { id: "officer", label: "Officiers" },
  { id: "member", label: "Membres" },
];

export function inHeirFilter(member: Pick<MemberRow, "role">, filter: HeirFilter): boolean {
  return filter === "all" || member.role === filter;
}

/** Le nombre de comptes de chaque filtre. */
export function heirCounts(rows: readonly Pick<MemberRow, "role">[]): Record<HeirFilter, number> {
  const counts: Record<HeirFilter, number> = {
    all: rows.length,
    admin: 0,
    officer: 0,
    member: 0,
  };
  for (const m of rows) if (m.role !== "founder") counts[m.role] += 1;
  return counts;
}

/**
 * La ligne sous la liste : combien de comptes elle montre. « autres » : le fondateur, qui regarde, n'y est pas ; l'onglet
 * Comptes, lui, le compte parmi les validés.
 */
export function heirCountLabel(shown: number, total: number): string {
  const what = total > 1 ? "autres membres validés" : "autre membre validé";
  return shown === total ? `${total} ${what}` : `${shown} sur ${total} ${what}`;
}

/** Un nom tel qu'il se lit : sans accents, majuscules ni espaces en trop. « Luern » et « luern » se confondent à l'œil. */
const commeIlSeLit = (text: string): string =>
  text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

type Homonyme = Pick<MemberRow, "user_id" | "name" | "number" | "discord_name">;

/**
 * Ce qui distingue chaque membre de la liste qu'un autre porte le même nom (aux accents, majuscules et espaces près), par
 * identifiant de compte : son nom Discord quand aucun de ses homonymes n'a le même, sinon son numéro de Gaulois, que le
 * serveur donne à chaque compte et qui ne se partage pas. Un nom porté par un seul membre n'est pas dans la table.
 */
export function homonymTags(candidates: readonly Homonyme[]): Map<string, string> {
  const groups = new Map<string, Homonyme[]>();
  for (const m of candidates) {
    const key = commeIlSeLit(m.name);
    const group = groups.get(key);
    if (group) group.push(m);
    else groups.set(key, [m]);
  }
  const tags = new Map<string, string>();
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    for (const m of group) {
      const discord = m.discord_name;
      const discordSeul = discord !== null && discord.trim() !== "" && group.filter((o) => o.discord_name !== null && commeIlSeLit(o.discord_name) === commeIlSeLit(discord)).length === 1;
      tags.set(m.user_id, discordSeul ? discord : `Gaulois n°${NBSP}${m.number}`);
    }
  }
  return tags;
}

/**
 * Où en est le nom retapé. `exact` seul ouvre le bouton : mêmes lettres, mêmes majuscules, mêmes accents, mêmes espaces au
 * milieu. Les espaces du bord ne comptent pas (un clavier de téléphone en ajoute une après un mot). Les deux textes sont
 * mis sous la même forme Unicode (NFC) : un « É » tapé d'une touche ou fait d'un « E » et d'un accent est la même lettre.
 * `start` : le début est bon, il faut continuer.
 */
export type TypedState = "empty" | "start" | "other" | "exact";

const tel = (text: string): string => text.normalize("NFC").trim();

export function typedState(typed: string, name: string): TypedState {
  const t = tel(typed);
  const n = tel(name);
  if (t === "") return "empty";
  if (t === n) return "exact";
  return n.startsWith(t) ? "start" : "other";
}

/** Le rôle que garde celui qui transmet : `transfer_founder` le passe admin. */
export const ROLE_AFTER_TRANSFER: Role = "admin";

/** Ce que dit l'écran une fois le rôle transmis, avec ce qui distingue le nouveau fondateur d'un homonyme. */
export function transferDoneMessage(heirName: string, tag: string | null): string {
  const who = tag ? `${heirName} (${tag})` : heirName;
  return `Rôle transmis à ${who}. Vous êtes maintenant ${ROLE_LABELS[ROLE_AFTER_TRANSFER].toLowerCase()}.`;
}
