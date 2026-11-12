/**
 * Les fiches que la commande /fiche de Discord peut montrer (docs/DIRECTION.md, « La commande /fiche »), publiées avec le
 * site dans `/fiches.json` (`src/pages/fiches.json.ts`). Une par membre avec pseudo, exactement comme les pages
 * `/membres/:id` : la fonction `code-discord` ne connaît donc que ce que le site montre déjà, et jamais un membre sans
 * pseudo, dont l'identifiant n'est écrit nulle part. Elle relit ce fichier elle-même (`parseFiches`) : un test vérifie
 * qu'elle accepte ce qu'écrit `ficheIndex`.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ficheFacts, ficheImageAlt } from "./fiche-image";
import type { StoredMembers } from "./schemas";

export interface FicheEntry {
  /** L'identifiant public du membre, celui de l'adresse de sa fiche et de son image. */
  id: string;
  pseudo: string;
  /** La description de l'image de la fiche, lue aux lecteurs d'écran ; `null` si l'image n'a pas été dessinée. */
  alt: string | null;
  /**
   * La version de l'image, tirée de son fichier (`ficheImageVersion`) : son adresse change avec son dessin, chiffres ou style,
   * et Discord ne montre pas l'image qu'il a gardée. `null` sans image.
   */
  v: string | null;
}

export interface FicheIndex {
  /**
   * L'heure de la liste des membres : celle qu'écrit l'image. La fonction `code-discord` en tirait la version de l'adresse de
   * l'image avant `v`, et le fait encore pour une fiche qui n'a pas de `v`.
   */
  listedAt: string;
  fiches: FicheEntry[];
}

/** L'image d'une fiche, dessinée par `scripts/generate-fiches.ts` avant la construction des pages. */
export const ficheImageFile = (id: string, root = "") => join(root, "public", "generated", "fiches", `${id}.png`);

/**
 * La version de l'image d'une fiche : douze signes tirés de son fichier, comme pour les images des commandes
 * (`commandes-discord.ts`), ou `null` si elle n'a pas été dessinée. Le 12 novembre 2026, l'image de /moi gardait l'ancien
 * style après un nouveau dessin : sa version ne suivait que la liste des membres, relue une fois par jour.
 */
export function ficheImageVersion(id: string, root = ""): string | null {
  const file = ficheImageFile(id, root);
  return existsSync(file) ? createHash("sha256").update(readFileSync(file)).digest("hex").slice(0, 12) : null;
}

/** `imageVersion` : la version de l'image de la fiche (`ficheImageVersion`), ou `null` si elle n'a pas été dessinée. */
export function ficheIndex(list: StoredMembers, tag: string, imageVersion: (id: string) => string | null): FicheIndex {
  const fiches = list.members.flatMap((member): FicheEntry[] => {
    if (!member.username || !member.publicId) return [];
    const facts = ficheFacts(list.members, member);
    const v = facts ? imageVersion(member.publicId) : null;
    const alt = facts && v ? ficheImageAlt(facts, tag, list.fetchedAt) : null;
    return [{ id: member.publicId, pseudo: member.username, alt, v: alt ? v : null }];
  });
  fiches.sort((a, b) => a.pseudo.localeCompare(b.pseudo, "fr"));
  return { listedAt: list.fetchedAt, fiches };
}
