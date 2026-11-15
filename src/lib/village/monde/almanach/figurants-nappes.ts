/**
 * Les nappes : ce qui passe en voile devant le village (brume, pluie fine, fumée, feuilles et aigrettes portées par le
 * vent). Une case est pleine ou vide : le flou vient d'un tramage fixe (`trame`), jamais du hasard. Rien ne dit une
 * saison : les feuilles sont vertes, il n'y a ni neige ni givre. Design : Claude Fable 5.2.
 */
import { type Planche, alea } from "../../decor";
import { figurant, trame } from "./figurants-outils";
import type { Figurant } from "./type";

interface Bande {
  /** Sa rangée du milieu, sa demi-épaisseur, de combien elle ondule. */
  y: number;
  epais: number;
  onde: number;
}

/**
 * Un voile en bandes tramées : épais au cœur de chaque bande, troué sur ses bords, effacé aux deux bouts.
 * `force(x)` : de 0 à 1, pour l'effilocher le long de sa course.
 */
function voile(pl: Planche, bandes: readonly Bande[], phase: number, clair: string, sombre: string, force: (x: number) => number = () => 1): void {
  for (let x = 0; x < pl.largeur; x++) {
    const bout = Math.min(1, x / 48, (pl.largeur - 1 - x) / 48);
    for (let y = 0; y < pl.hauteur; y++) {
      let d = 0;
      bandes.forEach((b, k) => {
        const milieu = b.y + b.onde * Math.sin(x / 37 + k * 2.1 + phase);
        const demi = b.epais * (0.6 + 0.4 * Math.sin(x / 61 + k * 1.3 + phase * 0.7));
        d = Math.max(d, 1 - Math.abs(y - milieu) / demi);
      });
      d *= 0.9 * bout * force(x);
      if (d > trame(x, y)) pl.poser(x, y, d > 0.62 ? clair : sombre);
    }
  }
}

/** Les quatre façons de voir une petite feuille qui tourne sur elle-même. */
const FEUILLE = [
  [[0, 0], [1, 0], [2, 0], [1, -1]],
  [[0, 0], [1, 1], [2, 2], [1, 0]],
  [[0, 0], [0, 1], [0, 2], [1, 1]],
  [[2, 0], [1, 1], [0, 2], [1, 2]],
] as const;

/** La petite volte d'une feuille ou d'une graine autour de sa place : elle y revient à la fin de la boucle. */
const VOLTE = [[0, 0], [2, 1], [3, 3], [1, 2]] as const;

export const FIGURANTS_EN_NAPPE: readonly Figurant[] = [
  figurant(
    {
      id: "brume-du-matin",
      nom: "la brume du matin",
      description: "Trois longues bandes de brume claire qui flottent à mi-hauteur et laissent voir le village entre elles. Glisse très lentement devant le pré, le ruisseau ou le bas du village, à l'aube seulement.",
      milieu: "nappe",
      allure: "lente",
      quand: ["aube"],
      largeur: 480,
      hauteur: 64,
      images: 2,
    },
    (pl, t, image) => {
      const bandes = [{ y: 14, epais: 8, onde: 4 }, { y: 34, epais: 10, onde: 5 }, { y: 52, epais: 7, onde: 3 }];
      voile(pl, bandes, image * 0.8, t.c("#eef3f6", "#6c7a9c"), t.c("#d6e1ea", "#56648a"));
    },
  ),
  figurant(
    {
      id: "brume-sur-l-eau",
      nom: "un voile de brume au ras de l'eau",
      description: "Une bande de brume basse et mince, plus épaisse en bas, qui traîne au ras de l'eau. Sur le ruisseau, le lavoir ou le port, à l'aube, au crépuscule ou la nuit.",
      milieu: "nappe",
      allure: "lente",
      quand: ["aube", "crepuscule", "nuit"],
      largeur: 240,
      hauteur: 26,
      images: 2,
    },
    (pl, t, image) => {
      const bandes = [{ y: 8, epais: 5, onde: 2 }, { y: 19, epais: 8, onde: 2 }];
      voile(pl, bandes, 1.7 + image * 0.8, t.c("#e6eef2", "#6c7a9c"), t.c("#cbd9e4", "#56648a"));
    },
  ),
  figurant(
    {
      id: "pluie-fine",
      nom: "une pluie fine",
      description: "Un rideau de pluie fine, en petits traits penchés, qui laisse tout voir derrière lui. Passe sur une partie du village puis s'en va, à toute heure ; un arc-en-ciel peut le suivre de jour.",
      milieu: "nappe",
      allure: "lente",
      largeur: 240,
      hauteur: 180,
      images: 3,
    },
    (pl, t, image) => {
      const [goutte, pale] = [t.c("#a9c0d8", "#5a6c98"), t.c("#c6d8e8", "#6e80a8")];
      // Chaque goutte tombe de 12 cases par image et revient tous les 36 : la boucle des trois images est sans couture.
      for (let k = 0; k < 250; k++) {
        const x = 2 + Math.floor(alea(k, 3) * 236);
        const y = (Math.floor(alea(k, 11) * 15) * 12 + Math.floor(alea(k, 19) * 12) + image * 12) % 180;
        const ton = k % 3 === 0 ? pale : goutte;
        // Les bords du rideau sont plus clairsemés.
        if ((x < 30 || x > 210) && k % 2 === 0) continue;
        pl.poser(x, y, ton);
        pl.poser(x, (y + 1) % 180, ton);
        pl.poser(x - 1, (y + 2) % 180, ton);
        if (k % 2 === 0) pl.poser(x - 1, (y + 3) % 180, ton);
      }
    },
  ),
  figurant(
    {
      id: "feuilles-au-vent",
      nom: "des feuilles portées par le vent",
      description: "Une vingtaine de petites feuilles vertes qui tournoient et descendent en biais dans un coup de vent. Passe devant les arbres, le grand chêne ou la lisière, de jour.",
      milieu: "nappe",
      allure: "pas",
      quand: ["aube", "jour", "crepuscule"],
      largeur: 180,
      hauteur: 88,
      images: 4,
    },
    (pl, t, image) => {
      const verts = [t.c("#6aa84a"), t.c("#8cc060"), t.c("#4a8a3a"), t.c("#b4c65a")] as const;
      for (let k = 0; k < 24; k++) {
        const [vx, vy] = VOLTE[(k + image) % 4]!;
        const x = 1 + Math.floor(alea(k, 5) * 172) + vx;
        const y = 2 + Math.floor(alea(k, 17) * 78) + vy;
        for (const [dx, dy] of FEUILLE[(k + image) % 4]!) pl.poser(x + dx, y + dy, verts[k % 4]!);
      }
    },
  ),
  figurant(
    {
      id: "fumee-qui-traine",
      nom: "une fumée qui traîne",
      description: "Un long ruban de fumée grise, épais d'un côté, qui s'effiloche de l'autre. Traîne au-dessus des toits, du four ou de la forge, couché par le vent, à toute heure.",
      milieu: "nappe",
      allure: "lente",
      largeur: 220,
      hauteur: 40,
      images: 2,
    },
    (pl, t, image) => {
      const bandes = [{ y: 13, epais: 7, onde: 5 }, { y: 26, epais: 6, onde: 6 }];
      voile(pl, bandes, 0.6 + image * 0.9, t.c("#d6d0c8", "#646478"), t.c("#b8b2ac", "#4c4e66"), (x) => 0.35 + 0.65 * (1 - x / 220));
    },
  ),
  figurant(
    {
      id: "aigrettes",
      nom: "des aigrettes de pissenlit",
      description: "Une quinzaine de graines à plumet clair qui flottent dans l'air, portées par un souffle. Dérive devant le pré, les jardins ou la place, en plein jour.",
      milieu: "nappe",
      allure: "lente",
      quand: ["jour"],
      largeur: 150,
      hauteur: 70,
      images: 3,
    },
    (pl, t, image) => {
      const [plumet, graine] = [t.c("#f4f0de"), t.c("#8a7a55")];
      for (let k = 0; k < 15; k++) {
        const [vx, vy] = VOLTE[(k + image) % 3]!;
        const x = 1 + Math.floor(alea(k, 23) * 144) + vx;
        const y = 2 + Math.floor(alea(k, 31) * 62) - vy;
        pl.poser(x - 1, y, plumet);
        pl.poser(x + 1, y, plumet);
        pl.poser(x, y - 1, plumet);
        pl.poser(x, y + 1, plumet);
        pl.poser(x, y + 2, graine);
      }
    },
  ),
];
