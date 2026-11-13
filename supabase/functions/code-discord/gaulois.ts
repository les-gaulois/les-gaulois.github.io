/**
 * Le Gaulois de chaque membre, premier lot du village des Gaulois (13 novembre 2026, demande du pilote : « leur perso
 * gaulois […] customisé avec des assets gratuit (chapeau, casque) (plastron ou veste, ou t shirt) (pantalon ect...)
 * chausurres »). Un personnage en pixels, 24 cases sur 32, qu'on habille par emplacements : la peau, les cheveux et leur
 * couleur, la barbe, la tête, le haut, le bas, les pieds. Ici, les objets gratuits, ouverts à tout compte lié à Discord ;
 * la monnaie et la boutique viendront dans les lots suivants (docs/DIRECTION.md, « Le village des Gaulois »).
 *
 * Des données et des calculs purs : la fonction code-discord (Deno) dessine l'image de /gaulois, le site (Node et
 * navigateur) dessine le vestiaire avec les mêmes grilles (`src/lib/gaulois.ts`). Le serveur garde sa propre liste des
 * objets (table `internal.gaulois_objets`) et refuse toute tenue qui n'y est pas : un test garde les deux listes identiques.
 *
 * Les dessins sont originaux, faits pour le clan [GAL] le 13 novembre 2026. Aucun n'emprunte un personnage, un objet ni
 * une tenue à une œuvre existante : un nouvel objet ou une nouvelle teinte se juge aussi assemblé avec les autres.
 *
 * Une grille s'écrit rangée par rangée, 24 cases de large ; « . » est une case vide, chaque autre lettre une couleur :
 * k le contour ; s, S la peau et son ombre ; h, H les cheveux et la barbe ; p, P la teinte de l'objet ; q, Q sa seconde
 * teinte, ou le lin ; u, U le lin ; l, L le cuir ; g, G l'or ; m, M, n le métal ; f, F la fourrure ; b, B le bleu, w, W
 * le blanc et r, R le rouge du clan.
 */
import { ecrirePng, type Image } from "./billets.ts";

export const GAULOIS_LARGEUR = 24;
export const GAULOIS_HAUTEUR = 32;

/** Un calque : sa première rangée sur la grille du Gaulois, puis ses rangées, de 24 cases chacune. */
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
  k: "#1a1410",
  u: "#d9cfb4",
  U: "#b3a585",
  l: "#8a5a2b",
  L: "#5e3b1a",
  g: "#d4a017",
  G: "#9c7410",
  m: "#b8c0cc",
  M: "#7d8796",
  n: "#eef2f7",
  f: "#9a6b3f",
  F: "#6e4a28",
  b: "#1f5fe0",
  B: "#16449f",
  w: "#f2f2f2",
  W: "#c9cfdc",
  r: "#e0283a",
  R: "#a51c2a",
};

/** La seconde teinte d'un objet d'une seule couleur : le lin, comme le bord du bonnet. */
const LIN: Readonly<Record<string, string>> = { q: "#d9cfb4", Q: "#b3a585" };

export const PEAUX = {
  claire: { nom: "Claire", couleurs: { s: "#f2c9a0", S: "#d9a77c" } },
  doree: { nom: "Dorée", couleurs: { s: "#e8b48a", S: "#c98e63" } },
  mate: { nom: "Mate", couleurs: { s: "#c08552", S: "#9a643a" } },
  foncee: { nom: "Foncée", couleurs: { s: "#7d4e30", S: "#5c3822" } },
} as const satisfies Record<string, Teinte>;

/** Les couleurs des cheveux, que la barbe reprend. */
export const POILS = {
  roux: { nom: "Roux", couleurs: { h: "#c4561f", H: "#8e3a12" } },
  blond: { nom: "Blond", couleurs: { h: "#e3c25b", H: "#b69636" } },
  chatain: { nom: "Châtain", couleurs: { h: "#7a4a26", H: "#55321a" } },
  noir: { nom: "Noir", couleurs: { h: "#2e2724", H: "#171312" } },
  gris: { nom: "Gris", couleurs: { h: "#a9a9a9", H: "#7c7c7c" } },
  blanc: { nom: "Blanc", couleurs: { h: "#ececec", H: "#c4c4c4" } },
} as const satisfies Record<string, Teinte>;

/** Les tissus d'une seule couleur, teints comme on teignait la laine et le lin : garance, guède, gaude. */
export const TISSUS = {
  rouge: { nom: "Rouge", couleurs: { p: "#b8322a", P: "#87241e" } },
  bleu: { nom: "Bleu", couleurs: { p: "#2f5fa8", P: "#1f4278" } },
  vert: { nom: "Vert", couleurs: { p: "#4f7d3a", P: "#36572a" } },
  jaune: { nom: "Jaune", couleurs: { p: "#d1a52e", P: "#9c7a1f" } },
  brun: { nom: "Brun", couleurs: { p: "#7a5232", P: "#573a23" } },
  blanc: { nom: "Blanc", couleurs: { p: "#e8e2d0", P: "#bdb6a2" } },
} as const satisfies Record<string, Teinte>;

/** Les tissus à deux couleurs : carreaux et rayures. */
export const MOTIFS = {
  "vert-jaune": { nom: "Vert et jaune", couleurs: { p: "#4f7d3a", P: "#36572a", q: "#d1a52e", Q: "#9c7a1f" } },
  "rouge-jaune": { nom: "Rouge et jaune", couleurs: { p: "#b8322a", P: "#87241e", q: "#d1a52e", Q: "#9c7a1f" } },
  "bleu-jaune": { nom: "Bleu et jaune", couleurs: { p: "#2f5fa8", P: "#1f4278", q: "#d1a52e", Q: "#9c7a1f" } },
  "brun-rouge": { nom: "Brun et rouge", couleurs: { p: "#7a5232", P: "#573a23", q: "#b8322a", Q: "#87241e" } },
} as const satisfies Record<string, Teinte>;

/** Une gamme : la liste de teintes où un objet choisit la sienne. */
export type Gamme = "poils" | "tissus" | "motifs";
export const GAMMES: Readonly<Record<Gamme, Readonly<Record<string, Teinte>>>> = { poils: POILS, tissus: TISSUS, motifs: MOTIFS };

// Les dessins : écrits par un petit atelier de dessin (traits symétriques, puis grilles imprimées), regardés agrandis.
// <dessins>
const CORPS: Calque = {
  y: 5,
  lignes: [
    "........kkkkkkkk........",
    ".......kssssssssk.......",
    "......kssssssssssk......",
    "......ksssssssssSk......",
    "......ksssssssssSk......",
    ".....kssskssssksSsk.....",
    ".....kssskssssksSsk.....",
    "......kssssSSsssSk......",
    "......kssssSSsssSk......",
    ".......ksssssssSk.......",
    "........kkkkkkkk........",
    ".........kSSSSk.........",
    "......kkkksssskkkk......",
    ".....kssssssssssssk.....",
    "....kssSssssssssSssk....",
    "....kssSssssssssSssk....",
    "....kssSssssssssSssk....",
    "....kssSssssssssSssk....",
    "....ksskuuuuuuuukssk....",
    ".....kkkuuuUUuuUkkk.....",
    ".......kssSkkssSk.......",
    ".......kssskksssk.......",
    ".......kssskksssk.......",
    ".......kssskksssk.......",
    "......ksssskkssssk......",
    "......kkkkkkkkkkkk......",
  ],
};

/** Les dessins des objets, par emplacement et par objet. */
const DESSINS = {
  cheveux: {
    "courts": {
      y: 4,
      lignes: [
        "........kkkkkkkk........",
        ".......khhhhhhhhk.......",
        "......khhhhhhhhhhk......",
        ".....khhhHHhhHHhhhk.....",
        ".....khH........Hhk.....",
        ".....kh..........hk.....",
      ],
    },
    "longs": {
      y: 4,
      lignes: [
        "........kkkkkkkk........",
        ".......khhhhhhhhk.......",
        "......khhhhhhhhhhk......",
        ".....khhhHHhhHHhhhk.....",
        ".....khH........Hhk.....",
        "....kkh..........hkk....",
        "....khH..........Hhk....",
        "....khH..........Hhk....",
        "....khH..........Hhk....",
        "....khH..........Hhk....",
        "....khH..........Hhk....",
        "....khh..........hhk....",
        "....khh..........hhk....",
        "....khh..........hhk....",
        "....kkk..........kkk....",
      ],
    },
    "tresses": {
      y: 4,
      lignes: [
        "........kkkkkkkk........",
        ".......khhhhhhhhk.......",
        "......khhhhhhhhhhk......",
        ".....khhhHHhhHHhhhk.....",
        ".....khH........Hhk.....",
        ".....kh..........hk.....",
        "....kHk..........kHk....",
        "....khk..........khk....",
        "....kHk..........kHk....",
        "....khk..........khk....",
        "....kHk..........kHk....",
        "....khk..........khk....",
        "....kHk..........kHk....",
        "....khk..........khk....",
        "....kHk..........kHk....",
        "....khk..........khk....",
        "....klk..........klk....",
        "....khk..........khk....",
        ".....k............k.....",
      ],
    },
    "herisses": {
      y: 0,
      lignes: [
        "...........kk...........",
        "......k...khhk...k......",
        ".....khk.khhhhk.khk.....",
        ".....khhkhhHHhhkhhk.....",
        ".....khhhhhhhhhhhhk.....",
        ".....khhhhhhhhhhhhk.....",
        "......khhhhhhhhhhk......",
        ".....khhhHHhhHHhhhk.....",
        ".....khH........Hhk.....",
        ".....kh..........hk.....",
      ],
    },
  },
  barbe: {
    "moustache": {
      y: 13,
      lignes: [
        ".........hhhhhh.........",
        "........hH....Hh........",
        "........H......H........",
      ],
    },
    "longue-moustache": {
      y: 13,
      lignes: [
        ".........hhhhhh.........",
        "........hH....Hh........",
        ".......khk....khk.......",
        ".......khk....khk.......",
        ".......kHk....kHk.......",
        "........k......k........",
      ],
    },
    "courte": {
      y: 12,
      lignes: [
        "......kh........hk......",
        "......kh.hhhhhh.hk......",
        ".......khhHkkHhhk.......",
        "........hhHHHHhh........",
        "........khhhhhhk........",
        ".........kkkkkk.........",
      ],
    },
    "grande": {
      y: 11,
      lignes: [
        "......kh........hk......",
        "......kh........hk......",
        "......kh.hhhhhh.hk......",
        "......khhhhkkhhhhk......",
        "......khhhHHHHhhhk......",
        "......khhhhhhhhhhk......",
        "......khhhHHHHhhhk......",
        ".......khhhhhhhhk.......",
        "........khHHHHhk........",
        ".........kkkkkk.........",
      ],
    },
  },
  tete: {
    "bonnet": {
      y: 2,
      lignes: [
        ".........kkkkkk.........",
        "........kpppppPk........",
        ".......kPPppppPPk.......",
        "......kPPPppppPPPk......",
        ".....kQQQQQQQQQQQQk.....",
        ".....kQQQQQQQQQQQQk.....",
        "......kkkkkkkkkkkk......",
      ],
    },
    "casque": {
      y: 0,
      lignes: [
        "...........kk...........",
        "..........kggk..........",
        ".........knmmmk.........",
        ".......kknnmmmmkk.......",
        "......kMMMmmmmMMMk......",
        "......kMMmmmmmmMMk......",
        ".....kGGGGGGGGGGGGk.....",
        ".....kkkkkkkkkkkkkk.....",
        ".....km..........Mk.....",
        ".....km..........Mk.....",
        ".....km..........Mk.....",
        ".....km..........Mk.....",
        ".....kk..........kk.....",
      ],
    },
    "bandeau": {
      y: 5,
      lignes: [
        "......kkkkkkkkkkkk......",
        ".....kppppppppppppk.....",
        ".....kPPPPPPPPPPPPkpk...",
        "......kkkkkkkkkkkk.Ppk..",
        "...................kPk..",
        "....................k...",
      ],
    },
    "capuche": {
      y: 2,
      lignes: [
        "........kkkkkkkk........",
        ".......kppppppppk.......",
        "......kppppppppppk......",
        ".....kPPPPppppPPPPk.....",
        "....kPPPPPPPPPPPPPPk....",
        "....kpPkkkkkkkkkkPPk....",
        "....kpP..........PPk....",
        "....kpP..........PPk....",
        "....kpP..........PPk....",
        "....kpP..........PPk....",
        "....kpP..........PPk....",
        "....kpP..........PPk....",
        "....kpP..........PPk....",
        "....kpP..........PPk....",
        "....kpPPP......PPPPk....",
        "....kkkkkk....kkkkkk....",
      ],
    },
  },
  haut: {
    "tunique": {
      y: 17,
      lignes: [
        "......kkkk....kkkk......",
        ".....kppppP..Pppppk.....",
        "....kppPppppppppPppk....",
        "....kPPPppppppppPPPk....",
        ".......kppppppppk.......",
        ".......klllgGlllk.......",
        ".......kppppppppk.......",
        ".......kPPPPPPPPk.......",
      ],
    },
    "veste-peau": {
      y: 17,
      lignes: [
        "......kkkk....kkkk......",
        ".....kfffF....Ffffk.....",
        "....kffFfF....FfFffk....",
        "....kFFFff....ffFFFk....",
        ".......kffk..kffk.......",
        ".......kfFk..kFfk.......",
        ".......klllgGlllk.......",
      ],
    },
    "maillot-clan": {
      y: 17,
      lignes: [
        "......kkkk....kkkk......",
        ".....kbbbbwwwwrrrrk.....",
        "....kbbkbbwwwwrrkrrk....",
        "....kBBkbbwwwwrrkRRk....",
        ".......kbbwwwwrrk.......",
        ".......kbbwwwwrrk.......",
        ".......kbbwwwwrrk.......",
        ".......kBBWWWWRRk.......",
      ],
    },
  },
  bas: {
    "braies": {
      y: 24,
      lignes: [
        ".......kPPPPPPPPk.......",
        ".......kppPkkPpPk.......",
        ".......kppPkkPppk.......",
        ".......kppPkkPppk.......",
        ".......kppPkkPppk.......",
      ],
    },
    "braies-carreaux": {
      y: 24,
      lignes: [
        ".......kPPPPPPPPk.......",
        ".......kqpPkkqpPk.......",
        ".......kpqpkkpqpk.......",
        ".......kqpqkkqpqk.......",
        ".......kpqpkkpqpk.......",
      ],
    },
    "braies-rayees": {
      y: 24,
      lignes: [
        ".......kPPPPPPPPk.......",
        ".......kqqPkkqqPk.......",
        ".......kpppkkpppk.......",
        ".......kqqqkkqqqk.......",
        ".......kpppkkpppk.......",
      ],
    },
  },
  pieds: {
    "sandales": {
      y: 28,
      lignes: [
        "........LLL..LLL........",
        ".......lsll..llsl.......",
      ],
    },
    "bottes": {
      y: 27,
      lignes: [
        ".......kLLLkkLLLk.......",
        ".......klllkklllk.......",
        "......klllLkkLlllk......",
        "......kkkkkkkkkkkk......",
      ],
    },
  },
} as const satisfies Record<string, Record<string, Calque>>;
// </dessins>

/** Un objet du vestiaire : son nom, la gamme où il choisit sa teinte (aucune s'il n'en change pas), son dessin. */
export interface Objet {
  nom: string;
  gamme: Gamme | null;
  dessin: Calque | null;
}

export const EMPLACEMENTS = ["peau", "cheveux", "barbe", "tete", "haut", "bas", "pieds"] as const;
export type Emplacement = (typeof EMPLACEMENTS)[number];

export const NOMS_EMPLACEMENTS: Readonly<Record<Emplacement, string>> = {
  peau: "Peau",
  cheveux: "Cheveux",
  barbe: "Barbe",
  tete: "Tête",
  haut: "Haut",
  bas: "Bas",
  pieds: "Pieds",
};

const objet = (nom: string, gamme: Gamme | null, dessin: Calque | null): Objet => ({ nom, gamme, dessin });

/**
 * Le vestiaire gratuit, emplacement par emplacement, dans l'ordre où le vestiaire les montre. Les cheveux choisissent
 * toujours une couleur, même rasés : la barbe la reprend.
 */
export const OBJETS: Readonly<Record<Emplacement, Readonly<Record<string, Objet>>>> = {
  peau: Object.fromEntries(Object.entries(PEAUX).map(([id, teinte]) => [id, objet(teinte.nom, null, null)])),
  cheveux: {
    aucun: objet("Rasés", "poils", null),
    courts: objet("Courts", "poils", DESSINS.cheveux.courts),
    longs: objet("Longs", "poils", DESSINS.cheveux.longs),
    tresses: objet("Tresses", "poils", DESSINS.cheveux.tresses),
    herisses: objet("Hérissés", "poils", DESSINS.cheveux.herisses),
  },
  barbe: {
    aucune: objet("Aucune", null, null),
    moustache: objet("Moustache", null, DESSINS.barbe.moustache),
    "longue-moustache": objet("Longue moustache", null, DESSINS.barbe["longue-moustache"]),
    courte: objet("Barbe courte", null, DESSINS.barbe.courte),
    grande: objet("Grande barbe", null, DESSINS.barbe.grande),
  },
  tete: {
    aucun: objet("Rien", null, null),
    bonnet: objet("Bonnet", "tissus", DESSINS.tete.bonnet),
    casque: objet("Casque", null, DESSINS.tete.casque),
    bandeau: objet("Bandeau", "tissus", DESSINS.tete.bandeau),
    capuche: objet("Capuche", "tissus", DESSINS.tete.capuche),
  },
  haut: {
    aucun: objet("Torse nu", null, null),
    tunique: objet("Tunique", "tissus", DESSINS.haut.tunique),
    "veste-peau": objet("Veste en peau", null, DESSINS.haut["veste-peau"]),
    "maillot-clan": objet("Maillot du clan", null, DESSINS.haut["maillot-clan"]),
  },
  bas: {
    aucun: objet("Pagne", null, null),
    braies: objet("Braies", "tissus", DESSINS.bas.braies),
    "braies-carreaux": objet("Braies à carreaux", "motifs", DESSINS.bas["braies-carreaux"]),
    "braies-rayees": objet("Braies rayées", "motifs", DESSINS.bas["braies-rayees"]),
  },
  pieds: {
    nus: objet("Pieds nus", null, null),
    sandales: objet("Sandales", null, DESSINS.pieds.sandales),
    bottes: objet("Bottes", null, DESSINS.pieds.bottes),
  },
};

/** L'ordre des calques, du fond vers le devant : les bottes sur les braies, la barbe sur la tunique, la capuche sur tout. */
const ORDRE: readonly Emplacement[] = ["bas", "pieds", "haut", "barbe", "cheveux", "tete"];

/**
 * Une tenue : pour chaque emplacement, l'objet porté ; pour un objet qui a une gamme, sa teinte sous `teinte_<emplacement>`.
 * Rien d'autre : le serveur refuse une clé en trop (`internal.gaulois_tenue_valide`).
 */
export type Tenue = Readonly<Record<string, string>>;

export const cleTeinte = (emplacement: Emplacement): string => `teinte_${emplacement}`;

/** Le Gaulois proposé à qui n'en a pas encore : roux, moustachu, en tunique bleue et braies à carreaux. */
export const TENUE_DE_DEPART: Tenue = {
  peau: "claire",
  cheveux: "courts",
  teinte_cheveux: "roux",
  barbe: "moustache",
  tete: "aucun",
  haut: "tunique",
  teinte_haut: "bleu",
  bas: "braies-carreaux",
  teinte_bas: "vert-jaune",
  pieds: "bottes",
};

const aCle = (objetJson: object, cle: string): boolean => Object.prototype.hasOwnProperty.call(objetJson, cle);

/** Une tenue complète, faite d'objets du vestiaire et de teintes de leur gamme, sans rien d'autre ; sinon `null`. */
export function lireTenue(valeur: unknown): Tenue | null {
  if (valeur === null || typeof valeur !== "object" || Array.isArray(valeur)) return null;
  const brute = valeur as Record<string, unknown>;
  const tenue: Record<string, string> = {};
  for (const emplacement of EMPLACEMENTS) {
    const id = brute[emplacement];
    const objets = OBJETS[emplacement];
    if (typeof id !== "string" || !aCle(objets, id)) return null;
    tenue[emplacement] = id;
    const gamme = objets[id]?.gamme ?? null;
    const cle = cleTeinte(emplacement);
    if (gamme) {
      const teinte = brute[cle];
      if (typeof teinte !== "string" || !aCle(GAMMES[gamme], teinte)) return null;
      tenue[cle] = teinte;
    } else if (aCle(brute, cle)) {
      return null;
    }
  }
  return Object.keys(brute).length === Object.keys(tenue).length ? tenue : null;
}

/**
 * La tenue après le choix d'un autre objet : la teinte reste si la nouvelle gamme la connaît, sinon la première de la
 * gamme ; elle disparaît pour un objet sans gamme.
 */
export function changerObjet(tenue: Tenue, emplacement: Emplacement, id: string): Tenue {
  const choisi = OBJETS[emplacement][id];
  if (!choisi) return tenue;
  const suite: Record<string, string> = { ...tenue, [emplacement]: id };
  const cle = cleTeinte(emplacement);
  if (choisi.gamme) {
    const gamme = GAMMES[choisi.gamme];
    const actuelle = tenue[cle];
    suite[cle] = actuelle !== undefined && aCle(gamme, actuelle) ? actuelle : (Object.keys(gamme)[0] ?? "");
  } else {
    delete suite[cle];
  }
  return suite;
}

/** Une tenue tirée au hasard dans le vestiaire. `hasard` rend un nombre de 0 inclus à 1 exclu, comme `Math.random`. */
export function tenueAuHasard(hasard: () => number): Tenue {
  const pioche = <T>(liste: readonly T[]): T => liste[Math.min(liste.length - 1, Math.floor(hasard() * liste.length))] as T;
  let tenue: Tenue = TENUE_DE_DEPART;
  for (const emplacement of EMPLACEMENTS) {
    tenue = changerObjet(tenue, emplacement, pioche(Object.keys(OBJETS[emplacement])));
    const gamme = OBJETS[emplacement][tenue[emplacement] ?? ""]?.gamme;
    if (gamme) tenue = { ...tenue, [cleTeinte(emplacement)]: pioche(Object.keys(GAMMES[gamme])) };
  }
  return tenue;
}

/** Les couleurs d'un objet porté : celles de sa teinte, sur le lin pour la seconde teinte d'un objet d'une couleur. */
function couleursDe(tenue: Tenue, emplacement: Emplacement, porte: Objet): Readonly<Record<string, string>> {
  if (!porte.gamme || porte.gamme === "poils") return {};
  return { ...LIN, ...(GAMMES[porte.gamme][tenue[cleTeinte(emplacement)] ?? ""]?.couleurs ?? {}) };
}

/**
 * Le Gaulois case par case, rangée par rangée : 24 × 32 couleurs « #rrggbb », `null` pour une case vide. La tenue doit
 * être lue par `lireTenue` ; une lettre sans couleur laisserait la case vide (un test l'interdit).
 */
export function casesDuGaulois(tenue: Tenue): (string | null)[] {
  const cases: (string | null)[] = new Array<string | null>(GAULOIS_LARGEUR * GAULOIS_HAUTEUR).fill(null);
  const peau = PEAUX[tenue["peau"] as keyof typeof PEAUX]?.couleurs ?? PEAUX.claire.couleurs;
  const poils = POILS[tenue["teinte_cheveux"] as keyof typeof POILS]?.couleurs ?? POILS.roux.couleurs;
  const base = { ...FIXES, ...peau, ...poils, ...LIN };
  const poser = (calque: Calque, couleurs: Readonly<Record<string, string>>) => {
    calque.lignes.forEach((ligne, dy) => {
      for (let x = 0; x < GAULOIS_LARGEUR; x++) {
        const lettre = ligne[x];
        if (lettre === undefined || lettre === ".") continue;
        const couleur = couleurs[lettre];
        if (couleur) cases[(calque.y + dy) * GAULOIS_LARGEUR + x] = couleur;
      }
    });
  };
  poser(CORPS, base);
  for (const emplacement of ORDRE) {
    const porte = OBJETS[emplacement][tenue[emplacement] ?? ""];
    if (porte?.dessin) poser(porte.dessin, { ...base, ...couleursDe(tenue, emplacement, porte) });
  }
  return cases;
}

/** L'espace insécable avant « : », selon l'usage français. */
const NBSP = String.fromCharCode(0xa0);

/** Le Gaulois en mots, pour qui ne voit pas l'image : son texte de remplacement, sur le site comme sur Discord. */
export function decrireGaulois(tenue: Tenue): string {
  const parties = EMPLACEMENTS.map((emplacement) => {
    const porte = OBJETS[emplacement][tenue[emplacement] ?? ""];
    if (!porte) return null;
    const gamme = porte.gamme;
    const teinte = gamme ? GAMMES[gamme][tenue[cleTeinte(emplacement)] ?? ""]?.nom : undefined;
    const mots = [porte.nom, teinte].filter(Boolean).join(", ").toLowerCase();
    return `${NOMS_EMPLACEMENTS[emplacement]}${NBSP}: ${mots}`;
  }).filter(Boolean);
  return `Gaulois en pixels. ${parties.join(". ")}.`;
}

/* ---------- L'image de /gaulois sur Discord ---------- */

/**
 * L'image que /gaulois montre dans Discord, au style des autres images du robot : le fond bleu nuit du site, ses croix de
 * repère, le petit drapeau du haut. 496 × 320 : au moins 1,55 fois plus large que haut, comme les autres
 * images du robot, que Discord montre à 550 pixels de large au plus. Une case du Gaulois y fait 8 pixels.
 */
export const IMAGE_GAULOIS = { largeur: 496, hauteur: 320, echelle: 8 } as const;

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
  // Son ombre au sol, une ellipse sous les pieds.
  const ombre = rgb(OMBRE_SOL);
  const sol = { x: largeur / 2, y: oy + 31 * echelle, rx: 9 * echelle, ry: 1.4 * echelle };
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
