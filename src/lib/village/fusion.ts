/**
 * La fusion à la forge (demande du pilote, 16 novembre 2026 : « tant d'objets rares fusionnés deviennent épique, tant
 * d'épiques deviennent légendaire ») : trois objets d'une même rareté donnent un objet de la rareté suivante, tiré au
 * hasard par le serveur (`fusionner_objets`, migration 20261116000300_divin_et_fusion). Ici, la lecture prudente de ses
 * réponses et les calculs du creuset, où le membre pose ce qu'il donne. Rien n'accorde une fusion : le serveur vérifie
 * tout, l'écran ne fait que préparer la demande et dire ce qu'il a reçu.
 */
import { ERROR_MESSAGES } from "../compte/errors";
import { OBJETS, ORDRE_RARETES, RARETES, type Catalogue, type Emplacement, type Rarete } from "../gaulois";
import { objetPayant } from "./boutique";
import type { FusionDeLaForge, FusionRecu, ObjetAFondre, RefObjet, RefusFusion } from "./contrat";

const estObjet = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
const entier = (v: unknown, min: number, max: number): number | null => (typeof v === "number" && Number.isSafeInteger(v) && v >= min && v <= max ? v : null);

/** La rareté qu'on obtient en fondant des objets d'une rareté ; `null` : le légendaire ne se fond pas. Comme le serveur. */
export function rareteSuivante(rarete: Rarete): Rarete | null {
  return ORDRE_RARETES[ORDRE_RARETES.indexOf(rarete) + 1] ?? null;
}

/** Les raretés qui se fondent, de la plus courante à la plus rare : toutes celles de la boutique, sauf la dernière. */
export const RARETES_A_FONDRE: readonly Rarete[] = ORDRE_RARETES.filter((rarete) => rareteSuivante(rarete) !== null);

/** L'espace insécable des guillemets français. */
const NBSP = String.fromCharCode(0xa0);

const cle = (ref: RefObjet): string => `${ref.emplacement}/${ref.objet}`;

/** Un objet à fondre : un objet payant du catalogue, d'une rareté qui se fond, celle que le catalogue lui donne. */
function lireObjetAFondre(v: unknown, catalogue: Catalogue): ObjetAFondre | null {
  if (!estObjet(v)) return null;
  const fiche = objetPayant(v["emplacement"], v["objet"], catalogue);
  const quantite = entier(v["quantite"], 1, 1_000_000);
  if (!fiche || quantite === null || fiche.rarete !== v["rarete"]) return null;
  const rarete = RARETES_A_FONDRE.find((r) => r === fiche.rarete);
  if (!rarete) return null;
  const libres = entier(v["libres"], 0, quantite) ?? 0;
  return { emplacement: v["emplacement"] as Emplacement, objet: v["objet"] as string, rarete, quantite, libres };
}

/**
 * `fusion` de `get_ma_forge` : `null` si le serveur ne la donne pas (il ne connaît pas encore la fusion) ou si le nombre
 * d'objets à donner est illisible. Un objet illisible ou lu deux fois est seulement ignoré.
 */
export function lireFusion(v: unknown, catalogue: Catalogue = OBJETS): FusionDeLaForge | null {
  if (!estObjet(v)) return null;
  const nombre = entier(v["nombre"], 2, 20);
  if (nombre === null) return null;
  const objets: ObjetAFondre[] = [];
  const vus = new Set<string>();
  for (const ligne of Array.isArray(v["objets"]) ? v["objets"] : []) {
    const lu = lireObjetAFondre(ligne, catalogue);
    if (!lu || vus.has(cle(lu))) continue;
    vus.add(cle(lu));
    objets.push(lu);
  }
  return { nombre, objets };
}

/** `recu` de `fusionner_objets` : un objet payant du catalogue, de la rareté que le catalogue lui donne ; sinon `null`. */
export function lireRecu(v: unknown, catalogue: Catalogue = OBJETS): FusionRecu | null {
  if (!estObjet(v)) return null;
  const fiche = objetPayant(v["emplacement"], v["objet"], catalogue);
  const rarete = ORDRE_RARETES.find((r) => r === fiche?.rarete);
  if (!fiche || !rarete || v["rarete"] !== rarete || typeof v["double"] !== "boolean") return null;
  return { emplacement: v["emplacement"] as Emplacement, objet: v["objet"] as string, rarete, double: v["double"] };
}

/** Le creuset : ce que le membre a posé pour le fondre, un exemplaire par place, dans l'ordre où il l'a posé. */
export type Creuset = readonly ObjetAFondre[];

/** Combien d'exemplaires de cet objet sont déjà dans le creuset. */
export const dansLeCreuset = (creuset: Creuset, ref: RefObjet): number => creuset.filter((o) => cle(o) === cle(ref)).length;

/** Combien d'exemplaires de cet objet peuvent encore se poser : ses exemplaires libres, moins ceux du creuset. */
export const resteAPoser = (creuset: Creuset, objet: ObjetAFondre): number => Math.max(0, objet.libres - dansLeCreuset(creuset, objet));

/** La rareté du creuset, celle de son premier objet ; `null` s'il est vide. */
export const rareteDuCreuset = (creuset: Creuset): Rarete | null => creuset[0]?.rarete ?? null;

/** Le creuset est plein : il a le nombre d'objets que demande une fusion. */
export const creusetPlein = (creuset: Creuset, fusion: Pick<FusionDeLaForge, "nombre">): boolean => creuset.length >= fusion.nombre;

/**
 * Le creuset avec un exemplaire de plus. Inchangé s'il est plein, si l'objet n'a plus d'exemplaire libre, ou s'il n'est pas
 * de la rareté déjà posée : un creuset ne mélange pas les raretés.
 */
export function poser(creuset: Creuset, objet: ObjetAFondre, fusion: Pick<FusionDeLaForge, "nombre">): Creuset {
  const rarete = rareteDuCreuset(creuset);
  if (creusetPlein(creuset, fusion) || resteAPoser(creuset, objet) === 0 || (rarete !== null && rarete !== objet.rarete)) return creuset;
  return [...creuset, objet];
}

/** Le creuset sans l'objet de cette place. */
export const reprendre = (creuset: Creuset, place: number): Creuset => creuset.filter((_, i) => i !== place);

/**
 * Le creuset tel qu'il vaut encore après une relecture de la forge : chaque objet posé doit toujours être là, de la même
 * rareté, avec assez d'exemplaires libres. Ce qui ne vaut plus est repris.
 */
export function creusetAJour(creuset: Creuset, fusion: FusionDeLaForge): Creuset {
  let garde: Creuset = [];
  for (const pose of creuset) {
    const actuel = fusion.objets.find((o) => cle(o) === cle(pose));
    if (actuel) garde = poser(garde, actuel, fusion);
  }
  return garde;
}

/** Les exemplaires libres de chaque rareté qui se fond : de quoi savoir où une fusion est possible. */
export function libresParRarete(fusion: Pick<FusionDeLaForge, "objets">): Record<Rarete, number> {
  const comptes = Object.fromEntries(ORDRE_RARETES.map((rarete) => [rarete, 0])) as Record<Rarete, number>;
  for (const objet of fusion.objets) comptes[objet.rarete] += objet.libres;
  return comptes;
}

/** La rareté à montrer d'abord : la plus courante qui a de quoi faire une fusion ; à défaut, la plus courante qui a un objet ; sinon `null`. */
export function rareteDeDepart(fusion: FusionDeLaForge): Rarete | null {
  const libres = libresParRarete(fusion);
  return RARETES_A_FONDRE.find((r) => libres[r] >= fusion.nombre) ?? RARETES_A_FONDRE.find((r) => fusion.objets.some((o) => o.rarete === r)) ?? null;
}

/** Les objets d'une rareté, ceux qui ont un exemplaire libre d'abord ; à rang égal, l'ordre du serveur. */
export function objetsDeLaRarete(fusion: Pick<FusionDeLaForge, "objets">, rarete: Rarete): ObjetAFondre[] {
  return fusion.objets
    .filter((o) => o.rarete === rarete)
    .map((objet, index) => ({ objet, index }))
    .sort((a, b) => Number(b.objet.libres > 0) - Number(a.objet.libres > 0) || a.index - b.index)
    .map((x) => x.objet);
}

/** Ce que le serveur attend : `[{ emplacement, objet }]`, un par exemplaire. */
export const demandeDeFusion = (creuset: Creuset): RefObjet[] => creuset.map(({ emplacement, objet }) => ({ emplacement, objet }));

/** « 3 objets « Commun » donnent 1 objet « Peu commun », tiré au hasard. » : la règle d'une rareté, avec le nombre du serveur. */
export function regleDeLaRarete(rarete: Rarete, nombre: number): string | null {
  const suivante = rareteSuivante(rarete);
  return suivante ? `${nombre} objets «${NBSP}${RARETES[rarete].nom}${NBSP}» donnent 1 objet «${NBSP}${RARETES[suivante].nom}${NBSP}», tiré au hasard.` : null;
}

/** Les mots de la fusion pour chaque refus, en français simple, sans signes. */
export const MESSAGES_DE_LA_FUSION: Readonly<Record<RefusFusion, string>> = {
  not_validated: "La forge s'ouvre une fois votre compte validé.",
  no_gaulois: ERROR_MESSAGES["no_gaulois"]!,
  fusion_invalide: ERROR_MESSAGES["fusion_invalide"]!,
  unknown_objet: ERROR_MESSAGES["fusion_invalide"]!,
  raretes_melangees: ERROR_MESSAGES["raretes_melangees"]!,
  rarete_sans_fusion: ERROR_MESSAGES["rarete_sans_fusion"]!,
  pas_possede: "Un de ces objets n'est plus dans votre inventaire.",
  objet_porte: "Votre Gaulois porte un de ces objets, et c'est votre dernier exemplaire : enlevez-le d'abord, dans « Mon Gaulois ».",
  objet_grave: "Un de ces objets porte une plaque, et c'est votre dernier exemplaire : effacez-la d'abord.",
};

/** Les mots de la fusion pour un refus ; `null` : ce n'est pas un refus de la fusion, le message courant convient. */
export function messageDeLaFusion(code: string): string | null {
  return Object.hasOwn(MESSAGES_DE_LA_FUSION, code) ? MESSAGES_DE_LA_FUSION[code as RefusFusion] : null;
}
