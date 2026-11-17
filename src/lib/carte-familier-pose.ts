/**
 * La place d'un familier sur une carte, en nombres seulement : ce fichier sert aussi dans le navigateur (les cartes de
 * « Mon Gaulois »), où `carte-familier.ts`, qui fabrique des images, ne peut pas aller.
 */
import type { FamilierAPoser } from "../../supabase/functions/code-discord/familiers/familier.ts";
import { GAULOIS_HAUTEUR } from "./gaulois";

/** La taille et la hauteur d'un familier sur la carte : seize cases de large et vingt-deux de haut au plus, 0,78 au plus. */
export function poseSurLaCarte(pose: Pick<FamilierAPoser, "largeur" | "hauteur" | "haut">): { echelle: number; lever: number } {
  return { echelle: Math.min(0.78, 16 / pose.largeur, 22 / pose.hauteur), lever: Math.max(0, GAULOIS_HAUTEUR - (pose.haut + pose.hauteur)) };
}
