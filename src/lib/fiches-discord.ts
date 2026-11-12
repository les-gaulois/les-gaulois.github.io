/**
 * Les fiches que la commande /fiche de Discord peut montrer (docs/DIRECTION.md, « La commande /fiche »), publiées avec le
 * site dans `/fiches.json` (`src/pages/fiches.json.ts`). Une par membre avec pseudo, exactement comme les pages
 * `/membres/:id` : la fonction `code-discord` ne connaît donc que ce que le site montre déjà, et jamais un membre sans
 * pseudo, dont l'identifiant n'est écrit nulle part. Elle relit ce fichier elle-même (`parseFiches`) : un test vérifie
 * qu'elle accepte ce qu'écrit `ficheIndex`.
 */
import { ficheFacts, ficheImageAlt } from "./fiche-image";
import type { StoredMembers } from "./schemas";

export interface FicheEntry {
  /** L'identifiant public du membre, celui de l'adresse de sa fiche et de son image. */
  id: string;
  pseudo: string;
  /** La description de l'image de la fiche, lue aux lecteurs d'écran ; `null` si l'image n'a pas été dessinée. */
  alt: string | null;
}

export interface FicheIndex {
  /** L'heure de la liste des membres : celle qu'écrit l'image, et la version de son adresse, pour que Discord ne garde pas l'ancienne. */
  listedAt: string;
  fiches: FicheEntry[];
}

/** `hasImage` : l'image de la fiche existe, dessinée par `scripts/generate-fiches.ts` avant la construction des pages. */
export function ficheIndex(list: StoredMembers, tag: string, hasImage: (id: string) => boolean): FicheIndex {
  const fiches = list.members.flatMap((member): FicheEntry[] => {
    if (!member.username || !member.publicId) return [];
    const facts = ficheFacts(list.members, member);
    const alt = facts && hasImage(member.publicId) ? ficheImageAlt(facts, tag, list.fetchedAt) : null;
    return [{ id: member.publicId, pseudo: member.username, alt }];
  });
  fiches.sort((a, b) => a.pseudo.localeCompare(b.pseudo, "fr"));
  return { listedAt: list.fetchedAt, fiches };
}
