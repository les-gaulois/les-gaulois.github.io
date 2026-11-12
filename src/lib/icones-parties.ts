/**
 * Les petites icônes des parties du QG et de la Direction, dans le menu des parties (`Onglets.tsx`) : des objets d'un
 * village gaulois, dessinés en pixels comme sur un vieil écran. Demande du pilote, le 12 novembre 2026 : « des petites
 * icônes dans le thème gaulois et hacker pour chaque section ». Décoratives : le nom de la partie est écrit à côté.
 * Aucune ne reprend un personnage ni un objet d'une œuvre protégée : casque ailé du logo du clan, cor, bannière, coq…
 * Les chapitres du guide du clan (/debuter) ont aussi la leur, dessinée dans la même grille, à la suite ; puis viennent
 * celles des fenêtres de la console de la page Carte, depuis le même jour (`src/lib/carte-console.ts`).
 *
 * Chaque icône est une grille de 13 cases sur 13, écrite ligne à ligne : « # » une case pleine, « + » une case en
 * demi-teinte, « . » une case vide. Un nombre impair de cases laisse une colonne au milieu pour les objets symétriques.
 * Ici, seulement les dessins et le calcul du tracé ; l'affichage est dans `src/components/compte/IconePartie.tsx`.
 */

/** Le côté de la grille, en cases. Affichée à 26 px, une case fait 2 px : les bords tombent sur les pixels de l'écran. */
export const ICONE_COTE = 13;

export const ICONE_PLEIN = "#";
export const ICONE_DEMI = "+";
export const ICONE_VIDE = ".";

export const ICONES_PARTIES = {
  /** Moi : le casque ailé du guerrier, celui du logo du clan, vu de face. */
  casque: [
    ".....###.....",
    "+...#####...+",
    "++.#######.++",
    "++#########++",
    ".+#########+.",
    "..#########..",
    "..#########..",
    ".###########.",
    "..##.....##..",
    "..##.....##..",
    "..##.....##..",
    "...#.....#...",
    ".............",
  ],
  /** Salons : le feu de camp, où l'on se retrouve. */
  feu: [
    "......#......",
    ".....##......",
    ".....###.....",
    "....####.#...",
    "...#####.##..",
    "...########..",
    "..####++###..",
    "..###++++##..",
    "..###++++##..",
    "...###++##...",
    "##..#####..##",
    "..#########..",
    "##.........##",
  ],
  /** Ce soir : la lune, une étoile derrière elle. Les Gaulois comptaient le temps en nuits (César, Guerre des Gaules, VI, 18). */
  lune: [
    ".............",
    ".#...#####...",
    "###.####.....",
    ".#.####......",
    "...###.......",
    "..####.......",
    "..####.......",
    "..####.......",
    "...####.....#",
    "...#####..###",
    ".+..########.",
    ".....######..",
    ".............",
  ],
  /** La semaine : un calendrier à chevilles, sept jours, celui du jour en plein. */
  calendrier: [
    ".............",
    "...#.....#...",
    ".###########.",
    ".###########.",
    ".#.........#.",
    ".#.+.+.+.+.#.",
    ".#.+.+.+.+.#.",
    ".#.........#.",
    ".#.+.+.#...#.",
    ".#.+.+.#...#.",
    ".#.........#.",
    ".###########.",
    ".............",
  ],
  /** Simulateur : l'abaque, pour compter avant de jouer. */
  abaque: [
    "#...........#",
    "#.##.##.....#",
    "#+##+##+++++#",
    "#.##.##.....#",
    "#...........#",
    "#.....##.##.#",
    "#+++++##+##+#",
    "#.....##.##.#",
    "#...........#",
    "#.##.....##.#",
    "#+##+++++##+#",
    "#.##.....##.#",
    "#...........#",
  ],
  /** Décisions et Sondages : la balance, où l'on pèse le pour et le contre. */
  balance: [
    "......#......",
    "..#########..",
    "..+...#...+..",
    ".+.+..#..+.+.",
    "+...+.#.+...+",
    "#####.#.#####",
    ".###..#..###.",
    "......#......",
    "......#......",
    "......#......",
    "....#####....",
    "...#######...",
    ".............",
  ],
  /** Événements : la bannière, le point de ralliement. */
  banniere: [
    "......#......",
    ".###########.",
    "..#########..",
    "..#########..",
    "..####+####..",
    "..###+++###..",
    "..####+####..",
    "..#########..",
    "..####.####..",
    "..###...###..",
    "..##..#..##..",
    "..#...#...#..",
    "......#......",
  ],
  /** Idées : l'éclair de Taranis, le dieu gaulois du tonnerre. */
  eclair: [
    "........###..",
    ".......###...",
    "......###....",
    ".....###.....",
    "....#######..",
    "...#######...",
    "......###....",
    ".....###.....",
    "....###......",
    "...###.......",
    "..##.........",
    "..#..........",
    ".............",
  ],
  /** Le mur : un mur de pierres, celui du village. */
  mur: [
    ".............",
    "######.######",
    "######.######",
    ".............",
    "###.#####.###",
    "###.#####.###",
    ".............",
    "######.######",
    "######.######",
    ".............",
    "###.#####.###",
    "###.#####.###",
    ".............",
  ],
  /** Vue d'ensemble : la tour de guet, d'où l'on voit tout le village. */
  tour: [
    "......#......",
    ".....###.....",
    "....#####....",
    "...#######...",
    "....#.+.#....",
    "....#.+.#....",
    "..#########..",
    "...#.....#...",
    "...##...##...",
    "...#.#.#.#...",
    "...#..#..#...",
    "...#.#.#.#...",
    "..###...###..",
  ],
  /** Demandes : la porte de la palissade, où l'on frappe pour entrer. */
  porte: [
    ".............",
    "...#######...",
    "...#+++++#...",
    "#.##+++++##.#",
    "#+##+++++##+#",
    "#+##+++++##+#",
    "#+##+++++##+#",
    "#+##+++#+##+#",
    "#+##+++++##+#",
    "#+##+++++##+#",
    "#+##+++++##+#",
    "#+##+++++##+#",
    ".............",
  ],
  /** Comptes : le bouclier, un par guerrier du clan. */
  bouclier: [
    "....#####....",
    "..#########..",
    "..####+####..",
    "..####+####..",
    "..####+####..",
    "..###+++###..",
    "..##+++++##..",
    "..###+++###..",
    "..####+####..",
    "..####+####..",
    "..####+####..",
    "..#########..",
    "....#####....",
  ],
  /** Journal : la tablette, où chaque action est notée. */
  tablette: [
    ".............",
    ".###########.",
    ".#.........#.",
    ".#.#.+++++.#.",
    ".#.........#.",
    ".#.#.+++++.#.",
    ".#.........#.",
    ".#.#.++++..#.",
    ".#.........#.",
    ".#.#.+++...#.",
    ".#.........#.",
    ".###########.",
    ".............",
  ],
  /** Annonces : le cor, que l'on sonne pour tout le village. */
  cor: [
    ".............",
    ".........#...",
    ".......###.+.",
    "......####..+",
    ".....#####..+",
    "....######..+",
    "...#######..+",
    "..########.+.",
    ".####....#...",
    "###..........",
    "#............",
    ".............",
    ".............",
  ],
  /** Mot d'accueil : la hutte, la maison où l'on accueille. */
  hutte: [
    "......#......",
    ".....###.....",
    "....#####....",
    "....#####....",
    "...#######...",
    "..#########..",
    "..#########..",
    ".###########.",
    "#############",
    ".####+++####.",
    ".####+++####.",
    ".####+++####.",
    ".............",
  ],
  /** Gaulois de la semaine : le coq, l'emblème gaulois. */
  coq: [
    ".........#.#.",
    "..#.....####.",
    ".###....##+##",
    "###.....###..",
    "###.....##+..",
    "###....###...",
    ".###..####...",
    ".#########...",
    "..########...",
    "...######....",
    "....####.....",
    "....#..#.....",
    "...##.##.....",
  ],
  /** Objectif : le javelot planté au centre de la cible. */
  cible: [
    "...........##",
    "...........##",
    "...+++++..#..",
    ".++.....+#...",
    ".+......#+...",
    "+...####..+..",
    "+..#..##..+..",
    "+..#.#.#..+..",
    "+..#...#..+..",
    "+...###...+..",
    ".+.......+...",
    ".++.....++...",
    "...+++++.....",
  ],
  /** Discord : le corbeau messager, qui porte les nouvelles ailleurs. */
  corbeau: [
    ".............",
    ".......###...",
    "......#####..",
    "......##+####",
    "......#####..",
    ".....#####...",
    "....######...",
    "...#######...",
    "..########...",
    ".#######.....",
    "####.#.#.....",
    "##...#.#.....",
    "....##.##....",
  ],
  /** Fondateur : la clé du village. */
  cle: [
    "....#####....",
    "...##...##...",
    "...#.....#...",
    "...#.....#...",
    "...##...##...",
    "....#####....",
    "......#......",
    "......#......",
    "......#......",
    "......####...",
    "......#......",
    "......####...",
    "......#......",
  ],

  // Le guide du clan (/debuter), depuis le 12 novembre 2026 : une icône par chapitre, dans le sommaire et en tête du
  // chapitre. Les bases reprennent le casque, le poste de défense la tour, les deux aide-mémoire le bouclier et l'abaque.

  /** Guide, croissance de la population : l'épi de blé. */
  epi: [
    "......#......",
    ".....###.....",
    "..#...#...#..",
    "..##..#..##..",
    "...##.#.##...",
    "..#.#####.#..",
    "..##..#..##..",
    "...##.#.##...",
    "..#.#####.#..",
    "..##..#..##..",
    "...##.#.##...",
    "....#####....",
    "......#......",
  ],
  /** Guide, comprendre une attaque : l'épée, pointe en l'air. */
  epee: [
    "..........###",
    ".........####",
    "........####.",
    ".......####..",
    "......####...",
    ".....####....",
    ".#..####.....",
    ".##.###......",
    "..####.......",
    "...###.......",
    "..##+##......",
    ".##...##.....",
    "##...........",
  ],
  /** Guide, les réflexes avant d'attaquer : l'œil, regarder avant de cliquer. */
  oeil: [
    ".............",
    ".............",
    "....#####....",
    "..##.....##..",
    ".#...###...#.",
    "#...#####...#",
    "#...##+##...#",
    "#...#####...#",
    ".#...###...#.",
    "..##.....##..",
    "....#####....",
    ".............",
    ".............",
  ],
  /** Guide, l'or : la bourse. */
  bourse: [
    ".............",
    "...##...##...",
    "....#####....",
    ".....###.....",
    "....#####....",
    "...#######...",
    "..#########..",
    ".###########.",
    ".####+++####.",
    ".###+###+###.",
    ".####+++####.",
    ".###########.",
    "..#########..",
  ],
  /** Guide, les bateaux de trade, et le Port : le bateau à voile carrée. */
  bateau: [
    "......#......",
    "...#######...",
    "...#######...",
    "...#######...",
    "...#######...",
    "...#######...",
    "......#......",
    "#.....#.....#",
    "#############",
    ".###########.",
    "..#########..",
    ".............",
    "+.++.++.++.+.",
  ],
  /** Guide, les trains, et l'Usine : la locomotive sur son rail. */
  train: [
    ".............",
    "..##.........",
    "..##...#####.",
    "..##...#+++#.",
    ".####..#+++#.",
    ".###########.",
    ".###########.",
    ".###########.",
    "#############",
    "..##..##..##.",
    ".#..##..##..#",
    "..##..##..##.",
    "+++++++++++++",
  ],
  /** Guide, la trahison : le poignard, pointe en bas. */
  poignard: [
    "###..........",
    "####.........",
    "#####........",
    ".#####...#...",
    "..#####.##...",
    "...######....",
    "....####.....",
    "...######....",
    "..##..####...",
    ".##....####..",
    "........####.",
    ".........###.",
    "..........##.",
  ],

  /* ---------- La console de la page Carte (12 novembre 2026) : une icône par fenêtre ---------- */

  /** Carte · Clans : trois boucliers ronds, un par clan sur la carte. */
  boucliers: [
    ".............",
    "....#####....",
    "...#######...",
    "...###+###...",
    "...#######...",
    "....#####....",
    ".............",
    ".####...####.",
    "######.######",
    "##++##.##++##",
    "######.######",
    ".####...####.",
    ".............",
  ],
  /** Carte · Moments : le sablier, le temps qui a passé sur la carte. */
  sablier: [
    ".###########.",
    ".###########.",
    "..#.......#..",
    "..#+++++++#..",
    "...#+++++#...",
    "....#+++#....",
    ".....#+#.....",
    "....#.+.#....",
    "...#..+..#...",
    "..#..+++..#..",
    "..#.+++++.#..",
    ".###########.",
    ".###########.",
  ],
  /** Carte · Zones : le fanion planté sur la butte, un territoire tenu. */
  fanion: [
    "....#........",
    "....#####....",
    "....#######..",
    "....#####....",
    "....#........",
    "....#........",
    "....#........",
    "....#........",
    "..#####......",
    ".######++....",
    "########+++..",
    "#########+++.",
    "##########+++",
  ],
  /** Carte · Fronts : deux épées croisées, là où deux clans se touchent. */
  epees: [
    "#...........#",
    "##.........##",
    ".##.......##.",
    "..##.....##..",
    "...##...##...",
    "....##.##....",
    ".....###.....",
    "....##.##....",
    ".#.##...##.#.",
    "..##.....##..",
    "..+.#...#.+..",
    ".+.........+.",
    "#...........#",
  ],
  /** Carte · Chiffres : le bâton à encoches, quatre traits et un cinquième en travers. */
  encoches: [
    ".............",
    ".#..#..#..#..",
    ".#..#..#..#.#",
    ".#..#..#..##.",
    ".#..#..#.##..",
    ".#..#..##.#..",
    ".#..#.##..#..",
    ".#..##.#..#..",
    ".#.##..#..#..",
    ".##.#..#..#..",
    "##..#..#..#..",
    ".#..#..#..#..",
    ".............",
  ],
  /**
   * Carte · Réglages : la roue du char, pour la vitesse du film. Huit rayons de même force, tous tenus à la jante : avec
   * quatre rayons seulement, ou des diagonales plus faibles, le dessin deviendrait une croix cerclée, un autre emblème.
   */
  roue: [
    "....#####....",
    "..##..#..##..",
    ".###..#..###.",
    ".#.##.#.##.#.",
    "#...#####...#",
    "#...#####...#",
    "######+######",
    "#...#####...#",
    "#...#####...#",
    ".#.##.#.##.#.",
    ".###..#..###.",
    "..##..#..##..",
    "....#####....",
  ],
  /** Carte · Légende : le rouleau, où l'on lit comment la carte est faite. */
  rouleau: [
    ".###########.",
    "##.........##",
    ".###########.",
    "..#.......#..",
    "..#.+++++.#..",
    "..#.......#..",
    "..#.++++..#..",
    "..#.......#..",
    "..#.+++++.#..",
    "..#.......#..",
    ".###########.",
    "##.........##",
    ".###########.",
  ],
  /** Carte · À propos : le torque, le collier ouvert que portaient les Gaulois, une boule à chaque bout. */
  torque: [
    "....#####....",
    "..#########..",
    ".###.....###.",
    ".##.......##.",
    "##.........##",
    "##.........##",
    "##.........##",
    "##.........##",
    ".##.......##.",
    ".##.......##.",
    "..#.......#..",
    ".###.....###.",
    ".###.....###.",
  ],
} as const satisfies Record<string, readonly string[]>;

export type IconePartieNom = keyof typeof ICONES_PARTIES;

/**
 * Le tracé SVG des cases d'une teinte (`#` ou `+`) : un rectangle par suite de cases voisines sur une ligne, dans des
 * unités d'une case. Tout est dans un seul tracé : deux rectangles qui se touchent ne laissent pas de filet entre eux.
 * Une chaîne vide : aucune case de cette teinte.
 */
export function tracePixels(lignes: readonly string[], teinte: string): string {
  let trace = "";
  lignes.forEach((ligne, y) => {
    let x = 0;
    while (x < ligne.length) {
      if (ligne[x] !== teinte) {
        x += 1;
        continue;
      }
      let fin = x;
      while (fin < ligne.length && ligne[fin] === teinte) fin += 1;
      trace += `M${x} ${y}h${fin - x}v1h${x - fin}z`;
      x = fin;
    }
  });
  return trace;
}

/** Les deux tracés d'une icône : ses cases pleines et ses cases en demi-teinte. */
export function traceIcone(nom: IconePartieNom): { plein: string; demi: string } {
  const lignes = ICONES_PARTIES[nom];
  return { plein: tracePixels(lignes, ICONE_PLEIN), demi: tracePixels(lignes, ICONE_DEMI) };
}
