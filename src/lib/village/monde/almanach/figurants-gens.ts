/**
 * Les gens de passage : ils ne sont pas des membres du clan et ne doivent jamais être pris pour eux. Les Gaulois des
 * membres sont de face, tête nue, en braies ; ceux-ci sont de profil, sous une capuche, un chapeau ou un fichu, dans une
 * longue cape, avec leur fardeau ou leurs bêtes. Dessins originaux, case par case, tournés vers la droite.
 * Design : Claude Fable 5.2.
 */
import { type Decor, Planche } from "../../decor";
import { melanger } from "../../lumiere";
import { type Teintes, type Tons, boule, cerner, chemin, figurant, ligne, ovale, patte, poly, tampon } from "./figurants-outils";
import type { Figurant } from "./type";

const PEAU = "#e8b890";
const PEAU_OMBRE = "#cf9a72";

/** Un petit dessin à part, cerné, à poser ensuite sur la planche (pour que chaque bête d'un troupeau garde son trait). */
function vignette(largeur: number, hauteur: number, t: Teintes, peindre: (pl: Planche) => void): Decor {
  const pl = new Planche(largeur, hauteur);
  peindre(pl);
  cerner(pl, t.trait);
  return pl.decor();
}

/**
 * Une longue cape de profil, des épaules (rangée `haut`) à l'ourlet, au-dessus de deux souliers qui marchent.
 * `x` : le milieu des pieds ; `penche` : de combien les épaules avancent ; `large` : la demi-largeur de l'ourlet.
 */
function cape(pl: Planche, t: Teintes, x: number, pied: number, haut: number, large: number, penche: number, tons: Tons, image: number): void {
  const soulier = t.c("#4a3222");
  pl.rect(x - 6 + 3 * image, pied - 2, 6, 2, soulier);
  pl.rect(x + 2 - 3 * image, pied - 2, 6, 2, soulier);
  const bas = pied - 3;
  poly(pl, [[x - large, bas], [x - 5 + penche, haut], [x + 5 + penche, haut], [x + large, bas]], (i, j) => {
    const part = (j - haut) / (bas - haut);
    const gauche = x - 5 + penche + (5 - penche - large) * part;
    const droite = x + 5 + penche + (large - 5 - penche) * part;
    const u = (i - gauche) / Math.max(1, droite - gauche);
    if (j >= bas - 1) return tons[2];
    if (u < 0.26) return tons[0];
    if (u > 0.74) return tons[2];
    return part > 0.3 && (i + Math.floor(j / 6)) % 6 === 0 ? tons[2] : tons[1];
  });
}

/** Une tête de profil sous une capuche ronde : on ne voit que le visage, à droite. `barbe` : sa couleur, ou rien. */
function capuche(pl: Planche, t: Teintes, cx: number, cy: number, tons: Tons, barbe: string | null = null, pointe = true): void {
  boule(pl, cx, cy, 8, 7.4, tons);
  if (pointe) poly(pl, [[cx - 6, cy - 4], [cx - 11, cy - 9], [cx - 2, cy - 7]], tons[1]);
  ovale(pl, cx + 4.6, cy + 1, 3.6, 4.6, t.c(PEAU));
  pl.rect(cx + 8, cy + 1, 2, 2, t.c(PEAU_OMBRE));
  pl.rect(cx + 6, cy - 1, 1, 2, t.trait);
  if (barbe) ovale(pl, cx + 5, cy + 5.4, 3.4, 2.6, barbe);
  // Le bord de la capuche, qui ombre le front.
  chemin(pl, [[cx + 2, cy - 5], [cx + 1, cy], [cx + 2, cy + 6]], tons[2]);
}

/** Un bras dans sa manche, de l'épaule à la main. */
function bras(pl: Planche, t: Teintes, x0: number, y0: number, x1: number, y1: number, ton: string): void {
  ligne(pl, x0, y0, x1, y1, ton, 4);
  pl.rect(x1 + 1, y1 + 1, 3, 3, t.c(PEAU));
}

/** Un mouton de 28 × 21 cases : la laine en bosses, la tête et les pattes sombres. */
function mouton(t: Teintes, image: number, k: number, laine: Tons): Decor {
  return vignette(28, 21, t, (pl) => {
    const noir = t.c("#4a4038");
    [5, 9, 16, 20].forEach((x, n) => patte(pl, x, 13, 19, 2, (n + k + image) % 2 === 0, noir, t.c("#2c2620")));
    boule(pl, 12, 9.5, 10, 5.6, laine);
    ovale(pl, 5, 7, 4, 4, laine[1]);
    ovale(pl, 11, 4.5, 5, 3.6, laine[0]);
    ovale(pl, 18, 5.5, 4.4, 3.8, laine[0]);
    ovale(pl, 3.6, 11, 3, 3.4, laine[2]);
    for (const [x, y] of [[8, 9], [13, 8], [17, 10], [10, 12], [15, 13], [6, 12]] as const) pl.rect(x, y, 2, 1, laine[2]);
    ovale(pl, 21.5, 4, 2.6, 2, laine[0]);
    ovale(pl, 23.4, 8, 3, 3.6, noir);
    pl.rect(19, 7, 3, 2, noir);
    pl.poser(24, 7, t.c("#d8cdb4"));
  });
}

/** Une oie blanche qui marche, de 24 × 27 cases ; `basse` : le cou tendu en avant. */
function oieAuSol(t: Teintes, image: number, k: number, basse: boolean): Decor {
  return vignette(24, 27, t, (pl) => {
    const blanc = t.tons("#fbf8f0", "#ece7da", "#cbc5b6");
    const orange = t.c("#e8913a");
    const leve = (k + image) % 2;
    ligne(pl, 8, 20, 8 - leve, 24, orange);
    ligne(pl, 11, 20, 11 + leve, 24, orange);
    pl.rect(7 - leve, 25, 3, 1, orange);
    pl.rect(11 + leve, 25, 3, 1, orange);
    poly(pl, [[3, 16], [1, 11], [3, 11], [6, 14]], blanc[1]);
    boule(pl, 9, 16.5, 7.4, 4.6, blanc);
    chemin(pl, [[4, 16], [9, 18], [13, 17]], blanc[2]);
    if (basse) {
      chemin(pl, [[14, 14], [17, 10], [19, 9]], blanc[1], 2);
      ovale(pl, 20, 9, 2.3, 2, blanc[0]);
      pl.rect(22, 9, 2, 2, orange);
      pl.poser(20, 8, t.trait);
    } else {
      chemin(pl, [[13, 14], [15, 8], [15, 4]], blanc[1], 2);
      ovale(pl, 16.4, 3, 2.4, 2, blanc[0]);
      pl.rect(19, 3, 3, 1, orange);
      pl.rect(19, 4, 2, 1, orange);
      pl.poser(17, 2, t.trait);
    }
  });
}

export const FIGURANTS_GENS: readonly Figurant[] = [
  figurant(
    {
      id: "colporteur",
      nom: "un colporteur et sa hotte",
      description: "Un marchand ambulant de profil, barbe grise, chapeau de feutre, longue cape rousse, qui porte sur le dos une haute hotte d'osier pleine d'étoffes et de casseroles, un bâton à la main. Arrive par la grand-rue, traverse le village et repart ; de jour. Ce n'est pas un membre du clan.",
      milieu: "sol",
      allure: "pas",
      quand: ["aube", "jour", "crepuscule"],
      largeur: 50,
      hauteur: 76,
      images: 2,
    },
    (pl, t, image) => {
      const pied = 75;
      const roux = t.tons("#cf9264", "#ad6c40", "#834c2a");
      const osier = [t.c("#d9b878"), t.c("#b08c4c"), t.c("#86682f")] as const;
      // La hotte, sur le dos : plus haute que sa tête, tressée, avec ses rouleaux d'étoffe, une casserole et une louche.
      pl.rect(9, 5, 4, 12, t.c("#b8483a"));
      pl.rect(13, 3, 4, 14, t.c("#4f7fb0"));
      pl.rect(17, 7, 3, 10, t.c("#e0c060"));
      poly(pl, [[5, 16], [22, 16], [20, 50], [8, 50]], (i, j) => (j < 18 || j > 48 ? osier[2] : (Math.floor(i / 2) + Math.floor(j / 2)) % 2 === 0 ? osier[0] : osier[1]));
      pl.rect(5, 16, 18, 2, osier[2]);
      ovale(pl, 4, 30, 3.4, 3.4, t.c("#a8a8a0"));
      pl.rect(3, 24, 1, 4, t.c("#6a6a66"));
      ligne(pl, 3, 38, 3, 46, t.c("#8a5a30"));
      ovale(pl, 3, 47.5, 2, 1.6, t.c("#a8a8a0"));
      cape(pl, t, 30, pied, 28, 11, 2, roux, image);
      // La bretelle de la hotte, puis la tête : chapeau de feutre à bord large, barbe grise.
      ligne(pl, 22, 20, 30, 34, t.c("#5a3a22"), 2);
      capuche(pl, t, 31, 19, roux, t.c("#d6d2c8"), false);
      pl.rect(20, 12, 24, 2, t.c("#44553a"));
      ovale(pl, 31, 9.5, 7, 4.5, (_i, j) => (j > 12 ? null : j < 8 ? t.c("#6a8058") : t.c("#566a48")));
      pl.rect(25, 11, 13, 1, t.c("#b8483a"));
      // Le bras et le bâton, qui avance d'un pas.
      ligne(pl, 44 + image, 22, 45 - image, pied - 1, t.c("#6a4424"), 2);
      bras(pl, t, 33, 33, 40, 38, roux[0]);
      cerner(pl, t.trait);
    },
  ),
  figurant(
    {
      id: "berger-et-moutons",
      nom: "un berger et ses moutons",
      description: "Un berger de profil, sous une cape de laine claire à capuche pointue, sa houlette à la main, qui pousse devant lui cinq moutons dont un brun. Traverse le pré ou longe la grand-rue vers les pâtures, à l'aube, de jour ou au crépuscule. Ce n'est pas un membre du clan.",
      milieu: "sol",
      allure: "pas",
      quand: ["aube", "jour", "crepuscule"],
      largeur: 156,
      hauteur: 70,
      images: 2,
    },
    (pl, t, image) => {
      const pied = 69;
      const laine = t.tons("#f6f0e0", "#e0d8c2", "#bdb49c");
      const brune = t.tons("#a08a70", "#7c6852", "#5a4a3a");
      const bure = t.tons("#d6ccb2", "#b3a88c", "#877d66");
      // Les moutons du fond d'abord, puis ceux de devant.
      tampon(pl, mouton(t, image, 0, laine), 62, 40);
      tampon(pl, mouton(t, image, 1, brune), 100, 42);
      tampon(pl, mouton(t, image, 1, laine), 44, 47);
      tampon(pl, mouton(t, image, 0, laine), 82, 49);
      tampon(pl, mouton(t, image, 1, laine), 126, 48);
      // Le berger, derrière le troupeau : la houlette plus haute que lui, la gourde à la ceinture.
      const berger = new Planche(40, 70);
      chemin(berger, [[33 + image, pied - 1], [32, 12], [32, 5], [35, 2], [38, 5], [37, 9]], t.c("#6a4424"), 2);
      cape(berger, t, 18, pied, 24, 12, 2, bure, image);
      capuche(berger, t, 19, 16, bure, null);
      bras(berger, t, 20, 30, 28, 34, bure[0]);
      ovale(berger, 14, 44, 3, 3.6, t.c("#8a5a30"));
      cerner(berger, t.trait);
      tampon(pl, berger.decor(), 0, 0);
    },
  ),
  figurant(
    {
      id: "porteur-de-lanterne",
      nom: "un veilleur et sa lanterne",
      description: "Un petit veilleur de profil, tout enveloppé dans une cape bleu nuit à capuche, qui porte au bout d'une perche une lanterne allumée. Fait lentement le tour du village, le long de la palissade ou de la grand-rue, au crépuscule et la nuit. Ce n'est pas un membre du clan.",
      milieu: "sol",
      allure: "lente",
      quand: ["crepuscule", "nuit"],
      largeur: 44,
      hauteur: 66,
      images: 2,
    },
    (pl, t, image) => {
      const pied = 65;
      const bleu = t.tons("#6f80b4", "#4c5a8c", "#343f68");
      // La perche et la lanterne : sa flamme garde sa couleur et ne s'allume que quand le jour baisse.
      ligne(pl, 27, 40, 35, 6, t.c("#6a4424"), 2);
      ligne(pl, 36, 6, 37, 10, t.c("#3a3a40"));
      const verre = melanger(t.c("#8a8a78"), "#f6d070", t.veille);
      const coeur = melanger(t.c("#9a9a84"), "#fbe6a0", t.veille);
      pl.rect(34, 11, 7, 9, (i, j) => (i === 34 || i === 40 || j === 11 || j === 19 ? t.c("#3a3a40") : i === 37 && j > 13 && j < 18 ? coeur : verre));
      pl.rect(35, 9, 5, 2, t.c("#3a3a40"));
      pl.rect(35, 20, 5, 1, t.c("#3a3a40"));
      cape(pl, t, 17, pied, 27, 12, 3, bleu, image);
      capuche(pl, t, 19, 20, bleu, null);
      bras(pl, t, 20, 34, 26, 38, bleu[0]);
      cerner(pl, t.trait);
      // La lueur autour de la lanterne, la nuit : quelques cases chaudes, immobiles.
      if (t.veille > 0.5) {
        for (const [x, y] of [[32, 13], [32, 17], [42, 13], [42, 17], [37, 7], [35, 22], [39, 22], [31, 15], [43, 15]] as const) if (pl.lire(x, y) === null) pl.poser(x, y, "#c89648");
      }
    },
  ),
  figurant(
    {
      id: "pecheur-sur-la-rive",
      nom: "un pêcheur assis sur la rive",
      description: "Un pêcheur de profil, grand chapeau de paille rond, tunique brique, assis sur une souche, la canne tendue au-dessus de l'eau, un panier à côté de lui. Immobile au bord du ruisseau, du lavoir ou du quai, la canne vers l'eau ; de jour. Ce n'est pas un membre du clan.",
      milieu: "sol",
      allure: "posee",
      quand: ["aube", "jour", "crepuscule"],
      largeur: 72,
      hauteur: 52,
      images: 2,
    },
    (pl, t, image) => {
      const pied = 51;
      const brique = t.tons("#d08468", "#b0624a", "#864634");
      const paille = [t.c("#f0cc68"), t.c("#d9b04e"), t.c("#a8823a")] as const;
      // La canne et son fil, jusqu'à l'eau.
      ligne(pl, 36, 30, 68, 6 + image, t.c("#c9a35c"));
      ligne(pl, 68, 6 + image, 68, pied - 2, t.c("#d8d0b8"));
      pl.rect(67, pied - 3 + image, 3, 2, t.c("#c8483a"));
      // Le panier d'osier, derrière lui, et la souche.
      ovale(pl, 7, 44, 6, 5, (i, j) => (j < 41 ? t.c("#86682f") : (i + j) % 2 === 0 ? t.c("#d9b878") : t.c("#b08c4c")));
      pl.rect(13, 40, 16, 10, (i, j) => (j === 40 ? t.c("#d9bb86") : i % 4 === 0 ? t.c("#4c3420") : t.c("#6a4c30")));
      // Les jambes repliées, les braies grises, les souliers.
      poly(pl, [[22, 36], [36, 36], [38, 41], [38, 48], [33, 48], [32, 42], [22, 42]], (i, j) => (j < 38 ? t.c("#9a9a94") : i > 35 ? t.c("#6e6e6a") : t.c("#84847e")));
      pl.rect(32, 48, 9, 2, t.c("#4a3222"));
      // Le buste penché, le bras tendu, la tête sous le chapeau.
      poly(pl, [[15, 40], [17, 22], [29, 20], [31, 40]], (i, j) => (i < 19 + (j - 20) * 0.05 ? brique[0] : i > 27 ? brique[2] : (i + Math.floor(j / 5)) % 6 === 0 ? brique[2] : brique[1]));
      ovale(pl, 26, 15, 5.4, 5.6, t.c(PEAU));
      pl.rect(31, 15, 2, 2, t.c(PEAU_OMBRE));
      pl.rect(28, 13, 1, 2, t.trait);
      ovale(pl, 27, 19.6, 3.4, 2, t.c("#8a6a4a"));
      ovale(pl, 25, 10, 7, 5.4, (i, j) => (j > 10 ? null : (i + j * 2) % 5 === 0 ? paille[2] : i < 23 ? paille[0] : paille[1]));
      pl.rect(12, 10, 27, 2, (i, j) => (j === 11 || i % 4 === 0 ? paille[2] : i < 22 ? paille[0] : paille[1]));
      pl.rect(19, 9, 13, 1, t.c("#8a5a30"));
      bras(pl, t, 25, 26, 33, 30, brique[0]);
      cerner(pl, t.trait, [t.c("#d8d0b8")]);
    },
  ),
  figurant(
    {
      id: "gardeuse-d-oies",
      nom: "une gardeuse d'oies",
      description: "Une jeune femme de profil, coiffe de lin clair nouée sur la tête, longue robe bleu-gris et tablier clair, une baguette à la main, qui mène cinq oies blanches devant elle. Va de la ferme au ruisseau ou traverse la place, de jour. Ce n'est pas un membre du clan.",
      milieu: "sol",
      allure: "pas",
      quand: ["aube", "jour", "crepuscule"],
      largeur: 132,
      hauteur: 64,
      images: 2,
    },
    (pl, t, image) => {
      const pied = 63;
      const robe = t.tons("#8faac6", "#6f8cab", "#526c88");
      const fichu = t.tons("#f8f2e2", "#e2dac4", "#b9b09a");
      tampon(pl, oieAuSol(t, image, 0, false), 62, 29);
      tampon(pl, oieAuSol(t, image, 1, true), 92, 32);
      tampon(pl, oieAuSol(t, image, 1, false), 46, 37);
      tampon(pl, oieAuSol(t, image, 0, true), 76, 37);
      tampon(pl, oieAuSol(t, image, 0, false), 108, 36);
      const elle = new Planche(46, 64);
      // La baguette, la robe, le tablier clair sur le devant, la coiffe nouée derrière la tête, une mèche brune.
      ligne(elle, 30, 34, 44, 26 + image, t.c("#8a6a34"));
      cape(elle, t, 17, pied, 23, 12, 1, robe, image);
      poly(elle, [[19, 30], [23, 30], [26, pied - 5], [20, pied - 5]], (_i, j) => (j % 7 === 0 ? t.c("#cfc5aa") : t.c("#efe6d0")));
      boule(elle, 18, 15, 7.6, 7, fichu);
      poly(elle, [[12, 17], [6, 20], [8, 23], [13, 20]], fichu[1]);
      ovale(elle, 22.4, 16, 3.6, 4.6, t.c(PEAU));
      elle.rect(26, 16, 2, 2, t.c(PEAU_OMBRE));
      elle.rect(24, 14, 1, 2, t.trait);
      chemin(elle, [[20, 10], [19, 15], [20, 20]], t.c("#6a4424"));
      bras(elle, t, 19, 28, 27, 33, robe[0]);
      cerner(elle, t.trait);
      tampon(pl, elle.decor(), 0, 0);
    },
  ),
  figurant(
    {
      id: "porteur-de-fagot",
      nom: "un vieux porteur de fagot",
      description: "Un vieil homme de profil, courbé sous un gros fagot de branches lié de cordes, cape grise à capuche, qui s'appuie sur une canne. Revient du bois vers le village par la lisière ou la grand-rue, à pas lents, de jour ou au crépuscule. Ce n'est pas un membre du clan.",
      milieu: "sol",
      allure: "lente",
      quand: ["aube", "jour", "crepuscule"],
      largeur: 56,
      hauteur: 62,
      images: 2,
    },
    (pl, t, image) => {
      const pied = 61;
      const gris = t.tons("#b8aa92", "#94866e", "#6c6050");
      const branches = [t.c("#a67a4c"), t.c("#7c5a38"), t.c("#5a4028"), t.c("#8f6c44")] as const;
      cape(pl, t, 24, pied, 30, 11, 7, gris, image);
      capuche(pl, t, 35, 26, gris, t.c("#e2ded4"));
      // Le fagot, en travers du dos : des branches serrées, deux liens de corde, des bouts qui dépassent.
      for (let k = 0; k < 9; k++) {
        const y = 6 + k * 2;
        ligne(pl, 2 + (k % 3), y + 8 + (k % 2), 37 - (k % 4), y, branches[k % 4]!, 2);
      }
      ligne(pl, 1, 13, 5, 10, branches[2]);
      ligne(pl, 36, 5, 41, 2, branches[1]);
      ligne(pl, 34, 18, 40, 15, branches[0]);
      for (const x of [11, 27]) ligne(pl, x, 9 + (38 - x) / 5, x + 3, 27 - x / 6, t.c("#d6c690"), 2);
      // Le bras et la canne.
      ligne(pl, 49 + image, 34, 50 - image, pied - 1, t.c("#6a4424"), 2);
      bras(pl, t, 33, 38, 44, 40, gris[0]);
      cerner(pl, t.trait);
    },
  ),
];
