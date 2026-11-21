/**
 * Les icônes du kit en pixels de « Mon Gaulois » : celles de la maquette validée par le pilote (planche de Claude Fable 5.2,
 * 19-21 novembre 2026), recopiées dessin pour dessin, et deux de plus dessinées par Claude Fable 5.2 le 21 novembre 2026 pour
 * le site, « Ma carte » et « Retour au site ».
 *
 * - Les grandes, sur 24 cases, en couleur, avec leur cerne d'encre et leur volume (lumière en haut à gauche) : le menu du jeu
 *   et les chiffres de « Ma carte » ; depuis le soir du 21 novembre 2026 (Claude Fable 5.2, demande du pilote : des icônes
 *   plutôt que des mots), les sept parties du corps du vestiaire (`trait-…`), les rayons de la boutique et son filtre « Tout »
 *   (`rayon-…`), les titres et boutons de la boutique et du marché (`action-…`).
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

/** La peau des icônes (celle du portrait de « Ma carte »), sa lumière et son ombre ; le roux de la barbe. */
const PEAU = "#f2c79a";
const PEAU_CLAIRE = "#ffe3c4";
const PEAU_OMBRE = "#d39b68";
const ROUX = "#d9742a";
const ROUX_CLAIR = "#f5a35a";
const ROUX_OMBRE = "#a04a14";

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

  // ——— Les sept parties du corps du vestiaire : elles remplacent des mots (demande du pilote, 21 novembre 2026). ———

  // Dessinée par Claude Fable 5.2 (21 novembre 2026) : le corps entier, debout, moitié humain (peau, cheveux blonds), moitié
  // créature (verte, une corne, une oreille pointue, une queue).
  "trait-corps": faire((g) => {
    const corps = (p: Planche, clair: string, base: string, ombre: string): void => {
      ell(p, 12, 6, 4.6, 4.6, base);
      R(p, 11, 10, 2, 1, ombre);
      R(p, 4, 11, 16, 2, base);
      R(p, 4, 13, 2, 5, base);
      R(p, 18, 13, 2, 5, base);
      R(p, 4, 17, 2, 1, clair);
      R(p, 18, 17, 2, 1, clair);
      rr(p, 7, 11, 10, 6, 0, base);
      R(p, 8, 12, 3, 1, clair);
      R(p, 13, 12, 3, 1, clair);
      R(p, 11, 13, 2, 3, ombre);
      R(p, 7, 16, 10, 3, M);
      R(p, 7, 16, 10, 1, N);
      R(p, 11, 17, 2, 2, y);
      R(p, 8, 19, 3, 3, base);
      R(p, 13, 19, 3, 3, base);
      R(p, 7, 22, 4, 1, ombre);
      R(p, 13, 22, 4, 1, ombre);
    };
    corps(g, "#8ff0a8", G, vf);
    poly(g, [[16, 4], [20, 2], [17, 7]], G);
    poly(g, [[13, 3], [16, 1], [16, 4]], w);
    R(g, 14, 6, 2, 1, y);
    R(g, 15, 6, 1, 1, k);
    R(g, 13, 8, 2, 1, vf);
    lig(g, 17, 16, 21, 19, G, 2);
    R(g, 14, 13, 1, 1, vf);
    R(g, 15, 20, 1, 1, vf);
    g.clearRect(0, 0, 12, 24);
    const humain = new Planche(24, 24);
    corps(humain, PEAU_CLAIRE, PEAU, PEAU_OMBRE);
    R(humain, 8, 2, 4, 2, y);
    R(humain, 7, 3, 2, 4, y);
    R(humain, 9, 2, 3, 1, Y);
    R(humain, 10, 6, 1, 1, k);
    R(humain, 10, 8, 2, 1, PEAU_OMBRE);
    humain.clearRect(12, 0, 12, 24);
    g.drawImage(humain, 0, 0);
  }),
  // Dessinée par Claude Fable 5.2 (21 novembre 2026) : une main ouverte, paume vers nous, et trois pastilles de teintes de peau.
  "trait-peau": faire((g) => {
    rr(g, 5, 11, 11, 11, 2, PEAU);
    R(g, 5, 4, 2, 8, PEAU);
    R(g, 8, 2, 2, 10, PEAU);
    R(g, 11, 3, 2, 9, PEAU);
    R(g, 14, 6, 2, 6, PEAU);
    poly(g, [[5, 14], [2, 10], [1, 12], [3, 17], [6, 19]], PEAU);
    for (const [x, yy] of [[5, 4], [8, 2], [11, 3], [14, 6]] as const) R(g, x, yy, 2, 1, PEAU_CLAIRE);
    R(g, 7, 14, 6, 1, PEAU_OMBRE);
    lig(g, 7, 17, 11, 16, PEAU_OMBRE);
    lig(g, 12, 16, 13, 18, PEAU_OMBRE);
    R(g, 6, 21, 9, 1, PEAU_OMBRE);
    R(g, 15, 13, 1, 8, PEAU_OMBRE);
    ell(g, 20.5, 5, 2.4, 2.4, PEAU_CLAIRE);
    ell(g, 20.5, 12, 2.4, 2.4, "#c98a55");
    ell(g, 20.5, 19, 2.4, 2.4, "#7a4a2a");
  }),
  // Dessinée par Claude Fable 5.2 (21 novembre 2026) : un visage de face sous une grande chevelure blonde, deux tresses baguées.
  "trait-cheveux": faire((g) => {
    ell(g, 12, 9.5, 9.5, 8, y);
    R(g, 2, 11, 4, 11, y);
    R(g, 18, 11, 4, 11, y);
    R(g, 20, 11, 2, 11, O);
    R(g, 2, 17, 4, 1, Rg);
    R(g, 18, 17, 4, 1, Rg);
    R(g, 3, 13, 1, 3, O);
    R(g, 19, 13, 1, 3, o);
    R(g, 3, 19, 1, 2, O);
    R(g, 19, 19, 1, 2, o);
    ell(g, 12, 15.5, 5.2, 6, PEAU);
    R(g, 8, 20, 8, 2, PEAU);
    R(g, 9, 21, 6, 1, PEAU_OMBRE);
    poly(g, [[6, 12], [7, 7], [12, 5], [17, 7], [18, 12], [15, 10], [13, 12], [11, 10], [8, 11]], y);
    lig(g, 6, 5, 10, 3, Y);
    lig(g, 5, 8, 8, 5, Y);
    lig(g, 12, 6, 12, 9, O);
    lig(g, 15, 5, 17, 9, O);
    lig(g, 9, 7, 9, 9, O);
    R(g, 10, 15, 1, 2, k);
    R(g, 14, 15, 1, 2, k);
    R(g, 11, 18, 3, 1, PEAU_OMBRE);
  }),
  // Dessinée par Claude Fable 5.2 (21 novembre 2026) : un visage sans cheveux, une grosse moustache tombante et une barbe rousse
  // nouée d'une bague d'or.
  "trait-barbe": faire((g) => {
    rr(g, 4, 1, 16, 13, 3, PEAU);
    R(g, 7, 1, 10, 1, PEAU_CLAIRE);
    R(g, 4, 4, 1, 6, PEAU_CLAIRE);
    R(g, 7, 4, 2, 2, k);
    R(g, 15, 4, 2, 2, k);
    R(g, 11, 4, 2, 4, PEAU_OMBRE);
    R(g, 10, 7, 4, 1, PEAU_OMBRE);
    poly(g, [[4, 10], [20, 10], [21, 15], [17, 20], [14, 22], [10, 22], [7, 20], [3, 15]], ROUX);
    poly(g, [[14, 12], [20, 10], [21, 15], [17, 20], [14, 22], [13, 22]], ROUX_OMBRE);
    lig(g, 5, 15, 7, 19, ROUX_CLAIR);
    lig(g, 8, 16, 9, 19, ROUX_CLAIR);
    lig(g, 15, 16, 14, 19, ROUX);
    const moustache = (dy: number, gauche: string, droite: string): void => {
      poly(g, [[12, 8 + dy], [8, 8 + dy], [4, 9 + dy], [1, 13 + dy], [1, 15 + dy], [4, 14 + dy], [7, 12 + dy], [12, 12 + dy]], gauche);
      poly(g, [[12, 8 + dy], [16, 8 + dy], [20, 9 + dy], [23, 13 + dy], [23, 15 + dy], [20, 14 + dy], [17, 12 + dy], [12, 12 + dy]], droite);
    };
    moustache(1, k, k);
    moustache(0, ROUX_CLAIR, ROUX);
    lig(g, 4, 10, 8, 9, "#ffc98a");
    R(g, 12, 9, 1, 3, ROUX_OMBRE);
    R(g, 10, 14, 4, 1, f);
    R(g, 10, 19, 4, 2, y);
    R(g, 10, 19, 4, 1, Y);
    R(g, 13, 20, 1, 1, O);
  }),
  // Dessinée par Claude Fable 5.2 (21 novembre 2026) : un grand œil bleu en amande sous son sourcil.
  "trait-yeux": faire((g) => {
    poly(g, [[4, 5], [9, 2], [16, 2], [21, 5], [21, 6], [16, 4], [9, 4], [4, 7]], m);
    lig(g, 6, 4, 9, 3, M);
    poly(g, [[1, 14], [6, 9], [12, 7], [18, 9], [23, 14], [18, 19], [12, 21], [6, 19]], w);
    lig(g, 3, 15, 7, 19, W);
    lig(g, 7, 19, 12, 20, W);
    lig(g, 13, 20, 18, 18, W);
    lig(g, 18, 18, 21, 15, W);
    ell(g, 12, 14, 5.2, 5.2, b);
    ell(g, 12, 14, 4.2, 4.2, B);
    ell(g, 11, 13, 3, 3, "#5d8dff");
    ell(g, 12, 14, 2.2, 2.2, k);
    R(g, 9, 11, 2, 2, "#ffffff");
    R(g, 14, 16, 1, 1, c);
    poly(g, [[1, 14], [6, 9], [12, 7], [18, 9], [23, 14], [18, 10.5], [12, 8.6], [6, 10.5]], k);
    R(g, 1, 12, 1, 1, k);
    R(g, 3, 9, 1, 1, k);
  }),
  // Dessinée par Claude Fable 5.2 (21 novembre 2026) : une bouche qui sourit, lèvres rouges et dents blanches.
  "trait-bouche": faire((g) => {
    poly(g, [[1, 9], [5, 6], [9, 5], [12, 7], [15, 5], [19, 6], [23, 9], [20, 16], [16, 20], [8, 20], [4, 16]], Rg);
    poly(g, [[1, 9], [5, 6], [9, 5], [12, 7], [15, 5], [19, 6], [23, 9], [19, 10], [5, 10]], r);
    lig(g, 5, 7, 9, 6, Rg);
    lig(g, 15, 6, 18, 7, Rg);
    poly(g, [[4, 10], [20, 10], [18, 14], [15, 16], [9, 16], [6, 14]], f);
    R(g, 6, 10, 12, 2, w);
    R(g, 7, 12, 10, 1, W);
    for (const x of [9, 12, 15]) R(g, x, 10, 1, 2, W);
    R(g, 10, 15, 4, 1, "#e0263a");
    lig(g, 8, 18, 15, 18, p);
    R(g, 9, 17, 3, 1, p);
  }),
  // Dessinée par Claude Fable 5.2 (21 novembre 2026) : un coin de visage, l'œil fermé, barré d'une balafre rose recousue.
  "trait-cicatrice": faire((g) => {
    rr(g, 2, 2, 20, 20, 4, PEAU);
    R(g, 5, 2, 14, 1, PEAU_CLAIRE);
    R(g, 2, 6, 1, 12, PEAU_CLAIRE);
    R(g, 20, 6, 2, 12, PEAU_OMBRE);
    R(g, 6, 20, 12, 2, PEAU_OMBRE);
    poly(g, [[4, 8], [9, 6], [12, 6], [12, 8], [9, 8], [4, 10]], m);
    lig(g, 5, 14, 7, 15, k);
    lig(g, 8, 15, 10, 15, k);
    lig(g, 11, 15, 12, 14, k);
    R(g, 6, 16, 1, 1, k);
    R(g, 9, 16, 1, 1, k);
    lig(g, 16, 3, 10, 20, "#c2364a", 2);
    lig(g, 16, 3, 10, 20, "#ff8a9a");
    for (const [x, yy] of [[14, 6], [13, 10], [11, 14], [10, 18]] as const) {
      lig(g, x - 2, yy - 1, x + 3, yy + 1, "#7a1626");
    }
  }),

  // ——— Les rayons de la boutique. ———

  // Dessinée par Claude Fable 5.2 (21 novembre 2026) : un casque de fer à bandeau d'or, sa crête rouge, ses deux joues.
  "rayon-tete": faire((g) => {
    poly(g, [[8, 4], [12, 1], [17, 2], [21, 6], [19, 6], [16, 4], [12, 4], [9, 6]], Rg);
    lig(g, 9, 4, 12, 2, p);
    lig(g, 17, 4, 20, 6, r);
    poly(g, [[3, 14], [3, 10], [6, 6], [10, 4], [14, 4], [18, 6], [21, 10], [21, 14]], S);
    poly(g, [[4, 13], [4, 10], [7, 7], [10, 5], [11, 5], [8, 8], [6, 11], [6, 13]], t);
    poly(g, [[16, 6], [18, 6], [21, 10], [21, 14], [18, 14], [18, 10]], s);
    R(g, 11, 4, 2, 10, t);
    R(g, 13, 5, 1, 9, s);
    R(g, 2, 13, 20, 3, O);
    R(g, 2, 13, 20, 1, y);
    R(g, 2, 15, 20, 1, o);
    for (const x of [4, 8, 15, 19]) R(g, x, 14, 1, 1, Y);
    R(g, 11, 13, 2, 8, O);
    R(g, 11, 13, 1, 8, y);
    poly(g, [[3, 16], [8, 16], [8, 19], [6, 22], [4, 21]], S);
    poly(g, [[16, 16], [21, 16], [20, 21], [18, 22], [16, 19]], s);
    R(g, 4, 16, 1, 4, t);
    R(g, 16, 16, 2, 2, S);
  }),
  // Dessinée par Claude Fable 5.2 (21 novembre 2026) : un gilet vert sans manches, col de fourrure, lacé d'or sur le devant.
  "rayon-haut": faire((g) => {
    poly(g, [[5, 3], [9, 2], [15, 2], [19, 3], [19, 8], [20, 10], [20, 22], [4, 22], [4, 10], [5, 8]], G);
    R(g, 4, 10, 2, 12, h);
    R(g, 17, 9, 3, 13, vf);
    R(g, 5, 3, 1, 6, h);
    poly(g, [[9, 2], [15, 2], [12, 8]], PEAU);
    poly(g, [[7, 2], [9, 2], [12, 8], [12, 10]], w);
    poly(g, [[15, 2], [17, 2], [12, 10], [12, 8]], W);
    R(g, 6, 3, 2, 1, w);
    R(g, 16, 3, 2, 1, W);
    R(g, 11, 10, 2, 12, "#178038");
    for (const yy of [11, 14, 17]) {
      lig(g, 10, yy, 13, yy + 1, y);
      lig(g, 13, yy, 10, yy + 1, Y);
    }
    R(g, 4, 20, 16, 2, w);
    R(g, 4, 21, 16, 1, W);
    for (const x of [6, 9, 13, 16]) R(g, x, 20, 1, 1, W);
  }),
  // Dessinée par Claude Fable 5.2 (21 novembre 2026) : des braies violettes à carreaux, ceinture de cuir à boucle d'or.
  "rayon-bas": faire((g) => {
    const carreau = (x: number, yy: number): string => (x % 4 === 1 || yy % 4 === 1 ? (x % 4 === 1 && yy % 4 === 1 ? l : "#a98bff") : x > 15 ? v : V);
    poly(g, [[5, 5], [19, 5], [20, 20], [13, 20], [12, 10], [11, 20], [4, 20]], carreau);
    g.clearRect(12, 12, 1, 9);
    R(g, 5, 9, 1, 11, l);
    R(g, 4, 2, 16, 3, M);
    R(g, 4, 2, 16, 1, N);
    R(g, 4, 4, 16, 1, m);
    R(g, 10, 1, 4, 5, y);
    R(g, 10, 1, 4, 1, Y);
    R(g, 11, 2, 2, 3, o);
    R(g, 3, 20, 9, 2, N);
    R(g, 13, 20, 8, 2, N);
    R(g, 3, 21, 9, 1, M);
    R(g, 13, 21, 8, 1, M);
  }),
  // Dessinée par Claude Fable 5.2 (21 novembre 2026) : une paire de bottes de cuir, revers de fourrure, lacets d'or.
  "rayon-pieds": faire((g) => {
    const botte = (dx: number, dy: number, cuir: string, clair: string, ombre: string): void => {
      poly(g, [[dx, dy + 2], [dx + 6, dy + 2], [dx + 6, dy + 9], [dx + 10, dy + 10], [dx + 12, dy + 13], [dx + 12, dy + 15], [dx, dy + 15]], cuir);
      R(g, dx, dy + 3, 1, 11, clair);
      lig(g, dx + 6, dy + 10, dx + 10, dy + 11, clair);
      R(g, dx, dy + 14, 12, 1, ombre);
      R(g, dx - 1, dy + 15, 14, 1, "#2b1a0d");
      R(g, dx - 1, dy, 8, 3, w);
      R(g, dx - 1, dy + 2, 8, 1, W);
      R(g, dx + 1, dy, 1, 1, W);
      R(g, dx + 4, dy + 1, 1, 1, W);
      for (const yy of [5, 7, 9]) R(g, dx + 3, dy + yy, 3, 1, y);
    };
    botte(3, 2, m, M, "#4a2a10");
    botte(8, 6, M, N, m);
  }),
  // Dessinée par Claude Fable 5.2 (21 novembre 2026) : une épée en travers, lame d'acier, garde et pommeau d'or.
  "rayon-arme": faire((g) => {
    poly(g, [[8, 13], [19, 2], [22, 1], [21, 4], [10, 15]], t);
    poly(g, [[9, 14], [21, 2], [22, 1], [21, 4], [10, 15]], S);
    lig(g, 9, 12, 18, 3, "#ffffff");
    lig(g, 6, 17, 3, 20, M, 2);
    lig(g, 6, 17, 4, 19, N);
    poly(g, [[5, 9], [7, 9], [15, 17], [15, 19], [13, 19], [5, 11]], y);
    lig(g, 6, 10, 13, 17, Y);
    lig(g, 7, 12, 13, 18, O);
    rr(g, 1, 19, 4, 4, 1, y);
    R(g, 2, 20, 1, 1, Y);
    R(g, 3, 21, 1, 1, O);
    R(g, 20, 8, 1, 3, Y);
    R(g, 19, 9, 3, 1, Y);
    R(g, 4, 4, 1, 1, Y);
  }),
  // Dessinée par Claude Fable 5.2 (21 novembre 2026) : une bannière rouge à deux pointes pendue à sa traverse, un soleil d'or.
  "rayon-banniere": faire((g) => {
    R(g, 11, 1, 2, 2, S);
    R(g, 1, 3, 22, 2, M);
    R(g, 1, 3, 22, 1, N);
    R(g, 1, 2, 2, 4, y);
    R(g, 21, 2, 2, 4, y);
    R(g, 1, 2, 2, 1, Y);
    R(g, 21, 2, 2, 1, Y);
    poly(g, [[4, 5], [20, 5], [20, 22], [16, 18], [12, 22], [8, 18], [4, 22]], Rg);
    R(g, 4, 5, 2, 15, p);
    R(g, 18, 5, 2, 15, r);
    R(g, 4, 6, 16, 2, y);
    R(g, 4, 6, 16, 1, Y);
    R(g, 4, 7, 16, 1, O);
    ell(g, 12, 13, 2.6, 2.6, y);
    for (const [x, yy] of [[12, 9], [12, 17], [8, 13], [16, 13]] as const) R(g, x - 0.5, yy - 0.5, 1, 1, y);
    for (const [x, yy] of [[9, 10], [14, 10], [9, 15], [14, 15]] as const) R(g, x, yy, 1, 1, O);
    R(g, 11, 12, 1, 1, Y);
    R(g, 13, 14, 1, 1, O);
  }),
  // Dessinée par Claude Fable 5.2 (21 novembre 2026) : une tête de bête violette, oreilles dressées, yeux d'or, une étincelle.
  "rayon-uniques": faire((g) => {
    poly(g, [[2, 2], [8, 7], [16, 7], [22, 2], [22, 12], [18, 18], [14, 22], [10, 22], [6, 18], [2, 12]], V);
    poly(g, [[12, 7], [16, 7], [22, 2], [22, 12], [18, 18], [14, 22], [12, 22]], "#7a48ea");
    poly(g, [[4, 5], [7, 8], [4, 10]], p);
    poly(g, [[20, 5], [17, 8], [20, 10]], "#e86a8a");
    lig(g, 3, 4, 3, 11, l);
    lig(g, 9, 8, 11, 8, l);
    poly(g, [[5, 11], [10, 13], [9, 15], [6, 14]], y);
    poly(g, [[19, 11], [14, 13], [15, 15], [18, 14]], y);
    R(g, 8, 13, 1, 2, k);
    R(g, 15, 13, 1, 2, k);
    R(g, 6, 12, 1, 1, Y);
    R(g, 17, 12, 1, 1, Y);
    poly(g, [[9, 16], [15, 16], [14, 21], [10, 21]], l);
    R(g, 13, 17, 2, 4, "#b9a4f5");
    R(g, 11, 16, 2, 2, k);
    R(g, 11, 19, 2, 1, v);
    R(g, 10, 20, 1, 1, w);
    R(g, 13, 20, 1, 1, w);
    R(g, 12, 2, 1, 3, Y);
    R(g, 11, 3, 3, 1, Y);
  }),
  // Dessinée par Claude Fable 5.2 (21 novembre 2026) : une carte penchée dont la face brille en reflets d'arc-en-ciel, un éclat.
  "rayon-cartes": faire((g) => {
    const tour: [number, number][] = [[8, 1], [21, 4], [16, 23], [3, 20]];
    const face: [number, number][] = [[9.4, 3.4], [18.8, 5.6], [14.6, 20.8], [5.2, 18.6]];
    poly(g, tour, (x, yy) => (yy < 4 || x < 6 + (20 - yy) * 0.1 ? "#ffffff" : x > 17 - (yy - 4) * 0.22 ? S : t));
    const reflets = [p, "#ffd9a0", q, h, c, l] as const;
    poly(g, face, (x, yy) => reflets[Math.floor((x + yy * 1.4 + 40) / 3.2) % reflets.length]!);
    lig(g, 9, 9, 15, 5, "#ffffff");
    lig(g, 8, 15, 16, 9, "#ffffff");
    lig(g, 10, 18, 15, 14, "#ffffff");
    R(g, 19, 13, 1, 7, Y);
    R(g, 16, 16, 7, 1, Y);
    R(g, 18, 15, 3, 3, Y);
    R(g, 19, 16, 1, 1, "#ffffff");
    R(g, 3, 4, 1, 3, Y);
    R(g, 2, 5, 3, 1, Y);
  }),
  // Dessinée par Claude Fable 5.2 (21 novembre 2026) : un cadre d'or vide, coins sculptés sertis de rouge, blason bleu en haut.
  "rayon-cadres": faire((g) => {
    rr(g, 2, 3, 20, 19, 1, O);
    R(g, 3, 3, 18, 1, Y);
    R(g, 2, 4, 1, 17, y);
    R(g, 3, 4, 2, 17, y);
    R(g, 5, 4, 14, 2, y);
    R(g, 19, 6, 3, 15, o);
    R(g, 5, 19, 16, 3, o);
    R(g, 6, 7, 12, 1, o);
    R(g, 6, 7, 1, 11, o);
    R(g, 17, 8, 1, 10, Y);
    R(g, 7, 18, 11, 1, Y);
    g.clearRect(7, 8, 10, 10);
    for (const [x, yy] of [[1, 2], [19, 2], [1, 18], [19, 18]] as const) {
      rr(g, x, yy, 4, 5, 1, y);
      R(g, x + 1, yy + 1, 2, 3, Rg);
      R(g, x + 1, yy + 1, 1, 1, p);
      R(g, x + 2, yy + 3, 1, 1, r);
    }
    poly(g, [[9, 1], [15, 1], [15, 4], [12, 7], [9, 4]], B);
    R(g, 9, 1, 6, 1, c);
    R(g, 9, 2, 1, 2, c);
    R(g, 14, 2, 1, 2, b);
    R(g, 11, 3, 2, 2, w);
    R(g, 9, 11, 2, 1, "#ffffff");
    R(g, 8, 12, 1, 1, "#ffffff");
    lig(g, 13, 16, 15, 14, "#ffffff");
  }),
  // Dessinée par Claude Fable 5.2 (21 novembre 2026) : six pavés aux six couleurs des raretés, rangés deux par deux : « Tout ».
  "rayon-tout": faire((g) => {
    const paves = [
      ["#4aa3ff", "#bfe0ff", "#1d6fd0"],
      ["#3a4fe8", "#aab4ff", "#2a37b8"],
      ["#9b4dff", "#dcc6ff", "#6a22cf"],
      ["#ff2e4a", "#ffb0ba", "#b8122a"],
      ["#f2b632", "#fff1a8", "#a8700a"],
      ["#19d3c5", "#b5f5ee", "#0b7f77"],
    ] as const;
    paves.forEach(([corps, clair, ombre], i) => {
      const x = 2 + (i % 2) * 11;
      const yy = 2 + Math.floor(i / 2) * 7;
      rr(g, x, yy, 9, 6, 1, corps);
      R(g, x + 1, yy, 7, 1, clair);
      R(g, x, yy + 1, 1, 3, clair);
      R(g, x + 1, yy + 5, 7, 1, ombre);
      R(g, x + 8, yy + 2, 1, 3, ombre);
      R(g, x + 2, yy + 2, 2, 1, "#ffffff");
    });
  }),

  // ——— Les titres et les actions de la boutique et du marché. ———

  // Dessinée par Claude Fable 5.2 (21 novembre 2026) : une balance d'or, des pièces sur un plateau, un objet bleu sur l'autre.
  "action-marche": faire((g) => {
    R(g, 11, 3, 2, 17, O);
    R(g, 11, 3, 1, 17, y);
    poly(g, [[6, 22], [18, 22], [16, 19], [8, 19]], O);
    R(g, 8, 19, 8, 1, y);
    R(g, 6, 22, 12, 1, o);
    R(g, 2, 4, 20, 2, y);
    R(g, 2, 4, 20, 1, Y);
    R(g, 13, 5, 9, 1, O);
    rr(g, 10, 1, 4, 4, 1, y);
    R(g, 11, 2, 1, 1, Y);
    lig(g, 3, 6, 1, 14, S);
    lig(g, 6, 6, 8, 14, S);
    lig(g, 17, 6, 15, 14, S);
    lig(g, 20, 6, 22, 14, S);
    poly(g, [[1, 14], [9, 14], [7, 17], [3, 17]], O);
    poly(g, [[15, 14], [23, 14], [21, 17], [17, 17]], O);
    R(g, 1, 14, 8, 1, y);
    R(g, 15, 14, 8, 1, y);
    ell(g, 4, 12.5, 1.8, 1.8, y);
    ell(g, 6.5, 12.5, 1.8, 1.8, y);
    R(g, 3, 11, 1, 1, Y);
    R(g, 6, 11, 1, 1, Y);
    R(g, 5, 13, 1, 1, O);
    poly(g, [[16, 14], [19, 9], [22, 14]], B);
    lig(g, 17, 13, 19, 10, c);
    R(g, 20, 12, 1, 2, b);
  }),
  // Dessinée par Claude Fable 5.2 (21 novembre 2026) : un miroir sur pied au cadre de bois, un Gaulois blond s'y regarde.
  "action-essayage": faire((g) => {
    R(g, 5, 19, 3, 4, m);
    R(g, 16, 19, 3, 4, m);
    rr(g, 4, 1, 16, 20, 4, M);
    rr(g, 5, 1, 13, 2, 1, N);
    R(g, 4, 5, 1, 12, N);
    R(g, 18, 5, 2, 12, m);
    rr(g, 6, 19, 12, 2, 1, m);
    rr(g, 6, 3, 12, 16, 3, k);
    rr(g, 7, 4, 10, 14, 2, "#a9c8fb");
    rr(g, 7, 4, 10, 4, 2, "#d6e6ff");
    poly(g, [[7, 18], [7, 15], [10, 13], [14, 13], [17, 15], [17, 18]], Rg);
    R(g, 11, 13, 2, 1, PEAU);
    R(g, 8, 15, 1, 3, p);
    ell(g, 12, 10, 2.6, 2.8, PEAU);
    R(g, 10, 7, 4, 2, y);
    R(g, 9, 8, 1, 4, y);
    R(g, 14, 8, 1, 4, O);
    R(g, 11, 10, 1, 1, k);
    R(g, 13, 10, 1, 1, k);
    lig(g, 14, 5, 16, 7, "#ffffff");
    lig(g, 8, 9, 8, 11, "#ffffff");
    R(g, 21, 2, 1, 3, Y);
    R(g, 20, 3, 3, 1, Y);
  }),
  // Dessinée par Claude Fable 5.2 (21 novembre 2026) : une étiquette de prix rouge au bout de sa ficelle, frappée d'une pièce d'or.
  "action-vendre": faire((g) => {
    lig(g, 6, 12, 2, 6, N);
    lig(g, 2, 6, 5, 2, N);
    lig(g, 5, 2, 9, 1, N);
    poly(g, [[1, 13], [8, 5], [22, 5], [22, 21], [8, 21]], Rg);
    poly(g, [[2, 13], [8, 6], [21, 6], [21, 7], [9, 7], [3, 13]], p);
    poly(g, [[4, 16], [8, 20], [21, 20], [21, 8], [22, 8], [22, 21], [8, 21]], r);
    ell(g, 6.5, 13.5, 2, 2, w);
    R(g, 6, 13, 1, 1, k);
    ell(g, 15, 13, 4.6, 4.6, o);
    ell(g, 15, 13, 3.8, 3.8, y);
    ell(g, 15.6, 13.6, 3, 3, O);
    ell(g, 14.6, 12.6, 2.8, 2.8, y);
    R(g, 13, 10, 2, 1, Y);
    R(g, 12, 11, 1, 2, Y);
    R(g, 15, 11, 1, 5, o);
    R(g, 14, 12, 3, 1, o);
    R(g, 14, 14, 3, 1, o);
  }),
  // Dessinée par Claude Fable 5.2 (21 novembre 2026) : une bulle qui demande, un point d'interrogation bleu, et la pièce offerte.
  "action-demander": faire((g) => {
    rr(g, 1, 1, 20, 16, 3, w);
    poly(g, [[5, 16], [11, 16], [4, 22]], w);
    R(g, 4, 1, 14, 1, "#ffffff");
    R(g, 4, 16, 14, 1, W);
    R(g, 20, 4, 1, 10, W);
    lig(g, 6, 19, 9, 17, W);
    g.drawImage(grille([".BBBBB.", "BBcccBB", "BB...BB", "....BBb", "...BBb.", "..BBb..", "..BB...", ".......", "..BB...", "..Bb..."], PAL), 7, 4);
    ell(g, 18.5, 18, 4.4, 4.4, o);
    ell(g, 18.5, 18, 3.6, 3.6, y);
    ell(g, 19, 18.6, 2.8, 2.8, O);
    ell(g, 18.2, 17.8, 2.6, 2.6, y);
    R(g, 17, 15, 2, 1, Y);
    R(g, 16, 16, 1, 2, Y);
    R(g, 18, 17, 1, 3, o);
  }),
  // Dessinée par Claude Fable 5.2 (21 novembre 2026) : un panier d'osier garni, un casque bleu et une étoile d'or qui dépassent.
  "action-acheter": faire((g) => {
    lig(g, 4, 11, 5, 5, M, 2);
    lig(g, 5, 5, 9, 2, M, 2);
    lig(g, 9, 1, 14, 1, M, 2);
    lig(g, 14, 2, 18, 5, M, 2);
    lig(g, 18, 5, 19, 11, M, 2);
    lig(g, 5, 5, 9, 2, N);
    lig(g, 9, 1, 13, 1, N);
    poly(g, [[6, 12], [6, 8], [8, 6], [11, 6], [13, 8], [13, 12]], B);
    R(g, 7, 8, 1, 4, c);
    R(g, 8, 6, 3, 1, c);
    R(g, 12, 8, 1, 4, b);
    poly(g, etoile5(15.5, 9, 4, 1.8), y);
    R(g, 15, 7, 1, 2, Y);
    poly(g, [[2, 12], [22, 12], [19, 22], [5, 22]], N);
    for (let yy = 14; yy < 22; yy += 2) for (let x = 3 + ((yy / 2) % 2) * 2; x < 21; x += 4) R(g, x, yy, 2, 1, M);
    poly(g, [[17, 14], [21, 14], [19, 22], [16, 22]], M);
    R(g, 5, 21, 14, 1, m);
    R(g, 1, 11, 22, 2, M);
    R(g, 1, 11, 22, 1, "#f2cf9a");
  }),
  // Dessinée par Claude Fable 5.2 (21 novembre 2026) : une pile de pièces d'or sous une flèche verte qui fait demi-tour : rendu au jeu.
  "action-revendre": faire((g) => {
    for (const yy of [20, 17, 14]) {
      ell(g, 10, yy, 8, 2.6, o);
      ell(g, 10, yy - 1, 8, 2.6, y);
      R(g, 5, yy - 2, 5, 1, Y);
      R(g, 13, yy, 3, 1, O);
    }
    R(g, 8, 13, 4, 1, O);
    poly(g, [[5, 5.5], [11, 1], [11, 4], [19, 4], [22, 7], [22, 13], [18, 13], [18, 8], [11, 8], [11, 10]], G);
    lig(g, 6, 5, 10, 2, h);
    R(g, 11, 4, 8, 1, h);
    R(g, 11, 7, 7, 1, vf);
    lig(g, 7, 6, 10, 8, vf);
    R(g, 21, 8, 1, 5, vf);
  }),
  // Dessinée par Claude Fable 5.2 (21 novembre 2026) : un Gaulois en buste dans sa tunique bleue, et la coche verte : c'est porté.
  "action-porter": faire((g) => {
    poly(g, [[1, 22], [1, 17], [5, 13], [15, 13], [19, 17], [19, 22]], B);
    R(g, 1, 17, 2, 5, c);
    lig(g, 2, 16, 5, 13, c);
    R(g, 16, 17, 3, 5, b);
    poly(g, [[7, 13], [13, 13], [10, 17]], PEAU);
    lig(g, 7, 13, 10, 17, y);
    lig(g, 13, 13, 10, 17, O);
    ell(g, 10, 7.5, 4.6, 5, PEAU);
    R(g, 8, 12, 4, 1, PEAU_OMBRE);
    poly(g, [[5, 8], [6, 3], [10, 1], [14, 3], [15, 8], [13, 5], [10, 6], [7, 5]], y);
    R(g, 5, 7, 1, 4, y);
    R(g, 14, 7, 1, 4, O);
    lig(g, 7, 3, 10, 2, Y);
    R(g, 8, 8, 1, 2, k);
    R(g, 12, 8, 1, 2, k);
    R(g, 9, 11, 3, 1, PEAU_OMBRE);
    ell(g, 17.5, 16.5, 5.4, 5.4, vf);
    ell(g, 17.5, 16.5, 4.5, 4.5, G);
    lig(g, 14, 16, 16, 18, w, 2);
    lig(g, 17, 18, 20, 14, w, 2);
  }),
  // Dessinée par Claude Fable 5.2 (21 novembre 2026) : une page d'almanach à bandeau rouge et ses deux anneaux, une étoile d'or
  // dessus : la sélection de la semaine.
  "action-selection": faire((g) => {
    rr(g, 2, 3, 20, 19, 2, w);
    R(g, 3, 20, 18, 2, W);
    R(g, 20, 9, 2, 11, W);
    rr(g, 2, 3, 20, 6, 2, Rg);
    R(g, 2, 6, 20, 3, Rg);
    R(g, 4, 3, 16, 1, p);
    R(g, 2, 8, 20, 1, r);
    for (const x of [6, 16]) {
      R(g, x, 1, 2, 5, t);
      R(g, x, 1, 1, 5, "#ffffff");
      R(g, x, 5, 2, 1, s);
    }
    poly(g, etoile5(12, 15.2, 6.2, 2.7), (x, yy) => (x + yy > 28 ? O : y));
    lig(g, 12, 10, 11, 13, Y);
    R(g, 7, 13, 3, 1, Y);
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

