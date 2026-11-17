import { EMPLACEMENTS_OBJETS, NOMS_EMPLACEMENTS, OBJETS, type Catalogue } from "../gaulois";
import type { ObjetPossede } from "./contrat";
import { quantitePossedee } from "./ecran-boutique";
import { collectionDuRayon } from "./vestiaire-rayons";

/**
 * Le livre de la collection (17 novembre 2026, choix du pilote parmi cinq idées) : en un seul écran de « Mon Gaulois », ce
 * que le membre possède sur ce qui existe, rayon par rayon, puis ses familiers, ses bannières et ses Gaulois uniques. Les
 * mêmes comptes que sous les rayons du vestiaire (`collectionDuRayon`) : des faits du catalogue et de l'inventaire, montrés
 * à leur seul titulaire, jamais un score ni un classement.
 */

/** Une ligne du livre. `rayon` : le rayon du vestiaire qu'elle ouvre ; `ancre` : l'adresse de la page où ça s'obtient. */
export interface LigneDeCollection {
  id: string;
  nom: string;
  possedes: number;
  existants: number;
  rayon?: (typeof EMPLACEMENTS_OBJETS)[number];
  ancre?: string;
}

/** Un compte déjà fait ailleurs (familiers, bannières, Gaulois uniques) ; `null` tant qu'il n'est pas lu, ou en panne. */
export type Compte = { possedes: number; existants: number } | null;

/**
 * Les lignes du livre, dans l'ordre du vestiaire puis des pochettes. Une partie qui n'est pas lue (`null`) n'a pas de
 * ligne : « pas de données » n'est pas zéro.
 */
export function lignesDeLaCollection(
  parties: { inventaire: readonly ObjetPossede[] | null; familiers: Compte; bannieres: Compte; modeles: Compte },
  catalogue: Catalogue = OBJETS,
): LigneDeCollection[] {
  const lignes: LigneDeCollection[] = [];
  const { inventaire } = parties;
  if (inventaire) {
    for (const emplacement of EMPLACEMENTS_OBJETS) {
      const compte = collectionDuRayon(emplacement, (id) => quantitePossedee(inventaire, emplacement, id), catalogue);
      if (compte.existants > 0) lignes.push({ id: emplacement, nom: NOMS_EMPLACEMENTS[emplacement], ...compte, rayon: emplacement });
    }
  }
  const ajouter = (id: string, nom: string, ancre: string, compte: Compte): void => {
    if (compte && compte.existants > 0) lignes.push({ id, nom, possedes: Math.min(compte.possedes, compte.existants), existants: compte.existants, ancre });
  };
  ajouter("familiers", "Familiers", "familiers", parties.familiers);
  ajouter("bannieres", "Bannières", "bannieres", parties.bannieres);
  ajouter("modeles", "Gaulois uniques", "gaulois-uniques", parties.modeles);
  return lignes;
}

/** Le nombre de lignes d'un livre complet : les cinq rayons, puis les familiers, les bannières et les Gaulois uniques. */
export const LIGNES_DU_LIVRE = EMPLACEMENTS_OBJETS.length + 3;

/** Le total du livre ; `null` tant qu'une partie manque : un total partiel passerait pour le vrai. */
export function totalDeLaCollection(lignes: readonly LigneDeCollection[]): { possedes: number; existants: number } | null {
  if (lignes.length < LIGNES_DU_LIVRE) return null;
  return lignes.reduce((total, ligne) => ({ possedes: total.possedes + ligne.possedes, existants: total.existants + ligne.existants }), { possedes: 0, existants: 0 });
}

/** La part possédée, en pour cent entiers, pour la barre : jamais 100 tant qu'il en manque un, jamais 0 dès qu'on en a un. */
export function partPossedee({ possedes, existants }: { possedes: number; existants: number }): number {
  if (existants <= 0 || possedes <= 0) return 0;
  if (possedes >= existants) return 100;
  return Math.max(1, Math.min(99, Math.round((100 * possedes) / existants)));
}
