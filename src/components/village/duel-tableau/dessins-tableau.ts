/**
 * Les dessins du tableau des duellistes du duel « Coup pour coup » dans « Mon Gaulois » : le classement de la semaine et
 * celui de la saison (« Le tableau des duellistes de la semaine, avec un insigne pour le premier, statères en récompense
 * en fin de saison », demande du pilote).
 * Dessins de Claude Fable 5.2 (22 novembre 2026), au style des dessins des salles (`../duel-salles/dessins-salles.ts`) et
 * du kit (`src/lib/jeu/icones.ts`) : les couleurs de la palette, un cerne d'encre, le volume (lumière en haut à gauche).
 * Les mêmes images servent dans les deux thèmes : aucune couleur n'y dépend du fond. Aucun ne rappelle une œuvre existante.
 *
 * - `iconeDuTableau` (24 cases) : l'entrée « Le tableau » de l'accueil du duel et la tête de l'écran. Un panneau de bois
 *   sur ses deux pieds, une feuille claire clouée dessus, trois lignes : une pastille d'or, d'argent, de bronze, et un
 *   trait de plus en plus court.
 * - `iconeDeLaSemaine` (24) : l'onglet « La semaine ». Une page de calendrier à bandeau rouge et deux anneaux, sept cases
 *   pour sept jours ; la dernière est d'or : le mardi où l'insigne est donné.
 * - `iconeDeLaSaison` (24) : l'onglet « La saison ». Une couronne de feuilles vertes nouée de rouge, une étoile d'or au
 *   milieu : ce qu'on gagne au bout de la saison.
 * - `medaille(place)` (16) : les places 1, 2 et 3. Un disque d'or, d'argent ou de bronze pendu à un ruban bleu et rouge,
 *   le chiffre de la place frappé au milieu : le rang se lit au chiffre, pas à la couleur seule.
 * - `partDeLaCagnotte(place)` (24) : la part d'une place au partage de la saison. Une pile de pièces sur une planche,
 *   cinq pièces pour la première place, trois pour la deuxième, deux pour la troisième (50, 30 et 20 pour cent).
 * - `podiumVide` (34 × 20) : personne n'est encore classé. Trois marches de pierre claire, la plus haute au milieu, leurs
 *   chiffres gravés, un liseré d'or, d'argent et de bronze, et rien dessus.
 * - `placeLibre` (24) : une place du podium que personne ne tient. La silhouette en pointillé d'une tête et de ses
 *   épaules, comme la place vide des salles, en plus petit.
 *
 * La cagnotte de la saison est `iconeCagnotte` des salles (`../duel-salles/dessins-salles.ts`) : le même chaudron, pas un
 * second dessin. L'insigne du duelliste de la semaine est dans `src/lib/village/insigne-du-duel.ts`.
 *
 * Chaque dessin est fait une fois, puis gardé en mémoire.
 */
import { PAL } from "../../../lib/jeu/palette";
import { Planche, R, cerne, ell, etoile5, poly, rr, volume } from "../../../lib/jeu/planche";

const { k, n, o, O, y, Y, r, R: Rg, p, B, c, w, W, g: vf, G, h, s, S, t, m, M, N } = PAL;

const BLANC = "#ffffff";
const BOIS_CLAIR = "#f2cf9a";

/** Les trois métaux des places : la lumière, le corps, l'ombre, et l'encre du chiffre frappé. */
const METAUX = {
  1: { clair: Y, corps: y, ombre: O, chiffre: n },
  2: { clair: BLANC, corps: t, ombre: S, chiffre: "#131a36" },
  3: { clair: "#f6c08e", corps: "#d07a3c", ombre: "#8f4a1e", chiffre: "#2a1004" },
} as const;

/** Une place du podium : 1, 2 ou 3. */
export type PlaceDuPodium = 1 | 2 | 3;

/** Les pièces de la pile de chaque place : la moitié, les trois dixièmes, le cinquième de la cagnotte. */
export const PIECES_DE_LA_PART: Readonly<Record<PlaceDuPodium, number>> = { 1: 5, 2: 3, 3: 2 };

const DEJA = new Map<string, Planche>();
/** Garde un dessin en mémoire : il n'est fait qu'une fois. */
function garde(nom: string, fabriquer: () => Planche): Planche {
  let pl = DEJA.get(nom);
  if (!pl) {
    pl = fabriquer();
    DEJA.set(nom, pl);
  }
  return pl;
}

/** Efface le bord d'une case tout autour : la place du cerne. */
function bord(g: Planche): void {
  g.clearRect(0, 0, g.width, 1);
  g.clearRect(0, g.height - 1, g.width, 1);
  g.clearRect(0, 0, 1, g.height);
  g.clearRect(g.width - 1, 0, 1, g.height);
}

/** Un dessin de `l` cases sur `ht` : le bord effacé, puis le cerne et le volume. */
const dessin = (nom: string, l: number, ht: number, peindre: (g: Planche) => void): Planche =>
  garde(nom, () => {
    const cv = new Planche(l, ht);
    peindre(cv);
    bord(cv);
    return volume(cerne(cv));
  });

/** Une petite étoile de lumière : une croix de trois cases. */
function eclat(g: Planche, x: number, yy: number, coul: string = Y): void {
  R(g, x, yy - 1, 1, 3, coul);
  R(g, x - 1, yy, 3, 1, coul);
}

/** Les chiffres 1, 2 et 3, sur trois cases de large et cinq de haut. */
const CHIFFRES: Readonly<Record<PlaceDuPodium, readonly string[]>> = {
  1: [".#.", "##.", ".#.", ".#.", "###"],
  2: ["##.", "..#", ".#.", "#..", "###"],
  3: ["##.", "..#", ".#.", "..#", "##."],
};

/** Écrit le chiffre d'une place, son coin en haut à gauche en (`x`, `yy`). */
function chiffre(g: Planche, place: PlaceDuPodium, x: number, yy: number, coul: string): void {
  CHIFFRES[place].forEach((rangee, j) => {
    for (let i = 0; i < rangee.length; i++) if (rangee[i] === "#") R(g, x + i, yy + j, 1, 1, coul);
  });
}

/** Le tableau : un panneau de bois sur ses pieds, trois lignes classées. */
export const iconeDuTableau = (): Planche =>
  dessin("tableau", 24, 24, (g) => {
    // les deux pieds
    R(g, 5, 19, 2, 4, M);
    R(g, 5, 19, 1, 4, N);
    R(g, 17, 19, 2, 4, m);
    R(g, 17, 19, 1, 4, M);
    // le panneau de bois
    rr(g, 1, 2, 22, 18, 1, M);
    R(g, 2, 2, 20, 1, BOIS_CLAIR);
    R(g, 1, 3, 1, 16, N);
    R(g, 22, 3, 1, 16, m);
    R(g, 2, 19, 20, 1, m);
    // la feuille clouée
    R(g, 3, 4, 18, 14, k);
    R(g, 4, 5, 16, 12, w);
    R(g, 4, 5, 16, 1, BLANC);
    R(g, 19, 6, 1, 11, W);
    R(g, 4, 16, 16, 1, W);
    // trois lignes : la pastille de la place, le trait de la note
    const lignes = [
      [6, METAUX[1], 9],
      [10, METAUX[2], 7],
      [14, METAUX[3], 5],
    ] as const;
    for (const [yy, metal, long] of lignes) {
      R(g, 5, yy, 3, 2, metal.corps);
      R(g, 5, yy, 1, 1, metal.clair);
      R(g, 7, yy + 1, 1, 1, metal.ombre);
      R(g, 9, yy, long, 2, s);
      R(g, 9, yy, long, 1, S);
    }
    // les deux clous
    R(g, 11, 3, 2, 1, y);
  });

/** La semaine : une page de calendrier, sept cases, la dernière d'or. */
export const iconeDeLaSemaine = (): Planche =>
  dessin("semaine", 24, 24, (g) => {
    // la page
    rr(g, 2, 3, 20, 19, 1, w);
    R(g, 3, 21, 18, 1, W);
    R(g, 20, 9, 1, 12, W);
    // le bandeau rouge
    rr(g, 2, 3, 20, 6, 1, Rg);
    R(g, 3, 3, 18, 1, p);
    R(g, 2, 8, 20, 1, r);
    R(g, 2, 7, 20, 1, Rg);
    // les deux anneaux
    for (const x of [6, 16]) {
      R(g, x - 1, 1, 4, 5, k);
      R(g, x, 1, 2, 4, t);
      R(g, x, 1, 1, 4, BLANC);
      R(g, x + 1, 4, 1, 1, S);
    }
    // sept jours : quatre, puis trois ; le dernier est le mardi de l'insigne
    const jours: [number, number][] = [
      [4, 10],
      [8, 10],
      [12, 10],
      [16, 10],
      [4, 15],
      [8, 15],
      [12, 15],
    ];
    jours.forEach(([x, yy], i) => {
      const dernier = i === jours.length - 1;
      R(g, x, yy, 3, 4, dernier ? y : c);
      R(g, x, yy, 3, 1, dernier ? Y : BLANC);
      R(g, x, yy + 3, 3, 1, dernier ? O : B);
      R(g, x + 2, yy + 1, 1, 2, dernier ? O : "#6f9cf5");
    });
    eclat(g, 18, 17, O);
  });

/** La saison : une couronne de feuilles, une étoile d'or au milieu. */
export const iconeDeLaSaison = (): Planche =>
  dessin("saison", 24, 24, (g) => {
    // les feuilles : deux branches qui montent du nœud, de chaque côté
    const feuilles = 7;
    for (let i = 0; i < feuilles; i++) {
      const a = 0.36 + (i * (Math.PI - 0.72)) / (feuilles - 1);
      for (const cote of [1, -1]) {
        const fx = 12 + cote * Math.sin(a) * 8.6;
        const fy = 12.4 + Math.cos(a) * 8.6;
        ell(g, fx, fy, 2.1, 2.1, vf);
        ell(g, fx - 0.5, fy - 0.5, 1.3, 1.3, G);
        R(g, Math.round(fx - 1.2), Math.round(fy - 1.4), 1, 1, h);
      }
    }
    // le nœud rouge, en bas
    R(g, 10, 20, 4, 3, k);
    R(g, 11, 20, 2, 2, Rg);
    R(g, 11, 20, 1, 1, p);
    R(g, 12, 21, 1, 1, r);
    // l'étoile d'or
    poly(g, etoile5(12, 12.6, 6.6, 3.1), k);
    poly(g, etoile5(12, 12.6, 5.4, 2.4), y);
    poly(g, etoile5(12.6, 13.4, 3.4, 1.6), O);
    poly(g, etoile5(11.6, 12.2, 3.2, 1.5), y);
    R(g, 11, 10, 1, 2, Y);
    R(g, 10, 11, 2, 1, Y);
  });

/** La médaille d'une place : un disque de métal à son chiffre, pendu à un ruban. */
export function medaille(place: PlaceDuPodium): Planche {
  return dessin(`medaille-${place}`, 16, 16, (g) => {
    const metal = METAUX[place];
    // le ruban : un pan bleu, un pan rouge
    poly(g, [[3, 1], [7, 1], [9, 6], [5, 6]], B);
    poly(g, [[9, 1], [13, 1], [11, 6], [7, 6]], Rg);
    R(g, 3, 1, 4, 1, c);
    R(g, 9, 1, 4, 1, p);
    R(g, 7, 4, 2, 2, k);
    // le disque
    ell(g, 8, 10, 5.6, 5.6, k);
    ell(g, 8, 10, 4.7, 4.7, metal.ombre);
    ell(g, 7.6, 9.6, 4.1, 4.1, metal.corps);
    R(g, 5, 7, 2, 1, metal.clair);
    R(g, 4, 8, 1, 2, metal.clair);
    // le chiffre frappé
    chiffre(g, place, 7, 8, metal.chiffre);
  });
}

/** La part d'une place au partage : une pile de cinq, trois ou deux pièces. */
export function partDeLaCagnotte(place: PlaceDuPodium): Planche {
  return dessin(`part-${place}`, 24, 24, (g) => {
    // la planche
    R(g, 2, 20, 20, 3, M);
    R(g, 2, 20, 20, 1, N);
    R(g, 2, 22, 20, 1, m);
    // la pile
    const pieces = PIECES_DE_LA_PART[place];
    const x = 5;
    const l = 14;
    const bas = 19;
    const haut = bas - pieces * 3 + 1;
    R(g, x - 1, haut - 2, l + 2, pieces * 3 + 3, k);
    for (let i = 0; i < pieces; i++) {
      const yy = haut + i * 3;
      R(g, x, yy, l, 1, y);
      R(g, x, yy + 1, l, 1, O);
      R(g, x, yy + 2, l, 1, o);
      R(g, x, yy, 2, 1, Y);
      R(g, x + l - 2, yy, 2, 2, O);
      for (let xx = x + 2; xx < x + l - 1; xx += 3) R(g, xx, yy + 1, 1, 1, y);
    }
    // le dessus de la pile
    R(g, x + 1, haut - 2, l - 2, 1, y);
    R(g, x, haut - 1, l, 1, y);
    R(g, x + 1, haut - 2, 4, 1, Y);
    R(g, x + l - 5, haut - 1, 4, 1, O);
    g.clearRect(x - 1, haut - 2, 1, 1);
    g.clearRect(x + l, haut - 2, 1, 1);
    if (place === 1) eclat(g, 20, 3);
  });
}

/** Personne n'est encore classé : trois marches, rien dessus. */
export const podiumVide = (): Planche =>
  dessin("podium-vide", 34, 20, (g) => {
    // la marche de gauche (2), celle du milieu (1), celle de droite (3)
    const marches = [
      [2, 8, 2],
      [12, 3, 1],
      [22, 11, 3],
    ] as const;
    for (const [x, haut, place] of marches) {
      const metal = METAUX[place];
      R(g, x, haut, 10, 19 - haut, w);
      R(g, x, haut, 10, 2, metal.corps);
      R(g, x, haut, 10, 1, metal.clair);
      R(g, x + 8, haut + 1, 2, 1, metal.ombre);
      R(g, x, haut + 2, 1, 17 - haut, BLANC);
      R(g, x + 9, haut + 2, 1, 17 - haut, W);
      chiffre(g, place, x + 4, haut + 3, s);
    }
    // les joints entre les marches
    R(g, 11, 8, 1, 11, W);
    R(g, 22, 11, 1, 8, W);
  });

/** Une place que personne ne tient : une tête et des épaules en pointillé. */
export const placeLibre = (): Planche =>
  garde("place-libre", () => {
    const g = new Planche(24, 24);
    const trait = "#7f8db8";
    let i = 0;
    const point = (x: number, yy: number): void => {
      if (i++ % 3 !== 2) R(g, x, yy, 1, 1, trait);
    };
    // la tête
    let avant = "";
    for (let a = 0; a < 24; a++) {
      const an = (a / 24) * Math.PI * 2 - Math.PI / 2;
      const x = Math.round(11.5 + Math.cos(an) * 4.2);
      const yy = Math.round(6.5 + Math.sin(an) * 4.2);
      const cle = `${x},${yy}`;
      if (cle === avant) continue;
      avant = cle;
      point(x, yy);
    }
    // les épaules, puis les flancs
    const epaule: [number, number][] = [
      [9, 12],
      [8, 12],
      [7, 13],
      [6, 13],
      [5, 14],
      [4, 15],
      [4, 16],
      [3, 17],
      [3, 18],
      [3, 19],
      [3, 20],
      [3, 21],
    ];
    i = 0;
    for (const [x, yy] of epaule) {
      if (i % 3 !== 2) {
        R(g, x, yy, 1, 1, trait);
        R(g, 23 - x, yy, 1, 1, trait);
      }
      i++;
    }
    return g;
  });
