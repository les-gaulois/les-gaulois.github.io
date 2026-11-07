/**
 * Le pseudo qu'un visiteur a choisi de retenir, pour retrouver sa place sans le retaper.
 * Il ne reste que dans son navigateur, et il ne désigne qu'un membre dont le pseudo est déjà public.
 */
import type { StoredMember } from "./schemas";

export const ME_KEY = "gal-moi";

/** Le membre retenu, s'il figure encore dans la liste avec un pseudo. Parti du clan, ou devenu anonyme : plus rien n'est retrouvé. */
export function rememberedMember(members: readonly StoredMember[], stored: string | null): StoredMember | null {
  if (!stored) return null;
  return members.find((m) => m.publicId === stored && m.username) ?? null;
}

/** Vrai si le membre retenu a quitté une liste bien remplie. Une liste vide ou sans aucun pseudo est un manque de données : ce n'est pas un départ. */
export function hasLeftList(members: readonly StoredMember[], stored: string | null): boolean {
  if (!stored || !members.some((m) => m.publicId && m.username)) return false;
  return rememberedMember(members, stored) === null;
}
