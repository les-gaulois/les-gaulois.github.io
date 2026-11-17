import type { PochetteGagnee } from "./contrat";

/**
 * L'étal des pochettes (17 novembre 2026, choisi par le pilote parmi trois exemples posés sur la vraie page : « B, une à
 * la fois ») : en tête de l'onglet « Les pochettes », les cinq pochettes posées sur un étal devant la bannière du membre.
 * L'étal sert de menu : la pochette choisie se soulève, et seule sa carte s'affiche dessous, avec tout ce qu'elle avait
 * (chances, règles, album au survol, tambour, bouton). Rien ici ne décide d'un droit ni d'un prix : le serveur le fait.
 */

/** Les pochettes de l'étal, de gauche à droite : l'ordre où elles étaient empilées dans l'onglet. */
export const POCHETTES_DE_L_ETAL = ["surprise", "stateres", "familiers", "bannieres", "modeles"] as const satisfies readonly PochetteGagnee[];
export type PochetteDeLEtal = (typeof POCHETTES_DE_L_ETAL)[number];

/** Le nom court d'une pochette, sur son étiquette : il tient sous la pochette, même sur un téléphone. */
export const NOMS_SUR_L_ETAL: Readonly<Record<PochetteDeLEtal, string>> = {
  surprise: "Surprise",
  stateres: "Statères",
  familiers: "Familiers",
  bannieres: "Bannières",
  modeles: "Uniques",
};

/** Le nom entier, pour un lecteur d'écran et pour le survol. */
export const NOMS_ENTIERS: Readonly<Record<PochetteDeLEtal, string>> = {
  surprise: "La pochette surprise",
  stateres: "La pochette de statères",
  familiers: "La pochette des familiers",
  bannieres: "La pochette des bannières",
  modeles: "La pochette des Gaulois uniques",
};

/**
 * La pochette ouverte à l'arrivée : la première qui a été gagnée à la loterie et reste à ouvrir (elle ne coûte rien),
 * sinon la pochette surprise.
 */
export function pochetteDOuverture(gagnees: Readonly<Partial<Record<PochetteGagnee, number>>>): PochetteDeLEtal {
  return POCHETTES_DE_L_ETAL.find((id) => (gagnees[id] ?? 0) > 0) ?? "surprise";
}

/** « 2 gagnées », « 1 gagnée » : les pochettes de ce genre gagnées à la loterie, sur l'étiquette ; `null` sans aucune. */
export function motsDesGagnees(nombre: number | undefined): string | null {
  if (!nombre || nombre < 1) return null;
  return `${nombre} ${nombre > 1 ? "gagnées" : "gagnée"}`;
}
