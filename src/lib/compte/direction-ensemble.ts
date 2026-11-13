/**
 * L'onglet « Vue d'ensemble » de la Direction : les quatre cases et les pastilles de l'état du site.
 *
 * Rien n'est calculé ici : les nombres sont ceux de `get_direction_overview`, les niveaux ceux de `src/lib/etat-site.ts`.
 * Ce fichier ne décide que de la couleur et du mot de chaque état, jamais seule l'une sans l'autre (`direction-kit.tsx`) :
 * jaune `warn` ce qui attend une décision, vert `ok` en règle, rouge `danger` bloqué, bleu `ally` une information,
 * gris `muted` rien à faire.
 */
import type { HealthLevel } from "../etat-site";
import type { MemberFilter } from "./admin-members";

/**
 * Les couleurs d'état de la Direction : le même ensemble que `DirTon` de `direction-kit.tsx`, recopié ici pour que
 * `src/lib` ne dépende pas d'un composant. Le test `direction-ensemble.test.ts` vérifie que les deux restent identiques.
 */
export type EnsembleTon = "ok" | "warn" | "danger" | "ally" | "muted";

/** Les quatre nombres de `get_direction_overview` que montrent les cases. */
export interface EnsembleNombres {
  pending_requests: number;
  members: number;
  officers: number;
  suspended: number;
}

export interface EnsembleCase {
  id: "demandes" | "membres" | "encadrement" | "suspendus";
  label: string;
  value: number;
  /** La couleur et le mot de l'état : les mêmes que ceux des filtres de l'onglet Comptes, que la case ouvre. */
  ton: EnsembleTon;
  mot: string;
  /** La partie de la Direction que la case ouvre, et le filtre de l'onglet Comptes déjà choisi. */
  part: "demandes" | "comptes";
  filter?: MemberFilter;
}

/** Le mot accordé au nombre de la case : `aucun` à zéro, `un` à un, `plusieurs` au-delà (« Aucun suspendu », « Suspendu », « Suspendus »). */
const accorde = (n: number, un: string, plusieurs: string, aucun: string): string => (n > 1 ? plusieurs : n === 1 ? un : aucun);

/**
 * Les quatre cases, dans l'ordre de l'écran. Seules les demandes attendent une décision : elles passent au jaune dès qu'il y
 * en a une. Les suspendus passent au rouge, comme dans Comptes. À zéro, une case est grise : il n'y a rien à y faire.
 */
export function ensembleCases(data: EnsembleNombres): EnsembleCase[] {
  return [
    {
      id: "demandes",
      label: "Demandes",
      value: data.pending_requests,
      ton: data.pending_requests > 0 ? "warn" : "muted",
      mot: data.pending_requests > 0 ? "À traiter" : "Rien à faire",
      part: "demandes",
    },
    {
      id: "membres",
      label: "Membres",
      value: data.members,
      ton: data.members > 0 ? "ok" : "muted",
      mot: accorde(data.members, "Validé", "Validés", "Aucun validé"),
      part: "comptes",
      filter: "validated",
    },
    // Les comptes validés d'un rôle au-dessus de membre : officiers, admins et fondateur.
    { id: "encadrement", label: "Encadrement", value: data.officers, ton: data.officers > 0 ? "ally" : "muted", mot: "Avec un rôle", part: "comptes", filter: "staff" },
    {
      id: "suspendus",
      label: "Comptes",
      value: data.suspended,
      ton: data.suspended > 0 ? "danger" : "muted",
      mot: accorde(data.suspended, "Suspendu", "Suspendus", "Aucun suspendu"),
      part: "comptes",
      filter: "suspended",
    },
  ];
}

/** La pastille d'une ligne de l'état du site. `info` est un fait sans jugement (la gazette) : bleu, jamais vert ni jaune. */
export const ETAT_PASTILLE: Record<HealthLevel, { ton: EnsembleTon; mot: string }> = {
  ok: { ton: "ok", mot: "OK" },
  warn: { ton: "warn", mot: "À voir" },
  info: { ton: "ally", mot: "Info" },
};

/**
 * Le résumé en tête de l'état du site : le nombre de lignes à surveiller, en mots. On lui passe les quatre lignes de
 * `siteHealth`, pas les sources : une source en retard compte déjà dans la ligne « API d'OpenFront ». `info` (la gazette)
 * n'est jamais à surveiller.
 */
export function etatResume(lines: readonly { level: HealthLevel }[]): { ton: EnsembleTon; mot: string } {
  const warnings = lines.filter((line) => line.level === "warn").length;
  if (warnings === 0) return { ton: "ok", mot: "Rien à signaler" };
  return { ton: "warn", mot: warnings === 1 ? "1 point à surveiller" : `${warnings} points à surveiller` };
}
