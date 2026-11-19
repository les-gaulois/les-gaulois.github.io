/**
 * La boutique tournante (19 novembre 2026, choix du pilote parmi cinq propositions pour le marché : « Le 1, 2, 3 et 4 ») : chaque
 * semaine, du mardi 21 h 30 au mardi suivant, heure de Paris, un tiers seulement des objets payants est en rayon. Un objet hors
 * du rayon s'obtient en pochette, à la forge, au sentier, à l'étal du jour ou au marché, et revient en rayon une semaine sur
 * trois. Le serveur décide de tout (`get_boutique_tournante`, `acheter_objet` refuse `hors_rayon`, migration
 * 20261119000100_marche_tournant_et_demandes) : ici, la lecture de sa réponse et ses mots.
 */
import { EMPLACEMENTS_OBJETS, type Emplacement } from "../gaulois";
import type { BoutiqueTournante, RefObjet } from "./contrat";

/** La rotation relue : le prochain changement, et chaque objet hors du rayon avec le jour de son retour. */
export interface TournanteLue {
  changeLe: string;
  /** Clé : « emplacement/objet ». Valeur : le début de la semaine où il revient. */
  horsRayon: ReadonlyMap<string, string>;
}

const cle = (ref: RefObjet): string => `${ref.emplacement}/${ref.objet}`;
const estUneDate = (valeur: unknown): valeur is string => typeof valeur === "string" && !Number.isNaN(Date.parse(valeur));
const estEmplacement = (valeur: unknown): valeur is Emplacement => typeof valeur === "string" && (EMPLACEMENTS_OBJETS as readonly string[]).includes(valeur);

/** La réponse de `get_boutique_tournante`, relue. `null` : illisible, et l'écran fait comme si tout était en rayon. */
export function lireTournante(reponse: unknown): TournanteLue | null {
  if (reponse === null || typeof reponse !== "object") return null;
  const brut = reponse as Partial<BoutiqueTournante> & Record<string, unknown>;
  if (brut.ok !== true || !estUneDate(brut.change_le) || !Array.isArray(brut.hors_rayon)) return null;
  const horsRayon = new Map<string, string>();
  for (const ligne of brut.hors_rayon as unknown[]) {
    if (ligne === null || typeof ligne !== "object") continue;
    const o = ligne as Record<string, unknown>;
    if (!estEmplacement(o["emplacement"]) || typeof o["objet"] !== "string" || !estUneDate(o["revient_le"])) continue;
    horsRayon.set(cle({ emplacement: o["emplacement"], objet: o["objet"] }), o["revient_le"]);
  }
  return { changeLe: brut.change_le, horsRayon };
}

/** Le jour où revient un objet hors du rayon ; `null` : il est en rayon (ou la rotation n'est pas connue). */
export const retourDe = (tournante: TournanteLue | null, ref: RefObjet): string | null => tournante?.horsRayon.get(cle(ref)) ?? null;

/** L'objet est-il en rayon ? Sans rotation connue (serveur d'avant, ou en panne), tout l'est : le serveur décide à l'achat. */
export const estEnRayon = (tournante: TournanteLue | null, ref: RefObjet): boolean => retourDe(tournante, ref) === null;

const PARIS = "Europe/Paris";
const JOUR_ET_MOIS = new Intl.DateTimeFormat("fr-FR", { timeZone: PARIS, weekday: "long", day: "numeric", month: "long" });
const JOUR_COURT = new Intl.DateTimeFormat("fr-FR", { timeZone: PARIS, day: "numeric", month: "short" });

/** « mardi 1er décembre ». */
export const jourEnMots = (iso: string): string => JOUR_ET_MOIS.format(new Date(iso)).replace(/ 1 /, " 1er ");

/** « 1er déc. », pour la case d'un objet. */
export const jourCourt = (iso: string): string => JOUR_COURT.format(new Date(iso)).replace(/^1 /, "1er ");

/** Ce que dit la case d'un objet hors du rayon : « Revient le 1er déc. ». */
export const motsDeLaCase = (revientLe: string): string => `Revient le ${jourCourt(revientLe)}`;

/** Ce que dit l'essayage d'un objet hors du rayon. */
export const raisonHorsRayon = (revientLe: string): string => `Pas en rayon cette semaine : il revient le ${jourEnMots(revientLe)}, à 21 h 30.`;

/** La ligne du haut des rayons : la règle, et le prochain changement. */
export const regleDeLaRotation = (changeLe: string): string =>
  `Chaque mardi à 21 h 30, un tiers des objets passe en rayon. Prochain changement : ${jourEnMots(changeLe)}. Les autres se trouvent en pochette ou au marché.`;
