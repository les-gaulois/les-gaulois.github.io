/**
 * Les mots du monde du village : le chantier (« Encore 437 points pour finir le pont »), le grand feu (son nom, les points
 * rapportés au clan sur 7 jours, l'heure du relevé), les fenêtres et la rangée d'icônes. Les chiffres viennent tous de
 * l'état du monde (`../monde-etat.ts`), calculé sur les sessions publiques du clan : rien n'est du temps réel, l'heure du
 * relevé est toujours écrite, et « pas de données » ne s'écrit jamais zéro.
 *
 * Les nombres s'écrivent comme sur Discord, par les règles de `../chantier.ts` : des points rapportés arrondis vers le bas
 * (`pointsAffiches` : on n'écrit jamais plus que ce qui a été rapporté), ce qui reste à poser arrondi vers le haut
 * (`pointsQuiRestent` : jamais « encore 0 » tant qu'un bâtiment n'est pas fini). Posés et restants font le coût.
 */
import { frNumber } from "../../nombre";
import { NOMS_DU_FEU, type NiveauDuFeu } from "../chantier-liste";
import { pointsAffiches, pointsQuiRestent } from "../chantier";
import { instantDeParis } from "../lumiere";
import type { EtatDuBatiment, EtatDuFeu } from "../monde-etat";

const entiers = frNumber({ maximumFractionDigits: 0 });

/** Un nombre entier, au format français : « 1 063 ». */
export const nombre = (n: number): string => entiers.format(n);
/** « point » ou « points », pour un nombre tel qu'il s'écrit. */
export const motPoints = (n: number): string => (n >= 2 ? "points" : "point");

/** « Encore 437 points pour finir le pont ». */
export function phraseDuChantier(b: EtatDuBatiment): string {
  const reste = pointsQuiRestent(b);
  return `Encore ${nombre(reste)} ${motPoints(reste)} pour finir ${b.nom}`;
}

/** « 13 points posés sur 450 ». */
export function posesDuBatiment(b: EtatDuBatiment): string {
  const poses = pointsAffiches(b.poses);
  return `${nombre(poses)} ${motPoints(poses)} ${poses >= 2 ? "posés" : "posé"} sur ${nombre(b.cout)}`;
}

/** Ce qu'on dit d'un bâtiment dans la liste du chantier : fini (et quand), en chantier, ou à venir. */
export function etatDuBatimentEnMots(b: EtatDuBatiment, enCours: boolean): string {
  if (b.fini_le !== null) {
    const jour = jourDeParis(b.fini_le);
    return jour ? `Fini le ${jour}` : "Fini";
  }
  if (enCours) {
    const reste = pointsQuiRestent(b);
    return `En chantier : encore ${nombre(reste)} ${motPoints(reste)}`;
  }
  return `À venir : ${nombre(b.cout)} ${motPoints(b.cout)}`;
}

const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"] as const;

/** « 2 novembre », à l'heure de Paris ; `null` si la date ne se lit pas. */
export function jourDeParis(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const { jour, mois } = instantDeParis(date);
  return `${jour === 1 ? "1er" : jour} ${MOIS[mois - 1]}`;
}

/** Le nom d'un feu, avec sa majuscule : « Un feu de joie ». */
export function nomDuNiveau(niveau: NiveauDuFeu): string {
  const nom = NOMS_DU_FEU[niveau];
  return nom.charAt(0).toUpperCase() + nom.slice(1);
}

/** Le nom du feu, avec sa majuscule. */
export const nomDuFeu = (feu: EtatDuFeu): string => nomDuNiveau(feu.niveau);

/** « points rapportés au clan en 7 jours », après le nombre écrit. */
export function suiteDuFeu(feu: EtatDuFeu): string {
  const n = pointsAffiches(feu.points);
  return `${motPoints(n)} ${n >= 2 ? "rapportés" : "rapporté"} au clan en ${feu.jours} jours`;
}
/** « 617 points rapportés au clan en 7 jours ». */
export const pointsDuFeu = (feu: EtatDuFeu): string => `${nombre(pointsAffiches(feu.points))} ${suiteDuFeu(feu)}`;

/** « 1 063 points rapportés au clan », le total du chantier. */
export function suiteDuChantier(points: number): string {
  const n = pointsAffiches(points);
  return `${motPoints(n)} ${n >= 2 ? "rapportés" : "rapporté"} au clan`;
}

/** Ce que disent l'écran et ses fenêtres quand une partie de l'état du monde manque : jamais un zéro. */
export const SANS_DONNEES = "Pas de données : les parties du clan n'ont pas pu être relevées.";

/** Les fenêtres du monde, dans l'ordre de la rangée d'icônes. `compte` : seulement pour un membre connecté. */
export const FENETRES_DU_MONDE = [
  { id: "gaulois", titre: "Mon Gaulois", court: "Gaulois", grande: true, compte: false },
  { id: "marche", titre: "Le marché", court: "Marché", grande: true, compte: true },
  { id: "qui", titre: "Qui est où", court: "Qui est où", grande: false, compte: true },
  { id: "chantier", titre: "Le chantier", court: "Chantier", grande: false, compte: false },
  { id: "feu", titre: "Le grand feu", court: "Feu", grande: false, compte: false },
  { id: "forge", titre: "La forge", court: "Forge", grande: false, compte: false },
] as const;
export type FenetreDuMonde = (typeof FENETRES_DU_MONDE)[number]["id"];

/** La fenêtre que demande l'ancre de l'adresse ; `#place` et toute autre ancre : le monde seul. */
export function fenetreDeLAncre(ancre: string): FenetreDuMonde | null {
  const id = ancre.replace(/^#/, "");
  return FENETRES_DU_MONDE.find((f) => f.id === id)?.id ?? null;
}
