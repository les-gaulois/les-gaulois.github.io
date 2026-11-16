/**
 * Les Gaulois uniques, lot après lot : un fichier par dessinateur (Claude Fable 5.2), chacun d'un seul auteur. Le 15 novembre
 * 2026, le pilote a écarté le champignon, l'esprit du chêne, la grenouille et le golem de granit : il en reste onze.
 *
 * Leur rareté (choix du chef de chantier) fait leur prix à la boutique et leurs chances dans la pochette des Gaulois
 * uniques. Le serveur garde la même liste (table `internal.modeles`, migration 20261115001000_gaulois_uniques) : un test
 * garde les deux identiques.
 *
 * Ce fichier n'importe de `gaulois.ts` que des types : `gaulois.ts` l'importe pour dessiner le modèle porté.
 */
import { LOT_A } from "./lot-a.ts";
import { LOT_B } from "./lot-b.ts";
import { LOT_C } from "./lot-c.ts";
import { LOT_D } from "./lot-d.ts";
import type { ModeleDuGaulois, RareteDUnique } from "./modele.ts";

export type { ModeleDuGaulois };

export const LOTS_DE_MODELES: Readonly<Record<string, readonly ModeleDuGaulois[]>> = { a: LOT_A, b: LOT_B, c: LOT_C, d: LOT_D };

/** Les familles de la galerie, une par lot. */
export const FAMILLES_DES_MODELES: Readonly<Record<string, string>> = {
  a: "Écailles et branchies",
  b: "Les éléments",
  c: "Bêtes de la forêt",
  d: "Venus d'ailleurs",
};

/** La rareté de chaque modèle : trois communs, trois peu communs, deux épiques, deux mystiques, un légendaire. */
export const RARETES_DES_MODELES: Readonly<Record<string, RareteDUnique>> = {
  lezard: "commun",
  loup: "commun",
  sanglier: "commun",
  axolotl: "peu-commun",
  corbeau: "peu-commun",
  squelette: "peu-commun",
  givre: "epique",
  automate: "epique",
  magma: "mystique",
  ovni: "mystique",
  dragon: "legendaire",
};

/** Un modèle, avec sa rareté et sa famille. */
export interface ModeleRange extends ModeleDuGaulois {
  rarete: RareteDUnique;
  famille: string;
}

/** Tous les modèles, lot après lot, avec leur rareté et leur famille. */
export const MODELES: readonly ModeleRange[] = Object.entries(LOTS_DE_MODELES).flatMap(([lot, liste]) =>
  liste.map((modele) => ({ ...modele, rarete: RARETES_DES_MODELES[modele.id] ?? "commun", famille: FAMILLES_DES_MODELES[lot] ?? lot })),
);

const PAR_ID = new Map(MODELES.map((modele) => [modele.id, modele]));

/** Le modèle de cet identifiant, ou `null`. */
export const modeleParId = (id: string | null | undefined): ModeleRange | null => (id ? (PAR_ID.get(id) ?? null) : null);
