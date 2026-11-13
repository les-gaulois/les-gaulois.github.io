/**
 * La vie du village (onglet « La place » de `/village`) : qui est où, et pourquoi. Demande du pilote, le 13 novembre 2026 :
 * ce que fait le joueur sur OpenFront et sur Discord décide de ce que fait son Gaulois. Tout part des seuls faits donnés
 * par le serveur (`contrat.ts` : `partie_le`, `vocal`, `releve`) et de l'heure de Paris. Rien n'est du temps réel : une
 * bataille est une partie finie, rejouée, et l'écran dit d'où vient chaque place.
 *
 * La règle, dans l'ordre, la première qui convient l'emporte :
 * 1. sa dernière partie a commencé il y a moins de 45 minutes : au champ de bataille, il se bat ;
 * 2. elle a commencé il y a 45 minutes ou plus, et moins de 3 heures : à la taverne, il fête les points rapportés au clan ;
 * 3. il était en vocal sur le Discord au dernier relevé, et ce relevé a moins de 3 heures (ou n'a pas d'heure) : dans la
 *    salle de réunion ;
 * 4. il est 23 heures ou plus, ou pas encore 7 heures, à Paris : il dort dans une maison ;
 * 5. sinon : il se promène sur la place.
 * Un fait absent, `null`, illisible ou daté du futur compte pour « rien de connu ».
 */
import type { GauloisDeLaPlace } from "./contrat";
import { instantDeParis } from "./lumiere";

export type Lieu = "place" | "taverne" | "reunion" | "bataille" | "maisons";

/** Les lieux, dans l'ordre où l'écran les propose. */
export const LIEUX: readonly Lieu[] = ["place", "taverne", "reunion", "bataille", "maisons"];

/** Le nom d'un lieu, et le début de la phrase qui le compte : « À la taverne : 3 ». */
export const NOMS_DES_LIEUX: Readonly<Record<Lieu, { nom: string; compte: string }>> = {
  place: { nom: "La place", compte: "Sur la place" },
  taverne: { nom: "La taverne", compte: "À la taverne" },
  reunion: { nom: "La salle de réunion", compte: "Dans la salle de réunion" },
  bataille: { nom: "Le champ de bataille", compte: "Au champ de bataille" },
  maisons: { nom: "Les maisons", compte: "Dans les maisons" },
};

/** Les durées de la règle, en minutes. */
export const BATAILLE_MINUTES = 45;
export const TAVERNE_MINUTES = 180;
export const RELEVE_VALABLE_MINUTES = 180;
/** La nuit des Gaulois, à l'heure de Paris : de 23 heures à 7 heures. */
export const NUIT_DE = 23;
export const NUIT_A = 7;

/** Où est un Gaulois, et ce qui le place là, en mots. */
export interface Presence {
  lieu: Lieu;
  raison: string;
}

/** « 21 h 38 », à l'heure de Paris. */
export function heureDeParis(date: Date): string {
  const { heure, minute } = instantDeParis(date);
  return `${heure} h ${String(minute).padStart(2, "0")}`;
}

/** Un instant écrit par le serveur, relu ; `null` s'il manque ou ne se lit pas. */
function instant(texte: string | null | undefined): Date | null {
  if (typeof texte !== "string" || texte === "") return null;
  const date = new Date(texte);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Il fait nuit pour les Gaulois : ils dorment. */
export function ilFaitNuit(maintenant: Date): boolean {
  const { heure } = instantDeParis(maintenant);
  return heure >= NUIT_DE || heure < NUIT_A;
}

/**
 * Le lieu d'un Gaulois et ce qu'il y fait, d'après la règle écrite en tête de ce fichier. `releve` : l'heure du dernier
 * relevé du serveur (`Village.releve`), qui date le vocal.
 */
export function lieuDuGaulois(gaulois: Pick<GauloisDeLaPlace, "partie_le" | "vocal">, maintenant: Date, releve?: string | null): Presence {
  const partie = instant(gaulois.partie_le);
  if (partie) {
    const minutes = (maintenant.getTime() - partie.getTime()) / 60_000;
    if (minutes >= 0 && minutes < BATAILLE_MINUTES) return { lieu: "bataille", raison: `Partie commencée à ${heureDeParis(partie)}` };
    if (minutes >= BATAILLE_MINUTES && minutes < TAVERNE_MINUTES) return { lieu: "taverne", raison: `Partie commencée à ${heureDeParis(partie)}` };
  }
  if (gaulois.vocal === true) {
    const date = instant(releve);
    const age = date ? (maintenant.getTime() - date.getTime()) / 60_000 : 0;
    if (age < RELEVE_VALABLE_MINUTES) return { lieu: "reunion", raison: "En vocal sur Discord" };
  }
  if (ilFaitNuit(maintenant)) return { lieu: "maisons", raison: "Dort" };
  return { lieu: "place", raison: "Se promène" };
}

/** Un Gaulois du village, avec sa place du moment. `rang` : sa place dans la réponse du serveur, pour le reconnaître. */
export interface Habitant {
  rang: number;
  gaulois: GauloisDeLaPlace;
  presence: Presence;
}

/** Tout le village, lieu par lieu : dans chacun, le sien d'abord, puis les autres dans l'ordre du serveur. */
export function repartirLeVillage(gaulois: readonly GauloisDeLaPlace[], maintenant: Date, releve?: string | null): Record<Lieu, Habitant[]> {
  const lieux: Record<Lieu, Habitant[]> = { place: [], taverne: [], reunion: [], bataille: [], maisons: [] };
  gaulois.forEach((g, rang) => {
    const presence = lieuDuGaulois(g, maintenant, releve);
    const habitant = { rang, gaulois: g, presence };
    if (g.moi) lieux[presence.lieu].unshift(habitant);
    else lieux[presence.lieu].push(habitant);
  });
  return lieux;
}

/**
 * Le lieu ouvert à l'arrivée : celui où se trouve son Gaulois ; sinon le plus peuplé (à égalité, le premier dans l'ordre
 * de l'écran) ; la place quand le village est vide.
 */
export function lieuDOuverture(lieux: Record<Lieu, Habitant[]>): Lieu {
  const mien = LIEUX.find((lieu) => lieux[lieu].some((h) => h.gaulois.moi));
  if (mien) return mien;
  let choix: Lieu = "place";
  for (const lieu of LIEUX) if (lieux[lieu].length > lieux[choix].length) choix = lieu;
  return choix;
}

/** « À la taverne : 3 ». */
export function compteDuLieu(lieu: Lieu, nombre: number): string {
  return `${NOMS_DES_LIEUX[lieu].compte} : ${nombre}`;
}

/** La longueur d'une réplique, en signes : au-delà, elle est coupée. */
export const REPLIQUE_MAX = 90;

/** Une réplique donnée par le serveur, en texte brut : espaces resserrés, coupée à 90 signes ; `null` si elle est vide. */
export function lireReplique(texte: unknown): string | null {
  if (typeof texte !== "string") return null;
  const propre = Array.from(texte.replace(/\s+/g, " ").trim());
  if (propre.length === 0) return null;
  if (propre.length <= REPLIQUE_MAX) return propre.join("");
  return (
    propre
      .slice(0, REPLIQUE_MAX - 1)
      .join("")
      .trimEnd() + "…"
  );
}

const MOIS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juill.", "août", "sept.", "oct.", "nov.", "déc."] as const;

/** « Relevé du 13 nov. à 21 h 53 » ; `null` sans relevé : la ligne ne s'écrit pas. */
export function phraseDuReleve(releve: string | null | undefined): string | null {
  const date = instant(releve);
  if (!date) return null;
  const { jour, mois } = instantDeParis(date);
  return `Relevé du ${jour === 1 ? "1er" : jour} ${MOIS[mois - 1]} à ${heureDeParis(date)}`;
}
