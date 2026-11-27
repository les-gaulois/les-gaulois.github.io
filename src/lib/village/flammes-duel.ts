/**
 * Les flammes de série pour le duel des Gaulois : un membre dont la flamme brûle avait un duel compté de plus par jour (choix
 * du pilote, 22 novembre 2026), jusqu'au retrait de la limite des duels comptés le 27 novembre 2026 ; le relevé continue,
 * et `get_mon_duel` dit toujours si elle brûle (`jour.flamme`). Le serveur ne sait pas lire les parties : le site, qui
 * calcule la flamme de chaque fiche (`serie-en-cours.ts`, la même que la fiche montre), lui envoie après chaque collecte les empreintes des membres dont elle
 * brûle (`scripts/noter-flammes-duel.ts`, fonction `noter_flammes_duel`). Jamais un identifiant : son empreinte SHA-256,
 * celle que garde le lien OpenFront du compte.
 */
import { hashPublicId } from "../compte/roster";
import { flammeAllumee } from "../serie-en-cours";
import type { SerieEnCours } from "../serie-en-cours";

/** Les empreintes des membres dont la flamme de série brûle, chacune une fois, triées. */
export const empreintesDesFlammes = (series: ReadonlyMap<string, SerieEnCours>): string[] =>
  [...new Set([...series].filter(([, s]) => flammeAllumee(s)).map(([publicId]) => hashPublicId(publicId)))].sort();
