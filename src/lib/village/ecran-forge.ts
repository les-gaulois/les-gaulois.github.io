/**
 * Les calculs de l'écran de la forge aux souvenirs (14 novembre 2026 ; onglet « La forge » de « Mon Gaulois » depuis le
 * retrait du monde du village, le 15 novembre 2026) : l'ordre
 * des objets, les lignes de la plaque, l'heure qui distingue deux parties, et ce que dit le bouton « Graver ». Le serveur
 * décide de tout (`forge.ts`, `contrat.ts`) : rien ici n'accorde une gravure, ce ne sont que des politesses de l'écran.
 */
import { NOMS_EMPLACEMENTS, OBJETS, type Objet } from "../gaulois";
import type { FaitsDeLaPartie, MaForge, ObjetGravable, PartieGravable, RefObjet } from "./contrat";
import { stateres } from "./ecran-boutique";

const NBSP = String.fromCharCode(0xa0);

/** L'évènement qui dit au vestiaire, s'il est ouvert, que les plaques ont changé à la forge : il les relit. */
export const PLAQUES_CHANGEES = "gal:forge-plaques";

/** Le nombre de parties montrées d'abord : les plus récentes ; les autres s'ouvrent d'un clic. */
export const PARTIES_MONTREES = 6;

/** La clé d'un objet dans une liste : « arme/epee ». Jamais montrée. */
export const cleDeLObjet = (ref: RefObjet): string => `${ref.emplacement}/${ref.objet}`;

/** La fiche d'un objet du catalogue, ou `undefined`. */
export function ficheDeLObjet(ref: RefObjet): Objet | undefined {
  const catalogue = OBJETS[ref.emplacement];
  return Object.hasOwn(catalogue, ref.objet) ? catalogue[ref.objet] : undefined;
}

/** Le nom d'un objet, celui du catalogue ; à défaut, le nom de son emplacement. */
export const nomDeLObjet = (ref: RefObjet): string => ficheDeLObjet(ref)?.nom ?? NOMS_EMPLACEMENTS[ref.emplacement];

/**
 * Les objets dans l'ordre de l'écran : ceux que le Gaulois porte d'abord, puis ceux qui ont déjà une plaque, puis les
 * autres ; à rang égal, l'ordre du serveur est gardé.
 */
export function rangerLesObjets(objets: readonly ObjetGravable[]): ObjetGravable[] {
  const rang = (o: ObjetGravable): number => (o.porte ? 0 : o.gravure ? 1 : 2);
  return objets.map((objet, index) => ({ objet, index })).sort((a, b) => rang(a.objet) - rang(b.objet) || a.index - b.index).map((x) => x.objet);
}

/**
 * Le texte d'une plaque, ligne par ligne, pour l'écrire sur la grande plaque : « 12 novembre, » / « à quatre, » /
 * « 2,33 points rapportés ». La virgule d'un nombre (« 2,33 ») ne coupe pas : seule une virgule suivie d'un espace.
 */
export function lignesDeLaPlaque(texte: string): string[] {
  const morceaux = texte.split(", ").map((m) => m.trim()).filter((m) => m !== "");
  return morceaux.map((m, i) => (i < morceaux.length - 1 ? `${m},` : m));
}

/** L'heure à Paris du début d'une partie, « 21 h 05 », pour reconnaître deux parties du même jour. `null` : pas une date. */
export function heureDeLaPartie(debut: string): string | null {
  const date = new Date(debut);
  if (!Number.isFinite(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date);
  const lu = (type: string): string => parts.find((p) => p.type === type)?.value ?? "00";
  return `${Number(lu("hour"))}${NBSP}h${NBSP}${lu("minute")}`;
}

/** Les mêmes faits : la plaque que donnerait la partie est celle que l'objet porte déjà. */
export const memesFaits = (a: FaitsDeLaPartie, b: FaitsDeLaPartie): boolean => a.jour === b.jour && a.gaulois === b.gaulois && a.points === b.points;

/** La partie choisie, retrouvée dans la forge à jour ; `null` si elle n'y est plus. */
export function partieChoisie(forge: Pick<MaForge, "parties">, partie: string | null): PartieGravable | null {
  return partie === null ? null : (forge.parties.find((p) => p.partie === partie) ?? null);
}

/** L'objet choisi, retrouvé dans la forge à jour ; `null` s'il n'y est plus (vendu, par exemple). */
export function objetChoisi(forge: Pick<MaForge, "objets">, cle: string | null): ObjetGravable | null {
  return cle === null ? null : (forge.objets.find((o) => cleDeLObjet(o) === cle) ?? null);
}

/** Ce que dit le bouton « Graver » : `raison` non nulle, il est éteint et la phrase dit pourquoi, en mots. */
export interface EtatDuBouton {
  libelle: string;
  raison: string | null;
}

export function etatDuBouton(forge: Pick<MaForge, "prix" | "solde">, objet: ObjetGravable, partie: PartieGravable | null): EtatDuBouton {
  const libelle = `${objet.gravure ? "Regraver" : "Graver"} pour ${stateres(forge.prix)}`;
  if (forge.solde < forge.prix) return { libelle, raison: `Il vous manque ${stateres(forge.prix - forge.solde)}.` };
  if (!partie) return { libelle, raison: "Choisissez une partie." };
  if (objet.gravure && memesFaits(objet.gravure, partie)) return { libelle, raison: "Cet objet porte déjà cette plaque." };
  return { libelle, raison: null };
}

/** Qui voit les plaques du membre, en une phrase. */
export const phraseDesPlaquesVues = (vues: boolean): string =>
  vues ? "Votre pseudo est public : les autres membres validés peuvent lire les plaques des objets que vous portez." : "Votre pseudo n'est pas public : vous seul voyez vos plaques.";

/** Ce qu'une case d'objet gravé ajoute à son nom, pour un lecteur d'écran et au survol : « Gravé : 12 novembre, … ». */
export const motsDeLaPlaque = (texte: string): string => `Gravé : ${texte}`;
