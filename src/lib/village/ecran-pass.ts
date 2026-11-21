/**
 * « Le pass » de « Mon Gaulois » habillé en écran de jeu (21 novembre 2026) : ce que l'écran (`Sentier.tsx`) déduit pour ses
 * dessins en cases (`src/lib/jeu/pass-forge.ts`). Des calculs purs : l'état de chaque case du calendrier, de chaque dalle de
 * la route, la part d'une barre, et quelques mots. Rien ne décide d'un droit, d'un pas ni d'un tirage : le serveur le fait
 * (`sentier.ts`, `contrat.ts`).
 */
import type { EtatDuJour as DessinDuJour } from "../jeu/pass-forge";
import type { RareteDePalier, SaisonDuSentier } from "./contrat";
import { jourEnMots, type EtatDePalier } from "./sentier";

/**
 * L'état d'une case du calendrier de présence que l'écran montre : cochée, à venir, le cadeau du dernier jour, ou le cadeau
 * gagné. Le dessin (`jourDuCalendrier`) sait aussi marquer un jour « aujourdhui », que l'écran ne montre pas : la visite du
 * jour est cochée dès la lecture du pass.
 */
export type EtatDuJour = Exclude<DessinDuJour, "aujourdhui">;

/** Les cases du calendrier, de la première à la dernière : les `cochees` premières sont faites, la dernière porte le cadeau. */
export function etatsDuCalendrier(cochees: number, cases: number): EtatDuJour[] {
  const n = Math.max(0, Math.floor(cases));
  const faites = Math.min(Math.max(0, Math.floor(cochees)), n);
  return Array.from({ length: n }, (_, i): EtatDuJour => {
    const faite = i < faites;
    if (i === n - 1) return faite ? "cadeau-fait" : "cadeau";
    return faite ? "fait" : "vide";
  });
}

/** Ce qu'un lecteur d'écran entend d'une case du calendrier. `gain` : les XP du cadeau, déjà en mots (« 30 XP »). */
export function motDuJour(rang: number, etat: EtatDuJour, gain: string): string {
  if (etat === "fait") return `Jour ${rang} : visite faite`;
  if (etat === "cadeau-fait") return `Jour ${rang} : visite faite, cadeau de ${gain} gagné`;
  if (etat === "cadeau") return `Jour ${rang} : le cadeau de ${gain}`;
  return `Jour ${rang} : à venir`;
}

/** L'état de la dalle d'un palier sur la route : à prendre, atteinte (dorée), ou pas encore (grise). */
export function etatDeLaDalle(etat: EtatDePalier): "dore" | "gris" | "a-prendre" {
  return etat === "a-prendre" ? "a-prendre" : etat === "pris" ? "dore" : "gris";
}

/** Le palier est-il un jalon de la route (10, 20, 30…) ? */
export const estUnJalon = (palier: number, parRangee: number): boolean => parRangee > 0 && palier % parRangee === 0;

/** La rareté que montre un palier : « saison » pour celui qui donne l'objet de la saison, sinon la sienne. */
export const rareteDuPalier = (rarete: RareteDePalier, deSaison: boolean): RareteDePalier | "saison" => (deSaison ? "saison" : rarete);

/** La part d'une barre, de 0 à 1 ; 0 sans cible. */
export const partDeLaBarre = (fait: number, cible: number): number => (cible > 0 && Number.isFinite(fait) ? Math.min(Math.max(fait / cible, 0), 1) : 0);

/** Les deux bouts de la saison, en mots : « du 17 novembre au 28 décembre ». */
export const datesDeLaSaison = (saison: Pick<SaisonDuSentier, "debut" | "fin">): string => `du ${jourEnMots(saison.debut)} au ${jourEnMots(saison.fin)}`;

/** Les jours qui restent, en mots : « encore 37 jours », « dernier jour ». */
export const joursEnMots = (restants: number): string => (restants <= 1 ? "dernier jour" : `encore ${restants} jours`);

/** Le seuil d'un palier, en mots courts sous sa case : « 150 XP ». */
export const seuilEnMots = (pas: number): string => `${pas} XP`;
