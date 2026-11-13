/**
 * Le Gaulois de chaque membre, premier lot du village des Gaulois (13 novembre 2026, demande du pilote : « leur perso
 * gaulois […] customisé avec des assets gratuit (chapeau, casque) (plastron ou veste, ou t shirt) (pantalon ect...)
 * chausurres »). Un personnage en pixels, 48 cases sur 64, qu'on habille par emplacements : la peau, les cheveux et leur
 * couleur, la barbe, puis les objets : la tête, le haut, le bas, les pieds, l'arme.
 *
 * Les objets sont des cases à l'apparence fixe, chacune d'une rareté (demande du pilote, le même jour : « des petite case
 * avec image - la case coloré en fonction la rareté commun bleu peu commun bleu foncé épique violet mystique rouge
 * légendaire doré et je veux 2 haut 2 bas et 1 botte gratuit commun », puis « tout qui peu se mettre sur la tete meme un
 * slip et créer une catégorie arme avec des truc wtf , médieval ou armée », puis « plus de pixel au personnage »). Les
 * objets gratuits se portent dès maintenant ; les autres sont au catalogue pour la boutique des lots suivants
 * (docs/DIRECTION.md, « Le village des Gaulois ») : le vestiaire les montre verrouillés, sans prix.
 *
 * Des données et des calculs purs : la fonction code-discord (Deno) dessine l'image de /gaulois, le site (Node et
 * navigateur) dessine le vestiaire avec les mêmes grilles (`src/lib/gaulois.ts`). Le serveur garde sa propre liste des
 * objets (table `internal.gaulois_objets`) et refuse toute tenue qui n'y est pas : un test garde les deux listes identiques.
 *
 * Les dessins sont originaux, faits pour le clan [GAL] le 13 novembre 2026. Aucun n'emprunte un personnage, un objet ni
 * une tenue à une œuvre existante : ni casque ailé, ni menhir, ni serpe, ni potion ; un nouvel objet se juge aussi
 * assemblé avec les autres.
 *
 * Une grille s'écrit rangée par rangée, 48 cases de large ; « . » est une case vide, chaque autre lettre une couleur
 * (`FIXES`, la peau, les cheveux, puis les couleurs propres à l'objet). Une minuscule est la couleur, sa majuscule son
 * ombre ; n, y et z sont des lumières.
 */
import { ecrirePng, type Image } from "./billets.ts";

export const GAULOIS_LARGEUR = 48;
export const GAULOIS_HAUTEUR = 64;

/** Un calque : sa première rangée sur la grille du Gaulois, puis ses rangées, de 48 cases chacune. */
export interface Calque {
  y: number;
  lignes: readonly string[];
}

/** Une couleur à choisir : son nom, tel qu'il s'affiche, et les couleurs qu'elle donne aux lettres des grilles. */
export interface Teinte {
  nom: string;
  couleurs: Readonly<Record<string, string>>;
}

/** Les couleurs qui ne changent pas d'un Gaulois à l'autre. */
const FIXES: Readonly<Record<string, string>> = {
  // Le contour, et la bouche.
  k: "#1a1410",
  e: "#4a2418",
  // Le lin.
  u: "#d9cfb4",
  U: "#b3a585",
  // Le cuir.
  l: "#8a5a2b",
  L: "#5e3b1a",
  // L'or et sa lumière.
  g: "#d4a017",
  G: "#9c7410",
  y: "#ffe07a",
  // Le fer et sa lumière.
  m: "#b8c0cc",
  M: "#7d8796",
  n: "#eef2f7",
  // Le fer noirci.
  d: "#5a6270",
  D: "#3c424d",
  // Le bronze.
  c: "#c98a3c",
  C: "#8f5a22",
  // La fourrure et le bois.
  f: "#9a6b3f",
  F: "#6e4a28",
  // La fourrure blanche.
  x: "#f4f1e8",
  X: "#cfc8b8",
  // Le bleu, le blanc et le rouge du clan.
  b: "#1f5fe0",
  B: "#16449f",
  w: "#f2f2f2",
  W: "#c9cfdc",
  r: "#e0283a",
  R: "#a51c2a",
  // Le kaki.
  v: "#6b7a3a",
  V: "#4a562a",
  // L'orange.
  o: "#f08a24",
  O: "#c2661a",
  // La croûte du pain et sa mie.
  a: "#e0a85a",
  A: "#b67a32",
  z: "#f6e2b0",
  // Le caoutchouc jaune.
  j: "#f4d03f",
  J: "#c9a51e",
};

export const PEAUX = {
  claire: { nom: "Claire", couleurs: { s: "#f2c9a0", S: "#d9a77c" } },
  doree: { nom: "Dorée", couleurs: { s: "#e8b48a", S: "#c98e63" } },
  mate: { nom: "Mate", couleurs: { s: "#c08552", S: "#9a643a" } },
  foncee: { nom: "Foncée", couleurs: { s: "#7d4e30", S: "#5c3822" } },
} as const satisfies Record<string, Teinte>;

/** Les couleurs des cheveux, que la barbe et les sourcils reprennent. */
export const POILS = {
  roux: { nom: "Roux", couleurs: { h: "#c4561f", H: "#8e3a12" } },
  blond: { nom: "Blond", couleurs: { h: "#e3c25b", H: "#b69636" } },
  chatain: { nom: "Châtain", couleurs: { h: "#7a4a26", H: "#55321a" } },
  noir: { nom: "Noir", couleurs: { h: "#2e2724", H: "#171312" } },
  gris: { nom: "Gris", couleurs: { h: "#a9a9a9", H: "#7c7c7c" } },
  blanc: { nom: "Blanc", couleurs: { h: "#ececec", H: "#c4c4c4" } },
} as const satisfies Record<string, Teinte>;

/** Les teintures des tissus, comme on teignait la laine et le lin : garance, guède, gaude. */
const ROUGE = { p: "#b8322a", P: "#87241e" };
const BLEU = { p: "#2f5fa8", P: "#1f4278" };
const VERT = { p: "#4f7d3a", P: "#36572a" };
const BRUN = { p: "#7a5232", P: "#573a23" };
const ECRU = { p: "#e8e2d0", P: "#bdb6a2" };
const PAILLE = { p: "#e3c25b", P: "#b69636" };
const BLEU_NUIT = { p: "#3b55a0", P: "#2a3d78" };
/** La seconde couleur d'un objet. */
const SECOND_LIN = { q: "#d9cfb4", Q: "#b3a585" };
const SECOND_JAUNE = { q: "#d1a52e", Q: "#9c7a1f" };
const SECOND_ROUGE = { q: "#b8322a", Q: "#87241e" };

/**
 * Les raretés, de la plus courante à la plus rare. `rang` compte de 1 à 5 : le vestiaire en fait un repère de forme, pour
 * que la rareté ne se lise pas qu'à la couleur. Les couleurs sont des jetons de la feuille de style (`--rarete-…`).
 */
export const RARETES = {
  commun: { nom: "Commun", rang: 1 },
  "peu-commun": { nom: "Peu commun", rang: 2 },
  epique: { nom: "Épique", rang: 3 },
  mystique: { nom: "Mystique", rang: 4 },
  legendaire: { nom: "Légendaire", rang: 5 },
} as const;
export type Rarete = keyof typeof RARETES;
export const ORDRE_RARETES = Object.keys(RARETES) as readonly Rarete[];

// Les dessins : ces grilles font foi. L'atelier `scripts/atelier-gaulois/` les montre, les remplace et en tire des
// planches de contrôle (objets seuls et portés, aux tailles réelles). La lumière vient d'en haut à gauche. Un haut
// s'arrête rangée 46, un bas va des rangées 46 à 57 et des bottes hautes commencent rangée 53 : les braies se voient.
// <dessins>
const CORPS: Calque = {
  y: 10,
  lignes: [
    ".................kkkkkkkkkkkkkk.................",
    "...............kksssssssssssssSkk...............",
    "...............ksssssssssssssssSk...............",
    ".............kksssssssssssssssssSkk.............",
    ".............ksssssssssssssssssssSk.............",
    "............ksssssssssssssssssssssSk............",
    "............kssssssssssssssssssssSSk............",
    "............ksssHHHHssssssssHHHHSSSk............",
    "............ksssssssssssssssssssSSSk............",
    "...........kssssssssssssssssssssSSSkk...........",
    "...........kssssssnkssssssssnkssSSsSk...........",
    "..........kssssssskksssssssskkssSSssSk..........",
    "..........kSsssssskksssssssskkssSSssSk..........",
    "...........ksssssssssssssSssssssSSsSk...........",
    "...........kSssssssssssssSssssssSSSkk...........",
    "............ksssssssssSSSSssssssSSSk............",
    "............kSssssssssssssssssssSSSk............",
    ".............kSsssssessssssesssSSSk.............",
    ".............kksssssseeeeeessssSSkk.............",
    "...............kSsssssssssssssSSk...............",
    "...............kkSSSSSSSSSSSSSSkk...............",
    ".................kkkkkkkkkkkkkk.................",
    "..................kkSSSSSSSSkk..................",
    "..................kSSSSSSSSSSk..................",
    ".............kkkkkksssssssssSkkkkkk.............",
    "...........kksssssssssssssssssssssSkk...........",
    "...........ksssssssssssssssssssssssSk...........",
    ".........kksssssssssssssssssssssssssSkk.........",
    ".........kssssSSssssssssssssssssSSsssSk.........",
    "........ksssssSSsSSSSSssssSSSSSsSSssssSk........",
    "........ksssssSSssssssssssssssssSSssssSk........",
    "........ksssssSSssssssssssssssssSSssssSk........",
    "........ksssssSSssssssssssssssssSSssssSk........",
    "........ksssssSSssssssssssssssssSSssssSk........",
    "........ksssssSSsssssssSSsssssssSSssssSk........",
    "........ksssssSSssssssssssssssssSSssssSk........",
    "........kSsssssSuuuuuuuuuuuuuuuuuSssssSk........",
    ".........kSssSkuuuuuuuuuuuuuuuuuUkSssSk.........",
    ".........kkSSkkuuuuuuuuUUuuuuuuUUkkSSkk.........",
    "...........kkkkuuuuuuuUUUUuuuuUUUkkkk...........",
    ".............kksssssSSSUUUssssSSSkk.............",
    "..............kssssssSSkkssssssSSk..............",
    "..............ksssssssSkksssssssSk..............",
    "..............ksssssssSkksssssssSk..............",
    "..............ksssssssSkksssssssSk..............",
    "..............ksssssssSkksssssssSk..............",
    "..............ksssssssSkksssssssSk..............",
    ".............kssssssssSkkssssssssSk.............",
    ".............kssssssssSkkSsssssssSk.............",
    "............kssssssssSkkkkSsssssssSk............",
    "............kkSSSSSSSkkkkkkSSSSSSSkk............",
    ".............kkkkkkkkkkkkkkkkkkkkkk.............",
  ],
};

/** Les dessins des objets, par emplacement et par objet. */
const DESSINS = {
  cheveux: {
    "courts": {
      y: 8,
      lignes: [
        ".................kkkkkkkkkkkkkk.................",
        "...............kkhhhhhhhhhhhhhHkk...............",
        "...............khhHhhhhHhhhhHhhHk...............",
        ".............kkhhhHhhhhHhhhhHhhhHkk.............",
        ".............khhhHhhhhHhhhhHhhhhHHk.............",
        "...........kkhhhhHhhhhHhhhhHhhhhHhHkk...........",
        "...........khhhhhHhHHhHhhhhHHhhhHhhHk...........",
        "..........khHhhhHHHHHHHHHHHHHHHHHhhhHk..........",
        "..........kHhhhH................HhhhHk..........",
        "..........kHhhH..................HhhHk..........",
        "..........kHhH....................HhHk..........",
        "...........kH......................Hk...........",
      ],
    },
    "longs": {
      y: 8,
      lignes: [
        ".................kkkkkkkkkkkkkk.................",
        "...............kkhhhhhhhhhhhhhHkk...............",
        "...............khhHhhhhHhhhhHhhHk...............",
        ".............kkhhhHhhhhHhhhhHhhhHkk.............",
        ".............khhhHhhhhHhhhhHhhhhHHk.............",
        "...........kkhhhhHhhhhHhhhhHhhhhHhHkk...........",
        "...........khhhhhHhHHhHhhhhHHhhhHhhHk...........",
        "..........khHhhhHHHHHHHHHHHHHHHHHhhhHk..........",
        "..........kHhhhH................HhhhHk..........",
        ".........kkHhhH..................HhhHkk.........",
        ".........kkHhH....................hhHkk.........",
        "........kkhHhH....................hhHHkk........",
        "........kkHhhH....................HHhHkk........",
        "........khHhHH....................HHhhHk........",
        "........khHhHH....................HHhhHk........",
        "........khHhHH....................HHhhHk........",
        "........kHhhHH....................HHhhHk........",
        "........kHhhHH....................HHhhHk........",
        "........kHhhHH....................HHhhHk........",
        "........kHhhHH....................HHhhHk........",
        "........khhhHH....................HHhhHk........",
        "........khhhhH....................HhhhHk........",
        "........khhhhH....................hhhhHk........",
        "........khhhhH....................hhhhHk........",
        "........khhhHH....................hhhHHk........",
        "........khhhHH....................hhhHHk........",
        "........kHhhHH....................hhhHHk........",
        "........kkHhHH....................HhhHkk........",
        "........kkkHHk....................kHHkkk........",
        ".........kkkk......................kkkk.........",
      ],
    },
    "tresses": {
      y: 8,
      lignes: [
        ".................kkkkkkkkkkkkkk.................",
        "...............kkhhhhhhhhhhhhhHkk...............",
        "...............khhhhhhhhhhhhhhhHk...............",
        ".............kkhhhhhhhhhhhhhhhhhHkk.............",
        ".............khhhhhhhhhhhhhhhhhhhHk.............",
        "...........kkhhhhhhhhhhhhhhhhhhhhhHkk...........",
        "...........khhhhhhhHHhhhhhhHHhhhhhhHk...........",
        "..........khhhhhHHHHHHHHHHHHHHHHhhhhHk..........",
        "..........khhhhH................HhhhHk..........",
        "..........khhhH..................HhhHk..........",
        "..........khhH....................hhHk..........",
        ".........kHHhH....................HhHHk.........",
        ".........kHHHk....................kHHHk.........",
        "........kHHHHk....................kHHHHk........",
        "........khhhHk....................khhhHk........",
        "........khhhHk....................khhhHk........",
        "........kHHHHk....................kHHHHk........",
        "........kHHHHk....................kHHHHk........",
        "........khhhHk....................khhhHk........",
        "........khhhHk....................khhhHk........",
        "........kHHHHk....................kHHHHk........",
        "........kHHHHk....................kHHHHk........",
        "........khhhHk....................khhhHk........",
        "........khhhHk....................khhhHk........",
        "........kHHHHk....................kHHHHk........",
        "........kHHHHk....................kHHHHk........",
        "........khhhHk....................khhhHk........",
        "........khhhHk....................khhhHk........",
        "........kHHHHk....................kHHHHk........",
        "........kHHHHk....................kHHHHk........",
        "........khhhHk....................khhhHk........",
        "........khhhHk....................khhhHk........",
        "........klllLk....................klllLk........",
        "........klllLk....................klllLk........",
        "........khhhHk....................khhhHk........",
        ".........khHk......................khHk.........",
        ".........kHHk......................kHHk.........",
        "..........kk........................kk..........",
      ],
    },
    "herisses": {
      y: 0,
      lignes: [
        ".......................kk.......................",
        ".....................kkhHkk.....................",
        "............kk.......khhhHk.......kk............",
        "...........khHk....kkhhhhHHkk....khHk...........",
        "...........khHk....khhhhHhhHk....kHHk...........",
        "..........khhhHk..khhhhhHhhhHk..khHhHk..........",
        "..........khhhHHkkhHhhHHHHhhhHkkhhHhHk..........",
        "..........khhhHhhhhHhhHHHHhhhHhhhhHhHk..........",
        "..........khhHhhhhHhhhhHhhhhHhhhhHhhHk..........",
        "..........khhHhhhhHhhhhHhhhhHhhhhHhhHk..........",
        "..........kHhHhhhhHhhhhHhhhhHhhhhHhhHk..........",
        "...........kHHhhhhHhhhhHhhhhHhhhhHhHk...........",
        "............khhhhHhhhhHhhhhHhhhhHhHk............",
        "............khhhhHhhhhHhhhhHhhhhHhHk............",
        "...........khhhhhHhHHhHhhhhHHhhhHhhHk...........",
        "..........khHhhhHHHHHHHHHHHHHHHHHhhhHk..........",
        "..........kHhhhH................HhhhHk..........",
        "..........kHhhH..................HhhHk..........",
        "..........kHhH....................HhHk..........",
        "...........kH......................Hk...........",
      ],
    },
  },
  barbe: {
    "moustache": {
      y: 26,
      lignes: [
        "...................hhhhhhhhhH...................",
        ".................hhhHHHHHHHHhhH.................",
        ".................hhH........HhH.................",
        "................hHH..........HHh................",
        "................HHH..........HHH................",
        "................HH............HH................",
      ],
    },
    "longue-moustache": {
      y: 26,
      lignes: [
        "...................hhhhhhhhhH...................",
        ".................hhhHHHHHHHHhhH.................",
        ".................hhH........HhH.................",
        "................hhHH........HHhH................",
        "...............khhHk........kHhHk...............",
        "..............khhhHk........khhhHk..............",
        "..............khhhHk........khhhHk..............",
        "..............khhhHk........khhhHk..............",
        "..............kHHHHk........kHHHHk..............",
        "...............kHHk..........kHHk...............",
        "...............kHHk..........kHHk...............",
        "................kk............kk................",
      ],
    },
    "courte": {
      y: 24,
      lignes: [
        ".............kH..................hk.............",
        "............khHH................hhHk............",
        "............kHHH...HhhhhHhhhH...hhHk............",
        ".............kHH..hHhhhhHhhhhH..hHk.............",
        ".............kkHhhHhhHHHHHHhHhhhHkk.............",
        "...............khhHhHHHHkHHHHhhHk...............",
        "................hhHhHHHHHHHHHhhH................",
        "................HhHhhHHHHHHhHhhH................",
        "................kHhhhhHhhhhHhhHk................",
        ".................kHhhhHhhhhHhHk.................",
        ".................kkHHHHHHHHHHkk.................",
        "...................kkkkkkkkkk...................",
      ],
    },
    "grande": {
      y: 22,
      lignes: [
        ".............kh..................hk.............",
        "............khhH................hhHk............",
        "............khHH................hhHk............",
        "............khHH................hhHk............",
        "............khHH...HhhhhHhhhH...hhHk............",
        "............khHH..hHhhhhHhhhhH..hhHk............",
        "............kHhhhhHhhhhHHhhhHhhhhHHk............",
        "............kHhhhhHhhhHkkhhhHhhhhHHk............",
        "............kHhhhhHhHHHHHHHHHhhhhHHk............",
        "............kHhhhhHhHHHHHHHHHhhhhHHk............",
        "............khhhhHhhhhHhhhhHhhhhHhHk............",
        "............khhhhHhhhhHhhhhHhhhhHhHk............",
        "............kHhhhHhhHHHHHHHHhhhhHhHk............",
        ".............kHhhHhhHHHHHHHHhhhhHHk.............",
        ".............kkHHhhhhHhhhhHhhhhHHkk.............",
        "...............kHhhhhHhhhhHhhhhHk...............",
        "...............kkHhhhHHHHHHhhhHkk...............",
        ".................kHhHHHHHHHHhHk.................",
        ".................kkHHHHHHHHHHkk.................",
        "...................kkkkkkkkkk...................",
      ],
    },
  },
  tete: {
    "bonnet": {
      y: 4,
      lignes: [
        "...................kkkkkkkkkk...................",
        ".................kkppPppPppPPkk.................",
        ".................kPppPppPppPpPk.................",
        "...............kkpPppPppPppPppPkk...............",
        "...............kPPPppPppPppPpPPPk...............",
        ".............kkPPPPPpPppPppPPPPPPkk.............",
        ".............kPPPPPPpPppPppPPPPPPPk.............",
        "...........kkPPPPPPPpPppPppPPPPPPPPkk...........",
        "...........kqQQqQQqQQqQQqQQqQQqQQqQQk...........",
        "..........kQqQQqQQqQQqQQqQQqQQqQQqQQqk..........",
        "..........kQqQQqQQqQQqQQqQQqQQqQQqQQqk..........",
        "...........kqQQqQQqQQqQQqQQqQQqQQqQQk...........",
        "...........kkQQqQQqQQqQQqQQqQQqQQqQkk...........",
        ".............kkkkkkkkkkkkkkkkkkkkkk.............",
      ],
    },
    "bandeau": {
      y: 10,
      lignes: [
        ".............kkkkkkkkkkkkkkkkkkkkkk.............",
        "...........kkpppppppppppppppppppppPkk...........",
        "...........kpppppppppppppppppppppppPk...........",
        "..........kpppppppppppppppppppppppppPk..........",
        "..........kPPPPPPPPPPPPPPPPPPPPPPPPPPkpPk.......",
        "...........kPPPPPPPPPPPPPPPPPPPPPPPPkkppPkk.....",
        "...........kkPPPPPPPPPPPPPPPPPPPPPPkk.PppPk.....",
        ".............kkkkkkkkkkkkkkkkkkkkkk...PPPpPk....",
        "......................................kPPPPk....",
        ".......................................kPPk.....",
        ".......................................kPPk.....",
        "........................................kk......",
      ],
    },
    "capuche": {
      y: 4,
      lignes: [
        ".................kkkkkkkkkkkkkk.................",
        "...............kkpppppppppppppPkk...............",
        "...............kpppppppppppppppPk...............",
        ".............kkpppppppppppppppppPkk.............",
        ".............kpppppppppppppppppppPk.............",
        "...........kkpppppppppppppppppppppPkk...........",
        "...........kPPPPPPPppppppppppPPPPPPPk...........",
        ".........kkPPPPPPPPPPppppppPPPPPPPPPPkk.........",
        ".........kPPPPPPPPPPPPPPPPPPPPPPPPPPPPk.........",
        "........kPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPk........",
        "........kppPPPPPPPPPPPPPPPPPPPPPPPPPPpPk........",
        "........kpppPPkkkkkkkkkkkkkkkkkkkkPPppPk........",
        "........kpppPP....................PPppPk........",
        "........kpppPP....................PPppPk........",
        "........kpppPP....................PPppPk........",
        "........kpppPP....................PPppPk........",
        "........kpppPP....................PPppPk........",
        "........kpppPP....................PPppPk........",
        "........kpppPP....................PPppPk........",
        "........kpppPP....................PPppPk........",
        "........kpppPP....................PPppPk........",
        "........kpppPP....................PPppPk........",
        "........kpppPP....................PPppPk........",
        "........kpppPP....................PPppPk........",
        "........kpppPP....................PPppPk........",
        "........kpppPP....................PPppPk........",
        "........kpppPP....................PPppPk........",
        "........kpppPPP..................PPPppPk........",
        "........kPppPPPPP..............PPPPPppPk........",
        "........kkPpPPPPPP............PPPPPPpPkk........",
        "........kkkPPPPPPPkk........kkPPPPPPPkkk........",
        ".........kkkkkkkkkkk........kkkkkkkkkkk.........",
      ],
    },
    "casque": {
      y: 0,
      lignes: [
        ".......................kk.......................",
        ".....................kkyGkk.....................",
        ".....................kyggGk.....................",
        "...................kkyggggGkk...................",
        "...................knnmmmmmMk...................",
        ".................kknnnmmmmmmMkk.................",
        "...............kkknnnnmmmmmmmMkkk...............",
        ".............kkMMnnnnmmmmmmmmmmMMkk.............",
        ".............kMMMMMMmmmmmmmmMMMMMMk.............",
        "............kMMMMMMmmmmmmmmmMMMMMMMk............",
        "............kMMMMMMmmmmmmmmmmMMMMMMk............",
        "...........kGMMMMMmmmmmmmmmmmmMMMMMGk...........",
        "...........kGGGGGGGGGGGGGGGGGGGGGGGGk...........",
        "..........kGGGGGGGGGGGGGGGGGGGGGGGGGGk..........",
        "..........kkGGGGGGGGGGGGGGGGGGGGGGGGkk..........",
        "..........kkkkkkkkkkkkkkkkkkkkkkkkkkkk..........",
        "..........kknM....................MMkk..........",
        "..........knmM....................MMMk..........",
        "..........knmM....................MMMk..........",
        "..........knmM....................MMMk..........",
        "..........knmM....................MMMk..........",
        "..........knmM....................MMMk..........",
        "..........kMmM....................MMMk..........",
        "..........kkMM....................MMkk..........",
        "..........kkkk....................kkkk..........",
        "...........kk......................kk...........",
      ],
    },
    "casque-crete": {
      y: 0,
      lignes: [
        ".....................kkkkkk.....................",
        "....................kbbBbbBk....................",
        "...................kbbbBbbBBk...................",
        "...................kbbbBbbBBk...................",
        "...................kbbbBbbBBk...................",
        "...................kbbbBbbBBk...................",
        "....................kbbBbbBk....................",
        "....................kbbBbbBk....................",
        "...............kycyyykbBbbBkyycCk...............",
        ".............kkyccyyykggggGkyyccCkk.............",
        ".............kCCccyycycccccyyyccCCk.............",
        "...........kkCCCccyyccccccccyyccCCCkk...........",
        "...........kyggggggggggggggggggggggGk...........",
        "..........kyggggggggggggggggggggggggGk..........",
        "..........kkGGGGGGGGGGGGGGGGGGGGGGGGkk..........",
        "..........kkkkkkkkkkkkkkkkkkkkkkkkkkkk..........",
        "..........kkyC....................yCkk..........",
        "..........kycC....................ycCk..........",
        "..........kycC....................ycCk..........",
        "..........kycC....................ycCk..........",
        "..........kycC....................ycCk..........",
        "..........kycC....................ycCk..........",
        "..........kCCC....................CCCk..........",
        "..........kkCC....................CCkk..........",
        "..........kkkk....................kkkk..........",
        "...........kk......................kk...........",
      ],
    },
    "casque-or": {
      y: 0,
      lignes: [
        ".....................kkkkkk.....................",
        "...................kkyyyyyykk...................",
        "...................kyyggggyyk...................",
        ".................kkyyggggggyykk.................",
        ".................kkyggggggggGkk.................",
        "...............kkyyggggggggggyykk...............",
        "...............kyyggggggggggggyyk...............",
        ".............kkyyggggggggggggggyykk.............",
        ".............kyyygrrggggggggrrgyyyk.............",
        "...........kkyyyggrrggggggggrrggyyykk...........",
        "...........kygrrggrrgggrrgggrrggrrgGk...........",
        ".........kkyggrrggrrggrrrrggrrggrrggGkk.........",
        ".........kGGGGGGGGGGGGGGGGGGGGGGGGGGGGk.........",
        "........kGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGk........",
        "........kkGGGGGGGGGGGGGGGGGGGGGGGGGGGGkk........",
        "........kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk........",
        "........kkyyyy....................yyyGkk........",
        "........kyggyy....................yyggGk........",
        "........kyggrR....................rrggGk........",
        "........kyggrR....................rrggGk........",
        "........kyggyy....................yyggGk........",
        "........kygggy....................ygggGk........",
        "........kygggG....................ygggGk........",
        "........kygggG....................ygggGk........",
        "........kGGGGG....................GGGGGk........",
        ".........kGGGG....................GGGGk.........",
        ".........kkGGk....................kGGkk.........",
        "...........kk......................kk...........",
      ],
    },
    "chapeau-paille": {
      y: 4,
      lignes: [
        "...................kkkkkkkkkk...................",
        ".................kkPppPPPPPPPkk.................",
        ".................kppPpPpPPppPPk.................",
        "...............kkppPPppPPPPpPpPkk...............",
        "...............kppPPpPPPPPPPPPpPk...............",
        ".............kkpppPPpPPpppppPPppPkk.............",
        ".......kkkkkkkkqqqqqqqqqqqqqqqqqQkkkkkkkk.......",
        ".....kkpPPppPPpqqqqqqqqqqqqqqqqqqpPPpPPPpkk.....",
        "....kpPPPPPPPPPpPPpPPPPpppPPppPPppPPppPPPPPk....",
        "....kPPPPPPpPPppPPppPPppPpPPppPPpPPPppPPpPPk....",
        ".....kkPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPkk.....",
        ".......kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk.......",
      ],
    },
    "beret": {
      y: 4,
      lignes: [
        ".......................kk.......................",
        ".....................kkkkkk.....................",
        ".................kkkkkkkkkkkkkk.................",
        "...............kkpppppppppppppPkk...............",
        ".............kkpppppppppppppppppPkk.............",
        "...........kkpppppppppppppppppppppPkk...........",
        "...........kpppppppppppppppppppppppPk...........",
        "..........kpppppppppppppppppppppppppPk..........",
        "..........kPPPPPPPPPPPPPPPPPPPPPPPPPPk..........",
        "...........kPPPPPPPPPPPPPPPPPPPPPPPPk...........",
        "...........kkPPPPPPPPPPPPPPPPPPPPPPkk...........",
        ".............kkkkkkkkkkkkkkkkkkkkkk.............",
      ],
    },
    "casque-cuir": {
      y: 6,
      lignes: [
        ".................kkkkkkkkkkkkkk.................",
        "...............kklllllnnnnllllLkk...............",
        "...............kllllllnnnnlllllLk...............",
        ".............kkllllllllnnlllllllLkk.............",
        ".............kllllLLllllllllLLlllLk.............",
        "...........kkllllLLLLllllllLLLLlllLkk...........",
        "...........kLLLLLLLLLLLLLLLLLLLLLLLLk...........",
        "..........kLLLLLLLLLLLLLLLLLLLLLLLLLLk..........",
        "..........kkLLLLLLLLLLLLLLLLLLLLLLLLkk..........",
        "..........kkkkkkkkkkkkkkkkkkkkkkkkkkkk..........",
        "..........kklL....................lLkk..........",
        "..........kllL....................llLk..........",
        "..........kllL....................llLk..........",
        "..........kllL....................llLk..........",
        "..........kLLL....................LLLk..........",
        "..........kkLL....................LLkk..........",
        "..........kkkk....................kkkk..........",
        "...........kk......................kk...........",
      ],
    },
    "marmite": {
      y: 2,
      lignes: [
        "............kkkkkkkkkkkkkkkkkkkkkkkk............",
        "...........kdddddddddddddddddddddddDk...........",
        "...........kdnnnnddddddddddddddddddDk...........",
        "...........kdddddddddddddddddddddDDDk...........",
        "...........kdnddddddddddddddddddDDDDk...........",
        ".........kkkdnddddddddddddddddddDDDDkkk.........",
        "........kmmkdnddddddddddddddddddDDDDkmMk........",
        "........km.kddddddddddddddddddddDDDDk.Mk........",
        "........km.kddddddddddddddddddddDDDDk.Mk........",
        "........kMMkddddddddddddddddddddDDDDkMMk........",
        ".........kkkddddddddddddddddddddDDDDkkk.........",
        "..........knmmmmmmmmmmmmmmmmmmmmmmmMMk..........",
        "..........kMMMMMMMMMMMMMMMMMMMMMMMMMMk..........",
        "...........kkkkkkkkkkkkkkkkkkkkkkkkkk...........",
      ],
    },
    "toque": {
      y: 0,
      lignes: [
        "...............kkkkkkkkkkkkkkkkkk...............",
        ".............kkwwwwwwwwwwwwwwwwwWkk.............",
        "...........kkwwwwwwwwwwwwwwwwwwwwwWkk...........",
        ".........kkwwwwwwwwwwwwwwwwwwwwwwwwwWkk.........",
        ".........kwwwwwwWWwwwwwwwwwwwwWWwwwwwWk.........",
        "........kwwwwwwwWWwwwwwwwwwwwwWWwwwwwwWk........",
        "........kWwwWWwwwwwwwwwwwwwwwwwwwwWWwwWk........",
        "........kkwwWWwwwwwwwwwwwwwwwwwwwwWWwWkk........",
        "........kkWwwwwwwwWWwwwwwwwwWWwwwwwwwWkk........",
        ".........kkwwwwwwWWWWwwwwwwWWWWwwwwwWkk.........",
        ".........kkWWWwwWWwwWWwwwwWWwwWWwwWWWkk.........",
        "..........kWWWwwWWwwWWwwwwWWwwWWwwWWWk..........",
        "..........kwwwwwwwwwwwwwwwwwwwwwwwwwWk..........",
        "..........kwwwwwwwwwwwwwwwwwwwwwwwwwWk..........",
        "..........kWWWWWWWWWWWWWWWWWWWWWWWWWWk..........",
        "...........kWWWWWWWWWWWWWWWWWWWWWWWWk...........",
        "...........kkWWWWWWWWWWWWWWWWWWWWWWkk...........",
        ".............kkkkkkkkkkkkkkkkkkkkkk.............",
      ],
    },
    "casque-armee": {
      y: 4,
      lignes: [
        "...................kkkkkkkkkk...................",
        ".................kkvvvvvvvvvVkk.................",
        "...............kkvvvvvvvvvvvvvVkk...............",
        ".............kkvvvvvvvvvvvvvvvvvVkk.............",
        ".............kvvvvVVvvvvvvvvVVvvvVk.............",
        "...........kkvvvvvVVvvvvvvvvVVvvvvVkk...........",
        "...........kvvVVvvvvvvvvvvvvvvvvVVvVk...........",
        ".........kkvvVVVVvvvvvvvvvvvvvvVVVVvVkk.........",
        ".........kVVVVVVVVVVVVVVVVVVVVVVVVVVVVk.........",
        "........kVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVk........",
        "........kkVVVVVVVVVVVVVVVVVVVVVVVVVVVVkk........",
        ".........kkkkkkkkkkkkkkkkkkkkkkkkkkkkkk.........",
        "............LL....................LL............",
        "............LL....................LL............",
        "............LL....................LL............",
        "............LL....................LL............",
        "............LL....................LL............",
        "............LL....................LL............",
        "............LL....................LL............",
        "............LL....................LL............",
        "............LL....................LL............",
        "............LL....................LL............",
      ],
    },
    "slip": {
      y: 4,
      lignes: [
        "...........kkkkkkkkkkkkkkkkkkkkkkkkkk...........",
        "..........kbbbbbbbbbbbrrrrbbbbbbbbbbBk..........",
        "..........kBBBBBBBBBBBRRRRBBBBBBBBBBBk..........",
        "..........kwwwwwwwwwwwwWWwwwwwwwwwwwWk..........",
        "..........kwwwwwwwwwwwwWWwwwwwwwwwwwWk..........",
        "...........kWwwwwwwwwwWwwWwwwwwwwwwWk...........",
        "............kWwwwwwwwwWwwWwwwwwwwwWk............",
        ".............kkWwwwwwWwwwwWwwwwwWkk.............",
        "...............kkWwwwWwwwwWwwwWkk...............",
        ".................kWwwWwwwwWwwWk.................",
        "..................kWwWWWWWWwWk..................",
        "..................kWwwwwwwwwWk..................",
        "...................kkkkkkkkkk...................",
      ],
    },
    "cone": {
      y: 0,
      lignes: [
        ".....................koooOk.....................",
        "....................koooooOk....................",
        "....................koooooOk....................",
        "...................koooooooOk...................",
        "...................koooooooOk...................",
        "..................koooooooooOk..................",
        "..................kwwwwwwwwwWk..................",
        ".................kkwwwwwwwwwWkk.................",
        ".................koooooooooooOk.................",
        "...............kkoooooooooooooOkk...............",
        "...............kwwwwwwwwwwwwwwwWk...............",
        "..............kwwwwwwwwwwwwwwwwwWk..............",
        "..............koooooooooooooooooOk..............",
        "..............koooooooooooooooooOk..............",
        "........kkOOOOOOOOOOOOOOOOOOOOOOOOOOOOkk........",
        "........kkOOOOOOOOOOOOOOOOOOOOOOOOOOOOkk........",
        ".........kkOOOOOOOOOOOOOOOOOOOOOOOOOOkk.........",
        "...........kkkkkkkkkkkkkkkkkkkkkkkkkk...........",
      ],
    },
    "tricorne": {
      y: 5,
      lignes: [
        "...................kkkkkkkkkk...................",
        ".................kkddddddddDDkk.................",
        "................kddddddddddddDDk................",
        "......kkk.....kkdddddddbwrdddddDkk.....kkk......",
        ".....kdddkkkkkddddddddbbwrrdddddDDkkkkkdDDk.....",
        ".....kddddddddddddddddbbwrrddddddddddddDDDk.....",
        ".....kgdddddddddddddddddwdddddddddddddDDDGk.....",
        "......kggggdddddddddddddddddddddddDDGGGGGk......",
        ".......kkGggggggggggggggggggggggggggGGGkk.......",
        ".........kkkGGGGGGGGGGGGGGGGGGGGGGGGkkk.........",
        "............kkkkkkkkkkkkkkkkkkkkkkkk............",
      ],
    },
    "couronne": {
      y: 4,
      lignes: [
        "............kk....kk...kk...kk....kk............",
        "...........kyyk..kyk..kyGk..kyk..kyyk...........",
        "...........kyyykkyyykkyggGkkyyykkyyyk...........",
        "..........kyyyybyyyyyrgggggryyyybyyyyk..........",
        "..........kyggbbggggrrggggrrggggbbggGk..........",
        "..........kyggbbggggrrggggrrggggbbggGk..........",
        "..........kyggggggggggggggggggggggggGk..........",
        "..........kyggggggggggggggggggggggggGk..........",
        "..........kGGGGGGGGGGGGGGGGGGGGGGGGGGk..........",
        "..........kkGGGGGGGGGGGGGGGGGGGGGGGGkk..........",
        "..........kkkGGGGGGGGGGGGGGGGGGGGGGkkk..........",
        "...........kkkkkkkkkkkkkkkkkkkkkkkkkk...........",
      ],
    },
  },
  haut: {
    "tunique": {
      y: 34,
      lignes: [
        ".............kkkkkk..........kkkkkk.............",
        "...........kkpppppPk........kpppppPkk...........",
        "...........kppppppppP......PpppppppPk...........",
        ".........kkppppppppppP....PpppppppppPkk.........",
        ".........kppppPPppppppPPPPppppppPPpppPk.........",
        "........kppppPPPppppppppppppppppPPPpppPk........",
        "........kPPPPPPPppppppppppppppppPPPPPPPk........",
        ".........kPPPPPPppppppppppppppppPPPPPPk.........",
        "..............kPppppppppppppppppPk..............",
        "..............klllllllggggllllllLk..............",
        "..............kLLLLLLLGGGGLLLLLLLk..............",
        "..............kpppppppppppppppppPk..............",
        "..............kPPPPPPPPPPPPPPPPPPk..............",
      ],
    },
    "chemise": {
      y: 34,
      lignes: [
        ".............kkkkkk..........kkkkkk.............",
        "...........kkpppppPk........kpppppPkk...........",
        "...........kppppppppP......PpppppppPk...........",
        ".........kkppppppppppP....PpppppppppPkk.........",
        ".........kppppPPppppppLLLLppppppPPpppPk.........",
        "........kpppppPPpppppppLLpppppppPPppppPk........",
        "........kpppppPPppppppppppppppppPPppppPk........",
        "........kpppppPPppppppppppppppppPPppppPk........",
        "........kpppppPPppppppppppppppppPPppppPk........",
        "........kppppPPPLLllLLllllLLllLLPPPpppPk........",
        "........kPPPPPPPppppppppppppppppPPPPPPPk........",
        ".........kPPPPPPppppppppppppppppPPPPPPk.........",
        "..............kPPPPPPPPPPPPPPPPPPk..............",
      ],
    },
    "tunique-rouge": {
      y: 34,
      lignes: [
        ".............kkkkkk..........kkkkkk.............",
        "...........kkpppppPk........kpppppPkk...........",
        "...........kppppppppq......qpppppppPk...........",
        ".........kkppppppppppq....qpppppppppPkk.........",
        ".........kppppPPpppppqqqqqqpppppPPpppPk.........",
        "........kpppppPPppppppppppppppppPPppppPk........",
        "........kqqqqqqqppppppppppppppppqqqqqqQk........",
        ".........kQQQQQqppppppppppppppppqQQQQQk.........",
        "..............kPppppppppppppppppPk..............",
        "..............klllllllggggllllllLk..............",
        "..............kLLLLLLLGGGGLLLLLLLk..............",
        "..............kpppppppppppppppppPk..............",
        "..............kqqqqqqqqqqqqqqqqqQk..............",
      ],
    },
    "veste-peau": {
      y: 34,
      lignes: [
        ".............kkkkkk..........kkkkkk.............",
        "...........kkfffffFk........kfffffFkk...........",
        "...........kffFffFfF........fFffFfFFk...........",
        ".........kkfFffFffFF........fFfFffFfFkk.........",
        ".........kffFfFffFfF........ffFfFFfFfFk.........",
        "........kffFffFFffFF........fFfFfFFffFFk........",
        "........kFFFFFFFFfFF........fFFFFFFFFFFk........",
        ".........kFFFFFFffFF........ffFFFFFFFFk.........",
        "..............kffFfFk......kfFffFk..............",
        "..............kfFffFFk....kfffFFFk..............",
        "..............klllllllyyyyllllllLk..............",
        "..............kLLLLLLLGGGGLLLLLLLk..............",
      ],
    },
    "cotte-mailles": {
      y: 34,
      lignes: [
        ".............kkkkkk..........kkkkkk.............",
        "...........kknnmmmMk........knnmmmMkk...........",
        "...........kMmMmMmMmMmMmMmMmMmMmMmMmk...........",
        ".........kkMmMmMmMmMmMmMmMmMmMmMmMmMmkk.........",
        ".........kMmMmMmMmMmMmMmMmMmMmMmMmMmMmk.........",
        "........kMmMmMmkmMmMmMmMmMmMmMmMmkmMmMmk........",
        "........kmMmMmMkMmMmMmMmMmMmMmMmMkMmMmMk........",
        ".........kmMmMmkmMmMmMmMmMmMmMmMmkmMmMk.........",
        "..............kmMmMmMmMmMmMmMmMmMk..............",
        "..............kLLLLLLLggggLLLLLLLk..............",
        "..............kLLLLLLLGGGGLLLLLLLk..............",
        "..............kmMmMmMmMmMmMmMmMmMk..............",
        "..............kMmMmMmMmMmMmMmMmMmk..............",
        "..............kMMMMMMMMMMMMMMMMMMk..............",
      ],
    },
    "maillot-clan": {
      y: 34,
      lignes: [
        ".............kkkkkk..........kkkkkk.............",
        "...........kkbbbbbBk........krrrrrRkk...........",
        "...........kbbbbbbbbwwwwwwwwrrrrrrrRk...........",
        ".........kkbbbbbbbbbwwwwwwwwrrrrrrrrRkk.........",
        ".........kbbbbbBbbbbwwwwwwwwrrrrrRrrrRk.........",
        "........kbbbbbBkbbbbwwwwwwwwrrrrRkrrrrRk........",
        "........kBBBBBBkbbbbwwwwwwwwrrrrRkRRRRRk........",
        ".........kBBBBBkbbbbwwwwwwwwrrrrRkRRRRk.........",
        "..............kbbbbbwwwwwwwwrrrrRk..............",
        "..............kbbbbbwwwwwwwwrrrrRk..............",
        "..............kbbbbbwwwwwwwwrrrrRk..............",
        "..............kbbbbbwwwwwwwwrrrrRk..............",
        "..............kBBBBBWWWWWWWWRRRRRk..............",
      ],
    },
    "cape-chef": {
      y: 34,
      lignes: [
        ".......kkkkkkkkkkkk..........kkkkkkkkkkkk.......",
        ".....kkRrRkkkrrrrrRk........krrrrrRkkkrrRkk.....",
        ".....kRRrrRkrrrrrrrry......yrrrrrrrRkrrrRRk.....",
        "....kRRRrrrrrrrrrrrrgG....ygrrrrrrrrRkrrRRRk....",
        "....kRRRrrrrrrRRrrrrccyyyyccrrrrRRrrrrrRRRRk....",
        "....kRRRRRrrrRRRrrrccccccccccrrrRRRrrrRkRRRk....",
        "....kRRRRkRRRRRRrrrccyyyyyyccrrrRRRRRRRkRRRk....",
        "....kRRRRkRRRRRRrrccyyyyyyyyccrrRRRRRRRkRRRk....",
        "....kRRRRk....kRrrrccyyyyyyccrrrRk....kRRRRk....",
        "....kRRRRk....klllllllggggllllllLk....kRRRRk....",
        "....kRRRRk....kLLLLLLLGGGGLLLLLLLk....kRRRRk....",
        "....kRRRRk....krrrrrrrrrrrrrrrrrRk....kRRRRk....",
        "....kRRRRk....kyggggggggggggggggGk....kRRRRk....",
        "....kRRRRk............................kRRRRk....",
        "....kRRRRk............................kRRRRk....",
        "....krRRRRk..........................kRRRRRk....",
        "....krRRrRRRRR....................RRRRrRRRRk....",
        "....krRRrRRRRR....................RRRRrRRRRk....",
        "....krRRrRRRRR....................RRRRrRRRRk....",
        "....krRRrRRRRR....................RRRRrRRRRk....",
        "....krRRrRRRRR....................RRRRrRRRRk....",
        "....kyggyggggG....................GggggyggGk....",
        ".....kkkkkkkkk....................kkkkkkkkk.....",
      ],
    },
    "torque-or": {
      y: 34,
      lignes: [
        ".......kkkkkkkkkkkkky......ykkkkkkkkkkkkk.......",
        ".....kkxxXxxxXxxxXxggG....yggXxxxXxxxXxxXkk.....",
        ".....kxxXxxxXxxxXxxxGGyyyyGGXxxxXxxxXxxxXXk.....",
        "....kxxXxxxXxxxXxxxXGGyyyyGGxxxXxxxXxxxXxxXk....",
        "....kxXxXXXxXXXxxXwwwwwwwwwwwwXxxxXXxxXXxxXk....",
        "....kXxxXXXXXXXxXwwwwwwwwwwwwwwXxXXXXXXXxXXk....",
        "....kyggGk....kxwwwwwwwwwwwwwwwwWk....kXggGk....",
        "....kyggGkyyGGGkwwwwwwwwwwwwwwwwWkGGyyykygGk....",
        "....kyggGkyyGGGkwwwwwwwwwwwwwwwwWkGGyyykygGk....",
        "....kyggGk....kyggyyggyyyyggyyggGk....kyggGk....",
        "....kyggGk....kGggGGggGGGGggGGggGk....kyggGk....",
        "....kyggGk....kwwwwwwwwwwwwwwwwwWk....kyggGk....",
        "....kyggGk....kyggggggggggggggggGk....kyggGk....",
        "....kyggGk............................kyggGk....",
        "....kyggGk............................kyggGk....",
        "....kygggGk..........................kygggGk....",
        "....kyggygggGG....................GGgggyggGk....",
        "....kyggygggGG....................GGgggyggGk....",
        "....kyggygggGG....................GGgggyggGk....",
        "....kyggygggGG....................GGgggyggGk....",
        "....kyggygggGG....................GGgggyggGk....",
        "....kxXxxXxxXx....................xXxxXxxXxk....",
        ".....kkkkkkkkk....................kkkkkkkkk.....",
      ],
    },
  },
  bas: {
    "braies": {
      y: 46,
      lignes: [
        "..............klLLlLLlLLlLLlLLlLLk..............",
        "..............kpppppppppppppppppPk..............",
        "..............kppppppppPPpppppppPk..............",
        "..............kpPPPpppPPPPppppppPk..............",
        "..............kppppppPPPPPPpppppPk..............",
        "..............kppppppPPkkPppppppPk..............",
        "..............kppppppPPkkPppppppPk..............",
        "..............kppppppPPkkPpPPPppPk..............",
        "..............kppppppPPkkPppppppPk..............",
        "..............kppppppPPkkPppppppPk..............",
        "..............kppppppPPkkPppppppPk..............",
        "...............kPPPPPPkkkkPPPPPPk...............",
      ],
    },
    "braies-carreaux": {
      y: 46,
      lignes: [
        "..............klllllllllllllllllLk..............",
        "..............kpppqpppqpppqpppqpPk..............",
        "..............kqqqqqqqqQQqqqqqqqQk..............",
        "..............kpppqpppQPPPqpppqpPk..............",
        "..............kpppqppPQPPPQpppqpPk..............",
        "..............kpppqppPQkkPqpppqpPk..............",
        "..............kqqqqqqQqkkQqqqqqqQk..............",
        "..............kpppqppPQkkPqpppqpPk..............",
        "..............kpppqppPQkkPqpppqpPk..............",
        "..............kpppqppPQkkPqpppqpPk..............",
        "..............kqqqqqqQqkkQqqqqqqQk..............",
        "...............kPPQPPPkkkkQPPPQPk...............",
      ],
    },
    "braies-bleues": {
      y: 46,
      lignes: [
        "..............kQqqqQqqqQqqqQqqqQQk..............",
        "..............kpppppqpqpppppppppPk..............",
        "..............kpppppQpQPPpppppppPk..............",
        "..............kpppppppPPPPppppppPk..............",
        "..............kppppppPPPPPPpppppPk..............",
        "..............kppppppPPkkPppppppPk..............",
        "..............kppppppPPkkPppppppPk..............",
        "..............kppppppPPkkPppppppPk..............",
        "..............kqqqqqqQQkkQqqqqqqQk..............",
        "..............kppppppPPkkPppppppPk..............",
        "..............kppppppPPkkPppppppPk..............",
        "...............kPPPPPPkkkkPPPPPPk...............",
      ],
    },
    "braies-rayees": {
      y: 46,
      lignes: [
        "..............klllllllllllllllllLk..............",
        "..............kpppppppppppppppppPk..............",
        "..............kqqqqqqqqQQqqqqqqqQk..............",
        "..............kqqqqqqqQQQQqqqqqqQk..............",
        "..............kppppppPPPPPPpppppPk..............",
        "..............kppppppPPkkPppppppPk..............",
        "..............kqqqqqqQQkkQqqqqqqQk..............",
        "..............kqqqqqqQQkkQqqqqqqQk..............",
        "..............kppppppPPkkPppppppPk..............",
        "..............kppppppPPkkPppppppPk..............",
        "..............kqqqqqqQQkkQqqqqqqQk..............",
        "...............kQQQQQQkkkkQQQQQQk...............",
      ],
    },
    "braies-cuir": {
      y: 46,
      lignes: [
        "..............kDnDDnDDnDDnDDnDDnDk..............",
        "..............klllllllllllllllllLk..............",
        "..............klnlllmllLLllnlllmLk..............",
        "..............klllllllLLLLllllllLk..............",
        "..............klnlllmLLLLLLnlllmLk..............",
        "..............kllnmmlLLkkLllnmmlLk..............",
        "..............klnMMMmLLkkLlnMMMmLk..............",
        "..............kllllllLLkkLllllllLk..............",
        "..............klnlllmLLkkLlnlllmLk..............",
        "..............kllllllLLkkLllllllLk..............",
        "..............klnlllmLLkkLlnlllmLk..............",
        "...............kLLLLLLkkkkLLLLLLk...............",
      ],
    },
    "jambieres-bronze": {
      y: 46,
      lignes: [
        "..............kcCcccCcyyyyccCcccCk..............",
        "..............krrrrrrrrrrrrrrrrrRk..............",
        "..............krrrrrrrrRRrrrrrrrRk..............",
        "..............kRRRRRRRRRRRRRRRRRRk..............",
        "..............kyyyyyyccccccyyyyyck..............",
        "..............kyyccccCCkkyycccccCk..............",
        "..............kyycyCcCCkkyycyCccCk..............",
        "..............kyyccCcCCkkyyccCccCk..............",
        "..............kyyccCcCCkkyyccCccCk..............",
        "..............kyyccCcCCkkyyccCccCk..............",
        "..............kyyCCCCCCkkyyCCCCCCk..............",
        "...............kyCCCCCkkkkyCCCCCk...............",
      ],
    },
    "braies-or": {
      y: 46,
      lignes: [
        "..............kggygggygggygggyggGk..............",
        "..............kygwwwwwwwwwwwwwwgGk..............",
        "..............kygwwwwwwWWwwwwwwgGk..............",
        "..............kygwwgwwWWWWwwgwwgGk..............",
        "..............kygwgygWWWWWWgygwgGk..............",
        "..............kygwwgwWWkkWwwgwwgGk..............",
        "..............kygwwwwWWkkWwwwwwgGk..............",
        "..............kygwwwwWWkkWwwwwwgGk..............",
        "..............kygwwwwWWkkWwwwwwgGk..............",
        "..............kgygygyGykkGygygygyk..............",
        "..............kggggggGGkkGggggggGk..............",
        "...............kgWWWWWkkkkWWWWWgk...............",
      ],
    },
  },
  pieds: {
    "bottes": {
      y: 55,
      lignes: [
        "..............kkkkkkkkkkkkkkkkkkkk..............",
        "..............kllllllLLkkllllllLLk..............",
        ".............kLLLLLLLLLkkLLLLLLLLLk.............",
        ".............kllllllllLkkllllllllLk.............",
        "............kllllllllLkkkkLlllllllLk............",
        "............kkLLLLLLLkkkkkkLLLLLLLkk............",
        ".............kkkkkkkkkkkkkkkkkkkkkk.............",
      ],
    },
    "sandales": {
      y: 56,
      lignes: [
        "..............kllllllllkkllllllllk..............",
        ".............ksssLlsssSkksssLlsssSk.............",
        ".............klllllllLLkkllllllllLk.............",
        "............kssssssssSkkkkSsssssssSk............",
        "............kkLLLLLLLkkkkkkLLLLLLLkk............",
        ".............kkkkkkkkkkkkkkkkkkkkkk.............",
      ],
    },
    "bottes-fourrees": {
      y: 53,
      lignes: [
        "..............kkkkkkkkkkkkkkkkkkkk..............",
        "..............kazaazaazkkzaazaazak..............",
        "..............kFffFffFFkkffFffFfFk..............",
        "..............klllllllLkklllllllLk..............",
        ".............kLLLLLLLLLkkLLLLLLLLLk.............",
        ".............kllllllllLkkllllllllLk.............",
        "............kllllllllLkkkkllllllllLk............",
        "............kkLLLLLLLkkkkkkLLLLLLLkk............",
        ".............kkkkkkkkkkkkkkkkkkkkkk.............",
      ],
    },
    "bottes-fer": {
      y: 53,
      lignes: [
        "..............kkkkkkkkkkkkkkkkkkkk..............",
        "..............knmmmmmmMkknmmmmmmMk..............",
        "..............kLLLmMLLDkkLLLmMLLDk..............",
        "..............kLLLmMLLDkkLLLmMLLDk..............",
        ".............kLLLLmMLLDkkLLLmMLLLDk.............",
        ".............knnmLLLLLDkkLLLLLLmmMk.............",
        "............knnmmLLLLDkkkkLLLLLmmMMk............",
        "............kkMMMMMMMkkkkkkMMMMMMMkk............",
        ".............kkkkkkkkkkkkkkkkkkkkkk.............",
      ],
    },
    "bottes-ecarlates": {
      y: 53,
      lignes: [
        "..............kkkkkkkkkkkkkkkkkkkk..............",
        "..............kyggggggGkkyggggggGk..............",
        "..............krorrrrrRkkrorrrrrRk..............",
        "..............krrrrrrrRkkrrrrrrrRk..............",
        ".............kRRRRygRRRkkRRRygRRRRk.............",
        ".............krrrrrrrrRkkrrrrrrrrRk.............",
        "............krrrrrrrrRkkkkrrrrrrrrRk............",
        "............kkRRRRRRRkkkkkkRRRRRRRkk............",
        ".............kkkkkkkkkkkkkkkkkkkkkk.............",
      ],
    },
    "bottes-or": {
      y: 53,
      lignes: [
        "..............kkkkkkkkkkkkkkkkkkkk..............",
        "..............kxxxXxxxXkkxXxxxXxXk..............",
        "..............kXxxxXxxXkkxxXxxxXXk..............",
        "..............kyggygggGkkygggyggGk..............",
        ".............kyygyryggGkkyggyryggGk.............",
        ".............kyyggygggGkkygggygggGk.............",
        "............kyyygggggGkkkkygggggggGk............",
        "............kkyyGGGGGkkkkkkGGGGGGGkk............",
        ".............kkkkkkkkkkkkkkkkkkkkkk.............",
      ],
    },
  },
  arme: {
    "gourdin": {
      y: 20,
      lignes: [
        ".......................................kkkk.....",
        ".....................................kkFffFkk...",
        ".....................................kfFfffFk...",
        "....................................kffFffffFk..",
        "....................................kfffFFfFFk..",
        "....................................kfffFFFFFk..",
        "....................................kfffffFFFk..",
        "....................................kfffffFFFk..",
        "....................................kfFFFFFFFk..",
        "....................................kfFFFFFFFk..",
        "....................................kFFFffFFFk..",
        ".....................................kFFffFFk...",
        ".....................................kkfFFFkk...",
        "......................................kFFFFk....",
        "......................................kfffFk....",
        "......................................kfffFk....",
        "......................................kffFFk....",
        "......................................kffFFk....",
        "......................................kffFFk....",
        "......................................kffFFk....",
        "......................................kfffFk....",
        "......................................kfffFk....",
        "......................................kfffFk....",
        "......................................kfffFk....",
        "......................................kffFFk....",
        "......................................kffFFk....",
        "......................................ssfFFk....",
        "......................................SsfFFk....",
        "......................................kSFFFk....",
        ".......................................kFFk.....",
        ".......................................kFFk.....",
        "........................................kk......",
      ],
    },
    "baguette": {
      y: 14,
      lignes: [
        ".........................................kk.....",
        ".......................................kkaAkk...",
        ".......................................kaaaAk...",
        "......................................kaaaaaAk..",
        "......................................kzzzaaAk..",
        "......................................kzzzzaAk..",
        "......................................kaazzzzk..",
        "......................................kaaazzzk..",
        "......................................kaaaaaAk..",
        "......................................kaaaaaAk..",
        "......................................kzzzaaAk..",
        "......................................kzzzzaAk..",
        "......................................kaazzzzk..",
        "......................................kaaazzzk..",
        "......................................kaaaaaAk..",
        "......................................kaaaaaAk..",
        "......................................kzzzaaAk..",
        "......................................kzzzzaAk..",
        "......................................kaazzzzk..",
        "......................................kaaazzzk..",
        "......................................kaaaaaAk..",
        "......................................kaaaaaAk..",
        "......................................kzzzaaAk..",
        "......................................kzzzzaAk..",
        "......................................kaazzzzk..",
        "......................................kaaazzzk..",
        "......................................kaaaaaAk..",
        "......................................kaaaaaAk..",
        "......................................kaaaaAAk..",
        "......................................kaaaAAAk..",
        "......................................kaaaAAAk..",
        "......................................kaaaAAAk..",
        "......................................ssaaAAAk..",
        "......................................SsaAAAAk..",
        "......................................kSAAAAAk..",
        ".......................................kAAAAk...",
        ".......................................kkAAkk...",
        ".........................................kk.....",
      ],
    },
    "poele": {
      y: 20,
      lignes: [
        ".......................................kkkkkk...",
        ".....................................kkMMMMMMkk.",
        ".....................................kMDDDDDDMk.",
        "....................................kMDDwwwDDDMk",
        "....................................kMDwwwwwDDMk",
        "....................................kMDwwjjwwDMk",
        "....................................kMDwwjjwwDMk",
        "....................................kMDDwwwwDDMk",
        "....................................kMDDDwwDDDMk",
        ".....................................kMDDDDDDMk.",
        ".....................................kkMMMMMMkk.",
        "......................................kdddDkk...",
        "......................................kdddDk....",
        "......................................kdddDk....",
        "......................................kdddDk....",
        "......................................kdddDk....",
        "......................................kdddDk....",
        "......................................kdddDk....",
        "......................................kdddDk....",
        "......................................kdddDk....",
        "......................................kdddDk....",
        "......................................kdddDk....",
        "......................................kdddDk....",
        "......................................kdddDk....",
        "......................................kdddDk....",
        "......................................kdddDk....",
        "......................................ssddDk....",
        "......................................SsddDk....",
        "......................................kSLLLk....",
        ".......................................kLLk.....",
        ".......................................kLLk.....",
        "........................................kk......",
      ],
    },
    "hache": {
      y: 16,
      lignes: [
        ".......................................kk.......",
        "......................................kkfkk.....",
        "......................................kffFFkk...",
        "......................................kffFfnMkk.",
        "......................................kFffmmmMk.",
        "......................................kFffmmmmMk",
        "......................................kFffmmmnnk",
        "......................................kFffmmnnnk",
        "......................................kfffmmnnnk",
        "......................................kfffmmmnnk",
        "......................................kfffmmmmMk",
        "......................................kfffmmmMk.",
        "......................................kFffFMMkk.",
        "......................................kFffFkk...",
        "......................................kFffFkk...",
        "......................................kFffFk....",
        "......................................kfffFk....",
        "......................................kfffFk....",
        "......................................kfffFk....",
        "......................................kfffFk....",
        "......................................kffFFk....",
        "......................................kffFFk....",
        "......................................kffFFk....",
        "......................................kffFFk....",
        "......................................kfffFk....",
        "......................................kfffFk....",
        "......................................kfffFk....",
        "......................................kfffFk....",
        "......................................kffFFk....",
        "......................................kffFFk....",
        "......................................ssfFFk....",
        "......................................SsfFFk....",
        "......................................kSFFFk....",
        ".......................................kFFk.....",
        ".......................................kFFk.....",
        "........................................kk......",
      ],
    },
    "bouclier-bois": {
      y: 34,
      lignes: [
        "...................................kkkkkk.......",
        ".................................kkFFfffFkk.....",
        ".................................kfFFffffFk.....",
        "...............................kkFfFFffffFFkk...",
        "...............................kfFfFFFfffFfFk...",
        "..............................kffFfFFFfffFffFk..",
        "..............................kFffFFFmnnFFffFk..",
        "..............................kFffFFmmmnFFffFk..",
        "..............................kFffffMmmmffffFk..",
        "..............................kFfffffMmfffffFk..",
        "..............................kFFfFFffFfFFFfFk..",
        "...............................kFfFFffFfFFFFk...",
        "...............................kkFfFffFffFFkk...",
        ".................................kFFffFffFk.....",
        ".................................kkFFFFFFkk.....",
        "...................................kkkkkk.......",
      ],
    },
    "poulet": {
      y: 16,
      lignes: [
        ".........................................rrrR...",
        "........................................rrrrrR..",
        ".......................................kjjjjjJk.",
        "......................................kjjjjjjjJk",
        "......................................kjjjjJjjoO",
        "......................................kjjjJkjjoO",
        "......................................kjjjjjjrRk",
        "......................................kjjjjJrRk.",
        "......................................kjjjJk....",
        "......................................kjjjJk....",
        "......................................kjjjJk....",
        ".....................................kjjjjjJk...",
        ".....................................kjjjjjJk...",
        "....................................kjjjjjjjJkk.",
        "....................................kjjjjjjjjJk.",
        "....................................kjjjjjjjjjJk",
        "....................................kjjjJJjjjjJk",
        "....................................kjjjJJJjjJk.",
        "....................................kJjjjJjJJkk.",
        ".....................................kjjjjJJk...",
        ".....................................kJjjjJkk...",
        "......................................kjjjJk....",
        "......................................koooOk....",
        "......................................koooOk....",
        "......................................koooOk....",
        "......................................koooOk....",
        "......................................koooOk....",
        "......................................koooOk....",
        "......................................koooOk....",
        "......................................koooOk....",
        "......................................ssooOk....",
        "......................................sooooOk...",
        "....................................kkooooooOk..",
        "....................................kkOooooOOk..",
        ".....................................kkOOOOkk...",
        ".......................................kkkk.....",
      ],
    },
    "talkie": {
      y: 22,
      lignes: [
        "..........................................kk....",
        "..........................................kk....",
        "..........................................nM....",
        "..........................................nM....",
        "..........................................nM....",
        "..........................................nM....",
        "..........................................nM....",
        "..........................................nM....",
        "..........................................nM....",
        "..........................................nM....",
        "..........................................nM....",
        "..........................................nM....",
        ".......................................kkkMMk...",
        "......................................kkkvkkkk..",
        "......................................kkvvvVkk..",
        "......................................kvvvvvVk..",
        "......................................kvvvvnnk..",
        "......................................kvvvnnnk..",
        "......................................kVVVVVVk..",
        "......................................kVVVVVVk..",
        "......................................kvvvvvVk..",
        "......................................kvvvvvVk..",
        "......................................kVVVVVVk..",
        "......................................kVVVVVVk..",
        "......................................ssvvvvVk..",
        "......................................SsvvvVkk..",
        "......................................kSVVVkkk..",
        ".......................................kkkkkk...",
      ],
    },
    "epee": {
      y: 12,
      lignes: [
        ".........................................kk.....",
        ".......................................kknnkk...",
        ".......................................knnmMk...",
        "......................................knnnmmMk..",
        "......................................knnnmmMk..",
        "......................................knnnmmMk..",
        "......................................knnnmmMk..",
        "......................................knnnmmMk..",
        "......................................knnnmmMk..",
        "......................................knnnmmMk..",
        "......................................knnnmmMk..",
        "......................................knnnmmMk..",
        "......................................knnnmmMk..",
        "......................................knnnmmMk..",
        "......................................knnnmmMk..",
        "......................................knnnmmMk..",
        "......................................knnnmmMk..",
        "......................................knnnmmMk..",
        "......................................knnnmmMk..",
        "......................................knnnmmMk..",
        "......................................knnnmmMk..",
        "......................................knnnmmMk..",
        "......................................knnnmmMk..",
        "......................................knnnmmMk..",
        "......................................knnnmmMk..",
        ".....................................kynnnmmmyk.",
        "....................................kyggggGGggGk",
        "....................................kGggggGGggGk",
        ".....................................kGgLLlllGk.",
        "......................................kLLLllLk..",
        "......................................kLLLllLk..",
        "......................................kLLLllLk..",
        "......................................kLLLllLk..",
        "......................................kLLLllLk..",
        "......................................ssLLllLk..",
        "......................................SsLLllLk..",
        "......................................kSggGGGk..",
        ".......................................kGgGGk...",
        ".......................................kkGGkk...",
        ".........................................kk.....",
      ],
    },
    "arc": {
      y: 30,
      lignes: [
        "...........................................kfFk.",
        ".........................................kkFffFk",
        ".........................................kfffuUk",
        "........................................kfffuUk.",
        "........................................kfffuU..",
        ".......................................kfffFuU..",
        ".......................................kfFF.uU..",
        "......................................kffF..uU..",
        "......................................kffF..uU..",
        "......................................kffF..uU..",
        "......................................kffF..uU..",
        "......................................kffF..uU..",
        "......................................kffF..uU..",
        "......................................kffF..uU..",
        "......................................kffF..uU..",
        "......................................kffF..uU..",
        "......................................ssfF..uU..",
        "......................................SsfF..uU..",
        "......................................ksFF..uU..",
        "......................................kfFF..uU..",
        "......................................kfFF..uU..",
        "......................................kfFF..uU..",
        "......................................kffF..uU..",
        "......................................kffF..uU..",
        "......................................kFfF..uU..",
        ".......................................kffF.uU..",
        ".......................................kFfFfuU..",
        "........................................kfFfuU..",
        "........................................kFFfuUk.",
        ".........................................kFffuUk",
        ".........................................kkFffFk",
        "...........................................kFFk.",
      ],
    },
    "drapeau": {
      y: 12,
      lignes: [
        "........................................kk......",
        ".......................................kyGk.....",
        ".......................................kyGk.....",
        "......................................kyggGkk...",
        "......................................kffFFkkkk.",
        "......................................kffFfbwwrk",
        "......................................kffFbbwwrR",
        "......................................kffFbbwwrR",
        "......................................kFffbbwwrR",
        "......................................kFffbbwwrR",
        "......................................kFffbbwwrR",
        "......................................kFffbbwwrR",
        "......................................kfffbbwwrR",
        "......................................kfffbbwwrR",
        "......................................kfffbbwwrR",
        "......................................kfffbbwwrR",
        "......................................kFffFBWWRk",
        "......................................kFffFkkkk.",
        "......................................kFffFkk...",
        "......................................kFffFk....",
        "......................................kfffFk....",
        "......................................kfffFk....",
        "......................................kfffFk....",
        "......................................kfffFk....",
        "......................................kffFFk....",
        "......................................kffFFk....",
        "......................................kffFFk....",
        "......................................kffFFk....",
        "......................................kfffFk....",
        "......................................kfffFk....",
        "......................................kfffFk....",
        "......................................kfffFk....",
        "......................................kffFFk....",
        "......................................kffFFk....",
        "......................................ssfFFk....",
        "......................................SsfFFk....",
        "......................................kSFFFk....",
        ".......................................kFFk.....",
        ".......................................kFFk.....",
        "........................................kk......",
      ],
    },
    "masse": {
      y: 12,
      lignes: [
        "........................................nn......",
        "........................................nn......",
        ".......................................knnk.....",
        ".....................................kkdkkdkk...",
        ".....................................kddnndDk...",
        "....................................kddmmmddDk..",
        "..................................nnnknmmdDDDknn",
        "..................................nnnknmdDDDDknn",
        "....................................kdddDDDdDk..",
        ".....................................kDdDDdDk...",
        ".....................................kkDDDDkk...",
        "......................................kkkkkk....",
        "......................................kfffFk....",
        "......................................kfffFk....",
        "......................................kfffFk....",
        "......................................kfffFk....",
        "......................................kFffFk....",
        "......................................kFffFk....",
        "......................................kFffFk....",
        "......................................kFffFk....",
        "......................................kfffFk....",
        "......................................kfffFk....",
        "......................................kfffFk....",
        "......................................kfffFk....",
        "......................................kffFFk....",
        "......................................kffFFk....",
        "......................................kffFFk....",
        "......................................kffFFk....",
        "......................................kfffFk....",
        "......................................kfffFk....",
        "......................................kfffFk....",
        "......................................kfffFk....",
        "......................................kffFFk....",
        "......................................kffFFk....",
        "......................................ssfFFk....",
        "......................................SsfFFk....",
        "......................................kSFFFk....",
        ".......................................kFFk.....",
        ".......................................kFFk.....",
        "........................................kk......",
      ],
    },
    "lance-patates": {
      y: 12,
      lignes: [
        ".......................................kkkkkk...",
        "......................................kaaaaafk..",
        ".....................................kaaFaaaffk.",
        ".....................................kaaaaaFffk.",
        ".....................................kafaaaaffk.",
        "......................................kaaaaffk..",
        ".......................................kkkkkk...",
        ".......................................o.yy.o...",
        "........................................yooy....",
        ".......................................yoyyoy...",
        "........................................oyyo....",
        "......................................kkkkkkkk..",
        ".....................................kvvvvvvVVk.",
        ".....................................kkvvvvvVkk.",
        "......................................kvvvvvVk..",
        "......................................kvvvvvVk..",
        "......................................kvvvvvVk..",
        "......................................kvvvvvVk..",
        "......................................kvvvvvVk..",
        "......................................kddddDDk..",
        "......................................kvvvvvVk..",
        "......................................kvvvvvVk..",
        "......................................kvvvvvVk..",
        "......................................kvvvvvVk..",
        "......................................kvvvvvVk..",
        "......................................kvvvvvVk..",
        "......................................kvvvvvVk..",
        "......................................kvvvvvVk..",
        "......................................kvvvvvVk..",
        "......................................kddddDDk..",
        "......................................kvvvvvVk..",
        "......................................kvvvvvVk..",
        "......................................kvvvvvVk..",
        "......................................kvvvvvVk..",
        "......................................ssvvvvVk..",
        "......................................SsvvvvVk..",
        "......................................kSvvvVVk..",
        "......................................kvvvvVVk..",
        "......................................kVVVVVVk..",
        ".......................................kkkkkk...",
      ],
    },
    "bouclier-bronze": {
      y: 28,
      lignes: [
        ".....................................kkkk.......",
        "...................................kkcyyCkk.....",
        "...................................kccggCCk.....",
        ".................................kkcccggCCCkk...",
        ".................................kcrccggcCrCk...",
        "................................kcccccggccCCCk..",
        "................................kcccccggccCCCk..",
        "...............................kccccccggcccCCCk.",
        "...............................kccccccggcccCCCk.",
        "..............................kccccccggggcccCCCk",
        "..............................kccccccgyygcccCCCk",
        "..............................kccccggyyyyggcCCCk",
        "..............................kcrcggyyrryyggCrCk",
        "..............................kcrcggyyrryyggCrCk",
        "..............................kccccggyyyyggcCCCk",
        "..............................kccccccgyygcccCCCk",
        "..............................kCcccccggggcccCCCk",
        "...............................kccccccggcccCCCk.",
        "...............................kCcccccggcccCCCk.",
        "................................kcccccggccCCCk..",
        "................................kCccccggccCCCk..",
        ".................................kCrccggcCrCk...",
        ".................................kkCccggCCCkk...",
        "...................................kCcggCCk.....",
        "...................................kkCGGCkk.....",
        ".....................................kkkk.......",
      ],
    },
    "epee-or": {
      y: 12,
      lignes: [
        ".........................................kk.....",
        ".......................................kkyykk...",
        ".......................................kyygGk...",
        "......................................kyyyggGk..",
        "......................................kyyyggGk..",
        "......................................kyyyggGk..",
        "......................................kyyyggGk..",
        "......................................kyyyggGk..",
        "......................................kyyyggGk..",
        "......................................kyyyggGk..",
        "......................................kyyyggGk..",
        "......................................kyyyggGk..",
        "......................................kyyyggGk..",
        "......................................kyyyggGk..",
        "......................................kyyyggGk..",
        "......................................kyyyggGk..",
        "......................................kyyyggGk..",
        "......................................kyyyggGk..",
        "......................................kyyyggGk..",
        "......................................kyyyggGk..",
        "......................................kyyyggGk..",
        "......................................kyyyggGk..",
        "......................................kyyyggGk..",
        ".....................................kkyyyggGkk.",
        ".....................................kkyyyggGkk.",
        "....................................kkyyyygggGkk",
        "....................................kyggrrrgggGk",
        ".....................................kygrrrrgGk.",
        ".....................................kGgLLlllGk.",
        "......................................kLLLllLk..",
        "......................................kLLLllLk..",
        "......................................kLLLllLk..",
        "......................................kLLLllLk..",
        "......................................kLLLllLk..",
        "......................................ssLLllLk..",
        "......................................SsLLllLk..",
        "......................................kSggyyyk..",
        ".......................................kGgyyk...",
        ".......................................kkGykk...",
        ".........................................kk.....",
      ],
    },
    "carnyx": {
      y: 14,
      lignes: [
        ".......................................kk.kk....",
        "......................................kyGkyGk...",
        "......................................kygkygkkk.",
        ".....................................kyyyygggGGk",
        ".....................................kyyggkggggk",
        ".....................................kygggggggGk",
        ".....................................kyggggkkkk.",
        ".....................................kygggk.rr..",
        ".....................................kygggGkkkk.",
        ".....................................kyggggggGGk",
        ".....................................kyGggGkkkk.",
        "......................................kygGk.....",
        "......................................kygGk.....",
        "......................................kygGk.....",
        "......................................kygGk.....",
        "......................................krrRk.....",
        "......................................kygGk.....",
        "......................................kygGk.....",
        "......................................kygGk.....",
        "......................................kygGk.....",
        "......................................kygGk.....",
        "......................................kygGk.....",
        "......................................kygGk.....",
        "......................................krrRk.....",
        "......................................kygGk.....",
        "......................................kygGk.....",
        "......................................kygGk.....",
        "......................................kygGk.....",
        "......................................kygGk.....",
        "......................................kygGk.....",
        "......................................kygGk.....",
        "......................................krrRk.....",
        "......................................ssgGk.....",
        "......................................SsgGk.....",
        "......................................kSGGk.....",
        "......................................kygGk.....",
        "......................................kygGk.....",
        "......................................kyGGk.....",
        ".......................................kGk......",
        "........................................k.......",
      ],
    },
  },
} as const satisfies Record<string, Record<string, Calque>>;
// </dessins>

/**
 * Un objet du vestiaire : son nom, son dessin (aucun pour « rien »), ses couleurs propres, sa rareté et s'il est gratuit.
 * Le corps (peau, cheveux, barbe) et les cases « rien » sont gratuits et sans rareté.
 */
export interface Objet {
  nom: string;
  dessin: Calque | null;
  couleurs: Readonly<Record<string, string>>;
  rarete: Rarete | null;
  gratuit: boolean;
  /** Pour un objet de tête : cache le haut des cheveux, qui dépasserait d'un bonnet ou d'un casque. */
  couvre?: boolean;
}

export const EMPLACEMENTS = ["peau", "cheveux", "barbe", "tete", "haut", "bas", "pieds", "arme"] as const;
export type Emplacement = (typeof EMPLACEMENTS)[number];

/** Les emplacements du corps, puis ceux des objets à rareté. */
export const EMPLACEMENTS_CORPS = ["peau", "cheveux", "barbe"] as const satisfies readonly Emplacement[];
export const EMPLACEMENTS_OBJETS = ["tete", "haut", "bas", "pieds", "arme"] as const satisfies readonly Emplacement[];

export const NOMS_EMPLACEMENTS: Readonly<Record<Emplacement, string>> = {
  peau: "Peau",
  cheveux: "Cheveux",
  barbe: "Barbe",
  tete: "Tête",
  haut: "Haut",
  bas: "Bas",
  pieds: "Pieds",
  arme: "Arme",
};

type Couleurs = Readonly<Record<string, string>>;
const corps = (nom: string, dessin: Calque | null): Objet => ({ nom, dessin, couleurs: {}, rarete: null, gratuit: true });
const rien = (nom: string): Objet => corps(nom, null);
const gratuit = (nom: string, dessin: Calque, couleurs: Couleurs = {}): Objet => ({ nom, dessin, couleurs, rarete: "commun", gratuit: true });
const boutique = (nom: string, rarete: Rarete, dessin: Calque, couleurs: Couleurs = {}): Objet => ({ nom, dessin, couleurs, rarete, gratuit: false });
/** Une coiffe qui cache le haut des cheveux. */
const couvrant = (objet: Objet): Objet => ({ ...objet, couvre: true });

/**
 * Le catalogue, emplacement par emplacement, dans l'ordre où le vestiaire le montre : les gratuits, puis la boutique de la
 * rareté la plus courante à la plus rare. Les cheveux choisissent toujours une couleur, même rasés : la barbe la reprend.
 */
export const OBJETS: Readonly<Record<Emplacement, Readonly<Record<string, Objet>>>> = {
  peau: Object.fromEntries(Object.entries(PEAUX).map(([id, teinte]) => [id, rien(teinte.nom)])),
  cheveux: {
    aucun: rien("Rasés"),
    courts: corps("Courts", DESSINS.cheveux.courts),
    longs: corps("Longs", DESSINS.cheveux.longs),
    tresses: corps("Tresses", DESSINS.cheveux.tresses),
    herisses: corps("Hérissés", DESSINS.cheveux.herisses),
  },
  barbe: {
    aucune: rien("Aucune"),
    moustache: corps("Moustache", DESSINS.barbe.moustache),
    "longue-moustache": corps("Longue moustache", DESSINS.barbe["longue-moustache"]),
    courte: corps("Barbe courte", DESSINS.barbe.courte),
    grande: corps("Grande barbe", DESSINS.barbe.grande),
  },
  tete: {
    aucun: rien("Tête nue"),
    bonnet: couvrant(gratuit("Bonnet de laine", DESSINS.tete.bonnet, { ...ROUGE, ...SECOND_LIN })),
    bandeau: boutique("Bandeau", "commun", DESSINS.tete.bandeau, ROUGE),
    "chapeau-paille": couvrant(boutique("Chapeau de paille", "commun", DESSINS.tete["chapeau-paille"], { ...PAILLE, ...SECOND_ROUGE })),
    beret: couvrant(boutique("Béret", "commun", DESSINS.tete.beret, BLEU_NUIT)),
    capuche: couvrant(boutique("Capuche", "peu-commun", DESSINS.tete.capuche, VERT)),
    "casque-cuir": couvrant(boutique("Casque de cuir", "peu-commun", DESSINS.tete["casque-cuir"])),
    marmite: couvrant(boutique("Marmite", "peu-commun", DESSINS.tete.marmite)),
    casque: couvrant(boutique("Casque de fer", "epique", DESSINS.tete.casque)),
    toque: couvrant(boutique("Toque de cuisinier", "epique", DESSINS.tete.toque)),
    "casque-armee": couvrant(boutique("Casque kaki", "epique", DESSINS.tete["casque-armee"])),
    slip: boutique("Slip", "epique", DESSINS.tete.slip),
    "casque-crete": couvrant(boutique("Casque à crête", "mystique", DESSINS.tete["casque-crete"])),
    cone: couvrant(boutique("Cône de chantier", "mystique", DESSINS.tete.cone)),
    tricorne: couvrant(boutique("Tricorne", "mystique", DESSINS.tete.tricorne)),
    "casque-or": couvrant(boutique("Casque d'or", "legendaire", DESSINS.tete["casque-or"])),
    couronne: boutique("Couronne", "legendaire", DESSINS.tete.couronne),
  },
  haut: {
    aucun: rien("Torse nu"),
    tunique: gratuit("Tunique bleue", DESSINS.haut.tunique, BLEU),
    chemise: gratuit("Chemise de lin", DESSINS.haut.chemise, ECRU),
    "tunique-rouge": boutique("Tunique rouge", "commun", DESSINS.haut["tunique-rouge"], { ...ROUGE, ...SECOND_JAUNE }),
    "veste-peau": boutique("Veste en peau", "peu-commun", DESSINS.haut["veste-peau"]),
    "cotte-mailles": boutique("Cotte de mailles", "epique", DESSINS.haut["cotte-mailles"]),
    "maillot-clan": boutique("Maillot du clan", "epique", DESSINS.haut["maillot-clan"]),
    "cape-chef": boutique("Cape de chef", "mystique", DESSINS.haut["cape-chef"]),
    "torque-or": boutique("Torque d'or", "legendaire", DESSINS.haut["torque-or"]),
  },
  bas: {
    aucun: rien("Pagne"),
    braies: gratuit("Braies brunes", DESSINS.bas.braies, BRUN),
    "braies-carreaux": gratuit("Braies à carreaux", DESSINS.bas["braies-carreaux"], { ...VERT, ...SECOND_JAUNE }),
    "braies-bleues": boutique("Braies bleues", "commun", DESSINS.bas["braies-bleues"], { ...BLEU, ...SECOND_LIN }),
    "braies-rayees": boutique("Braies rayées", "peu-commun", DESSINS.bas["braies-rayees"], { ...BRUN, ...SECOND_ROUGE }),
    "braies-cuir": boutique("Braies cloutées", "epique", DESSINS.bas["braies-cuir"]),
    "jambieres-bronze": boutique("Jambières de bronze", "mystique", DESSINS.bas["jambieres-bronze"]),
    "braies-or": boutique("Braies brodées d'or", "legendaire", DESSINS.bas["braies-or"]),
  },
  pieds: {
    nus: rien("Pieds nus"),
    bottes: gratuit("Bottes de cuir", DESSINS.pieds.bottes),
    sandales: boutique("Sandales", "commun", DESSINS.pieds.sandales),
    "bottes-fourrees": boutique("Bottes fourrées", "peu-commun", DESSINS.pieds["bottes-fourrees"]),
    "bottes-fer": boutique("Bottes ferrées", "epique", DESSINS.pieds["bottes-fer"]),
    "bottes-ecarlates": boutique("Bottes écarlates", "mystique", DESSINS.pieds["bottes-ecarlates"]),
    "bottes-or": boutique("Bottes dorées", "legendaire", DESSINS.pieds["bottes-or"]),
  },
  arme: {
    aucune: rien("Mains nues"),
    gourdin: gratuit("Gourdin", DESSINS.arme.gourdin),
    baguette: boutique("Baguette de pain", "commun", DESSINS.arme.baguette),
    poele: boutique("Poêle", "commun", DESSINS.arme.poele),
    hache: boutique("Hache", "peu-commun", DESSINS.arme.hache),
    "bouclier-bois": boutique("Bouclier de bois", "peu-commun", DESSINS.arme["bouclier-bois"]),
    poulet: boutique("Poulet en caoutchouc", "peu-commun", DESSINS.arme.poulet),
    talkie: boutique("Talkie-walkie", "peu-commun", DESSINS.arme.talkie),
    epee: boutique("Épée de fer", "epique", DESSINS.arme.epee),
    arc: boutique("Arc", "epique", DESSINS.arme.arc),
    drapeau: boutique("Drapeau du clan", "epique", DESSINS.arme.drapeau),
    masse: boutique("Masse d'armes", "mystique", DESSINS.arme.masse),
    "lance-patates": boutique("Lance-patates", "mystique", DESSINS.arme["lance-patates"]),
    "bouclier-bronze": boutique("Bouclier de bronze", "mystique", DESSINS.arme["bouclier-bronze"]),
    "epee-or": boutique("Épée d'or", "legendaire", DESSINS.arme["epee-or"]),
    carnyx: boutique("Carnyx d'or", "legendaire", DESSINS.arme.carnyx),
  },
};

/**
 * L'ordre des calques, du fond vers le devant : les bottes sur les braies, la barbe sur la tunique, la capuche sur les
 * cheveux, l'arme par-dessus tout.
 */
const ORDRE: readonly Emplacement[] = ["bas", "pieds", "haut", "barbe", "cheveux", "tete", "arme"];

/** Sous une coiffe qui couvre, les cheveux ne se dessinent qu'à partir de cette rangée : les tempes et la nuque. */
const HAUT_DES_CHEVEUX = 14;

/** La clé de la couleur des cheveux, seule couleur au choix d'une tenue. */
export const TEINTE_CHEVEUX = "teinte_cheveux";

/**
 * Une tenue : pour chaque emplacement, l'objet porté, et la couleur des cheveux sous `teinte_cheveux`. Rien d'autre : le
 * serveur refuse une clé en trop (`internal.gaulois_tenue_valide`).
 */
export type Tenue = Readonly<Record<string, string>>;

/** Le Gaulois proposé à qui n'en a pas encore, tout en objets gratuits : roux, moustachu, en tunique bleue. */
export const TENUE_DE_DEPART: Tenue = {
  peau: "claire",
  cheveux: "courts",
  teinte_cheveux: "roux",
  barbe: "moustache",
  tete: "aucun",
  haut: "tunique",
  bas: "braies-carreaux",
  pieds: "bottes",
  arme: "gourdin",
};

const aCle = (objetJson: object, cle: string): boolean => Object.prototype.hasOwnProperty.call(objetJson, cle);

/** Une tenue complète, faite d'objets du catalogue et d'une couleur de cheveux, sans rien d'autre ; sinon `null`. */
export function lireTenue(valeur: unknown): Tenue | null {
  if (valeur === null || typeof valeur !== "object" || Array.isArray(valeur)) return null;
  const brute = valeur as Record<string, unknown>;
  const tenue: Record<string, string> = {};
  for (const emplacement of EMPLACEMENTS) {
    const id = brute[emplacement];
    if (typeof id !== "string" || !aCle(OBJETS[emplacement], id)) return null;
    tenue[emplacement] = id;
  }
  const teinte = brute[TEINTE_CHEVEUX];
  if (typeof teinte !== "string" || !aCle(POILS, teinte)) return null;
  tenue[TEINTE_CHEVEUX] = teinte;
  return Object.keys(brute).length === Object.keys(tenue).length ? tenue : null;
}

/** L'objet est-il gratuit ? Faux aussi pour un objet inconnu. */
export const estGratuit = (emplacement: Emplacement, id: string): boolean => OBJETS[emplacement][id]?.gratuit === true;

/** La tenue ne porte-t-elle que des objets gratuits ? Les seules que le serveur enregistre tant que la boutique n'existe pas. */
export const tenueGratuite = (tenue: Tenue): boolean => EMPLACEMENTS.every((emplacement) => estGratuit(emplacement, tenue[emplacement] ?? ""));

/** La tenue après le choix d'un autre objet ; inchangée si l'objet n'existe pas. */
export function changerObjet(tenue: Tenue, emplacement: Emplacement, id: string): Tenue {
  return aCle(OBJETS[emplacement], id) ? { ...tenue, [emplacement]: id } : tenue;
}

/** Une tenue tirée au hasard parmi les objets gratuits. `hasard` rend un nombre de 0 inclus à 1 exclu, comme `Math.random`. */
export function tenueAuHasard(hasard: () => number): Tenue {
  const pioche = <T>(liste: readonly T[]): T => liste[Math.min(liste.length - 1, Math.floor(hasard() * liste.length))] as T;
  const tenue: Record<string, string> = {};
  for (const emplacement of EMPLACEMENTS) {
    tenue[emplacement] = pioche(Object.keys(OBJETS[emplacement]).filter((id) => estGratuit(emplacement, id)));
  }
  tenue[TEINTE_CHEVEUX] = pioche(Object.keys(POILS));
  return tenue;
}

/** Les couleurs communes à tous les calques d'un Gaulois : les fixes, sa peau, ses cheveux. */
function couleursDeBase(tenue: Tenue): Couleurs {
  const peau = PEAUX[tenue["peau"] as keyof typeof PEAUX]?.couleurs ?? PEAUX.claire.couleurs;
  const poils = POILS[tenue[TEINTE_CHEVEUX] as keyof typeof POILS]?.couleurs ?? POILS.roux.couleurs;
  return { ...FIXES, ...peau, ...poils };
}

/**
 * Le Gaulois case par case, rangée par rangée : 48 × 64 couleurs « #rrggbb », `null` pour une case vide. La tenue doit
 * être lue par `lireTenue` ; une lettre sans couleur laisserait la case vide (un test l'interdit).
 */
export function casesDuGaulois(tenue: Tenue): (string | null)[] {
  const cases: (string | null)[] = new Array<string | null>(GAULOIS_LARGEUR * GAULOIS_HAUTEUR).fill(null);
  const base = couleursDeBase(tenue);
  const poser = (calque: Calque, couleurs: Couleurs, depuis = 0) => {
    calque.lignes.forEach((ligne, dy) => {
      if (calque.y + dy < depuis) return;
      for (let x = 0; x < GAULOIS_LARGEUR; x++) {
        const lettre = ligne[x];
        if (lettre === undefined || lettre === ".") continue;
        const couleur = couleurs[lettre];
        if (couleur) cases[(calque.y + dy) * GAULOIS_LARGEUR + x] = couleur;
      }
    });
  };
  poser(CORPS, base);
  const coiffe = OBJETS.tete[tenue["tete"] ?? ""]?.couvre === true;
  for (const emplacement of ORDRE) {
    const porte = OBJETS[emplacement][tenue[emplacement] ?? ""];
    if (porte?.dessin) poser(porte.dessin, { ...base, ...porte.couleurs }, emplacement === "cheveux" && coiffe ? HAUT_DES_CHEVEUX : 0);
  }
  return cases;
}

/** L'image d'un objet seul : ses cases, rognées à son contour. */
export interface Vignette {
  largeur: number;
  hauteur: number;
  cases: (string | null)[];
}

/**
 * Un objet seul, rogné à son contour, pour l'image de sa case dans le vestiaire ; `null` pour un objet sans dessin
 * (« rien »). La tenue ne sert qu'aux couleurs de la peau et des cheveux, pour une coupe ou une barbe.
 */
export function vignetteDeLObjet(emplacement: Emplacement, id: string, tenue: Tenue = TENUE_DE_DEPART): Vignette | null {
  const objet = OBJETS[emplacement][id];
  const dessin = objet?.dessin;
  if (!objet || !dessin) return null;
  let gauche = GAULOIS_LARGEUR;
  let droite = -1;
  for (const ligne of dessin.lignes) {
    for (let x = 0; x < GAULOIS_LARGEUR; x++) {
      if ((ligne[x] ?? ".") === ".") continue;
      gauche = Math.min(gauche, x);
      droite = Math.max(droite, x);
    }
  }
  if (droite < gauche) return null;
  const couleurs = { ...couleursDeBase(tenue), ...objet.couleurs };
  const largeur = droite - gauche + 1;
  const cases: (string | null)[] = [];
  for (const ligne of dessin.lignes) {
    for (let x = gauche; x <= droite; x++) cases.push(couleurs[ligne[x] ?? "."] ?? null);
  }
  return { largeur, hauteur: dessin.lignes.length, cases };
}

/** L'espace insécable avant « : », selon l'usage français. */
const NBSP = String.fromCharCode(0xa0);

/** Le Gaulois en mots, pour qui ne voit pas l'image : son texte de remplacement, sur le site comme sur Discord. */
export function decrireGaulois(tenue: Tenue): string {
  const parties = EMPLACEMENTS.map((emplacement) => {
    const porte = OBJETS[emplacement][tenue[emplacement] ?? ""];
    if (!porte) return null;
    const teinte = emplacement === "cheveux" ? POILS[tenue[TEINTE_CHEVEUX] as keyof typeof POILS]?.nom : undefined;
    const mots = [porte.nom, teinte].filter(Boolean).join(", ").toLowerCase();
    return `${NOMS_EMPLACEMENTS[emplacement]}${NBSP}: ${mots}`;
  }).filter(Boolean);
  return `Gaulois en pixels. ${parties.join(". ")}.`;
}

/* ---------- L'image de /gaulois sur Discord ---------- */

/**
 * L'image que /gaulois montre dans Discord, au style des autres images du robot : le fond bleu nuit du site, ses croix de
 * repère, le petit drapeau du haut. 496 × 320 : au moins 1,55 fois plus large que haut, comme les autres
 * images du robot, que Discord montre à 550 pixels de large au plus. Une case du Gaulois y fait 4 pixels : il occupe
 * 192 × 256, comme avant le passage à 48 cases sur 64.
 */
export const IMAGE_GAULOIS = { largeur: 496, hauteur: 320, echelle: 4 } as const;

const FOND = "#0a1230";
const REPERE = "#24346b";
const OMBRE_SOL = "#060b1f";
const DRAPEAU = ["#0b5fff", "#ffffff", "#ff1a2e"] as const;

const rgb = (hex: string): [number, number, number] => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];

export function imageDuGaulois(tenue: Tenue): Image {
  const { largeur, hauteur, echelle } = IMAGE_GAULOIS;
  const rgba = new Uint8Array(new ArrayBuffer(largeur * hauteur * 4));
  const peindre = (x: number, y: number, [r, g, b]: [number, number, number]) => {
    if (x < 0 || y < 0 || x >= largeur || y >= hauteur) return;
    const i = (y * largeur + x) * 4;
    rgba[i] = r;
    rgba[i + 1] = g;
    rgba[i + 2] = b;
    rgba[i + 3] = 255;
  };
  const fond = rgb(FOND);
  for (let y = 0; y < hauteur; y++) for (let x = 0; x < largeur; x++) peindre(x, y, fond);
  // Les croix de repère du fond, comme sur les images des victoires.
  const repere = rgb(REPERE);
  for (let cy = 32; cy < hauteur; cy += 64) {
    for (let cx = 40; cx < largeur; cx += 64) {
      for (let d = -4; d <= 4; d++) {
        peindre(cx + d, cy, repere);
        peindre(cx, cy + d, repere);
      }
    }
  }
  // Le drapeau du clan, en haut à gauche.
  DRAPEAU.forEach((couleur, i) => {
    for (let y = 20; y < 24; y++) for (let x = 24 + i * 26; x < 46 + i * 26; x++) peindre(x, y, rgb(couleur));
  });
  const ox = Math.round((largeur - GAULOIS_LARGEUR * echelle) / 2);
  const oy = hauteur - GAULOIS_HAUTEUR * echelle - 24;
  // Son ombre au sol, une ellipse sous les pieds, à la rangée 62 de la grille.
  const ombre = rgb(OMBRE_SOL);
  const sol = { x: largeur / 2, y: oy + 62 * echelle, rx: 18 * echelle, ry: 2.8 * echelle };
  for (let y = Math.floor(sol.y - sol.ry); y <= sol.y + sol.ry; y++) {
    for (let x = Math.floor(sol.x - sol.rx); x <= sol.x + sol.rx; x++) {
      if (((x - sol.x) / sol.rx) ** 2 + ((y - sol.y) / sol.ry) ** 2 <= 1) peindre(x, y, ombre);
    }
  }
  casesDuGaulois(tenue).forEach((couleur, i) => {
    if (!couleur) return;
    const cx = i % GAULOIS_LARGEUR;
    const cy = Math.floor(i / GAULOIS_LARGEUR);
    const teinte = rgb(couleur);
    for (let dy = 0; dy < echelle; dy++) for (let dx = 0; dx < echelle; dx++) peindre(ox + cx * echelle + dx, oy + cy * echelle + dy, teinte);
  });
  return { largeur, hauteur, rgba };
}

/** L'image de /gaulois, en PNG. */
export const pngDuGaulois = (tenue: Tenue): Promise<Uint8Array<ArrayBuffer>> => ecrirePng(imageDuGaulois(tenue));
