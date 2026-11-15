/**
 * La flamme de série, en pixels : elle brûle près du Gaulois d'un membre tant que sa série de victoires en équipe sous le
 * tag dure, à partir de 5 d'affilée, et s'éteint à la première défaite. Elle se pose sur l'image de la fiche (fond marine)
 * et sur la page de la fiche (page blanche) : son contour sombre la tient sur les deux. Onze cases sur quinze, une langue
 * à droite, un cœur clair en bas. Toujours décorative : le nombre de victoires d'affilée s'écrit en mots à côté.
 * Dessinée case par case pour ce site, sans emprunt à une œuvre existante.
 * Design : Claude Fable 5.2, 15 novembre 2026.
 */
import { type Decor, Planche } from "./village/decor";

/** Du bord au cœur : le contour, la braise, l'orange, le jaune, le cœur. */
const FEU = {
  contour: "#4a1206",
  braise: "#d92d0f",
  orange: "#f5760f",
  jaune: "#ffc61a",
  coeur: "#fff1a8",
};

const LIGNES = [
  "....o......",
  "...oro.....",
  "...orro....",
  "...orero...",
  "..oreero.o.",
  "..oreeeroro",
  ".oreejeerro",
  ".orejjeeero",
  "oreejjjeero",
  "orejjcjjero",
  "orejccjjero",
  "orejcccjero",
  ".orejcjero.",
  "..orrrrro..",
  "...ooooo...",
] as const;

/** La flamme : 11 cases de large, 15 de haut, le pied au milieu de la dernière rangée. */
export const FLAMME: Decor = (() => {
  const planche = new Planche(LIGNES[0].length, LIGNES.length);
  planche.lettres(0, 0, LIGNES, {
    o: FEU.contour,
    r: FEU.braise,
    e: FEU.orange,
    j: FEU.jaune,
    c: FEU.coeur,
  });
  return planche.decor();
})();

/** L'or du record personnel, du bord au cœur : le contour, le vieil or, l'or, l'or clair, l'éclat. Ni rouge ni orange. */
const OR = {
  contour: "#3a2606",
  vieilOr: "#9c6a0c",
  or: "#d9a21b",
  clair: "#ffd84a",
  eclat: "#fffbe6",
};

/**
 * La flamme dorée : la même forme, case pour case, quand la série en cours bat l'ancien record du membre, qui avait lui-même
 * eu sa flamme (5 victoires d'affilée et plus ; `RecordPersonnel.doree`). L'or ne dit rien seul : « son record » s'écrit en
 * mots à côté.
 * Design : Claude Fable 5.2, 15 novembre 2026.
 */
export const FLAMME_DOREE: Decor = (() => {
  const planche = new Planche(LIGNES[0].length, LIGNES.length);
  planche.lettres(0, 0, LIGNES, {
    o: OR.contour,
    r: OR.vieilOr,
    e: OR.or,
    j: OR.clair,
    c: OR.eclat,
  });
  return planche.decor();
})();
