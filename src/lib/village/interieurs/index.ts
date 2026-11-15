/**
 * Les intérieurs des bâtiments du chantier, réunis (`type.ts` dit ce qu'est un intérieur). Un bâtiment de
 * `BATIMENTS_A_INTERIEUR` absent d'ici n'a pas encore son dessin : il ne s'ouvre pas.
 */
import { INTERIEURS_LOT_1 } from "./lot-1";
import { INTERIEURS_LOT_2 } from "./lot-2";
import type { DessinDInterieur, InterieurId } from "./type";

export * from "./type";

export const INTERIEURS: Readonly<Partial<Record<InterieurId, DessinDInterieur>>> = { ...INTERIEURS_LOT_1, ...INTERIEURS_LOT_2 };

/** L'intérieur d'un bâtiment, s'il en a un et qu'il est dessiné. Seules les clés propres comptent : « toString » n'en est pas une. */
export const interieurDe = (id: string): DessinDInterieur | null =>
  Object.hasOwn(INTERIEURS, id) ? ((INTERIEURS as Record<string, DessinDInterieur | undefined>)[id] ?? null) : null;
