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
import type { AccountLevel, StoredMembers } from "./schemas";
import { datesDeLaSerie, flammeAllumee, type RecordPersonnel, type SerieEnCours } from "./serie-en-cours";

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
  /**
   * Le niveau et le prestige du compte OpenFront, tout le jeu, tels que la fiche les montre : `null` s'il ne les montre pas.
   * Pour l'emblème de /gaulois (15 novembre 2026).
   */
  niveau: AccountLevel | null;
  /** La flamme de série, telle que la fiche la montre (5 victoires d'affilée et plus) : `null` sans flamme. Pour /gaulois. */
  flamme: FicheFlamme | null;
}

/**
 * La flamme d'une fiche, prête pour /gaulois : le nombre, « au moins », ses dates (« du 12 au 14 nov. 2026 »), l'or, et
 * l'heure du relevé (ISO), que /gaulois écrit : la série est celle de ce moment, pas du temps réel.
 */
export interface FicheFlamme {
  victoires: number;
  auMoins: boolean;
  dates: string;
  doree: boolean;
  releve: string;
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
export function ficheIndex(list: StoredMembers, tag: string, imageVersion: (id: string) => string | null, series: ReadonlyMap<string, SerieEnCours> = new Map(), records: ReadonlyMap<string, RecordPersonnel> = new Map()): FicheIndex {
  const fiches = list.members.flatMap((member): FicheEntry[] => {
    if (!member.username || !member.publicId) return [];
    const facts = ficheFacts(list.members, member, series.get(member.publicId) ?? null, records.get(member.publicId) ?? null);
    const v = facts ? imageVersion(member.publicId) : null;
    const alt = facts && v ? ficheImageAlt(facts, tag, list.fetchedAt) : null;
    const serie = series.get(member.publicId) ?? null;
    const flamme: FicheFlamme | null = flammeAllumee(serie)
      ? { victoires: serie.victoires, auMoins: serie.auMoins, dates: datesDeLaSerie(serie), doree: records.get(member.publicId)?.doree === true, releve: serie.releve }
      : null;
    return [{ id: member.publicId, pseudo: member.username, alt, v: alt ? v : null, niveau: member.account ?? null, flamme }];
  });
  fiches.sort((a, b) => a.pseudo.localeCompare(b.pseudo, "fr"));
  return { listedAt: list.fetchedAt, fiches };
}
