/**
 * Les figurants des toits : ce qui se pose sur un faîte de chaume, une cheminée ou un mur. Le pied du dessin se pose sur
 * le toit. Dessins originaux, case par case, tournés vers la droite. Design : Claude Fable 5.2.
 */
import { alea } from "../../decor";
import { boule, cerner, chemin, figurant, ligne, ovale, poly } from "./figurants-outils";
import type { Figurant } from "./type";

export const FIGURANTS_DES_TOITS: readonly Figurant[] = [
  figurant(
    {
      id: "chat-au-soleil",
      nom: "un chat roux couché au soleil",
      description: "Un chat roux tigré allongé de tout son long, les yeux fermés, dont seule la queue remue. Sur le faîte d'un toit de chaume, un mur ou le rebord du lavoir, en plein jour ; il ne bouge pas de sa place.",
      milieu: "toit",
      allure: "posee",
      quand: ["jour"],
      largeur: 32,
      hauteur: 12,
      images: 2,
    },
    (pl, t, image) => {
      const roux = t.tons("#f4b068", "#d88840", "#aa622c");
      const creme = t.c("#f6e6c8");
      chemin(pl, [[5, 8], [2, 7], [1, 4 + image * 2], [2 + image, 2 + image * 3]], roux[1], 2);
      boule(pl, 14, 6.6, 10.4, 3.6, roux);
      for (const x of [8, 11, 14, 17]) pl.rect(x, 3 + (x % 2), 1, 3, roux[2]);
      poly(pl, [[21, 4], [22, 0], [24, 3]], roux[2]);
      poly(pl, [[24, 3], [27, 0], [27, 4]], roux[1]);
      boule(pl, 24.5, 6.4, 3.8, 3.3, roux);
      pl.rect(25, 6, 2, 1, t.trait);
      pl.poser(28, 7, t.c("#d89a9a"));
      pl.rect(26, 8, 2, 1, creme);
      pl.rect(23, 9, 6, 1, creme);
      pl.rect(6, 9, 4, 1, creme);
      cerner(pl, t.trait);
    },
  ),
  figurant(
    {
      id: "cigogne-au-nid",
      nom: "une cigogne sur son nid",
      description: "Une cigogne blanche et noire debout sur un grand nid de branches, qui renverse la tête en arrière pour claquer du bec. Sur une cheminée, le haut d'un toit ou de la tour, de jour ; elle ne bouge pas de sa place.",
      milieu: "toit",
      allure: "posee",
      quand: ["aube", "jour", "crepuscule"],
      largeur: 40,
      hauteur: 47,
      images: 2,
    },
    (pl, t, image) => {
      const blanc = t.tons("#fbf8f0", "#ece7da", "#cbc5b6");
      const [noir, rouge] = [t.c("#2a2a32"), t.c("#d2482e")];
      const brindilles = [t.c("#a67a4c"), t.c("#7c5a38"), t.c("#5a4028")] as const;
      // Le nid : un large coussin de branches, des brindilles qui dépassent.
      ovale(pl, 19, 41.5, 17, 4.4, (i, j) => brindilles[Math.floor(alea(Math.floor(i / 2), j) * 3)]!);
      ligne(pl, 2, 39, 6, 37, brindilles[1]);
      ligne(pl, 33, 37, 38, 38, brindilles[0]);
      ligne(pl, 12, 37, 9, 35, brindilles[2]);
      ligne(pl, 27, 37, 30, 35, brindilles[1]);
      // La cigogne.
      poly(pl, [[11, 21], [5, 30], [12, 29], [18, 26]], noir);
      boule(pl, 18, 23, 8.2, 5.6, blanc);
      chemin(pl, [[11, 24], [15, 27], [21, 27]], noir);
      if (image === 0) {
        chemin(pl, [[23, 20], [25, 13], [25, 8]], blanc[1], 2);
        ovale(pl, 26.5, 6.4, 2.7, 2.3, blanc[0]);
        ligne(pl, 29, 7, 36, 9, rouge);
        pl.rect(29, 8, 4, 1, rouge);
        pl.poser(27, 6, t.trait);
      } else {
        chemin(pl, [[23, 20], [24, 13], [22, 8]], blanc[1], 2);
        ovale(pl, 23, 6, 2.7, 2.3, blanc[0]);
        ligne(pl, 25, 5, 31, 0, rouge);
        ligne(pl, 25, 6, 29, 3, rouge);
        pl.poser(23, 5, t.trait);
      }
      cerner(pl, t.trait);
      ligne(pl, 17, 29, 17, 38, rouge);
      chemin(pl, [[20, 29], [21, 34], [20, 38]], rouge);
    },
  ),
  figurant(
    {
      id: "corbeau-pose",
      nom: "un corbeau posé",
      description: "Un corbeau noir posé, qui penche la tête d'un côté puis de l'autre pour regarder le village. Sur un faîte, un piquet de la palissade ou la tour, de l'aube au crépuscule ; il ne bouge pas de sa place.",
      milieu: "toit",
      allure: "posee",
      quand: ["aube", "jour", "crepuscule"],
      largeur: 20,
      hauteur: 16,
      images: 2,
    },
    (pl, t, image) => {
      const noir = t.tons("#56566c", "#343442", "#20202a");
      poly(pl, [[5, 9], [1, 13], [4, 13], [7, 11]], noir[2]);
      boule(pl, 9, 8.6, 5.6, 4.2, noir);
      chemin(pl, [[5, 9], [9, 11], [12, 10]], noir[2]);
      const d = image;
      boule(pl, 13 + d, 4.6 + d, 3.1, 2.9, noir);
      pl.rect(16 + d, 4 + d, 3, 1, t.c("#6a6a76"));
      pl.rect(16 + d, 5 + d, 2, 1, t.c("#52525e"));
      pl.poser(14 + d, 4 + d, t.c("#d0d0d8"));
      pl.rect(8, 13, 1, 2, t.c("#52525e"));
      pl.rect(11, 13, 1, 2, t.c("#52525e"));
      cerner(pl, t.trait);
    },
  ),
  figurant(
    {
      id: "chouette-posee",
      nom: "une chouette posée",
      description: "Une chouette brune toute ronde, aux grands yeux d'ambre qu'elle ferme à demi, immobile. Sur un faîte, la poutre du grenier, la tour ou une branche basse, au crépuscule et la nuit ; elle ne bouge pas de sa place.",
      milieu: "toit",
      allure: "posee",
      quand: ["crepuscule", "nuit"],
      largeur: 18,
      hauteur: 22,
      images: 2,
    },
    (pl, t, image) => {
      const brun = t.tons("#cdae7e", "#a8875a", "#7e6240");
      const [clair, ambre] = [t.c("#f0e2c2", "#a8a2ac"), t.c("#e0a030", "#b08a3a")];
      boule(pl, 9, 13, 6.2, 6.8, brun);
      ovale(pl, 9.5, 14.5, 3.8, 4.6, (i, j) => ((i + j * 2) % 4 === 0 ? brun[2] : clair));
      chemin(pl, [[3, 11], [4, 16], [6, 19]], brun[2]);
      boule(pl, 9, 6, 6.2, 4.8, brun);
      ovale(pl, 6, 6.4, 2.5, 2.5, clair);
      ovale(pl, 12, 6.4, 2.5, 2.5, clair);
      for (const x of [5, 11]) {
        pl.rect(x, 6, 2, 2, ambre);
        pl.poser(x + 1, 7, t.trait);
        if (image === 1) pl.rect(x, 6, 2, 1, brun[1]);
      }
      pl.rect(9, 8, 1, 2, t.c("#c98a3a"));
      pl.rect(6, 20, 2, 1, t.c("#c98a3a"));
      pl.rect(11, 20, 2, 1, t.c("#c98a3a"));
      cerner(pl, t.trait);
    },
  ),
  figurant(
    {
      id: "chat-assis",
      nom: "un chat noir assis",
      description: "Un chat noir assis bien droit, de profil, qui regarde au loin ; seul le bout de sa queue bouge. Sur un faîte, un mur ou le rempart, au crépuscule, la nuit ou à l'aube ; il ne bouge pas de sa place.",
      milieu: "toit",
      allure: "posee",
      quand: ["crepuscule", "nuit", "aube"],
      largeur: 18,
      hauteur: 21,
      images: 2,
    },
    (pl, t, image) => {
      const noir = t.tons("#55556a", "#353544", "#22222c");
      chemin(pl, [[4, 18], [1, 16], [1 + image, 12], [2 + image * 2, 10]], noir[1], 2);
      boule(pl, 8, 13.4, 4.8, 5.8, noir);
      pl.rect(10, 13, 3, 6, noir[1]);
      pl.rect(10, 18, 4, 1, noir[0]);
      poly(pl, [[8, 3], [9, 0], [11, 2]], noir[2]);
      poly(pl, [[11, 2], [13, 0], [14, 3]], noir[1]);
      boule(pl, 11, 5.4, 3.7, 3.2, noir);
      pl.poser(13, 5, t.c("#c8d860", "#a8b858"));
      pl.poser(15, 6, t.c("#8a6a6a"));
      cerner(pl, t.trait);
    },
  ),
];
