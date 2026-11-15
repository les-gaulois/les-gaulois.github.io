/**
 * Les familiers du Gaulois, lot après lot (voir `familier.ts`) : Ferme, Forêt, Ciel et eaux, Légendes, Drôles, 20 chacun.
 * Un fichier par dessinateur ; les dessins sont de Claude Fable 5.2, originaux, faits pour le clan [GAL] le 15 novembre
 * 2026, et tous choisis par le pilote (« j'aime tout »). Le serveur garde la même liste (migration
 * 20261115000800_familiers_du_gaulois) : un test compare.
 */
import type { Familier } from "./familier.ts";
import { LOT_A } from "./lot-a.ts";
import { LOT_B } from "./lot-b.ts";
import { LOT_C } from "./lot-c.ts";
import { LOT_D } from "./lot-d.ts";
import { LOT_E } from "./lot-e.ts";

export const LOTS_DE_FAMILIERS: Readonly<Record<string, readonly Familier[]>> = { a: LOT_A, b: LOT_B, c: LOT_C, d: LOT_D, e: LOT_E };

/** Tous les familiers, lot après lot. */
export const FAMILIERS: readonly Familier[] = [...LOT_A, ...LOT_B, ...LOT_C, ...LOT_D, ...LOT_E];

/** Les familles, dans l'ordre des lots. */
export const FAMILLES: readonly string[] = [...new Set(FAMILIERS.map((familier) => familier.famille))];

const PAR_ID: ReadonlyMap<string, Familier> = new Map(FAMILIERS.map((familier) => [familier.id, familier]));

/** Le familier de cet identifiant ; `null` pour tout autre chose. */
export const familierDe = (id: unknown): Familier | null => (typeof id === "string" ? (PAR_ID.get(id) ?? null) : null);
