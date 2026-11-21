import type { PochetteGagnee } from "./contrat";

/**
 * L'étal des pochettes (17 novembre 2026, choisi par le pilote parmi trois exemples posés sur la vraie page : « B, une à
 * la fois ») : en tête de l'onglet « Les pochettes », les cinq pochettes posées sur un étal devant la bannière du membre.
 * L'étal sert de menu : la pochette choisie se soulève, et seule sa carte s'affiche dessous, avec tout ce qu'elle avait
 * (chances, règles, album au survol, bouton ; l'ouverture dans sa fenêtre). Rien ici ne décide d'un droit ni d'un prix : le serveur le fait.
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
  surprise: "Le booster surprise",
  stateres: "Le booster de statères",
  familiers: "Le booster des familiers",
  bannieres: "Le booster des bannières",
  modeles: "Le booster des Gaulois uniques",
};

/**
 * La pochette ouverte à l'arrivée : la première qui a été gagnée à la loterie et reste à ouvrir (elle ne coûte rien),
 * sinon la pochette surprise.
 */
export function pochetteDOuverture(gagnees: Readonly<Partial<Record<PochetteGagnee, number>>>): PochetteDeLEtal {
  return POCHETTES_DE_L_ETAL.find((id) => (gagnees[id] ?? 0) > 0) ?? "surprise";
}

/** « 2 offerts », « 1 offert » : les boosters de ce genre offerts (loterie, palier de victoires), sur l'étiquette ; `null` sans aucun. */
export function motsDesGagnees(nombre: number | undefined): string | null {
  if (!nombre || nombre < 1) return null;
  return `${nombre} ${nombre > 1 ? "offerts" : "offert"}`;
}

/** Le nom de chaque booster dans une phrase, un ou plusieurs (« les pochettes » sont « les boosters » depuis le 21 novembre 2026). */
const NOMS_EN_PHRASE: Readonly<Record<PochetteDeLEtal, { un: string; des: string }>> = {
  surprise: { un: "un booster surprise", des: "boosters surprises" },
  stateres: { un: "un booster de statères", des: "boosters de statères" },
  familiers: { un: "un booster des familiers", des: "boosters des familiers" },
  bannieres: { un: "un booster des bannières", des: "boosters des bannières" },
  modeles: { un: "un booster des Gaulois uniques", des: "boosters des Gaulois uniques" },
};

/** Les boosters gagnés à la loterie qui restent à ouvrir, en mots : « 2 boosters surprises », « un booster de statères ». */
export function boostersGagnesEnMots(bons: Readonly<Partial<Record<PochetteGagnee, number>>>): string[] {
  return POCHETTES_DE_L_ETAL.flatMap((cle) => {
    const n = bons[cle] ?? 0;
    return n < 1 ? [] : [n === 1 ? NOMS_EN_PHRASE[cle].un : `${n} ${NOMS_EN_PHRASE[cle].des}`];
  });
}
