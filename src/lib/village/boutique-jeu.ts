/**
 * « La boutique » de « Mon Gaulois » habillée en écran de jeu (21 novembre 2026, maquette validée par le pilote) : ce que
 * l'écran calcule pour son dessin, sans rien décider. La sélection de la semaine et son compte à rebours viennent de la
 * boutique tournante (`get_boutique_tournante`, `boutique-tournante.ts`) ; la pastille « Nouveau » des rayons est gardée sur
 * l'appareil, comme celle du vestiaire (`nouveaux-objets.ts`). Le serveur décide de tout, prix et rayon compris.
 */

import { OBJETS, RARETES, type Emplacement } from "../gaulois";
import type { RefObjet } from "./contrat";
import { objetDuMarche, raisonDeNePasDemander, type ObjetDuMarche } from "./ecran-marche";

const PARIS = "Europe/Paris";
const JOUR_ET_HEURE = new Intl.DateTimeFormat("fr-FR", { timeZone: PARIS, weekday: "long", hour: "numeric", minute: "2-digit", hourCycle: "h23" });

const MINUTE = 60_000;
const HEURE = 60 * MINUTE;
const JOUR = 24 * HEURE;

/** Ce qui reste avant le changement de la sélection : en mots courts pour l'écran, en toutes lettres pour un lecteur d'écran. */
export interface Reste {
  court: string;
  dit: string;
}

const pluriel = (n: number, mot: string): string => `${n} ${mot}${n > 1 ? "s" : ""}`;

/**
 * Le compte à rebours jusqu'au prochain changement : « Encore 3 j 8 h », « Encore 5 h 20 min », « Encore 12 min ». Arrondi
 * à la minute du dessous ; passé l'heure, « Change maintenant », et la boutique relit la sélection (Boutique.tsx).
 */
export function resteAvantLeChangement(changeLe: string, maintenant: Date): Reste {
  const ms = Date.parse(changeLe) - maintenant.getTime();
  if (!Number.isFinite(ms) || ms < MINUTE) return { court: "Change maintenant", dit: "La sélection change maintenant" };
  const jours = Math.floor(ms / JOUR);
  const heures = Math.floor((ms % JOUR) / HEURE);
  const minutes = Math.floor((ms % HEURE) / MINUTE);
  if (jours > 0) return { court: `Encore ${jours} j ${heures} h`, dit: `Encore ${pluriel(jours, "jour")}${heures > 0 ? ` et ${pluriel(heures, "heure")}` : ""}` };
  if (heures > 0) return { court: `Encore ${heures} h ${minutes} min`, dit: `Encore ${pluriel(heures, "heure")}${minutes > 0 ? ` et ${pluriel(minutes, "minute")}` : ""}` };
  return { court: `Encore ${minutes} min`, dit: `Encore ${pluriel(minutes, "minute")}` };
}

/** « Jusqu'à mardi 21 h 30 », à l'heure de Paris. */
export function jusquAuChangement(changeLe: string): string {
  const quand = new Date(changeLe);
  if (Number.isNaN(quand.getTime())) return "";
  const parts = JOUR_ET_HEURE.formatToParts(quand);
  const part = (type: Intl.DateTimeFormatPartTypes): string => parts.find((p) => p.type === type)?.value ?? "";
  return `Jusqu'à ${part("weekday")} ${Number(part("hour"))} h ${part("minute")}`;
}

/** La clé du stockage de l'appareil : la semaine de la sélection, et les rayons déjà ouverts depuis qu'elle a changé. */
export const CLE_DES_RAYONS_VUS = "gal:boutique-rayons-vus";

/** Ce que l'appareil garde : la date du prochain changement (qui nomme la semaine), et les rayons ouverts cette semaine. */
interface RayonsVus {
  semaine: string;
  rayons: string[];
}

function lireRayonsVus(brut: string | null): RayonsVus | null {
  if (brut === null) return null;
  try {
    const lu: unknown = JSON.parse(brut);
    if (lu === null || typeof lu !== "object") return null;
    const { semaine, rayons } = lu as Record<string, unknown>;
    if (typeof semaine !== "string" || !Array.isArray(rayons) || !rayons.every((r): r is string => typeof r === "string")) return null;
    return { semaine, rayons };
  } catch {
    return null;
  }
}

/** Le point des rayons à l'ouverture : ceux qui portent « Nouveau », et ce qu'il faut garder. */
export interface PointDesRayons {
  /** Les rayons d'objets dont la sélection de la semaine n'a pas encore été ouverte. */
  nouveaux: Set<string>;
  /** Le texte à garder sur l'appareil. */
  aGarder: string;
}

/**
 * Le point à l'ouverture de la boutique. `semaine` : le prochain changement de la sélection (`change_le`). Sans rien de
 * gardé (première visite sur cet appareil, stockage illisible), rien n'est nouveau : mieux vaut aucune pastille qu'une
 * pastille partout. La sélection a changé depuis : tous les rayons d'objets sont nouveaux, jusqu'à ce qu'on les ouvre.
 */
export function faireLePointDesRayons(brut: string | null, semaine: string, rayons: readonly string[]): PointDesRayons {
  const garde = lireRayonsVus(brut);
  if (!garde) return { nouveaux: new Set(), aGarder: JSON.stringify({ semaine, rayons: [...rayons] }) };
  const vus = garde.semaine === semaine ? garde.rayons.filter((r) => rayons.includes(r)) : [];
  return { nouveaux: new Set(rayons.filter((r) => !vus.includes(r))), aGarder: JSON.stringify({ semaine, rayons: vus }) };
}

/** Un rayon ouvert : il quitte les nouveaux, et le texte à garder le dit. */
export function noterLeRayonOuvert(brut: string | null, semaine: string, rayon: string): string {
  const garde = lireRayonsVus(brut);
  const vus = garde && garde.semaine === semaine ? garde.rayons : [];
  return JSON.stringify({ semaine, rayons: vus.includes(rayon) ? vus : [...vus, rayon] });
}

/**
 * Les objets d'un emplacement qu'on peut demander au marché (bouton « Demander », 21 novembre 2026) : ceux qui se vendent au
 * marché (payants, jamais sans prix : ni divins, ni de saison), qu'on n'a pas, qu'on n'a pas mis en vente et pas déjà demandés ; du plus rare au plus
 * courant, puis par nom. Le serveur revérifie tout (`poser_demande`), plafond de demandes compris.
 */
export function objetsADemander(emplacement: Emplacement, inventaire: readonly RefObjet[] | null, miennes: readonly RefObjet[], mesDemandes: readonly RefObjet[]): ObjetDuMarche[] {
  return Object.keys(OBJETS[emplacement])
    .map((id) => objetDuMarche(emplacement, id))
    .filter((objet): objet is ObjetDuMarche => objet !== null && raisonDeNePasDemander(objet, inventaire, miennes, mesDemandes, Number.POSITIVE_INFINITY) === null)
    .sort((a, b) => RARETES[b.rarete].rang - RARETES[a.rarete].rang || a.nom.localeCompare(b.nom, "fr"));
}
