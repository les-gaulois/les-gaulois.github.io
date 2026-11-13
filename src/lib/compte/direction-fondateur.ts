/**
 * Les règles de l'onglet Fondateur de la Direction : à qui le rôle peut être transmis, comment la liste se filtre, et quand
 * le nom retapé confirme le choix.
 *
 * Le serveur décide (`transfer_founder`) : il refuse un compte qui n'est pas validé, et le fondateur lui-même. L'écran ne
 * propose donc que les comptes validés qui ne sont pas fondateur ; un choix que le serveur refuserait n'y paraît pas.
 */
import { ROLE_RANK } from "./admin-members";
import type { MemberRow, Role } from "./types";

type Candidat = Pick<MemberRow, "user_id" | "name" | "role" | "status">;

const parNom = new Intl.Collator("fr", { sensitivity: "base", numeric: true });

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
 * Où en est le nom retapé. `exact` seul ouvre le bouton : mêmes lettres, mêmes majuscules, mêmes accents. Les espaces du
 * bord ne comptent pas (un clavier de téléphone en ajoute une après un mot). `start` : le début est bon, il faut continuer.
 */
export type TypedState = "empty" | "start" | "other" | "exact";

export function typedState(typed: string, name: string): TypedState {
  const t = typed.trim();
  const n = name.trim();
  if (t === "") return "empty";
  if (t === n) return "exact";
  return n.startsWith(t) ? "start" : "other";
}

/** Le rôle que garde celui qui transmet : `transfer_founder` le passe admin. */
export const ROLE_AFTER_TRANSFER: Role = "admin";
