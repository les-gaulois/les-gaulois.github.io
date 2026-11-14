/**
 * Les mots du monde du village : le chantier (« Encore 436 points pour finir le pont »), le grand feu (son nom, les points
 * rapportés au clan sur 7 jours, l'heure du relevé), les fenêtres et la rangée d'icônes. Les chiffres viennent tous de
 * l'état du monde (`../monde-etat.ts`), calculé sur les sessions publiques du clan : rien n'est du temps réel, l'heure du
 * relevé est toujours écrite, et « pas de données » ne s'écrit jamais zéro.
 */
import { frNumber } from "../../nombre";
import { NOMS_DU_FEU } from "../chantier-liste";
import { instantDeParis } from "../lumiere";
import type { EtatDuBatiment, EtatDuChantier, EtatDuFeu } from "../monde-etat";

const nombres = frNumber({ maximumFractionDigits: 2 });
/** Un nombre de points : entier quand il l'est, deux décimales au plus sinon (« 2,33 »). */
export const points = (n: number): string => nombres.format(Math.round(n * 100) / 100);
/** « point » ou « points ». */
export const motPoints = (n: number): string => (Math.abs(n) < 2 ? "point" : "points");

/** Les points qui manquent encore à un bâtiment. */
export const resteDe = (b: Pick<EtatDuBatiment, "cout" | "poses">): number => Math.max(0, Math.round((b.cout - b.poses) * 100) / 100);

/** Le bâtiment en cours, ou `null` quand tout est bâti. */
export const batimentEnCours = (chantier: EtatDuChantier): EtatDuBatiment | null => chantier.batiments.find((b) => b.id === chantier.en_cours) ?? null;

/** « Encore 436 points pour finir le pont ». */
export function phraseDuChantier(b: EtatDuBatiment): string {
  const reste = resteDe(b);
  return `Encore ${points(reste)} ${motPoints(reste)} pour finir ${b.nom}`;
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

/** Le nom du feu, avec sa majuscule : « Un feu de joie ». */
export function nomDuFeu(feu: EtatDuFeu): string {
  const nom = NOMS_DU_FEU[feu.niveau];
  return nom.charAt(0).toUpperCase() + nom.slice(1);
}

/** « points rapportés au clan en 7 jours », après le nombre. */
export const suiteDuFeu = (feu: EtatDuFeu): string => `${motPoints(feu.points)} ${feu.points < 2 ? "rapporté" : "rapportés"} au clan en ${feu.jours} jours`;
/** « 523 points rapportés au clan en 7 jours ». */
export const pointsDuFeu = (feu: EtatDuFeu): string => `${points(feu.points)} ${suiteDuFeu(feu)}`;

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
