/**
 * Les calculs de la forge aux souvenirs du village (idée du pilote, 14 novembre 2026 : « On paie des statères pour graver une
 * vraie partie sur son épée : “12 novembre, à quatre, 2,33 points rapportés”. ») : le texte d'une plaque, la lecture prudente
 * de ce que répond le serveur, et les mots de chaque refus. Le serveur décide de tout (`contrat.ts`, migration
 * 20261114001000_village_forge.sql) : rien ici n'accorde une gravure, l'écran ne fait que dire ce qu'il a reçu.
 *
 * Le texte de la plaque suit la même règle que `internal.forge_plaque` du serveur, qui le donne déjà dans ses réponses :
 * `texteDeLaPlaque` ne sert qu'à l'écrire avant d'avoir la réponse, par exemple pour une partie de la bourse. Une réponse
 * illisible vaut « pas de réponse » (`null`), jamais zéro.
 */
import { ERROR_MESSAGES } from "../compte/errors";
import { EMPLACEMENTS_OBJETS, OBJETS, type Emplacement } from "../gaulois";
import { parisParts } from "../time";
import type { FaitsDeLaPartie, FusionReponse, MaForge, ObjetGravable, PartieGravable, Plaque, PlaqueVue, RefObjet, RefusForge } from "./contrat";
import { lireFusion, lireRecu } from "./fusion";

const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"] as const;
/** Les nombres de Gaulois écrits en mots, de deux à vingt ; au-delà, en chiffres. */
const NOMBRES = ["deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf", "dix", "onze", "douze", "treize", "quatorze", "quinze", "seize", "dix-sept", "dix-huit", "dix-neuf", "vingt"] as const;

const estObjet = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
const entier = (v: unknown, min: number, max: number): number | null => (typeof v === "number" && Number.isSafeInteger(v) && v >= min && v <= max ? v : null);
const instant = (v: unknown): string | null => (typeof v === "string" && Number.isFinite(Date.parse(v)) ? v : null);
const JOUR = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Le jour en mots, « 1er novembre », « 12 novembre », d'un jour « AAAA-MM-JJ » ; `null` s'il n'existe pas. */
export function jourEnMots(jour: string): string | null {
  const m = JOUR.exec(jour);
  if (!m) return null;
  const [annee, mois, j] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(annee, mois - 1, j));
  if (date.getUTCFullYear() !== annee || date.getUTCMonth() !== mois - 1 || date.getUTCDate() !== j) return null;
  return `${j === 1 ? "1er" : String(j)} ${MOIS[mois - 1]}`;
}

/** Le nombre de Gaulois du clan dans la partie, en mots : « seul », « à deux »… « à vingt », puis « à 23 ». */
export function compagnieEnMots(gaulois: number): string | null {
  if (!Number.isSafeInteger(gaulois) || gaulois < 1) return null;
  if (gaulois === 1) return "seul";
  return `à ${gaulois <= 20 ? NOMBRES[gaulois - 2] : String(gaulois)}`;
}

/**
 * Les points, en centièmes, arrondis comme le serveur : sur l'écriture décimale du nombre (celle que le serveur a reçue et
 * rend), une demie vers le haut. `null` : pas un nombre de points positif.
 */
function centiemes(points: number): number | null {
  if (!Number.isFinite(points) || points <= 0 || points >= 1000) return null;
  const ecrit = String(points);
  // Une écriture en puissance de dix : un nombre si petit qu'il s'arrondit à zéro (moins d'un millionième).
  if (/e/i.test(ecrit)) return 0;
  const [ent = "0", dec = ""] = ecrit.split(".");
  const chiffres = `${dec}000`;
  return Number(ent) * 100 + Number(chiffres.slice(0, 2)) + (Number(chiffres[2]) >= 5 ? 1 : 0);
}

/**
 * Les points rapportés au clan, en mots : « 2,33 points rapportés », « 1,5 point rapporté » (au singulier sous 2), « 2
 * points rapportés » ; moins d'un centième, « moins de 0,01 point rapporté », jamais « 0 point ».
 */
export function pointsEnMots(points: number): string | null {
  const c = centiemes(points);
  if (c === null) return null;
  if (c === 0) return "moins de 0,01 point rapporté";
  const reste = c % 100;
  const decimales = reste === 0 ? "" : reste % 10 === 0 ? `,${reste / 10}` : `,${String(reste).padStart(2, "0")}`;
  return `${Math.floor(c / 100)}${decimales} ${c >= 200 ? "points rapportés" : "point rapporté"}`;
}

/** Le texte de la plaque : « 12 novembre, à quatre, 2,33 points rapportés ». `null` si un fait est illisible. */
export function texteDeLaPlaque(faits: FaitsDeLaPartie): string | null {
  const jour = jourEnMots(faits.jour);
  const compagnie = compagnieEnMots(faits.gaulois);
  const points = pointsEnMots(faits.points);
  return jour && compagnie && points ? `${jour}, ${compagnie}, ${points}` : null;
}

/** Le jour à Paris (« AAAA-MM-JJ ») du début d'une partie, comme le serveur le grave. `null` : pas une date. */
export function jourAParis(debut: string): string | null {
  return instant(debut) ? parisParts(debut).date : null;
}

/**
 * L'objet peut-il se graver, d'après le catalogue : un objet à rareté d'un des cinq emplacements d'objets. Ce n'est qu'une
 * politesse de l'écran : le serveur vérifie aussi que le membre l'a.
 */
export function estGravable(ref: { emplacement: string; objet: string }): boolean {
  if (!(EMPLACEMENTS_OBJETS as readonly string[]).includes(ref.emplacement)) return false;
  const catalogue = OBJETS[ref.emplacement as Emplacement];
  const fiche = Object.hasOwn(catalogue, ref.objet) ? catalogue[ref.objet] : undefined;
  return fiche !== undefined && fiche.rarete !== null;
}

/** Un objet de la réponse, s'il est au catalogue et se grave. */
function lireRef(v: Record<string, unknown>): RefObjet | null {
  const { emplacement, objet } = v;
  if (typeof emplacement !== "string" || typeof objet !== "string" || !estGravable({ emplacement, objet })) return null;
  return { emplacement: emplacement as Emplacement, objet };
}

/** Les faits d'une partie : un vrai jour, de 1 à 200 Gaulois, des points positifs. */
function lireFaits(v: Record<string, unknown>): FaitsDeLaPartie | null {
  const { jour, points } = v;
  const gaulois = entier(v["gaulois"], 1, 200);
  if (typeof jour !== "string" || jourEnMots(jour) === null || gaulois === null || typeof points !== "number" || centiemes(points) === null) return null;
  return { jour, gaulois, points };
}

/** Le texte du serveur s'il en donne un, sinon celui de la même règle. */
function lireTexte(v: unknown, faits: FaitsDeLaPartie): string | null {
  return typeof v === "string" && v.trim() !== "" ? v.trim() : texteDeLaPlaque(faits);
}

function lirePlaque(v: unknown): Plaque | null {
  if (!estObjet(v)) return null;
  const faits = lireFaits(v);
  const grave = instant(v["grave_le"]);
  const texte = faits ? lireTexte(v["texte"], faits) : null;
  return faits && grave && texte ? { ...faits, texte, grave_le: grave } : null;
}

function lirePartie(v: unknown): PartieGravable | null {
  if (!estObjet(v)) return null;
  const { partie } = v;
  const faits = lireFaits(v);
  const debut = instant(v["debut"]);
  const texte = faits ? lireTexte(v["texte"], faits) : null;
  if (typeof partie !== "string" || !/^[A-Za-z0-9]{4,20}$/.test(partie) || !faits || !debut || !texte) return null;
  return { partie, debut, ...faits, texte };
}

function lireObjet(v: unknown): ObjetGravable | null {
  if (!estObjet(v)) return null;
  const ref = lireRef(v);
  if (!ref) return null;
  // Une plaque présente mais illisible : l'objet reste, sans plaque à montrer.
  return { ...ref, porte: v["porte"] === true, gravure: v["gravure"] === null || v["gravure"] === undefined ? null : lirePlaque(v["gravure"]) };
}

/**
 * `get_ma_forge`, `graver_objet` et `effacer_gravure` : `null` si le prix ou le solde manque. Une partie ou un objet
 * illisible est seulement ignoré.
 */
export function lireMaForge(reponse: unknown): MaForge | null {
  if (!estObjet(reponse) || reponse["ok"] !== true) return null;
  const prix = entier(reponse["prix"], 1, 1_000_000);
  const solde = entier(reponse["solde"], 0, Number.MAX_SAFE_INTEGER);
  if (prix === null || solde === null) return null;
  const liste = <T>(v: unknown, lire: (x: unknown) => T | null): T[] => (Array.isArray(v) ? v.map(lire).filter((x): x is T => x !== null) : []);
  return {
    ok: true,
    prix,
    solde,
    peut_graver: reponse["peut_graver"] === true,
    plaques_vues: reponse["plaques_vues"] === true,
    parties: liste(reponse["parties"], lirePartie),
    objets: liste(reponse["objets"], lireObjet),
    fusion: lireFusion(reponse["fusion"]),
  };
}

/** `fusionner_objets` : l'objet reçu et la forge à jour ; `null` si l'un des deux est illisible. */
export function lireFusionReponse(reponse: unknown): FusionReponse | null {
  if (!estObjet(reponse) || reponse["ok"] !== true) return null;
  const recu = lireRecu(reponse["recu"]);
  const forge = lireMaForge(reponse["forge"]);
  return recu && forge ? { ok: true, recu, forge } : null;
}

/**
 * Les plaques que donnent la place (`gravures` de chaque Gaulois de `get_village`) et le vestiaire (`gravures` de
 * `get_mon_gaulois`) : une plaque illisible est ignorée, une liste absente est vide.
 */
export function lirePlaques(valeur: unknown): PlaqueVue[] {
  if (!Array.isArray(valeur)) return [];
  const lues: PlaqueVue[] = [];
  for (const v of valeur) {
    if (!estObjet(v)) continue;
    const ref = lireRef(v);
    const texte = typeof v["texte"] === "string" ? v["texte"].trim() : "";
    if (ref && texte !== "") lues.push({ ...ref, texte });
  }
  return lues;
}

/** Le texte de la plaque d'un objet, ou `null` s'il n'en porte pas. */
export function plaqueDe(plaques: readonly PlaqueVue[], ref: RefObjet): string | null {
  return plaques.find((p) => p.emplacement === ref.emplacement && p.objet === ref.objet)?.texte ?? null;
}

/** Le solde suffit pour une gravure. Le serveur le revérifie : ce n'est qu'une politesse de l'écran. */
export const assezDeStateres = (forge: Pick<MaForge, "solde" | "prix">): boolean => forge.solde >= forge.prix;

/** Les mots de la forge pour chaque refus, en français simple, sans signes. */
export const MESSAGES_DE_LA_FORGE: Readonly<Record<RefusForge, string>> = {
  not_validated: "La forge s'ouvre une fois votre compte validé.",
  no_gaulois: ERROR_MESSAGES["no_gaulois"]!,
  objet_non_gravable: ERROR_MESSAGES["objet_non_gravable"]!,
  pas_possede: ERROR_MESSAGES["pas_possede"]!,
  partie_inconnue: ERROR_MESSAGES["partie_inconnue"]!,
  deja_grave: ERROR_MESSAGES["deja_grave"]!,
  prix_change: "Le prix de la gravure vient de changer : regardez le nouveau avant de graver.",
  solde_insuffisant: "Vous n'avez pas assez de statères pour cette gravure.",
  pas_grave: ERROR_MESSAGES["pas_grave"]!,
};

/** Les mots de la forge pour un refus ; `null` : ce n'est pas un refus de la forge, le message courant du refus convient. */
export function messageDeLaForge(code: string): string | null {
  return Object.hasOwn(MESSAGES_DE_LA_FORGE, code) ? MESSAGES_DE_LA_FORGE[code as RefusForge] : null;
}
