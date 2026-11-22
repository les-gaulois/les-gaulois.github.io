/**
 * Les dessins des écrans qui entourent le duel « Coup pour coup » dans « Mon Gaulois » : l'icône du menu, celles de
 * l'accueil du duel, et le petit badge qui dit qu'un objet est aussi une carte de duel.
 * Dessins de Claude Fable 5.2 (22 novembre 2026), au style des grandes icônes du kit (`src/lib/jeu/icones.ts`) : 24 cases,
 * les couleurs de la palette, un cerne d'encre, le volume (lumière en haut à gauche). Aucun ne rappelle une œuvre existante.
 *
 * - `iconeDuDuel` : le menu « Le duel ». Une carte bleue et une carte rouge en éventail (toi et l'adversaire), deux épées
 *   croisées devant elles.
 * - `iconeApprenti` : le premier niveau de l'entraînement. Un mannequin de paille sur son piquet, une cible peinte.
 * - `iconeGuerrier` : le deuxième niveau. Un bouclier rond bleu à bosse d'or, une épée derrière lui.
 * - `iconeDruide` : le troisième niveau. Un bâton noueux dont la crosse tient une pierre verte, deux feuilles, des étincelles.
 * - `iconeBoss` : le boss du jour. Un heaume sombre à cornes, bandeau d'or et pierre rouge, deux yeux rouges dans la fente.
 * - `iconeDefi` : les défis d'entraînement. Une cible rouge et blanche, une flèche plantée au centre.
 * - `iconeDefense` : ma main de défense. Un écu bleu au bord d'or, barré de blanc, devant trois cartes claires en éventail,
 *   chacune à la couleur d'une rareté (bleu, or, violet).
 * - `iconeHistorique` : l'historique des défis reçus. Un parchemin déroulé, une ligne par duel : pastille verte (repoussé)
 *   ou rouge (battu).
 * - `iconeCollection` : ma collection. Un recueil ouvert : à gauche une carte que l'on a, dorée ; à droite une carte que
 *   l'on n'a pas, grise ; un signet rouge.
 * - `badgeCarteDeDuel` : 11 cases, cerné d'encre. Une petite carte rouge, une épée blanche à garde d'or en travers : posé
 *   sur un objet qui sort d'un booster, il dit que cet objet est aussi une carte de duel.
 *
 * Chaque dessin est fait une fois, puis gardé en mémoire.
 */
import { PAL } from "../../../lib/jeu/palette";
import { Planche, R, cerne, ell, grille, lig, marge, poly, rr, volume } from "../../../lib/jeu/planche";

const { k, O, y, Y, r, R: Rg, p, b, B, c, w, W, g: vf, G, h, s, S, t, m, M, N } = PAL;

const BLEU_MOYEN = "#2459e6";
const PAILLE = "#e8c468";
const PAILLE_CLAIRE = "#fbe6a0";
const PAILLE_OMBRE = "#b98f35";

const DEJA = new Map<string, Planche>();
/** Garde un dessin en mémoire : il n'est fait qu'une fois. */
const garde =
  (nom: string, fabriquer: () => Planche) =>
  (): Planche => {
    let pl = DEJA.get(nom);
    if (!pl) {
      pl = fabriquer();
      DEJA.set(nom, pl);
    }
    return pl;
  };

/** Un dessin sur 24 cases : la marge d'une case effacée, puis le cerne et le volume. */
const grande = (nom: string, dessin: (g: Planche) => void): (() => Planche) =>
  garde(nom, () => {
    const cv = new Planche(24, 24);
    dessin(cv);
    marge(cv, 24);
    return volume(cerne(cv));
  });

/** Pose `source` sur `g`, retournée de gauche à droite si `miroir`. */
function poser(g: Planche, source: Planche, miroir = false): void {
  for (let yy = 0; yy < source.height; yy++)
    for (let x = 0; x < source.width; x++) {
      const coul = source.couleur(x, yy);
      if (coul) g.poser(miroir ? source.width - 1 - x : x, yy, coul);
    }
}

/** L'encre autour de ce qui est peint sur `source`, posée sur `g` : sépare un dessin de ce qu'il recouvre. */
function ombreDEncre(g: Planche, source: Planche, miroir = false): void {
  const tour = cerne(source.copie());
  for (let yy = 0; yy < tour.height; yy++) for (let x = 0; x < tour.width; x++) if (tour.pleine(x, yy)) R(g, miroir ? tour.width - 1 - x : x, yy, 1, 1, k);
}

/** Une épée en travers, la pointe en haut à droite : lame d'acier, garde et pommeau d'or, poignée de cuir. */
function epee(): Planche {
  const e = new Planche(24, 24);
  lig(e, 9, 16, 17, 8, t, 2);
  lig(e, 9, 16, 17, 8, "#ffffff");
  lig(e, 11, 16, 18, 9, S);
  R(e, 18, 7, 2, 2, t);
  R(e, 19, 7, 1, 1, "#ffffff");
  lig(e, 6, 14, 11, 19, y, 2);
  lig(e, 6, 14, 10, 18, Y);
  lig(e, 8, 17, 6, 19, M, 2);
  lig(e, 8, 17, 6, 19, N);
  R(e, 4, 20, 2, 2, y);
  R(e, 4, 20, 1, 1, Y);
  return e;
}

/** Le menu « Le duel » : deux cartes en éventail, bleue et rouge, et deux épées croisées devant. */
export const iconeDuDuel = grande("duel", (g) => {
  // la carte bleue, penchée à gauche
  poly(g, [[2, 3], [10, 1], [13, 15], [5, 17]], w);
  poly(g, [[3.6, 4.2], [8.8, 2.8], [11.2, 13.8], [6, 15.2]], (x, yy) => (x + yy > 17 ? b : B));
  lig(g, 4, 4, 8, 3, c);
  R(g, 2, 3, 1, 1, "#ffffff");
  // la carte rouge, penchée à droite
  poly(g, [[14, 1], [22, 3], [19, 17], [11, 15]], W);
  poly(g, [[14, 1], [21, 3], [18, 16], [11, 14]], w);
  poly(g, [[15.2, 2.8], [20.4, 4.2], [18, 15.2], [12.8, 13.8]], (x, yy) => (x + yy > 25 ? r : Rg));
  lig(g, 16, 3, 20, 4, p);
  R(g, 11, 2, 2, 13, k);
  // les deux épées
  const e = epee();
  ombreDEncre(g, e, true);
  ombreDEncre(g, e);
  poser(g, e, true);
  poser(g, e);
});

/** Apprenti : un mannequin de paille. */
export const iconeApprenti = grande("apprenti", (g) => {
  R(g, 11, 17, 2, 5, M);
  R(g, 11, 17, 1, 5, N);
  R(g, 7, 21, 10, 2, M);
  R(g, 7, 21, 10, 1, N);
  // les bras : une traverse, de la paille aux bouts
  R(g, 2, 9, 20, 2, M);
  R(g, 2, 9, 20, 1, N);
  R(g, 1, 8, 2, 4, PAILLE);
  R(g, 21, 8, 2, 4, PAILLE);
  R(g, 1, 8, 1, 1, PAILLE_CLAIRE);
  R(g, 22, 11, 1, 1, PAILLE_OMBRE);
  // le corps : un sac de paille
  rr(g, 6, 7, 12, 11, 2, PAILLE);
  R(g, 7, 7, 9, 1, PAILLE_CLAIRE);
  R(g, 6, 9, 1, 7, PAILLE_CLAIRE);
  R(g, 16, 9, 2, 8, PAILLE_OMBRE);
  R(g, 8, 17, 9, 1, PAILLE_OMBRE);
  // la cible peinte
  ell(g, 12, 13, 3.6, 3.6, w);
  ell(g, 12, 13, 2.6, 2.6, Rg);
  R(g, 11, 12, 2, 2, w);
  // la tête et sa corde
  ell(g, 12, 4, 3.6, 3.2, PAILLE);
  R(g, 10, 1, 3, 1, PAILLE_CLAIRE);
  R(g, 9, 2, 1, 2, PAILLE_CLAIRE);
  R(g, 14, 4, 1, 2, PAILLE_OMBRE);
  R(g, 10, 3, 1, 2, k);
  R(g, 13, 3, 1, 2, k);
  R(g, 9, 7, 6, 1, m);
});

/** Guerrier : un bouclier rond et une épée. */
export const iconeGuerrier = grande("guerrier", (g) => {
  // l'épée, derrière : la pointe en haut à droite, la poignée en bas à gauche
  poly(g, [[14, 8], [20, 2], [23, 1], [22, 4], [16, 10]], t);
  lig(g, 15, 8, 21, 2, "#ffffff");
  lig(g, 17, 9, 22, 4, S);
  lig(g, 4, 19, 2, 21, M, 2);
  R(g, 1, 21, 2, 2, y);
  R(g, 1, 21, 1, 1, Y);
  // le bouclier
  ell(g, 11.5, 12.5, 9.4, 9.4, k);
  ell(g, 11.5, 12.5, 8.6, 8.6, O);
  ell(g, 11, 12, 8, 8, y);
  ell(g, 11.5, 12.5, 7.6, 7.6, O);
  ell(g, 11.5, 12.5, 6.4, 6.4, k);
  for (let yy = 6; yy < 20; yy++)
    for (let x = 5; x < 19; x++) {
      if (((x + 0.5 - 11.5) / 5.6) ** 2 + ((yy + 0.5 - 12.5) / 5.6) ** 2 > 1) continue;
      const haut = yy < 12.5;
      const gauche = x < 11.5;
      R(g, x, yy, 1, 1, haut === gauche ? (haut ? B : b) : haut ? w : W);
    }
  lig(g, 7, 9, 9, 7, c);
  ell(g, 11.5, 12.5, 2.6, 2.6, k);
  ell(g, 11.5, 12.5, 1.8, 1.8, y);
  R(g, 10, 11, 1, 1, Y);
  R(g, 12, 13, 1, 1, O);
  for (const [x, yy] of [[11, 4], [11, 20], [3, 12], [19, 12]] as const) R(g, x, yy, 1, 1, Y);
});

/** Druide : un bâton noueux, sa crosse enroulée autour d'une pierre verte. */
export const iconeDruide = grande("druide", (g) => {
  // le manche
  R(g, 7, 9, 3, 14, M);
  R(g, 7, 9, 1, 14, N);
  R(g, 9, 11, 1, 12, m);
  R(g, 8, 15, 1, 1, m);
  R(g, 8, 19, 1, 1, m);
  // la crosse : elle monte, tourne, et s'arrête avant de se refermer
  for (let yy = 1; yy < 14; yy++)
    for (let x = 6; x < 21; x++) {
      const dx = x + 0.5 - 13.5;
      const dy = yy + 0.5 - 7;
      const d = Math.hypot(dx, dy);
      const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
      if (d <= 6.2 && d > 4.3 && !(angle > 15 && angle < 100)) R(g, x, yy, 1, 1, x + yy < 17 ? N : x + yy > 22 ? m : M);
    }
  R(g, 18, 8, 2, 2, N);
  // la pierre, tenue au creux
  ell(g, 13.5, 7, 3.2, 3.2, k);
  ell(g, 13.5, 7, 2.4, 2.4, G);
  R(g, 12, 5, 2, 1, h);
  R(g, 12, 6, 1, 1, "#ffffff");
  R(g, 14, 8, 1, 1, vf);
  R(g, 13, 8, 2, 1, vf);
  // deux feuilles
  poly(g, [[7, 15], [2, 13], [1, 16], [4, 18]], G);
  lig(g, 2, 15, 6, 16, vf);
  R(g, 2, 14, 2, 1, h);
  poly(g, [[10, 17], [15, 15], [17, 18], [13, 20]], vf);
  lig(g, 11, 18, 16, 17, G);
  // les étincelles
  R(g, 20, 12, 1, 3, Y);
  R(g, 19, 13, 3, 1, Y);
  R(g, 3, 3, 1, 3, Y);
  R(g, 2, 4, 3, 1, Y);
  R(g, 22, 3, 1, 1, h);
  R(g, 19, 20, 1, 1, h);
});

/** Le boss du jour : un heaume sombre à cornes, deux yeux rouges. */
export const iconeBoss = grande("boss", (g) => {
  // les cornes
  const corne: [number, number][] = [[7, 10], [3, 9], [1, 5], [1, 1], [3, 4], [5, 6], [8, 7]];
  poly(g, corne, w);
  poly(g, corne.map(([x, yy]) => [23 - x, yy] as [number, number]), W);
  lig(g, 2, 3, 4, 6, "#ffffff");
  lig(g, 21, 4, 19, 7, w);
  R(g, 4, 8, 3, 1, W);
  // le heaume
  ell(g, 12, 11, 7.4, 6.6, k);
  ell(g, 12, 11, 6.6, 5.8, S);
  R(g, 5, 10, 14, 11, k);
  R(g, 6, 10, 12, 10, S);
  R(g, 6, 20, 1, 1, k);
  R(g, 17, 20, 1, 1, k);
  R(g, 15, 7, 3, 13, s);
  R(g, 13, 6, 3, 1, s);
  R(g, 7, 7, 3, 1, t);
  R(g, 6, 9, 1, 3, t);
  // le bandeau d'or et sa pierre
  R(g, 5, 9, 14, 2, y);
  R(g, 5, 9, 14, 1, Y);
  R(g, 16, 10, 3, 1, O);
  R(g, 11, 8, 2, 4, k);
  R(g, 11, 9, 2, 2, Rg);
  R(g, 11, 9, 1, 1, p);
  // la fente et les yeux
  R(g, 7, 12, 10, 3, k);
  R(g, 8, 13, 3, 1, Rg);
  R(g, 13, 13, 3, 1, Rg);
  R(g, 8, 13, 1, 1, p);
  R(g, 13, 13, 1, 1, p);
  // le nasal et la grille
  R(g, 11, 12, 2, 5, t);
  R(g, 12, 12, 1, 5, S);
  for (const x of [8, 10, 13, 15]) R(g, x, 17, 1, 3, k);
});

/** Les défis : une cible, une flèche au centre. */
export const iconeDefi = grande("defi", (g) => {
  ell(g, 10.5, 13.5, 9.4, 9.4, Rg);
  ell(g, 10, 13, 8.6, 8.6, p);
  ell(g, 10.5, 13.5, 8.8, 8.8, Rg);
  ell(g, 11.5, 14.5, 8, 8, r);
  ell(g, 10.5, 13.5, 8, 8, Rg);
  ell(g, 10.5, 13.5, 6.6, 6.6, w);
  ell(g, 11.2, 14.2, 5.8, 5.8, W);
  ell(g, 10.5, 13.5, 5.8, 5.8, w);
  ell(g, 10.5, 13.5, 4.2, 4.2, Rg);
  ell(g, 10.5, 13.5, 2.4, 2.4, w);
  ell(g, 10.5, 13.5, 1.2, 1.2, y);
  // la flèche : le fût, puis l'empenne verte
  const fleche = new Planche(24, 24);
  lig(fleche, 11, 13, 19, 5, M);
  lig(fleche, 11, 12, 18, 5, N);
  poly(fleche, [[18, 3], [21, 1], [23, 1], [23, 3], [21, 6], [19, 6]], G);
  lig(fleche, 19, 4, 22, 1, h);
  lig(fleche, 20, 5, 22, 3, vf);
  ombreDEncre(g, fleche);
  poser(g, fleche);
  R(g, 2, 3, 1, 3, Y);
  R(g, 1, 4, 3, 1, Y);
});

/** Ma main de défense : un écu devant trois cartes claires en éventail, chacune à la couleur d'une rareté. */
export const iconeDefense = grande("defense", (g) => {
  // la carte de gauche, bleue
  poly(g, [[1, 6], [8, 2], [13, 13], [6, 17]], "#4aa3ff");
  poly(g, [[2.4, 6.6], [7.4, 3.6], [11, 12], [6, 15]], "#eef6ff");
  R(g, 4, 6, 2, 2, "#4aa3ff");
  // la carte de droite, violette
  poly(g, [[23, 6], [16, 2], [11, 13], [18, 17]], "#9b4dff");
  poly(g, [[21.6, 6.6], [16.6, 3.6], [13, 12], [18, 15]], "#f4eaff");
  R(g, 18, 6, 2, 2, "#9b4dff");
  // la carte du milieu, dorée
  R(g, 6, 0, 12, 14, k);
  rr(g, 7, 1, 10, 13, 1, "#f2b632");
  R(g, 8, 2, 8, 11, "#fff8dc");
  R(g, 8, 2, 8, 1, "#ffffff");
  R(g, 9, 3, 3, 3, Rg);
  R(g, 9, 3, 1, 1, p);
  R(g, 13, 4, 2, 1, "#f2b632");
  R(g, 9, 7, 6, 1, "#ffe59a");
  // l'écu
  poly(g, [[4, 9], [20, 9], [20, 16.6], [12, 24.4], [4, 16.6]], k);
  poly(g, [[5, 10], [19, 10], [19, 16], [12, 23], [5, 16]], (x, yy) => (yy < 11 || x < 6 + Math.max(0, yy - 16) ? y : O));
  poly(g, [[7, 12], [17, 12], [17, 15.4], [12, 20.4], [7, 15.4]], (x) => (x < 12 ? B : BLEU_MOYEN));
  R(g, 7, 12, 5, 1, c);
  R(g, 7, 13, 1, 2, c);
  R(g, 16, 13, 1, 3, b);
  R(g, 7, 15, 10, 2, w);
  R(g, 12, 15, 5, 2, W);
  R(g, 7, 15, 1, 1, "#ffffff");
});

/** L'historique : un parchemin déroulé, une ligne par duel. */
export const iconeHistorique = grande("historique", (g) => {
  R(g, 5, 4, 14, 16, w);
  R(g, 5, 4, 1, 16, "#ffffff");
  R(g, 17, 5, 2, 15, W);
  // les deux rouleaux
  for (const yy of [1, 19]) {
    rr(g, 2, yy, 20, 4, 1, N);
    R(g, 3, yy, 18, 1, "#f2cf9a");
    R(g, 3, yy + 3, 18, 1, M);
    R(g, 2, yy + 1, 1, 2, M);
    R(g, 21, yy + 1, 1, 2, m);
  }
  R(g, 5, 5, 14, 1, W);
  // trois duels : repoussé, battu, repoussé
  const lignes = [[7, G, vf], [11, Rg, r], [15, G, vf]] as const;
  for (const [yy, clair, fonce] of lignes) {
    R(g, 7, yy, 2, 2, clair);
    R(g, 8, yy + 1, 1, 1, fonce);
    R(g, 10, yy, 6, 1, s);
    R(g, 10, yy + 1, 4, 1, S);
  }
});

/** Ma collection : un recueil ouvert, une carte que l'on a, une que l'on n'a pas. */
export const iconeCollection = grande("collection", (g) => {
  // la couverture
  rr(g, 1, 5, 22, 17, 1, M);
  R(g, 2, 5, 20, 1, N);
  R(g, 1, 20, 22, 2, m);
  // les pages
  poly(g, [[3, 4], [11, 5], [11, 20], [3, 19]], w);
  poly(g, [[21, 4], [13, 5], [13, 20], [21, 19]], w);
  R(g, 11, 5, 2, 15, W);
  R(g, 12, 5, 1, 15, S);
  R(g, 3, 4, 8, 1, "#ffffff");
  R(g, 20, 5, 1, 14, W);
  R(g, 3, 19, 8, 1, W);
  R(g, 13, 19, 8, 1, W);
  // la carte que l'on a
  rr(g, 4, 7, 6, 9, 1, O);
  R(g, 5, 8, 4, 7, y);
  R(g, 5, 8, 4, 1, Y);
  R(g, 6, 10, 2, 3, Rg);
  R(g, 6, 10, 1, 1, p);
  // la carte que l'on n'a pas
  rr(g, 14, 7, 6, 9, 1, S);
  R(g, 15, 8, 4, 7, t);
  R(g, 16, 10, 2, 3, S);
  // le signet
  R(g, 16, 20, 2, 3, Rg);
  R(g, 16, 20, 1, 3, p);
  R(g, 2, 2, 1, 3, Y);
  R(g, 1, 3, 3, 1, Y);
});

/** Le badge « carte de duel », 11 cases : une petite carte rouge, une épée blanche en travers. */
export const badgeCarteDeDuel = garde("badge", () => {
  const dessin = grille(
    [
      "...........",
      "..ppppppp..",
      ".RRRRRRRwR.",
      ".RRRRRRwwR.",
      ".RyRRRwwRR.",
      ".RRyRwwRRR.",
      ".RRRywRRRR.",
      ".RRwRyRRRR.",
      ".RwwRRyRRR.",
      "..rrrrrrr..",
      "...........",
    ],
    PAL,
  );
  return cerne(dessin);
});
