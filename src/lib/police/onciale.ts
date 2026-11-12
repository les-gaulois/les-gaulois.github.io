/**
 * L'onciale de cases (« GAL Onciale ») : la police des titres de toutes les pages sauf le QG et la Direction, depuis le
 * 12 novembre 2026. Le pilote voulait des lettres « dans le design gaulois - hacker » : l'onciale des vieux manuscrits,
 * posée case par case comme un territoire d'OpenFront. Chaque signe est dessiné ici en cases (« # » pleine, « . » vide),
 * capitales et minuscules chacune avec le leur ; scripts/generate-police.ts en tire la police à chaque construction : en
 * cases visibles pour les grands titres, taillée (sans marches d'escalier) pour les petits textes. Deux cases d'un dessin
 * se touchent toujours par un côté, jamais par un seul coin : taillé, le signe se déferait (seule exception, dans le
 * « @ », entre son anneau et sa lettre, qui ne se touchent pas). Voir « Typographie » dans docs/DESIGN.md.
 *
 * Licence : ce fichier et les polices qui en sont tirées sont sous SIL Open Font License 1.1, pas sous l'AGPL du site ;
 * les outils qui les fabriquent ou les mesurent (cases.ts, largeur.ts, scripts/generate-police.ts) restent sous l'AGPL.
 * Texte complet et notice dans OFL.txt, à côté. Les formes viennent de la police Uncial Antiqua, passée sur une grille de
 * cases puis redessinée à la main le 12 novembre 2026 :
 * Copyright (c) 2011 by Brian J. Bonislawsky DBA Astigmatic (AOETI) (astigma@astigmatic.com), with Reserved Font Names
 * "Uncial Antiqua". Modifiée par le clan [GAL] : grille de cases, minuscules, chiffres alignés, accents, signes. Ce nom
 * réservé ne s'emploie pas pour cette version.
 */

/** Un dessin : la hauteur de sa première rangée (0 = la rangée posée sur la ligne de base), puis ses rangées de haut en bas. */
export interface Dessin {
  readonly haut: number;
  readonly rangees: readonly string[];
  /** Cases vides de chaque côté, si ce n'est pas APPROCHE. */
  readonly approche?: number;
}

/**
 * Le corps des lettres : 10 rangées, de y = 0 à y = 9. Toutes les capitales ont cette hauteur, depuis que le pilote a trouvé
 * le L « trop grand par rapport aux autres lettres » : seuls les accents montent au-dessus (jusqu'à 12), et la queue du Q,
 * la cédille et la virgule descendent sous la ligne de base (jusqu'à -3). Les minuscules ont leurs propres hauteurs : les
 * hampes s'arrêtent à la hauteur des capitales, le point du i et du j et les accents montent une rangée plus haut
 * (y = 10), et cinq jambages descendent à -3 (voir MINUSCULES).
 */
export const CORPS = 10;
/** Unités de police par case : le corps fait 700 unités sur 1 000, comme la capitale d'Outfit qu'elle remplace. */
export const CASE = 70;
/** Cases vides de chaque côté d'un signe : deux cases entre deux lettres. */
export const APPROCHE = 1;
/** Les chiffres se serrent davantage (une case entre deux) : un nombre garde à peu près la largeur qu'il avait en Outfit. */
export const APPROCHE_CHIFFRES = 0.5;
/** Chasse des espaces, en cases : l'espace entre deux mots, l'espace insécable des milliers et des unités, les fines. */
export const ESPACE = 4;
export const ESPACE_INSECABLE = 3;
export const ESPACE_FINE = 2;

export const ONCIALE = {
  famille: "GAL Onciale",
  familleCases: "GAL Onciale Cases",
  version: "1.000",
  // La notice d'origine, telle quelle (condition 2 de la licence), puis la modification : voir OFL.txt, à côté.
  copyright:
    'Copyright (c) 2011 by Brian J. Bonislawsky DBA Astigmatic (AOETI) (astigma@astigmatic.com), with Reserved Font Names "Uncial Antiqua". Modified version by the [GAL] clan, 2026: pixel grid, lowercase letters, lining figures, accents and signs; the Reserved Font Name is not used.',
  licence: "This Font Software is licensed under the SIL Open Font License, Version 1.1. This license is available with a FAQ at: https://openfontlicense.org",
  licenceUrl: "https://openfontlicense.org",
} as const;

/** Lit un dessin écrit en colonnes de « # » et de « . », une rangée par ligne. */
export function dessin(haut: number, texte: string): Dessin {
  const rangees = texte
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  return { haut, rangees };
}

export const LETTRES: Readonly<Record<string, Dessin>> = {
  A: dessin(9, `
    ..##.......
    ..###......
    ...###.....
    ...###.....
    ...####....
    ..##.###...
    ..##..##...
    .########..
    .##....###.
    ###....####`),
  B: dessin(9, `
    ######...
    ###..##..
    ###..##..
    ###.##...
    ######...
    ###..###.
    ###...###
    ###...###
    ###..###.
    #######..`),
  C: dessin(9, `
    ....####.
    ..###..##
    .###.....
    ###......
    ###......
    ###......
    ###......
    .###.....
    ..###..##
    ....####.`),
  // Un D courant, depuis le 12 novembre 2026 : le D onciale, dont le trait revenait vers la gauche, se lisait comme un A.
  D: dessin(9, `
    #######...
    ###..####.
    ###....###
    ###....###
    ###....###
    ###....###
    ###....###
    ###....###
    ###..####.
    #######...`),
  E: dessin(9, `
    ....####.
    ..###..##
    .###.....
    ###......
    #######..
    ###......
    ###......
    .###.....
    ..###..##
    ....####.`),
  F: dessin(9, `
    ########
    ###..###
    ###.....
    ###.....
    ######..
    ###.....
    ###.....
    ###.....
    ###.....
    ###.....`),
  G: dessin(9, `
    ....####..
    ..###..##.
    .###......
    ###.......
    ###.......
    ###..#####
    ###....###
    .###...###
    ..###.###.
    ....####..`),
  H: dessin(9, `
    ###....###
    ###....###
    ###....###
    ###....###
    ##########
    ##########
    ###....###
    ###....###
    ###....###
    ###....###`),
  I: dessin(9, `
    ####
    ###.
    ###.
    ###.
    ###.
    ###.
    ###.
    ###.
    ###.
    ####`),
  J: dessin(9, `
    ...####
    ....###
    ....###
    ....###
    ....###
    ....###
    ....###
    ##..###
    ###.###
    .#####.`),
  K: dessin(9, `
    ###...###.
    ###..###..
    ###.###...
    ######....
    #####.....
    ######....
    ###.###...
    ###..###..
    ###...###.
    ###....###`),
  L: dessin(9, `
    ###.....
    ###.....
    ###.....
    ###.....
    ###.....
    ###.....
    ###.....
    ###.....
    ###...##
    ########`),
  // Le M onciale : deux arches rondes autour du trait du milieu, les jambes droites.
  M: dessin(9, `
    ..####...####..
    .##..#####..##.
    ##....###....##
    ##....###....##
    ##....###....##
    ##....###....##
    ##....###....##
    ##....###....##
    ##....###....##
    ##....###....##`),
  N: dessin(9, `
    ###.....##
    ####....##
    #####...##
    ##.###..##
    ##..###.##
    ##...#####
    ##....####
    ##.....###
    ##......##
    ###.....##`),
  O: dessin(9, `
    ...####...
    .###..###.
    ###....###
    ###....###
    ###....###
    ###....###
    ###....###
    ###....###
    .###..###.
    ...####...`),
  // La panse du R et quatre rangées de jambe : avec une panse plus grande, le P se lisait comme un D.
  P: dessin(9, `
    ######...
    ###..###.
    ###...###
    ###...###
    ###..###.
    ######...
    ###......
    ###......
    ###......
    ###......`),
  Q: dessin(9, `
    ...####...
    .###..###.
    ###....###
    ###....###
    ###....###
    ###....###
    ###....###
    ###..#.###
    .###.####.
    ...######.
    ......####`),
  R: dessin(9, `
    ######....
    ###..###..
    ###...###.
    ###...###.
    ###..###..
    ######....
    ###.###...
    ###..###..
    ###...###.
    ###....###`),
  S: dessin(9, `
    ...#####.
    .###...##
    ###......
    ###......
    .#####...
    ...#####.
    ......###
    ......###
    ##...###.
    .#####...`),
  T: dessin(9, `
    .#########.
    ###.###.###
    ##..###...#
    #...###....
    ....###....
    ....###....
    ....###....
    ....###....
    ....###....
    ...#####...`),
  U: dessin(9, `
    ###....###
    ###....###
    ###....###
    ###....###
    ###....###
    ###....###
    ###....###
    ###....###
    .###..####
    ...#######`),
  V: dessin(9, `
    ###.....##
    ###.....##
    .###....##
    .###...##.
    ..###..##.
    ..###.##..
    ...#####..
    ...####...
    ....###...
    ....##....`),
  W: dessin(9, `
    ###.........###
    ###.........###
    ###...###...###
    ###...###...###
    ###...###...###
    ###...###...###
    ###...###...###
    .##...###...##.
    .###.#####.###.
    ..####...####..`),
  X: dessin(9, `
    ###.....##
    .###...##.
    ..###.##..
    ...####...
    ....###...
    ...#####..
    ..##.###..
    .##...###.
    ##.....###
    ##.....###`),
  Y: dessin(9, `
    ###.....##
    .###...##.
    ..###.##..
    ...####...
    ...###....
    ...###....
    ...###....
    ...###....
    ...###....
    ..#####...`),
  Z: dessin(9, `
    #########
    #.....###
    .....###.
    ....###..
    ...###...
    ..###....
    .###.....
    ###.....#
    ###....##
    #########`),
  Œ: dessin(9, `
    ...###########
    .###...###..##
    ###....###....
    ###....###....
    ###....######.
    ###....###....
    ###....###....
    ###....###....
    .###...###..##
    ...###########`),
};

/**
 * Chiffres alignés, tous de la même chasse (7 cases) : les colonnes de nombres restent droites. Plus fins que les
 * lettres, comme l'affichage d'une machine : un nombre garde la largeur qu'il avait en Outfit, et une rangée de chiffres
 * clés tient sur la même ligne qu'avant.
 */
export const CHIFFRES: Readonly<Record<string, Dessin>> = {
  "0": dessin(9, `
    .#####.
    ##...##
    ##...##
    ##...##
    ##...##
    ##...##
    ##...##
    ##...##
    ##...##
    .#####.`),
  "1": dessin(9, `
    ...##..
    .####..
    ##.##..
    ...##..
    ...##..
    ...##..
    ...##..
    ...##..
    ...##..
    .######`),
  "2": dessin(9, `
    .#####.
    ##...##
    .....##
    .....##
    ....##.
    ...##..
    ..##...
    .##....
    ##.....
    #######`),
  "3": dessin(9, `
    .#####.
    ##...##
    .....##
    .....##
    ..####.
    .....##
    .....##
    .....##
    ##...##
    .#####.`),
  "4": dessin(9, `
    ....##.
    ...###.
    ..####.
    .##.##.
    ##..##.
    ##..##.
    #######
    ....##.
    ....##.
    ....##.`),
  "5": dessin(9, `
    #######
    ##.....
    ##.....
    ######.
    .....##
    .....##
    .....##
    .....##
    ##...##
    .#####.`),
  "6": dessin(9, `
    ..####.
    .##....
    ##.....
    ##.....
    ######.
    ##...##
    ##...##
    ##...##
    ##...##
    .#####.`),
  "7": dessin(9, `
    #######
    .....##
    .....##
    ....##.
    ....##.
    ...##..
    ...##..
    ..##...
    ..##...
    ..##...`),
  "8": dessin(9, `
    .#####.
    ##...##
    ##...##
    ##...##
    .#####.
    ##...##
    ##...##
    ##...##
    ##...##
    .#####.`),
  "9": dessin(9, `
    .#####.
    ##...##
    ##...##
    ##...##
    ##...##
    .######
    .....##
    .....##
    ....##.
    .####..`),
};

export const SIGNES: Readonly<Record<string, Dessin>> = {
  ".": dessin(1, `
    ##
    ##`),
  ",": dessin(1, `
    .##
    .##
    .#.
    ##.`),
  ":": dessin(6, `
    ##
    ##
    ..
    ..
    ..
    ##
    ##`),
  ";": dessin(6, `
    .##
    .##
    ...
    ...
    ...
    .##
    .##
    .#.
    ##.`),
  "!": dessin(9, `
    ###
    ###
    ###
    ###
    ###
    .#.
    .#.
    ...
    ###
    ###`),
  "?": dessin(9, `
    .#####.
    ##...##
    .....##
    ....##.
    ...##..
    ..##...
    ..##...
    .......
    ..##...
    ..##...`),
  "'": dessin(9, `
    .##
    .##
    .#.
    ##.`),
  // apostrophe
  [String.fromCharCode(0x2019)]: dessin(9, `
    .##
    .##
    .#.
    ##.`),
  // guillemet simple ouvrant
  [String.fromCharCode(0x2018)]: dessin(9, `
    .##
    .#.
    ##.
    ##.`),
  '"': dessin(9, `
    .##..##
    .##..##
    .#...#.
    ##..##.`),
  // guillemet anglais ouvrant
  [String.fromCharCode(0x201c)]: dessin(9, `
    .##..##
    .#...#.
    ##..##.
    ##..##.`),
  // guillemet anglais fermant
  [String.fromCharCode(0x201d)]: dessin(9, `
    .##..##
    .##..##
    .#...#.
    ##..##.`),
  "«": dessin(7, `
    ...##..##
    ..##..##.
    .##..##..
    ##..##...
    .##..##..
    ..##..##.
    ...##..##`),
  "»": dessin(7, `
    ##..##...
    .##..##..
    ..##..##.
    ...##..##
    ..##..##.
    .##..##..
    ##..##...`),
  "(": dessin(11, `
    ..##
    .##.
    ##..
    ##..
    ##..
    ##..
    ##..
    ##..
    ##..
    ##..
    ##..
    ##..
    .##.
    ..##`),
  ")": dessin(11, `
    ##..
    .##.
    ..##
    ..##
    ..##
    ..##
    ..##
    ..##
    ..##
    ..##
    ..##
    ..##
    .##.
    ##..`),
  "[": dessin(11, `
    ####
    ##..
    ##..
    ##..
    ##..
    ##..
    ##..
    ##..
    ##..
    ##..
    ##..
    ##..
    ##..
    ####`),
  "]": dessin(11, `
    ####
    ..##
    ..##
    ..##
    ..##
    ..##
    ..##
    ..##
    ..##
    ..##
    ..##
    ..##
    ..##
    ####`),
  "-": dessin(5, `
    #####
    #####`),
  // Tiret demi-cadratin (« 21 h – 22 h ») et signe moins : la même barre, de la largeur et de l'approche d'un chiffre.
  [String.fromCharCode(0x2013)]: { ...dessin(5, `
    #######
    #######`), approche: APPROCHE_CHIFFRES },
  // signe moins
  [String.fromCharCode(0x2212)]: { ...dessin(5, `
    #######
    #######`), approche: APPROCHE_CHIFFRES },
  // tiret cadratin
  [String.fromCharCode(0x2014)]: dessin(5, `
    #############
    #############`),
  "+": dessin(8, `
    ...##...
    ...##...
    ...##...
    ########
    ########
    ...##...
    ...##...
    ...##...`),
  "=": dessin(7, `
    ########
    ########
    ........
    ........
    ########
    ########`),
  "×": dessin(7, `
    ##...##
    .##.##.
    ..###..
    ..###..
    .##.##.
    ##...##`),
  "/": dessin(11, `
    ......##
    ......##
    .....##.
    .....##.
    ....##..
    ....##..
    ...##...
    ...##...
    ..##....
    ..##....
    .##.....
    .##.....
    ##......
    ##......`),
  "%": dessin(9, `
    .##.....##
    ####...##.
    ####..##..
    .##..##...
    ....##....
    ...##.....
    ..##...##.
    .##...####
    ##....####
    .......##.`),
  "#": dessin(8, `
    ..##..##..
    ..##..##..
    ##########
    ..##..##..
    ..##..##..
    ##########
    ..##..##..
    ..##..##..`),
  "&": dessin(9, `
    ..####.....
    .##..##....
    .##..##....
    ..####.....
    .####...##.
    ##..##.##..
    ##...###...
    ##....###..
    .##..##.##.
    ..####...##`),
  "@": dessin(9, `
    ..#######..
    .##.....##.
    ##..####.##
    ##.##..#.##
    ##.##..#.##
    ##.##..#.##
    ##..####.#.
    .##........
    ..######...`),
  _: dessin(-1, `
    ########`),
  "·": dessin(5, `
    ##
    ##`),
  "…": dessin(1, `
    ##..##..##
    ##..##..##`),
  "°": dessin(9, `
    .###.
    ##.##
    ##.##
    .###.`),
  "€": dessin(9, `
    ....#####
    ..###...#
    .###.....
    #######..
    ###......
    #######..
    ###......
    .###.....
    ..###...#
    ....#####`),
  "*": dessin(9, `
    ...#...
    ##.#.##
    .#####.
    ..###..
    .##.##.
    ##...##`),
  "|": dessin(11, `
    ##
    ##
    ##
    ##
    ##
    ##
    ##
    ##
    ##
    ##
    ##
    ##
    ##
    ##`),
  "<": dessin(8, `
    .....##
    ...###.
    .###...
    ##.....
    .###...
    ...###.
    .....##`),
  ">": dessin(8, `
    ##.....
    .###...
    ...###.
    .....##
    ...###.
    .###...
    ##.....`),
};

/** Les accents des capitales, au-dessus du corps avec une rangée d'air ; la cédille sous la ligne de base. */
export const MARQUES = {
  aigu: dessin(12, `
    .##
    ##.`),
  grave: dessin(12, `
    ##.
    .##`),
  circonflexe: dessin(12, `
    .###.
    ##.##`),
  trema: dessin(12, `
    ##.##
    ##.##`),
  tilde: dessin(12, `
    .##..##
    ######.`),
  cedille: dessin(-1, `
    .##
    ..#
    ###`),
} as const satisfies Record<string, Dessin>;

export type Marque = keyof typeof MARQUES;

/** Les lettres accentuées : une capitale et sa marque. La minuscule se compose de même, sur sa minuscule (glyphesOnciale). */
export const COMPOSEES: Readonly<Record<string, readonly [string, Marque]>> = {
  À: ["A", "grave"],
  Á: ["A", "aigu"],
  Â: ["A", "circonflexe"],
  Ã: ["A", "tilde"],
  Ä: ["A", "trema"],
  Ç: ["C", "cedille"],
  È: ["E", "grave"],
  É: ["E", "aigu"],
  Ê: ["E", "circonflexe"],
  Ë: ["E", "trema"],
  Ì: ["I", "grave"],
  Í: ["I", "aigu"],
  Î: ["I", "circonflexe"],
  Ï: ["I", "trema"],
  Ñ: ["N", "tilde"],
  Ò: ["O", "grave"],
  Ó: ["O", "aigu"],
  Ô: ["O", "circonflexe"],
  Õ: ["O", "tilde"],
  Ö: ["O", "trema"],
  Ù: ["U", "grave"],
  Ú: ["U", "aigu"],
  Û: ["U", "circonflexe"],
  Ü: ["U", "trema"],
  Ý: ["Y", "aigu"],
  Ÿ: ["Y", "trema"],
};

/** Le centre optique des lettres asymétriques, en cases depuis la gauche : l'accent se pose là. */
const CENTRES: Readonly<Record<string, number>> = { A: 5, C: 4.5, E: 4.5, I: 1.5, U: 5, Y: 4.5 };

/** L'œil des minuscules : 8 rangées, de y = 0 à y = 7. */
export const OEIL = 8;

/**
 * Les minuscules, depuis le 12 novembre 2026 : le pilote a choisi « de vraies minuscules » sur captures, plus lisibles
 * que le tout-capitales. Un œil de 8 rangées, des hampes à la hauteur des capitales (b, d, f, h, k, l), un t d'une rangée
 * de moins, des jambages jusqu'à y = -3 (g, j, p, q, y), le point du i et du j à la hauteur des accents. Des formes
 * courantes, qu'on reconnaît du premier coup : il lisait le d onciale comme un a. Le l a un pied recourbé, pour ne pas
 * se confondre avec le I, dont il ne différait que d'une case.
 */
export const MINUSCULES: Readonly<Record<string, Dessin>> = {
  a: dessin(7, `
    .######..
    ##...###.
    ......###
    .########
    ###...###
    ###...###
    ###.#####
    .####.###`),
  b: dessin(9, `
    ###......
    ###......
    ########.
    ####..###
    ###...###
    ###...###
    ###...###
    ###...###
    ####..###
    ########.`),
  c: dessin(7, `
    ..#####.
    .###..##
    ###.....
    ###.....
    ###.....
    ###.....
    .###..##
    ..#####.`),
  d: dessin(9, `
    ......###
    ......###
    .########
    ###..####
    ###...###
    ###...###
    ###...###
    ###...###
    ###..####
    .########`),
  e: dessin(7, `
    ..#####..
    .##...##.
    ###...###
    #########
    ###......
    ###......
    .###...##
    ..######.`),
  f: dessin(9, `
    ..#####
    .###...
    ######.
    .###...
    .###...
    .###...
    .###...
    .###...
    .###...
    .###...`),
  g: dessin(7, `
    ..#######
    .###..###
    ###...###
    ###...###
    ###...###
    ###...###
    .###..###
    ..#######
    ......###
    ##...###.
    .######..`),
  h: dessin(9, `
    ###......
    ###......
    ########.
    ####..###
    ###...###
    ###...###
    ###...###
    ###...###
    ###...###
    ###...###`),
  i: dessin(10, `
    ###
    ###
    ...
    ###
    ###
    ###
    ###
    ###
    ###
    ###
    ###`),
  j: dessin(10, `
    ..###
    ..###
    .....
    ..###
    ..###
    ..###
    ..###
    ..###
    ..###
    ..###
    ..###
    ..###
    .###.
    ###..`),
  k: dessin(9, `
    ###......
    ###......
    ###...###
    ###..###.
    ###.###..
    ######...
    ######...
    ###.###..
    ###..###.
    ###...###`),
  l: dessin(9, `
    ###..
    ###..
    ###..
    ###..
    ###..
    ###..
    ###..
    ###..
    ####.
    .####`),
  m: dessin(7, `
    ##############.
    ####..####..###
    ###...###...###
    ###...###...###
    ###...###...###
    ###...###...###
    ###...###...###
    ###...###...###`),
  n: dessin(7, `
    ########.
    ####..###
    ###...###
    ###...###
    ###...###
    ###...###
    ###...###
    ###...###`),
  o: dessin(7, `
    ..#####..
    .###.###.
    ###...###
    ###...###
    ###...###
    ###...###
    .###.###.
    ..#####..`),
  p: dessin(7, `
    ########.
    ####..###
    ###...###
    ###...###
    ###...###
    ###...###
    ####..###
    ########.
    ###......
    ###......
    ###......`),
  q: dessin(7, `
    .########
    ###..####
    ###...###
    ###...###
    ###...###
    ###...###
    ###..####
    .########
    ......###
    ......###
    ......###`),
  r: dessin(7, `
    ###..###
    ########
    ####....
    ###.....
    ###.....
    ###.....
    ###.....
    ###.....`),
  s: dessin(7, `
    .######.
    ###...##
    ###.....
    .#####..
    ...#####
    .....###
    ##...###
    .######.`),
  t: dessin(8, `
    .###...
    #######
    .###...
    .###...
    .###...
    .###...
    .###...
    .###..#
    ..#####`),
  u: dessin(7, `
    ###...###
    ###...###
    ###...###
    ###...###
    ###...###
    ###...###
    ###..####
    .########`),
  v: dessin(7, `
    ###...###
    ###...###
    ###...###
    .###.###.
    .###.###.
    ..#####..
    ..#####..
    ...###...`),
  w: dessin(7, `
    ###...###...###
    ###...###...###
    ###...###...###
    ###...###...###
    ###...###...###
    ###...###...###
    .###.#####.###.
    ..####...####..`),
  x: dessin(7, `
    ###...###
    .###.###.
    ..#####..
    ...###...
    ...###...
    ..#####..
    .###.###.
    ###...###`),
  y: dessin(7, `
    ###...###
    ###...###
    ###...###
    ###...###
    ###...###
    ###...###
    .###.####
    ..#######
    ......###
    ##...###.
    .######..`),
  z: dessin(7, `
    ########
    .....###
    ....###.
    ...###..
    ..###...
    .###....
    ###.....
    ########`),
  œ: dessin(7, `
    ..###########..
    .###.####...##.
    ###...###...###
    ###...#########
    ###...###......
    ###...###......
    .###.#####...##
    ..############.`),
};

/** Le i sans son point, pour porter un accent. */
const I_SANS_POINT = dessin(OEIL - 1, `
    ###
    ###
    ###
    ###
    ###
    ###
    ###
    ###`);

/** L'accent d'une minuscule : celui des capitales, deux rangées plus bas (au-dessus de l'œil, avec une rangée d'air). */
const marqueBasse = (m: Marque): Dessin => (m === "cedille" ? MARQUES[m] : { ...MARQUES[m], haut: MARQUES[m].haut - (CORPS - OEIL) });

/** Largeur d'un dessin, en cases. */
export function largeur(d: Dessin): number {
  return Math.max(0, ...d.rangees.map((r) => r.length));
}

/** Chasse d'un signe, en cases : son dessin et une approche de chaque côté. */
export function chasse(d: Dessin): number {
  return largeur(d) + 2 * (d.approche ?? APPROCHE);
}

/** Pose une marque sur une lettre, centrée sur elle ; le dessin s'élargit si la marque dépasse. */
export function composer(base: Dessin, marque: Dessin, centre = largeur(base) / 2): Dessin {
  const lb = largeur(base);
  const lm = largeur(marque);
  let xb = 0;
  let xm = Math.round(centre - lm / 2);
  if (xm < 0) {
    xb = -xm;
    xm = 0;
  }
  const l = Math.max(xb + lb, xm + lm);
  const haut = Math.max(base.haut, marque.haut);
  const bas = Math.min(base.haut - base.rangees.length + 1, marque.haut - marque.rangees.length + 1);
  const rangees: string[] = [];
  for (let y = haut; y >= bas; y--) {
    const ligne = Array<string>(l).fill(".");
    const poser = (d: Dessin, dx: number) => {
      const r = d.rangees[d.haut - y];
      if (r === undefined) return;
      for (let x = 0; x < r.length; x++) if (r[x] === "#") ligne[dx + x] = "#";
    };
    poser(base, xb);
    poser(marque, xm);
    rangees.push(ligne.join(""));
  }
  return { haut, rangees };
}

/** Tous les signes de la police, capitales, minuscules et lettres accentuées comprises, par caractère. */
export function glyphesOnciale(): Map<string, Dessin> {
  const tous = new Map<string, Dessin>([
    ...Object.entries(LETTRES),
    ...Object.entries(MINUSCULES),
    ...Object.entries(CHIFFRES).map(([c, d]): [string, Dessin] => [c, { ...d, approche: APPROCHE_CHIFFRES }]),
    ...Object.entries(SIGNES),
  ]);
  for (const [ch, [b, m]] of Object.entries(COMPOSEES)) {
    const base = LETTRES[b];
    if (!base) throw new Error(`Lettre de base inconnue : ${b}`);
    tous.set(ch, composer(base, MARQUES[m], CENTRES[b]));
    // La même lettre en minuscule : sa base, et la marque posée au-dessus de l'œil. Le i perd son point sous l'accent.
    const petite = b.toLowerCase();
    const basePetite = petite === "i" && m !== "cedille" ? I_SANS_POINT : MINUSCULES[petite];
    if (!basePetite) throw new Error(`Minuscule de base inconnue : ${petite}`);
    tous.set(ch.toLowerCase(), composer(basePetite, marqueBasse(m)));
  }
  return tous;
}
