/**
 * Les figurants du sol : les bêtes sauvages et les petites vies de l'herbe, qui posent leurs pattes sur la dernière rangée
 * du dessin (les papillons et les lucioles volettent au-dessus : le bas de leur dessin reste vide). Dessins originaux,
 * case par case, tournés vers la droite, dans le trait des bêtes du village. Design : Claude Fable 5.2.
 */
import { type Planche, alea } from "../../decor";
import { type Teintes, boule, cerner, chemin, figurant, ligne, ovale, patte, poly } from "./figurants-outils";
import type { Figurant } from "./type";

/** Un papillon vu ailes à plat, autour de la case (cx, cy) : `ouvert` de 1 (ailes fermées) à 3 (grandes ouvertes). */
function papillon(pl: Planche, t: Teintes, cx: number, cy: number, ouvert: number, aile: string, bord: string): void {
  for (const sens of [-1, 1]) {
    for (let w = 1; w <= ouvert; w++) {
      for (let r = -2; r <= 2; r++) {
        if (r > 0 && w === ouvert && ouvert > 1) continue;
        if (r === -2 && w === 1 && ouvert > 1) continue;
        pl.poser(cx + sens * w, cy + r, w === ouvert && ouvert === 3 ? bord : r === 1 && w === 1 ? bord : aile);
      }
    }
  }
  pl.rect(cx, cy - 2, 1, 5, t.trait);
}

/** Un moineau : il picore (tête basse) ou regarde (tête haute). */
function moineau(pl: Planche, t: Teintes, x: number, picore: boolean): void {
  const [brun, ventre, calotte] = [t.c("#a67a4c"), t.c("#dccbb0"), t.c("#7a4a28")];
  pl.rect(x, 3, 2, 2, calotte);
  ovale(pl, x + 4, 5.4, 3.3, 2.5, (i, j) => (j > 5 ? ventre : (i + j) % 3 === 0 ? calotte : brun));
  const [hx, hy] = picore ? [x + 7, 6] : [x + 6.5, 3];
  ovale(pl, hx, hy, 2, 1.8, (_i, j) => (j < hy ? calotte : ventre));
  pl.poser(Math.round(hx + 2), Math.round(hy + (picore ? 1 : 0)), t.c("#3a3028"));
  pl.poser(Math.round(hx), Math.round(hy), t.trait);
  pl.poser(x + 3, 8, t.c("#c08a5a"));
  pl.poser(x + 5, 8, t.c("#c08a5a"));
}

export const FIGURANTS_DU_SOL: readonly Figurant[] = [
  figurant(
    {
      id: "lapin",
      nom: "un lapin de garenne",
      description: "Un lapin gris-brun aux longues oreilles, à la petite queue blanche, qui avance par bonds. Dans le pré, au bord du potager ou à la lisière, à l'aube et au crépuscule surtout.",
      milieu: "sol",
      allure: "pas",
      quand: ["aube", "jour", "crepuscule"],
      largeur: 24,
      hauteur: 17,
      images: 3,
    },
    (pl, t, image) => {
      const poil = t.tons("#cdb594", "#a68c6a", "#7d664a");
      const [ventre, queue, rose] = [t.c("#e8dec8"), t.c("#f6f0e2"), t.c("#d89a9a")];
      if (image === 1) {
        // En l'air, étiré : les pattes de derrière tendues, celles de devant en avant, les oreilles couchées.
        ligne(pl, 5, 9, 1, 12, poil[2], 2);
        ligne(pl, 15, 9, 19, 12, poil[1], 2);
        boule(pl, 10, 7, 7, 3, poil);
        ovale(pl, 3, 5, 1.7, 1.7, queue);
        boule(pl, 18, 5, 3, 2.6, poil);
        ligne(pl, 16, 3, 11, 2, poil[2], 2);
        pl.poser(19, 4, t.trait);
        pl.poser(21, 5, rose);
        pl.rect(8, 9, 6, 1, ventre);
      } else {
        const d = image === 2 ? 1 : 0;
        // Assis, ramassé (ou qui retombe, le nez plus bas).
        boule(pl, 9, 10.5, 6.5, 4.2, poil);
        ovale(pl, 5.5, 11.5, 3.6, 3.6, (_i, j) => (j > 12 ? poil[2] : poil[1]));
        ovale(pl, 2, 10 - d, 1.8, 1.8, queue);
        boule(pl, 16, 7 + d, 3.2, 2.9, poil);
        ligne(pl, 14, 5 + d, 13 - d * 2, 1 + d, poil[2], 2);
        ligne(pl, 16, 4 + d, 16 - d * 2, d, poil[1], 2);
        pl.poser(17, 6 + d, t.trait);
        pl.poser(19, 7 + d, rose);
        pl.rect(13, 13, 3, 2, ventre);
        pl.rect(3, 15, 6, 1, poil[1]);
        pl.rect(13, 15, 3, 1, poil[1]);
      }
      cerner(pl, t.trait);
    },
  ),
  figurant(
    {
      id: "renard",
      nom: "un renard roux",
      description: "Un renard roux, museau pointu, chaussettes sombres, grosse queue à bout blanc, qui trotte sans bruit. Passe à la lisière, le long de la palissade ou dans le pré, à la tombée du jour, la nuit ou à l'aube.",
      milieu: "sol",
      allure: "pas",
      quand: ["crepuscule", "nuit", "aube"],
      largeur: 52,
      hauteur: 25,
      images: 2,
    },
    (pl, t, image) => {
      const roux = t.tons("#ee9a50", "#cf6e2c", "#a04e1c");
      const [blanc, noir] = [t.c("#f4eada"), t.c("#3a2418")];
      // La queue, qui se balance d'une case.
      boule(pl, 9, 11 + image, 8, 3.4, roux);
      ovale(pl, 3, 11.5 + image, 2.8, 2.5, blanc);
      // Les pattes : le haut roux, le bas sombre.
      [17, 21, 32, 36].forEach((x, k) => {
        const leve = (k + image) % 2 === 0;
        pl.rect(x, 13, 2, 5, k % 2 === 1 ? roux[2] : roux[1]);
        patte(pl, x, 18, 23, 2, leve, noir, noir);
      });
      boule(pl, 26, 11, 11.5, 4.6, roux);
      ovale(pl, 34, 13.5, 3.4, 2.4, blanc);
      // La tête : les oreilles à pointe noire, le museau fin, la joue blanche.
      poly(pl, [[37, 5], [38, 0], [41, 4]], (_i, j) => (j < 2 ? noir : roux[1]));
      poly(pl, [[40, 5], [43, 0], [44, 5]], (_i, j) => (j < 2 ? noir : roux[0]));
      boule(pl, 41, 8, 4.2, 3.6, roux);
      poly(pl, [[43, 7], [49, 9], [49, 10], [42, 11]], (_i, j) => (j > 9 ? blanc : roux[1]));
      ovale(pl, 41.5, 10.6, 2.4, 1.4, blanc);
      pl.poser(49, 9, noir);
      pl.poser(50, 9, noir);
      pl.poser(43, 7, t.trait);
      cerner(pl, t.trait);
    },
  ),
  figurant(
    {
      id: "herisson",
      nom: "un hérisson",
      description: "Un petit hérisson rond, piquants bruns, museau pointu clair, qui trottine à petits pas. Longe un mur, un jardin ou la palissade, à la tombée du jour et la nuit.",
      milieu: "sol",
      allure: "lente",
      quand: ["crepuscule", "nuit"],
      largeur: 21,
      hauteur: 12,
      images: 2,
    },
    (pl, t, image) => {
      const piquants = [t.c("#c4a67c"), t.c("#8f6e4a"), t.c("#6a4e32")] as const;
      poly(pl, [[14, 6], [19, 8], [19, 9], [14, 10]], t.c("#e6d0a8"));
      ovale(pl, 8.5, 7, 7.4, 4.6, (i, j) => (j > 9 ? null : piquants[Math.floor(alea(i, j) * 3)]!));
      for (let i = 2; i <= 14; i += 2) {
        let y = 0;
        while (y < 10 && pl.lire(i, y) === null) y++;
        pl.poser(i, y - 1, piquants[2]);
      }
      pl.poser(19, 8, t.trait);
      pl.poser(16, 7, t.trait);
      pl.rect(4 - image, 10, 2, 1, t.c("#c49a80"));
      pl.rect(8 + image, 10, 2, 1, t.c("#c49a80"));
      pl.rect(13 - image, 10, 2, 1, t.c("#c49a80"));
      cerner(pl, t.trait);
    },
  ),
  figurant(
    {
      id: "biche-et-faon",
      nom: "une biche et son faon",
      description: "Une biche fauve, fine sur ses longues pattes, et son petit faon tacheté de clair qui la suit. Sortent du bois et longent la lisière ou le pré, loin des gens, à l'aube ou au crépuscule.",
      milieu: "sol",
      allure: "lente",
      quand: ["aube", "crepuscule"],
      largeur: 82,
      hauteur: 51,
      images: 2,
    },
    (pl, t, image) => {
      const poil = t.tons("#dcae7c", "#b98656", "#8e6238");
      const [ventre, sabot] = [t.c("#eedcbc"), t.c("#3a2a1c")];
      // Le faon, derrière : pattes fines, dos tacheté.
      boule(pl, 18, 33, 8.5, 4.2, poil);
      poly(pl, [[23, 31], [26, 24], [29, 24], [27, 35]], poil[1]);
      boule(pl, 29, 23, 3.2, 2.6, poil);
      pl.rect(31, 23, 3, 2, poil[1]);
      pl.poser(33, 23, sabot);
      pl.poser(30, 22, t.trait);
      poly(pl, [[26, 21], [24, 17], [28, 20]], poil[2]);
      poly(pl, [[28, 20], [29, 16], [30, 20]], poil[0]);
      for (const [x, y] of [[12, 31], [15, 30], [18, 31], [21, 30], [14, 33], [19, 33], [23, 32]] as const) pl.poser(x, y, ventre);
      pl.rect(9, 30, 2, 2, ventre);
      // La biche : les pattes du fond plus sombres, le corps, la croupe claire, le cou, la tête, les grandes oreilles.
      pl.rect(43, 24, 5, 9, poil[1]);
      pl.rect(58, 25, 4, 7, poil[1]);
      boule(pl, 53, 23, 13.5, 6.4, poil);
      pl.rect(46, 28, 14, 1, ventre);
      ovale(pl, 40.5, 21.5, 1.8, 3, ventre);
      pl.rect(39, 18, 2, 3, poil[2]);
      poly(pl, [[60, 20], [64, 9], [69, 9], [67, 25]], (i, j) => (i < 62 + (25 - j) * 0.2 ? poil[0] : poil[1]));
      boule(pl, 69, 7.5, 4.2, 3.2, poil);
      poly(pl, [[71, 6], [77, 8], [77, 10], [70, 11]], (_i, j) => (j > 9 ? ventre : poil[1]));
      pl.rect(77, 8, 1, 2, sabot);
      pl.rect(70, 6, 1, 2, t.trait);
      poly(pl, [[65, 6], [61, 1], [64, 0], [67, 4]], (i) => (i > 63 ? ventre : poil[2]));
      poly(pl, [[67, 5], [68, 0], [70, 0], [71, 4]], (i) => (i === 69 ? ventre : poil[1]));
      cerner(pl, t.trait);
      // Les pattes, fines, sans cerne (un trait de plus les ferait épaisses) : celles du fond plus sombres.
      const jambe = (x: number, haut: number, fond: boolean, leve: boolean): void => {
        const bas = 49 - (leve ? 1 : 0);
        pl.rect(x, haut, 2, bas - haut, (i) => (fond || i === x ? poil[2] : poil[1]));
        pl.rect(x, bas, 2, 1, sabot);
      };
      [12, 15, 22, 25].forEach((x, k) => jambe(x, 37, k % 2 === 1, (k + image) % 2 === 1));
      [44, 48, 59, 63].forEach((x, k) => jambe(x, 31, k % 2 === 1, (k + image) % 2 === 0));
    },
  ),
  figurant(
    {
      id: "ecureuil",
      nom: "un écureuil roux",
      description: "Un écureuil roux au ventre crème, la grande queue en panache, qui court par petits bonds. Va d'un arbre à l'autre, au pied du grand chêne ou le long de la palissade, de jour.",
      milieu: "sol",
      allure: "pas",
      quand: ["aube", "jour", "crepuscule"],
      largeur: 25,
      hauteur: 18,
      images: 2,
    },
    (pl, t, image) => {
      const roux = t.tons("#ee9a56", "#c8642c", "#9a461a");
      const creme = t.c("#f2e0c4");
      const e = image;
      // La queue en panache : dressée, puis couchée derrière lui quand il s'allonge.
      boule(pl, 5 - e, 8 + 2 * e, 4, 6.4 - 2.4 * e, roux);
      ovale(pl, 7 - 3 * e, 3 + 3 * e, 3, 2.3, roux[0]);
      boule(pl, 12, 11.5 + 0.5 * e, 4.6 + 1.4 * e, 4 - 0.8 * e, roux);
      ovale(pl, 14 + e, 13, 2.2, 2.2 - 0.6 * e, creme);
      boule(pl, 17 + 1.5 * e, 7.6 + e, 3.1, 2.7, roux);
      poly(pl, [[15 + e, 5 + e], [15 + e, 2 + e], [17 + e, 5 + e]], roux[2]);
      poly(pl, [[17 + e, 5 + e], [18 + e, 2 + e], [19 + e, 5 + e]], roux[1]);
      pl.poser(18 + e, 7 + e, t.trait);
      pl.poser(20 + 2 * e, 8 + e, t.c("#3a2418"));
      pl.rect(19 + e, 9 + e, 2, 1, creme);
      if (e === 0) {
        pl.rect(9, 15, 4, 2, roux[2]);
        pl.rect(15, 14, 2, 3, roux[1]);
      } else {
        ligne(pl, 8, 14, 5, 16, roux[2], 2);
        ligne(pl, 17, 13, 20, 16, roux[1], 2);
      }
      cerner(pl, t.trait);
    },
  ),
  figurant(
    {
      id: "chat-qui-trotte",
      nom: "un chat gris tigré",
      description: "Un chat gris tigré aux pattes blanches, la queue en l'air, qui trotte d'un air décidé. Traverse la place, longe les huttes ou le quai, à toute heure.",
      milieu: "sol",
      allure: "pas",
      largeur: 31,
      hauteur: 19,
      images: 2,
    },
    (pl, t, image) => {
      const gris = t.tons("#b4b4bc", "#8c8c96", "#666670");
      const [raie, blanc] = [t.c("#4e4e58"), t.c("#f2eee4")];
      chemin(pl, [[6, 9], [3, 5], [3 + image, 1]], (_i, j) => (j % 3 === 0 ? raie : gris[1]), 2);
      [7, 10, 17, 20].forEach((x, k) => patte(pl, x, 12, 17, 2, (k + image) % 2 === 0, k % 2 === 1 ? gris[2] : gris[1], blanc));
      boule(pl, 13.5, 9.5, 8.4, 3.7, gris);
      for (const x of [9, 12, 15, 18]) pl.rect(x, 6, 1, 3, raie);
      poly(pl, [[20, 4], [21, 0], [23, 3]], gris[2]);
      poly(pl, [[23, 3], [26, 0], [26, 4]], gris[1]);
      boule(pl, 23.5, 6.6, 3.7, 3.3, gris);
      pl.rect(22, 3, 1, 2, raie);
      pl.rect(25, 8, 2, 2, blanc);
      pl.poser(27, 7, t.c("#d89a9a"));
      pl.poser(25, 6, t.c("#5a8a3a"));
      pl.rect(21, 11, 3, 2, blanc);
      cerner(pl, t.trait);
    },
  ),
  figurant(
    {
      id: "faisan",
      nom: "un faisan",
      description: "Un faisan cuivré à la tête vert sombre, au collier blanc, à la très longue queue rayée, qui marche en hochant la tête. Dans le pré, au bord des champs ou près du potager, de jour.",
      milieu: "sol",
      allure: "pas",
      quand: ["aube", "jour", "crepuscule"],
      largeur: 36,
      hauteur: 19,
      images: 2,
    },
    (pl, t, image) => {
      const cuivre = t.tons("#e89a52", "#c0662c", "#8e4218");
      const vert = t.c("#1f6a50");
      poly(pl, [[1, 5], [17, 9], [17, 11], [1, 7]], (i) => (i % 3 === 0 ? t.c("#5a3a20") : t.c("#d2aa70")));
      ligne(pl, 20, 14, 20 - image, 17, t.c("#8a8a80"));
      ligne(pl, 23, 14, 23 + image, 17, t.c("#8a8a80"));
      boule(pl, 21, 10.5, 6.6, 4.2, cuivre);
      for (const [x, y] of [[18, 9], [21, 8], [24, 10], [19, 12], [22, 12]] as const) pl.poser(x, y, cuivre[2]);
      chemin(pl, [[16, 10], [20, 12], [24, 11]], t.c("#d2aa70"));
      const d = image;
      pl.rect(25 + d, 5, 3, 5, vert);
      pl.rect(25 + d, 8, 3, 1, t.c("#f2eee4"));
      ovale(pl, 27.5 + d, 3.6, 2.5, 2.3, vert);
      pl.rect(28 + d, 3, 2, 2, t.c("#d2382e"));
      pl.rect(30 + d, 4, 2, 1, t.c("#e8d8a0"));
      pl.poser(28 + d, 3, t.trait);
      pl.poser(26 + d, 1, vert);
      cerner(pl, t.trait);
    },
  ),
  figurant(
    {
      id: "moineaux",
      nom: "quatre moineaux qui picorent",
      description: "Quatre moineaux bruns posés au sol, qui picorent des miettes chacun à son tour. Sur la place, devant le four, la halle ou le grenier, de jour ; ils restent sur place.",
      milieu: "sol",
      allure: "posee",
      quand: ["aube", "jour", "crepuscule"],
      largeur: 48,
      hauteur: 10,
      images: 2,
    },
    (pl, t, image) => {
      [1, 13, 26, 37].forEach((x, k) => moineau(pl, t, x, (k + image) % 2 === 0));
      cerner(pl, t.trait);
    },
  ),
  figurant(
    {
      id: "papillons",
      nom: "trois papillons",
      description: "Trois papillons, un jaune, un bleu, un orangé, qui volettent en ouvrant et fermant les ailes, un peu au-dessus de l'herbe. Près du potager, des jardins ou dans le pré, en plein jour.",
      milieu: "sol",
      allure: "lente",
      quand: ["jour"],
      largeur: 46,
      hauteur: 42,
      images: 4,
    },
    (pl, t, image) => {
      const ouvertures = [3, 2, 1, 2] as const;
      const pas = [[0, 0], [1, -1], [2, 0], [1, 1]] as const;
      const robes = [[t.c("#f4de4e"), t.c("#c4a42a")], [t.c("#86b4f2"), t.c("#3f6fc0")], [t.c("#f2a040"), t.c("#5a3418")]] as const;
      const places = [[5, 16], [21, 25], [36, 5]] as const;
      places.forEach(([x, y], k) => {
        const i = (image + k) % 4;
        papillon(pl, t, x + pas[i]![0], y + pas[i]![1], ouvertures[i]!, robes[k]![0], robes[k]![1]);
      });
    },
  ),
  figurant(
    {
      id: "lucioles",
      nom: "des lucioles",
      description: "Une dizaine de petites lueurs vert-jaune qui flottent lentement au-dessus de l'herbe. Près du ruisseau, de la lisière ou du pré, la nuit et à la fin du crépuscule seulement.",
      milieu: "sol",
      allure: "lente",
      quand: ["crepuscule", "nuit"],
      largeur: 86,
      hauteur: 44,
      images: 3,
    },
    (pl, _t, image) => {
      // Ce qui éclaire garde sa couleur : un cœur clair, un halo plus sourd. Elles ne s'éteignent pas, elles dérivent.
      const places = [[6, 20], [17, 8], [25, 30], [36, 15], [44, 4], [51, 26], [60, 12], [68, 33], [77, 18], [80, 6]] as const;
      const pas = [[0, 0], [1, -1], [-1, -1]] as const;
      places.forEach(([x, y], k) => {
        const [dx, dy] = pas[(image + k) % 3]!;
        for (const [hx, hy] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) pl.poser(x + dx + hx, y + dy + hy, "#8ea63e");
        pl.poser(x + dx, y + dy, "#e6f08c");
      });
    },
  ),
];
