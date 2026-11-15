/**
 * Les figurants de l'eau : ce qui passe sur le ruisseau, le lavoir, le port ou la mer. Le pied du dessin est la dernière
 * rangée de son sillage ; la ligne d'eau est quelques rangées plus haut, et ce qui est dessous devient un reflet sombre.
 * Dessins originaux, case par case, tournés vers la droite. Design : Claude Fable 5.2.
 */
import type { Planche } from "../../decor";
import { type Teintes, boule, cerner, chemin, figurant, ligne, ovale, poly, sillage } from "./figurants-outils";
import type { Figurant } from "./type";

/**
 * Met le dessin à l'eau : sous la ligne d'eau, ce qui est dessiné devient un reflet sombre, puis de courts traits clairs
 * font le sillage, de `x0` à `x1`, sur les rangées qui restent.
 */
function flotter(pl: Planche, t: Teintes, ligneDEau: number, image: number, x0 = 0, x1 = pl.largeur - 1): void {
  for (let x = 0; x < pl.largeur; x++) {
    if (pl.lire(x, ligneDEau) !== null) pl.poser(x, ligneDEau, t.eau.sombre);
    for (let y = ligneDEau + 1; y < pl.hauteur; y++) pl.poser(x, y, null);
  }
  for (let y = ligneDEau + 1; y < pl.hauteur; y++) {
    const retrait = (y - ligneDEau - 1) * 3;
    sillage(pl, t, x0 + retrait, x1 - retrait, y, image + y);
  }
}

/** Un rond dans l'eau : un ovale très plat, en trait clair. */
function rond(pl: Planche, t: Teintes, cx: number, cy: number, rx: number): void {
  for (let i = -rx; i <= rx; i++) {
    const bord = Math.abs(i) > rx - 2;
    if (bord) pl.poser(cx + i, cy, t.eau.clair);
    else {
      pl.poser(cx + i, cy - 1, t.eau.clair);
      if (i % 2 === 0) pl.poser(cx + i, cy + 1, t.eau.clair);
    }
  }
}

/** Un poisson long de 11 cases, le nez vers l'angle `angle` (en radians, 0 : vers la droite). */
function poisson(pl: Planche, t: Teintes, cx: number, cy: number, angle: number): void {
  const [dos, flanc, ventre] = [t.c("#557a90"), t.c("#b4c6ce"), t.c("#e4eaea")];
  const larges = [3, 1, 1, 2, 3, 4, 4, 4, 3, 2, 1];
  const [ux, uy] = [Math.cos(angle), Math.sin(angle)];
  larges.forEach((large, k) => {
    const s = k - 5;
    for (let w = 0; w < large; w++) {
      const e = w - (large - 1) / 2;
      // La queue (k = 0) est fourchue : pas de case au milieu.
      if (k === 0 && w === 1) continue;
      const x = Math.round(cx + s * ux - e * uy);
      const y = Math.round(cy + s * uy + e * ux);
      pl.poser(x, y, k === 0 ? dos : e < -0.6 ? dos : e > 0.9 ? ventre : flanc);
    }
  });
  pl.poser(Math.round(cx + 3.4 * ux + 0.6 * uy), Math.round(cy + 3.4 * uy - 0.6 * ux), t.trait);
}

export const FIGURANTS_DE_L_EAU: readonly Figurant[] = [
  figurant(
    {
      id: "canards",
      nom: "une cane et ses quatre canetons",
      description: "Une cane brune suivie de quatre canetons jaunes à la file, qui dansent sur l'eau. Descend ou remonte lentement le ruisseau, traverse le lavoir ou longe le quai, de jour.",
      milieu: "eau",
      allure: "lente",
      quand: ["aube", "jour", "crepuscule"],
      largeur: 72,
      hauteur: 17,
      images: 2,
    },
    (pl, t, image) => {
      const brun = t.tons("#c29a68", "#9a7448", "#6f5032");
      // Les canetons, du dernier au premier : un sur deux monte d'une case.
      for (let k = 3; k >= 0; k--) {
        const x = 6 + 11 * k;
        const y = (k + image) % 2;
        ovale(pl, x, 10.5 - y, 3.6, 2.4, (_i, j) => (j < 10 - y ? t.c("#a8843e") : t.c("#ecd46e")));
        ovale(pl, x + 3, 7.5 - y, 2, 1.9, t.c("#f2dc7c"));
        pl.poser(x + 3, 6 - y, t.c("#a8843e"));
        pl.poser(x + 5, 8 - y, t.c("#e09a3a"));
        pl.poser(x + 4, 7 - y, t.trait);
      }
      // La cane : la queue relevée, le corps moucheté, le miroir bleu de l'aile, le cou, la tête, le bec.
      poly(pl, [[49, 9], [45, 5], [47, 5], [52, 7]], brun[2]);
      boule(pl, 56, 9, 8, 3.8, brun);
      for (const [x, y] of [[52, 8], [55, 7], [58, 9], [60, 7], [54, 10], [57, 11]] as const) pl.poser(x, y, brun[2]);
      pl.rect(51, 9, 4, 1, t.c("#3f6fb0"));
      pl.rect(61, 3, 3, 5, (i) => (i === 61 ? brun[0] : brun[1]));
      ovale(pl, 63.5, 3.2, 2.7, 2.3, brun[1]);
      pl.rect(62, 1, 3, 1, brun[2]);
      pl.rect(66, 3, 3, 1, t.c("#e09a3a"));
      pl.rect(66, 4, 2, 1, t.c("#c07c2a"));
      pl.poser(64, 3, t.trait);
      cerner(pl, t.trait);
      flotter(pl, t, 13, image, 2, 70);
    },
  ),
  figurant(
    {
      id: "cygne",
      nom: "un cygne",
      description: "Un grand cygne blanc, le cou en S, l'aile un peu levée, qui glisse sans bruit. Sur l'eau calme du ruisseau, du lavoir ou du port, de l'aube au crépuscule.",
      milieu: "eau",
      allure: "lente",
      quand: ["aube", "jour", "crepuscule"],
      largeur: 36,
      hauteur: 29,
      images: 2,
    },
    (pl, t, image) => {
      const blanc = t.tons("#fbf8f0", "#eee9dc", "#cdc7b8");
      poly(pl, [[5, 19], [1, 14], [3, 14], [8, 17]], blanc[1]);
      boule(pl, 14, 20, 11, 4.6, blanc);
      // L'aile levée en voûte, ses plumes soulignées.
      boule(pl, 11, 16.5, 8, 4.2, blanc);
      chemin(pl, [[4, 18], [9, 20], [15, 19], [19, 16]], blanc[2]);
      chemin(pl, [[6, 15], [10, 17], [15, 16]], blanc[2]);
      // Le cou en S : il se penche un peu d'une image à l'autre.
      const d = image;
      chemin(pl, [[22, 18], [25, 14], [24 + d, 9], [25 + d, 5], [27 + d, 3]], (i) => (i < 25 + d ? blanc[1] : blanc[0]), 2);
      ovale(pl, 28.5 + d, 3.6, 2.4, 2, blanc[0]);
      pl.rect(31 + d, 4, 3, 1, t.c("#e8873a"));
      pl.rect(31 + d, 5, 2, 1, t.c("#c86a28"));
      pl.rect(30 + d, 3, 2, 1, t.trait);
      pl.poser(29 + d, 3, t.trait);
      cerner(pl, t.trait);
      flotter(pl, t, 24, image, 1, 30);
    },
  ),
  figurant(
    {
      id: "heron-au-gue",
      nom: "un héron debout dans l'eau",
      description: "Un héron gris immobile sur ses longues pattes, le cou en S, qui guette le poisson et baisse lentement la tête. Au bord du ruisseau, au gué ou dans l'eau basse, à l'aube ou au crépuscule surtout.",
      milieu: "eau",
      allure: "posee",
      quand: ["aube", "jour", "crepuscule"],
      largeur: 30,
      hauteur: 46,
      images: 2,
    },
    (pl, t, image) => {
      const gris = t.tons("#b4c0d0", "#8a98ae", "#66748c");
      const pale = t.c("#e4e6e8");
      const patteTon = t.c("#9a7c3e");
      // La queue et le bout des ailes, sombres ; le corps penché ; les plumes du poitrail.
      poly(pl, [[5, 20], [1, 28], [4, 28], [9, 25]], t.c("#3d4860"));
      boule(pl, 11, 22, 7.4, 5, gris);
      chemin(pl, [[5, 21], [10, 24], [15, 24]], gris[2]);
      ligne(pl, 16, 22, 17, 27, pale);
      ligne(pl, 15, 24, 15, 28, pale);
      if (image === 0) {
        chemin(pl, [[15, 19], [18, 15], [16, 11], [17, 7]], pale, 2);
        ovale(pl, 19, 6, 2.6, 2.1, pale);
        ligne(pl, 20, 4, 14, 5, t.c("#2a2f3c"));
        ligne(pl, 22, 6, 27, 7, t.c("#e0b040"));
        pl.rect(22, 7, 3, 1, t.c("#c2922e"));
        pl.poser(20, 6, t.trait);
      } else {
        chemin(pl, [[15, 19], [19, 16], [19, 12], [20, 10]], pale, 2);
        ovale(pl, 22, 9.4, 2.6, 2.1, pale);
        ligne(pl, 23, 7, 17, 7, t.c("#2a2f3c"));
        ligne(pl, 24, 10, 28, 13, t.c("#e0b040"));
        pl.rect(24, 11, 2, 1, t.c("#c2922e"));
        pl.poser(23, 9, t.trait);
      }
      cerner(pl, t.trait);
      // Les pattes, fines, sans cerne : un trait de plus les ferait épaisses.
      ligne(pl, 10, 28, 10, 42, patteTon);
      chemin(pl, [[13, 28], [14, 34], [13, 42]], patteTon);
      flotter(pl, t, 42, image, 4, 22);
      rond(pl, t, 12, 44, 6 + image);
    },
  ),
  figurant(
    {
      id: "poisson-qui-saute",
      nom: "un poisson qui saute",
      description: "Un poisson argenté qui sort de l'eau, fait un petit arc et retombe en laissant des ronds. Sur place, au milieu du ruisseau, du lavoir ou du port, à toute heure du jour.",
      milieu: "eau",
      allure: "posee",
      quand: ["aube", "jour", "crepuscule"],
      largeur: 30,
      hauteur: 24,
      images: 4,
    },
    (pl, t, image) => {
      const ligneDEau = 19;
      if (image === 0) poisson(pl, t, 9, 16, -1.25);
      else if (image === 1) poisson(pl, t, 13, 7, -0.6);
      else if (image === 2) poisson(pl, t, 20, 9, 0.75);
      else poisson(pl, t, 24, 18, 1.3);
      cerner(pl, t.trait);
      for (let y = ligneDEau; y < pl.hauteur; y++) for (let x = 0; x < pl.largeur; x++) pl.cases[y * pl.largeur + x] = null;
      // Les ronds : là où il sort, puis là où il retombe ; quelques gouttes.
      if (image < 3) rond(pl, t, 9, 21, 4 + image * 2);
      if (image === 3) rond(pl, t, 23, 21, 5);
      if (image === 2) rond(pl, t, 9, 21, 3);
      const gouttes = [[[5, 14], [13, 15]], [[7, 13], [11, 16]], [[8, 17]], [[20, 14], [27, 15], [22, 12]]] as const;
      for (const [x, y] of gouttes[image]!) pl.poser(x, y, t.eau.clair);
    },
  ),
  figurant(
    {
      id: "barque-de-pecheur",
      nom: "un pêcheur dans sa barque",
      description: "Une barque de bois et son pêcheur encapuchonné, assis à l'arrière, la ligne à l'eau et un panier d'osier devant lui. Dérive lentement sur le ruisseau large, le port ou la mer, de l'aube au crépuscule.",
      milieu: "eau",
      allure: "lente",
      quand: ["aube", "jour", "crepuscule"],
      largeur: 100,
      hauteur: 60,
      images: 2,
    },
    (pl, t, image) => {
      const [clair, bois, sombre] = t.tons("#b07a44", "#8a5a30", "#6a4424");
      // La canne et le fil, derrière tout le reste.
      ligne(pl, 40, 33, 78, 8 + image, t.c("#c9a35c"));
      ligne(pl, 78, 8 + image, 78, 51 + image, t.c("#d8d0b8"));
      // La coque : l'avant relevé à droite, l'arrière à gauche, trois bordages, des membrures.
      poly(pl, [[3, 39], [9, 43], [82, 43], [94, 36], [88, 49], [80, 54], [14, 54], [7, 49]], (i, j) => {
        if (j <= 44) return clair;
        if (j === 47 || j === 51) return sombre;
        if ((i + (j > 47 ? 5 : 0)) % 11 === 0) return sombre;
        return j > 51 ? sombre : bois;
      });
      ligne(pl, 9, 43, 82, 43, clair);
      // Le banc, le panier d'osier et la rame couchée.
      ovale(pl, 56, 39, 6, 4.5, (i, j) => ((i + j) % 2 === 0 ? t.c("#c9a35c") : t.c("#a07d42")));
      pl.rect(50, 38, 13, 1, t.c("#8a6a34"));
      ligne(pl, 62, 42, 86, 37, sombre);
      poly(pl, [[86, 36], [92, 33], [93, 35], [87, 38]], bois);
      // Le pêcheur : une cape verte à capuche pointue, de profil ; on ne voit que le bas du visage et la main.
      const cape = t.tons("#7f9a70", "#5f7a56", "#46603f");
      poly(pl, [[19, 43], [21, 30], [26, 25], [33, 27], [37, 34], [38, 43]], (i, j) => (i < 23 + (j - 26) * 0.1 ? cape[0] : i > 33 ? cape[2] : (i + j * 2) % 9 === 0 ? cape[2] : cape[1]));
      boule(pl, 28, 21, 6, 5.6, cape);
      poly(pl, [[23, 18], [19, 13], [26, 16]], cape[1]);
      ovale(pl, 32, 22.5, 2.4, 3, t.c("#e8b890"));
      pl.poser(35, 23, t.c("#d49a74"));
      pl.poser(33, 21, t.trait);
      pl.rect(31, 25, 3, 1, t.c("#a8a094"));
      ligne(pl, 30, 31, 38, 33, cape[0], 3);
      pl.rect(40, 32, 2, 3, t.c("#e8b890"));
      cerner(pl, t.trait, [t.c("#d8d0b8")]);
      flotter(pl, t, 55, image, 2, 96);
      // Le bouchon rouge et clair, qui danse d'une case.
      pl.rect(77, 52 + image, 3, 2, t.c("#c8483a"));
      pl.rect(77, 51 + image, 3, 1, t.c("#efe6d2"));
    },
  ),
  figurant(
    {
      id: "bois-flotte",
      nom: "un tronc de bois flotté",
      description: "Un vieux tronc qui flotte, écorce sombre, un chicot de branche en l'air, porté par le courant. Descend le ruisseau ou dérive vers le port, à toute heure.",
      milieu: "eau",
      allure: "lente",
      largeur: 46,
      hauteur: 13,
      images: 2,
    },
    (pl, t, image) => {
      const ecorce = t.tons("#8a6844", "#6a4c30", "#4c3420");
      const y = image;
      ligne(pl, 14, 1 + y, 16, 5 + y, ecorce[1], 2);
      ligne(pl, 12, 0 + y, 14, 2 + y, ecorce[1]);
      poly(pl, [[3, 5 + y], [6, 3 + y], [38, 3 + y], [40, 5 + y], [40, 9 + y], [5, 9 + y], [3, 7 + y]], (i, j) => (j === 3 + y ? ecorce[0] : (i * 3 + j * 5) % 11 === 0 ? ecorce[2] : j > 6 + y ? ecorce[2] : ecorce[1]));
      ovale(pl, 39.5, 6 + y, 2.6, 3, (i, j) => ((i + j) % 2 === 0 ? t.c("#d9bb86") : t.c("#b89360")));
      pl.poser(39, 6 + y, ecorce[1]);
      pl.rect(22, 3 + y, 4, 1, t.c("#6f9a4a"));
      cerner(pl, t.trait);
      flotter(pl, t, 9, image, 1, 44);
    },
  ),
  figurant(
    {
      id: "libellules",
      nom: "trois libellules",
      description: "Trois libellules, une bleue, une rouge, une verte, aux ailes claires, qui font du surplace au ras de l'eau. Au-dessus du ruisseau ou du lavoir, en plein jour.",
      milieu: "eau",
      allure: "lente",
      quand: ["jour"],
      largeur: 46,
      hauteur: 30,
      images: 2,
    },
    (pl, t, image) => {
      const aile = t.c("#e4f0f4");
      const aileOmbre = t.c("#b4d0de");
      const une = (x: number, y: number, corps: string, haut: boolean): void => {
        if (haut) {
          ligne(pl, x + 6, y + 3, x + 3, y, aile);
          ligne(pl, x + 7, y + 3, x + 9, y, aile);
          ligne(pl, x + 5, y + 3, x + 2, y + 1, aileOmbre);
          ligne(pl, x + 8, y + 3, x + 10, y + 1, aileOmbre);
        } else {
          pl.rect(x + 2, y + 3, 4, 1, aile);
          pl.rect(x + 8, y + 3, 4, 1, aile);
          pl.rect(x + 3, y + 2, 3, 1, aileOmbre);
          pl.rect(x + 8, y + 2, 3, 1, aileOmbre);
        }
        pl.rect(x, y + 4, 6, 1, corps);
        pl.rect(x + 6, y + 4, 2, 2, corps);
        pl.rect(x + 8, y + 4, 2, 2, t.trait);
      };
      une(2, 8 + image, t.c("#2f8fd0"), image === 0);
      une(19, 15 - image, t.c("#d0483a"), image === 1);
      une(33, 3 + image, t.c("#4aa860"), image === 0);
    },
  ),
  figurant(
    {
      id: "grenouille",
      nom: "une grenouille sur un nénuphar",
      description: "Une grenouille verte assise sur une feuille de nénuphar, près d'une fleur claire ; sa gorge se gonfle doucement. Sur l'eau calme, près d'une rive du ruisseau ou du lavoir, de jour ou au crépuscule.",
      milieu: "eau",
      allure: "posee",
      quand: ["aube", "jour", "crepuscule"],
      largeur: 26,
      hauteur: 16,
      images: 2,
    },
    (pl, t, image) => {
      const feuille = t.tons("#7cc068", "#58a04c", "#3f8040");
      const vert = t.tons("#9ccc5a", "#74a83e", "#527f2c");
      // La feuille, avec son entaille, et sa fleur à gauche.
      ovale(pl, 13, 12, 11.5, 2.6, (i, j) => (i > 19 && Math.abs(j - 12) < (i - 19) * 0.5 ? null : j < 11 ? feuille[0] : (i + j) % 6 === 0 ? feuille[2] : feuille[1]));
      for (const [x, y] of [[4, 8], [6, 8], [3, 10], [7, 10], [5, 7]] as const) pl.rect(x, y, 2, 2, t.c("#f4e6ec"));
      pl.rect(5, 9, 2, 2, t.c("#f0cc5a"));
      // La grenouille : la cuisse repliée, le dos, la tête, l'œil en bosse, la gorge.
      boule(pl, 12, 8, 5, 3.2, vert);
      ovale(pl, 9, 10, 3, 1.8, vert[2]);
      ovale(pl, 17, 6.5, 2.8, 2.4, vert[1]);
      ovale(pl, 16, 4, 1.5, 1.4, vert[0]);
      pl.poser(16, 4, t.trait);
      ligne(pl, 15, 10, 17, 11, vert[2]);
      if (image === 1) ovale(pl, 18.5, 8.6, 2, 1.7, t.c("#e4ecc0"));
      else pl.rect(17, 8, 3, 1, t.c("#e4ecc0"));
      cerner(pl, t.trait);
      for (let x = 0; x < pl.largeur; x++) if (pl.lire(x, 15) !== null) pl.cases[15 * pl.largeur + x] = t.eau.sombre;
    },
  ),
  figurant(
    {
      id: "martin-pecheur",
      nom: "un martin-pêcheur",
      description: "Un tout petit oiseau bleu vif au ventre orange, au long bec, qui file comme une flèche au ras de l'eau. Longe le ruisseau d'un bout à l'autre, de jour.",
      milieu: "eau",
      allure: "vol",
      quand: ["aube", "jour"],
      largeur: 18,
      hauteur: 20,
      images: 2,
    },
    (pl, t, image) => {
      const [bleu, bleuSombre, orange] = [t.c("#2a9ad8"), t.c("#1f6aa8"), t.c("#e8873a")];
      pl.rect(1, 6, 3, 2, bleuSombre);
      ovale(pl, 7, 7, 3.8, 2.5, (_i, j) => (j > 7 ? orange : bleu));
      ovale(pl, 10.5, 5.5, 2.4, 2.2, bleu);
      pl.poser(11, 7, t.c("#f4eee0"));
      pl.poser(10, 6, orange);
      pl.rect(13, 5, 4, 1, t.c("#2a2a32"));
      pl.rect(13, 6, 2, 1, t.c("#2a2a32"));
      pl.poser(11, 5, t.trait);
      if (image === 0) poly(pl, [[5, 5], [8, 5], [4, 1]], bleuSombre);
      else poly(pl, [[5, 7], [8, 7], [4, 12]], bleuSombre);
      cerner(pl, t.trait);
    },
  ),
  figurant(
    {
      id: "loutre",
      nom: "une loutre qui nage",
      description: "Une loutre brune dont on ne voit que la tête, le dos rond et le bout de la queue, avec son sillage. Nage dans le ruisseau, à l'aube, au crépuscule ou la nuit.",
      milieu: "eau",
      allure: "lente",
      quand: ["aube", "crepuscule", "nuit"],
      largeur: 40,
      hauteur: 11,
      images: 2,
    },
    (pl, t, image) => {
      const poil = t.tons("#a07a54", "#7a5a3c", "#5a4028");
      ovale(pl, 8 - image, 6, 3, 1.6, poil[1]);
      boule(pl, 18 + image * 3, 5.6, 6.5, 2.6, poil);
      boule(pl, 31, 4, 4, 3, poil);
      pl.rect(28, 0, 2, 2, poil[2]);
      pl.rect(33, 5, 3, 2, t.c("#dcc8a8"));
      pl.poser(35, 4, t.trait);
      pl.poser(32, 3, t.trait);
      cerner(pl, t.trait);
      flotter(pl, t, 7, image, 0, 38);
      ligne(pl, 36, 6, 38, 7, t.eau.clair);
    },
  ),
  figurant(
    {
      id: "bateau-d-ecorce",
      nom: "un petit bateau d'écorce",
      description: "Un jouet : un bout d'écorce, une brindille pour mât, une feuille verte pour voile, qu'un enfant a lâché sur l'eau. Descend le ruisseau au fil du courant, de jour.",
      milieu: "eau",
      allure: "lente",
      quand: ["jour", "crepuscule"],
      largeur: 18,
      hauteur: 17,
      images: 2,
    },
    (pl, t, image) => {
      const ecorce = t.tons("#a8845a", "#7c5a38", "#573c24");
      const feuille = t.tons("#8cc860", "#5fa244", "#44803a");
      const d = image;
      ligne(pl, 8, 10, 8 + d, 1, t.c("#6a4c30"));
      poly(pl, [[9 + d, 2], [14 + d, 6], [9, 9]], (i, j) => (j === 6 ? feuille[2] : i > 11 + d ? feuille[2] : j < 5 ? feuille[0] : feuille[1]));
      poly(pl, [[1, 9], [4, 11], [12, 11], [16, 8], [13, 13], [4, 13]], (i, j) => (j < 11 ? ecorce[0] : (i + j) % 4 === 0 ? ecorce[2] : ecorce[1]));
      cerner(pl, t.trait);
      flotter(pl, t, 14, image, 0, 16);
    },
  ),
];
