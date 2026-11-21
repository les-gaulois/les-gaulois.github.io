/**
 * Les icônes du kit en pixels de « Mon Gaulois » : celles de la maquette validée par le pilote (planche de Claude Fable 5.2,
 * 19-21 novembre 2026), recopiées dessin pour dessin, et deux de plus dessinées par Claude Fable 5.2 le 21 novembre 2026 pour
 * le site, « Ma carte » et « Retour au site ».
 *
 * - Les grandes, sur 24 cases, en couleur, avec leur cerne d'encre et leur volume (lumière en haut à gauche) : le menu du jeu
 *   et les chiffres de « Ma carte ».
 * - Les petites, sur 16 cases, en blanc : les boutons bleus de la barre du jeu (pause, son, musique, thème, retour).
 *
 * Aucune ne rappelle une œuvre existante. Voir « Le kit du jeu » dans docs/DESIGN.md.
 */
import { PAL } from "./palette";
import { Planche, R, cerne, ell, etoile5, grille, lig, marge, poly, rr, volume } from "./planche";

/** Les petites icônes blanches, sur 16 cases, en rangées de lettres (`w` crème, `W` son ombre). */
const PETITES = {
  pause: ["................", "................", "................", "....kkkk.kkkk...", "....kwwk.kwwk...", "....kwwk.kwwk...", "....kwwk.kwwk...", "....kwwk.kwwk...", "....kwwk.kwwk...", "....kWWk.kWWk...", "....kkkk.kkkk...", "................", "................", "................", "................", "................"],
  jouer: ["................", "................", ".....kk.........", ".....kwkk.......", ".....kwwwkk.....", ".....kwwwwwkk...", ".....kwwwwwwwk..", ".....kwwwwwkk...", ".....kwwwkk.....", ".....kWkk.......", ".....kk.........", "................", "................", "................", "................", "................"],
  soleil: ["................", "................", ".......yy.......", "....y..yy..y....", ".....y....y.....", "......yyyy......", "...yy.yYyy.yy...", "...yy.yyyy.yy...", "......yyyy......", ".....y....y.....", "....y..yy..y....", ".......yy.......", "................", "................", "................", "................"],
  son: ["................", "................", "........w.......", ".......ww..w....", "......www...w...", "...wwwwww.w.w...", "...wwwwww.w.w...", "...wwwwww.w.w...", "......www...w...", ".......ww..w....", "........w.......", "................", "................", "................", "................", "................"],
  muet: ["................", "................", "........w.......", ".......ww.......", "......www.......", "...wwwwww.w.w...", "...wwwwww..w....", "...wwwwww.w.w...", "......www.......", ".......ww.......", "........w.......", "................", "................", "................", "................", "................"],
  musique: ["................", "................", ".......wwwww....", ".......wwwwww...", ".......w...ww...", ".......w....w...", ".......w........", ".......w........", "....wwww........", "...wwwww........", "...wwwww........", "....www.........", "................", "................", "................", "................"],
  silence: ["................", "................", ".......wwwww.w..", ".......wwwwww...", ".......w..www...", ".......w.w..w...", ".......ww.......", ".......w........", "....wwww........", "...wwwww........", "..wwwwww........", ".w..www.........", "................", "................", "................", "................"],
  lune: ["................", "................", "......wwww......", ".....wwww.......", "....wwww........", "....www.........", "....www.........", "....wwww........", "....wwwww..w....", ".....wwwwwww....", "......wwwww.....", "................", "................", "................", "................", "................"],
  // Dessinée par Claude Fable 5.2 (21 novembre 2026) : un cadre de porte ouvert, et une flèche qui en sort.
  retour: ["................", "................", ".......wwwwww...", ".......w....w...", "....w..w....w...", "...ww.......w...", "..wwwwwwww..w...", "..wwwwwwww..w...", "...ww.......w...", "....w..w....w...", ".......w....w...", ".......WWWWWW...", "................", "................", "................", "................"],
} as const;

export type NomDePetiteIcone = keyof typeof PETITES;
export const PETITES_ICONES = Object.keys(PETITES) as NomDePetiteIcone[];

/** Une petite icône blanche, sur 16 cases. */
export function petiteIcone(nom: NomDePetiteIcone): Planche {
  return grille(PETITES[nom], PAL);
}

/** Un dessin sur 24 cases : la marge d'une case effacée, puis le cerne et le volume, sauf finition à part. */
const faire =
  (dessin: (g: Planche) => void, fini?: (p: Planche) => Planche) =>
  (): Planche => {
    const cv = new Planche(24, 24);
    dessin(cv);
    marge(cv, 24);
    return fini ? fini(cv) : volume(cerne(cv));
  };

const { k, o, O, y, Y, r, R: Rg, p, b, B, c, w, W, g: vf, G, h, v, V, l, s, S, t, m, M, N, e, E, j, f, q } = PAL;

/** Les grandes icônes, sur 24 cases. */
const GRANDES = {
  // « Ma carte » (Claude Fable 5.2, 21 novembre 2026) : une carte à collectionner au cadre d'or, un portrait sur ciel bleu,
  // un bandeau tricolore, et une seconde carte glissée derrière.
  "ma-carte": faire((g) => {
    poly(g, [[1, 8], [8, 5], [8, 21], [4, 22]], B);
    lig(g, 2, 8, 5, 7, c);
    lig(g, 2, 10, 4, 20, b);
    R(g, 3, 9, 2, 1, w);
    R(g, 3, 11, 2, 1, w);
    R(g, 5, 2, 1, 20, k);
    rr(g, 6, 1, 16, 22, 1, O);
    R(g, 7, 1, 14, 1, Y);
    R(g, 6, 2, 1, 19, y);
    R(g, 7, 2, 1, 19, y);
    R(g, 20, 3, 2, 19, o);
    R(g, 7, 21, 14, 2, o);
    R(g, 8, 2, 3, 1, Y);
    R(g, 8, 3, 12, 12, k);
    R(g, 9, 4, 10, 10, "#7fb0ff");
    R(g, 9, 4, 10, 2, "#cfe2ff");
    R(g, 9, 11, 10, 3, B);
    R(g, 11, 11, 6, 3, Rg);
    R(g, 10, 12, 8, 2, Rg);
    R(g, 11, 11, 6, 1, p);
    R(g, 13, 11, 2, 1, "#f2c79a");
    R(g, 13, 12, 2, 2, y);
    R(g, 12, 6, 4, 5, "#f2c79a");
    R(g, 12, 9, 4, 1, y);
    R(g, 12, 10, 1, 1, y);
    R(g, 15, 10, 1, 1, y);
    R(g, 12, 5, 4, 1, y);
    R(g, 11, 6, 6, 1, y);
    R(g, 11, 7, 1, 3, y);
    R(g, 16, 7, 1, 3, O);
    R(g, 15, 6, 2, 1, O);
    R(g, 13, 8, 1, 1, k);
    R(g, 15, 8, 1, 1, k);
    R(g, 8, 16, 12, 5, k);
    R(g, 9, 17, 3, 3, B);
    R(g, 12, 17, 4, 3, w);
    R(g, 16, 17, 3, 3, Rg);
    R(g, 9, 17, 3, 1, c);
    R(g, 12, 17, 4, 1, "#ffffff");
    R(g, 16, 17, 3, 1, p);
    R(g, 9, 19, 3, 1, b);
    R(g, 12, 19, 4, 1, W);
    R(g, 16, 19, 3, 1, r);
    R(g, 2, 2, 1, 3, Y);
    R(g, 1, 3, 3, 1, Y);
  }),
  // « Retour au site » (Claude Fable 5.2, 21 novembre 2026) : une porte de bois ouverte sur la lumière, une flèche d'or.
  retour: faire((g) => {
    rr(g, 9, 1, 14, 22, 1, M);
    R(g, 10, 1, 12, 1, N);
    R(g, 9, 2, 1, 20, N);
    R(g, 21, 3, 2, 19, m);
    R(g, 11, 3, 10, 19, k);
    R(g, 12, 4, 8, 18, q);
    R(g, 12, 4, 8, 3, Y);
    R(g, 12, 18, 8, 4, y);
    poly(g, [[15, 3], [21, 3], [21, 22], [15, 22]], k);
    poly(g, [[16, 6], [20, 4], [20, 22], [16, 22]], B);
    R(g, 16, 6, 1, 16, c);
    R(g, 19, 5, 1, 17, b);
    R(g, 17, 8, 2, 4, "#2459e6");
    R(g, 17, 15, 2, 5, "#2459e6");
    R(g, 17, 13, 1, 1, y);
    R(g, 9, 22, 14, 1, S);
    const fleche = (dx: number, dy: number, coul: string): void => {
      poly(g, [[1 + dx, 12.5 + dy], [7 + dx, 6.5 + dy], [7 + dx, 18.5 + dy]], coul);
      R(g, 7 + dx, 10 + dy, 8, 5, coul);
    };
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) fleche(dx, dy, k);
    fleche(0, 0, y);
    R(g, 7, 10, 8, 1, Y);
    lig(g, 2, 12, 6, 8, Y);
    R(g, 7, 14, 8, 1, O);
    lig(g, 3, 14, 6, 17, O);
    R(g, 6, 16, 1, 2, O);
  }),
  vestiaire: faire((g) => {
    poly(g, [[8, 3], [16, 3], [22, 7], [23, 12], [19, 13], [18, 10], [18, 22], [6, 22], [6, 10], [5, 13], [1, 12], [2, 7]], B);
    R(g, 15, 10, 3, 12, "#2459e6");
    R(g, 17, 10, 1, 12, b);
    lig(g, 6, 10, 6, 13, b);
    lig(g, 17, 10, 17, 13, b);
    poly(g, [[8, 3], [16, 3], [12, 9]], "#f2c79a");
    lig(g, 8, 3, 11, 8, y);
    lig(g, 15, 3, 12, 8, y);
    lig(g, 9, 3, 11, 7, O);
    lig(g, 14, 3, 12, 7, O);
    lig(g, 9, 11, 9, 14, "#2459e6");
    lig(g, 13, 12, 13, 14, "#2459e6");
    R(g, 6, 15, 12, 3, O);
    R(g, 6, 15, 12, 1, y);
    R(g, 6, 17, 12, 1, o);
    R(g, 10, 14, 4, 5, Y);
    R(g, 11, 15, 2, 3, o);
    R(g, 6, 20, 12, 1, y);
    R(g, 6, 21, 12, 1, b);
    lig(g, 2, 11, 4, 12, y);
    lig(g, 19, 12, 21, 11, y);
    R(g, 4, 7, 3, 1, c);
    R(g, 9, 4, 1, 1, c);
  }),
  // Le pass (« Le sentier » jusqu'au 21 novembre 2026) : un fanion planté sur une colline, au bout d'un chemin de pierre.
  sentier: faire((g) => {
    ell(g, 11, 26, 13, 9, G);
    ell(g, 15, 28, 13, 9, vf);
    R(g, 3, 19, 2, 1, h);
    R(g, 18, 20, 2, 1, h);
    poly(g, [[8, 23], [17, 23], [14, 18], [10, 18]], t);
    poly(g, [[10, 18], [14, 18], [13, 15], [11, 15]], S);
    lig(g, 9, 21, 15, 21, S);
    lig(g, 11, 19, 13, 19, s);
    lig(g, 12, 22, 12, 22, s);
    R(g, 11, 3, 2, 13, M);
    R(g, 11, 3, 1, 13, N);
    poly(g, [[13, 3], [22, 6.5], [13, 10]], Rg);
    lig(g, 13, 3, 19, 5, p);
    poly(g, [[13, 8], [18, 8], [13, 10]], r);
    R(g, 15, 5, 2, 2, w);
    R(g, 10, 1, 4, 2, y);
    R(g, 11, 1, 1, 1, Y);
  }),
  forge: faire((g) => {
    poly(g, [[1, 13], [6, 11], [19, 11], [22, 12], [22, 14], [17, 16], [6, 16], [5, 14]], S);
    R(g, 6, 11, 13, 1, t);
    R(g, 6, 15, 11, 1, s);
    R(g, 17, 12, 4, 1, t);
    poly(g, [[8, 16], [16, 16], [15, 19], [9, 19]], s);
    poly(g, [[5, 22], [19, 22], [17, 19], [7, 19]], S);
    R(g, 5, 21, 14, 1, s);
    R(g, 8, 19, 8, 1, t);
    lig(g, 7, 9, 13, 3, M, 2);
    lig(g, 7, 9, 13, 3, N, 1);
    poly(g, [[12, 3], [16, 7], [20, 4], [16, 0.5]], S);
    lig(g, 13, 3, 16, 1, t);
    lig(g, 16, 6, 19, 4, s);
    R(g, 20, 8, 1, 1, Y);
    R(g, 22, 9, 1, 1, y);
    R(g, 19, 9, 1, 1, y);
    R(g, 21, 6, 1, 1, y);
    R(g, 3, 9, 1, 1, y);
  }),
  boutique: faire((g) => {
    R(g, 3, 9, 2, 13, M);
    R(g, 3, 9, 1, 13, N);
    R(g, 19, 9, 2, 13, M);
    R(g, 19, 9, 1, 13, N);
    R(g, 5, 10, 14, 6, "#2b1a0d");
    poly(g, [[1, 9], [4, 2], [20, 2], [23, 9]], (x, yy) => (Math.floor((x + 2) / 3) % 2 ? (yy >= 7 ? W : w) : yy >= 7 ? r : yy <= 2 ? p : Rg));
    for (let x = 1; x < 23; x++) if ((x + 2) % 3 !== 0) R(g, x, 9, 1, 1, Math.floor((x + 2) / 3) % 2 ? W : r);
    R(g, 2, 16, 20, 2, N);
    R(g, 2, 16, 20, 1, "#f2cf9a");
    R(g, 3, 18, 18, 4, M);
    R(g, 9, 18, 1, 4, m);
    R(g, 15, 18, 1, 4, m);
    R(g, 3, 21, 18, 1, m);
    ell(g, 8.5, 14, 2, 2, y);
    R(g, 8, 13, 1, 1, Y);
    R(g, 9, 15, 1, 1, O);
    R(g, 12, 12, 3, 4, B);
    R(g, 12, 11, 3, 1, c);
    R(g, 12, 12, 1, 4, c);
    ell(g, 17, 14.5, 1.5, 1.5, Rg);
    R(g, 17, 12, 1, 1, vf);
  }),
  // Les boosters (« Les pochettes » jusqu'au 21 novembre 2026) : un paquet serti, une écharpe tricolore, une étoile.
  pochettes: faire((g) => {
    for (let x = 5; x < 19; x++) {
      const cl = x % 2 ? t : S;
      R(g, x, 1 + (x % 2), 1, 3 - (x % 2), cl);
      R(g, x, 20, 1, 3 - (x % 2), cl);
    }
    R(g, 5, 4, 14, 1, s);
    R(g, 5, 19, 14, 1, s);
    R(g, 5, 5, 14, 14, B);
    R(g, 5, 5, 2, 14, c);
    R(g, 17, 5, 2, 14, b);
    for (let yy = 5; yy < 19; yy++)
      for (let x = 7; x < 17; x++) {
        const d = x + (yy - 5) * 0.8;
        if (d >= 20 && d < 21) R(g, x, yy, 1, 1, w);
        else if (d >= 21 && d < 24) R(g, x, yy, 1, 1, Rg);
        else if (d >= 24 && d < 25) R(g, x, yy, 1, 1, w);
        else if (d >= 9 && d < 10.5) R(g, x, yy, 1, 1, c);
      }
    g.drawImage(grille(["..y..", "yyYyy", ".yYy.", ".y.y."], PAL), 8, 8);
    R(g, 6, 6, 12, 1, "#e9eefb");
    for (let x = 6; x < 18; x += 2) R(g, x, 6, 1, 1, B);
    R(g, 21, 3, 1, 3, Y);
    R(g, 20, 4, 3, 1, Y);
  }),
  // La vitrine : une armoire de collection en bois, vitrée, ses étagères garnies.
  vitrine: (): Planche => {
    const cv = new Planche(24, 24);
    const g = cv;
    R(g, 4, 21, 3, 2, m);
    R(g, 17, 21, 3, 2, m);
    rr(g, 2, 1, 20, 21, 1, M);
    R(g, 2, 1, 20, 2, N);
    R(g, 2, 20, 20, 2, m);
    R(g, 2, 3, 1, 17, N);
    R(g, 21, 3, 1, 17, m);
    R(g, 4, 4, 16, 16, "#a9c8fb");
    R(g, 4, 4, 16, 2, "#e6f0ff");
    R(g, 4, 11, 16, 2, M);
    R(g, 4, 11, 16, 1, N);
    R(g, 6, 6, 4, 3, y);
    R(g, 6, 6, 1, 3, Y);
    R(g, 7, 9, 2, 1, O);
    R(g, 6, 10, 4, 1, O);
    R(g, 15, 6, 1, 5, Rg);
    R(g, 14, 7, 3, 3, Rg);
    R(g, 13, 8, 5, 1, Rg);
    R(g, 14, 7, 1, 1, p);
    R(g, 5, 14, 4, 6, B);
    R(g, 5, 14, 4, 1, c);
    R(g, 6, 16, 2, 2, w);
    R(g, 10, 14, 4, 6, V);
    R(g, 10, 14, 4, 1, l);
    R(g, 11, 16, 2, 2, w);
    R(g, 15, 14, 4, 6, G);
    R(g, 15, 14, 4, 1, h);
    R(g, 16, 16, 2, 2, w);
    lig(g, 18, 5, 19, 4, "#ffffff");
    lig(g, 18, 7, 19, 6, "#ffffff");
    return volume(cerne(cv));
  },
  loterie: faire((g) => {
    poly(g, [[1, 10], [19, 3], [23, 13], [5, 20]], y);
    lig(g, 2, 10, 19, 4, Y);
    lig(g, 3, 11, 19, 5, "#fff2a8");
    lig(g, 6, 19, 22, 13, O);
    lig(g, 5, 18, 21, 12, "#f0b020");
    g.clearRect(2, 14, 3, 3);
    g.clearRect(20, 7, 3, 3);
    for (let i = 0; i < 9; i += 2) R(g, 8 + Math.round(i * 0.36), 8 + i, 1, 1, o);
    g.drawImage(grille(["...o...", "...o...", "ooooooo", ".ooooo.", "..ooo..", ".oo.oo.", "o.....o"], PAL), 12, 7);
    R(g, 15, 9, 1, 2, Y);
    R(g, 5, 12, 2, 1, o);
    R(g, 6, 14, 2, 1, o);
    R(g, 20, 1, 1, 3, Y);
    R(g, 19, 2, 3, 1, Y);
    R(g, 2, 20, 1, 3, Y);
    R(g, 1, 21, 3, 1, Y);
  }),
  xp: faire((g) => {
    poly(g, [[12, 1], [21, 7], [21, 17], [12, 23], [3, 17], [3, 7]], B);
    poly(g, [[12, 1], [3, 7], [3, 17], [12, 12]], "#7fb0ff");
    poly(g, [[12, 1], [21, 7], [21, 17], [12, 12]], "#4f86ff");
    poly(g, [[12, 12], [21, 17], [12, 23]], b);
    poly(g, [[12, 12], [3, 17], [12, 23]], "#2459e6");
    lig(g, 12, 2, 12, 11, c);
    lig(g, 4, 7, 11, 2, "#cfe2ff");
    lig(g, 7, 12, 11, 8, w, 2);
    lig(g, 12, 8, 16, 12, w, 2);
    lig(g, 7, 17, 11, 13, w, 2);
    lig(g, 12, 13, 16, 17, w, 2);
    R(g, 6, 8, 2, 1, "#ffffff");
    R(g, 5, 9, 1, 1, "#ffffff");
  }),
  victoire: faire((g) => {
    rr(g, 1, 4, 7, 8, 2, O);
    g.clearRect(3, 6, 3, 4);
    rr(g, 16, 4, 7, 8, 2, O);
    g.clearRect(18, 6, 3, 4);
    R(g, 1, 6, 1, 3, y);
    R(g, 16, 5, 5, 1, y);
    poly(g, [[5, 2], [19, 2], [18, 9], [15, 13], [9, 13], [6, 9]], y);
    poly(g, [[15, 3], [19, 3], [18, 9], [15, 13]], O);
    R(g, 7, 3, 2, 7, Y);
    R(g, 9, 3, 1, 4, "#fff2a8");
    R(g, 5, 2, 14, 1, Y);
    R(g, 12, 5, 1, 5, o);
    R(g, 10, 7, 5, 1, o);
    R(g, 11, 13, 2, 4, O);
    R(g, 11, 13, 1, 4, y);
    R(g, 10, 15, 4, 1, y);
    R(g, 7, 17, 10, 2, y);
    R(g, 7, 18, 10, 1, O);
    rr(g, 5, 19, 14, 4, 1, M);
    R(g, 6, 19, 12, 1, N);
    R(g, 6, 22, 12, 1, m);
    R(g, 9, 20, 6, 2, y);
    R(g, 9, 21, 6, 1, O);
  }),
  points: faire((g) => {
    poly(g, [[3, 2], [21, 2], [21, 12], [12, 22.5], [3, 12]], (x, yy) => (x > 12 + (yy > 12 ? 0 : 6) ? O : y));
    poly(g, [[5, 4], [19, 4], [19, 11.5], [12, 19.5], [5, 11.5]], (x, yy) => {
      const ombre = yy > 13;
      return x < 10 ? (ombre ? b : B) : x < 14 ? (ombre ? W : w) : ombre ? r : Rg;
    });
    R(g, 5, 4, 5, 1, c);
    R(g, 10, 4, 4, 1, "#ffffff");
    R(g, 14, 4, 5, 1, p);
    R(g, 6, 5, 1, 5, c);
    R(g, 3, 2, 18, 1, Y);
    R(g, 4, 3, 1, 1, Y);
    R(g, 20, 3, 1, 1, Y);
  }),
  flamme: faire(
    (g) => {
      poly(g, [[12, 1], [15, 6], [17, 4], [21, 11], [21, 16], [17, 23], [7, 23], [3, 16], [3, 11], [6, 7], [8, 10]], E);
      poly(g, [[12, 5], [14, 10], [16, 8], [19, 13], [18, 18], [15, 22], [9, 22], [6, 17], [6, 12], [8, 13]], e);
      poly(g, [[12, 10], [15, 14], [16, 18], [13, 22], [11, 22], [8, 18], [9, 14]], j);
      poly(g, [[12, 15], [14, 19], [12, 22], [10, 19]], q);
      R(g, 19, 5, 1, 1, e);
      R(g, 4, 4, 1, 1, j);
      R(g, 21, 8, 1, 1, j);
    },
    (cv) => cerne(cv, f),
  ),
  utilite: faire((g) => {
    ell(g, 12, 12, 10.6, 10.6, vf);
    ell(g, 12, 12, 9, 9, G);
    ell(g, 13, 13.5, 8, 7.5, "#35bd5e");
    ell(g, 11.5, 11.5, 7.6, 7.6, G);
    ell(g, 8.5, 7.5, 3, 1.8, h);
    R(g, 10, 6, 4, 12, w);
    R(g, 6, 10, 12, 4, w);
    R(g, 10, 17, 4, 1, W);
    R(g, 17, 10, 1, 4, W);
    R(g, 13, 14, 1, 4, W);
    R(g, 14, 13, 4, 1, W);
    R(g, 10, 6, 1, 4, "#ffffff");
    R(g, 6, 10, 4, 1, "#ffffff");
  }),
  niveau: faire((g) => {
    poly(g, etoile5(12, 12.6, 11.4, 5), (x, yy) => (x + yy > 27 ? v : V));
    poly(g, etoile5(12, 12.6, 6.2, 2.8), (x, yy) => (x + yy > 25 ? V : l));
    lig(g, 12, 2, 10, 8, l);
    lig(g, 3, 10, 8, 9, l);
    R(g, 11, 11, 2, 2, "#ffffff");
  }),
} as const;

export type NomDeGrandeIcone = keyof typeof GRANDES;
export const GRANDES_ICONES = Object.keys(GRANDES) as NomDeGrandeIcone[];

const DEJA = new Map<string, Planche>();
/** Une grande icône, sur 24 cases. Dessinée une fois. */
export function grandeIcone(nom: NomDeGrandeIcone): Planche {
  let p = DEJA.get(nom);
  if (!p) {
    p = GRANDES[nom]();
    DEJA.set(nom, p);
  }
  return p;
}

