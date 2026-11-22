/**
 * Les défis d'entraînement du duel « Coup pour coup » (chantier 6, 22 novembre 2026) : de petites énigmes, des plus simples
 * aux plus rusées. Chacune apprend une seule chose : un mot-clé, une panoplie ou une règle de base (`lecon`). Design de
 * Claude Fable 5.2 ; un solveur prouve dans les tests que chacune a une solution, qu'au moins un premier coup ne mène à
 * rien, et que jouer au hasard réussit au plus une fois sur deux (`tests/unit/duel-defis.test.ts`). Une partie de défi se
 * joue par `partie.ts`.
 *
 * - `but` : « gagner », abattre l'autre en `manches` manches au plus ; « survivre », être encore debout après `manches`
 *   manches (gagner avant compte aussi).
 * - `manche` : le numéro de la première manche (la fatigue frappe dès la sixième).
 * - `toi` et `lui` : la main (de 2 à 5 objets, l'ordre compte pour `repos`), la vie, l'énergie (6 au plus, le plafond), et
 *   au besoin l'élan, les manches de repos qui restent à chaque carte, les saignements (manches qui restent à chacun) et
 *   les souffles déjà pris. La main d'un défi n'est pas une main de duel : elle peut tenir deux armes ou deux hauts, pour
 *   isoler la leçon. Une panoplie enseignée, elle, se réunit comme dans une vraie main (une pièce par emplacement).
 * - `adversaire` : `annonce`, la carte que l'autre jouera à chaque manche, montrée au joueur (si elle se repose, il joue sa
 *   première carte prête) ; ou « libre » : il faut réussir quoi que l'autre joue.
 *
 * Des données seules, sans rien de Node ni de Deno.
 */
import type { IdDeLieu, IdDePanoplie, MotCle } from "../effets.ts";

/** Les règles de base qu'un défi peut apprendre, en plus des mots-clés et des panoplies. */
export const REGLES_DE_BASE = ["garde", "coup-de-tete", "souffle", "pieds", "essouffle", "repos", "enchainement", "fatigue"] as const;
export type RegleDeBase = (typeof REGLES_DE_BASE)[number];

/** Ce qu'apprend un défi. */
export type LeconDuDefi = MotCle | `panoplie:${IdDePanoplie}` | RegleDeBase;

/** Un camp d'un défi, tel qu'il est posé à la première manche. */
export interface CampDuDefi {
  readonly main: readonly string[];
  readonly vie: number;
  readonly vieMax?: number;
  readonly energie: number;
  readonly elan?: number;
  readonly repos?: readonly number[];
  readonly saignes?: readonly number[];
  readonly souffles?: number;
}

/** Un défi d'entraînement. */
export interface Defi {
  readonly id: string;
  readonly titre: string;
  readonly consigne: string;
  readonly lecon: LeconDuDefi;
  readonly indice: string;
  readonly but: { readonly type: "gagner" | "survivre"; readonly manches: number };
  readonly manche: number;
  readonly lieu: IdDeLieu | null;
  readonly toi: CampDuDefi;
  readonly lui: CampDuDefi;
  readonly adversaire: { readonly annonce: readonly string[] } | "libre";
}

export const DEFIS: readonly Defi[] = [
  {
    id: "la-garde-renvoie",
    titre: "La garde renvoie",
    consigne: "Gagne en une manche.",
    lecon: "garde",
    indice: "Une garde rend le coup à celui qui frappe.",
    but: { type: "gagner", manches: 1 },
    manche: 1,
    lieu: null,
    toi: { main: ["gourdin", "tunique", "braies"], vie: 2, energie: 3 },
    lui: { main: ["gourdin", "bonnet"], vie: 2, energie: 3 },
    adversaire: { annonce: ["gourdin"] },
  },
  {
    id: "les-pieds-d-abord",
    titre: "Les pieds d'abord",
    consigne: "Gagne en deux manches.",
    lecon: "pieds",
    indice: "Les pieds ne frappent pas : ils donnent leur force au coup d'après.",
    but: { type: "gagner", manches: 2 },
    manche: 1,
    lieu: null,
    toi: { main: ["gourdin", "bottes", "tunique"], vie: 10, energie: 3 },
    lui: { main: ["bottes", "braies"], vie: 4, energie: 3 },
    adversaire: { annonce: ["bottes", "braies"] },
  },
  {
    id: "coup-de-tete",
    titre: "Le coup de tête",
    consigne: "Gagne en deux manches.",
    lecon: "coup-de-tete",
    indice: "Un coup de tête coupe le souffle joué en face.",
    but: { type: "gagner", manches: 2 },
    manche: 1,
    lieu: null,
    toi: { main: ["gourdin", "bonnet", "tunique"], vie: 10, energie: 3 },
    lui: { main: ["braies", "bottes"], vie: 4, energie: 3 },
    adversaire: { annonce: ["braies", "bottes"] },
  },
  {
    id: "reprendre-son-souffle",
    titre: "Reprendre son souffle",
    consigne: "Reste debout deux manches.",
    lecon: "souffle",
    indice: "Le souffle rend de la vie après le coup reçu.",
    but: { type: "survivre", manches: 2 },
    manche: 1,
    lieu: null,
    toi: { main: ["gourdin", "bonnet", "braies"], vie: 4, energie: 3 },
    lui: { main: ["gourdin", "bonnet"], vie: 20, energie: 3 },
    adversaire: { annonce: ["gourdin", "bonnet"] },
  },
  {
    id: "a-bout-de-souffle",
    titre: "À bout de souffle",
    consigne: "Gagne en une manche.",
    lecon: "essouffle",
    indice: "Sans assez d'énergie, la plus belle carte ne frappe que 1.",
    but: { type: "gagner", manches: 1 },
    manche: 1,
    lieu: null,
    toi: { main: ["hache-double", "gourdin", "tunique"], vie: 10, energie: 1 },
    lui: { main: ["braies", "bottes"], vie: 2, energie: 3 },
    adversaire: { annonce: ["braies"] },
  },
  {
    id: "chaque-chose-en-son-temps",
    titre: "Chaque chose en son temps",
    consigne: "Gagne en deux manches.",
    lecon: "repos",
    indice: "Une carte jouée se repose deux manches : ne la gâche pas sur une garde.",
    but: { type: "gagner", manches: 2 },
    manche: 1,
    lieu: null,
    toi: { main: ["hache", "tunique", "braies"], vie: 10, energie: 3 },
    lui: { main: ["tunique", "bottes"], vie: 4, energie: 3 },
    adversaire: { annonce: ["tunique", "bottes"] },
  },
  {
    id: "coup-sur-coup",
    titre: "Coup sur coup",
    consigne: "Gagne en deux manches.",
    lecon: "enchainement",
    indice: "Un coup qui porte donne 1 d'élan au coup d'après.",
    but: { type: "gagner", manches: 2 },
    manche: 1,
    lieu: null,
    toi: { main: ["gourdin", "bonnet", "tunique"], vie: 10, energie: 3 },
    lui: { main: ["bottes", "braies"], vie: 5, energie: 3 },
    adversaire: { annonce: ["bottes", "braies"] },
  },
  {
    id: "la-fatigue-monte",
    titre: "La fatigue monte",
    consigne: "Reste debout deux manches.",
    lecon: "fatigue",
    indice: "La fatigue coûte plus à chaque manche : garde ton souffle pour la pire.",
    but: { type: "survivre", manches: 2 },
    manche: 7,
    lieu: null,
    toi: { main: ["tunique", "braies", "gourdin"], vie: 5, energie: 3 },
    lui: { main: ["gourdin", "bottes"], vie: 30, energie: 3 },
    adversaire: { annonce: ["gourdin", "bottes"] },
  },
  {
    id: "la-fleche-passe",
    titre: "La flèche passe",
    consigne: "Gagne en une manche.",
    lecon: "perce",
    indice: "Une carte qui perce retire de la force à la garde d'en face.",
    but: { type: "gagner", manches: 1 },
    manche: 1,
    lieu: null,
    toi: { main: ["arc", "hache-double", "bonnet"], vie: 10, energie: 3 },
    lui: { main: ["cape-capuche", "gourdin"], vie: 3, energie: 3 },
    adversaire: { annonce: ["cape-capuche"] },
  },
  {
    id: "la-plaie-travaille",
    titre: "La plaie travaille",
    consigne: "Gagne en deux manches.",
    lecon: "saigne",
    indice: "Une plaie fait encore perdre 1 de vie à la manche suivante, même derrière une garde.",
    but: { type: "gagner", manches: 2 },
    manche: 1,
    lieu: null,
    toi: { main: ["epee-courte", "rateau", "tunique"], vie: 10, energie: 3 },
    lui: { main: ["bottes", "cotte-mailles"], vie: 5, energie: 3 },
    adversaire: { annonce: ["bottes", "cotte-mailles"] },
  },
  {
    id: "sonne-le-d-abord",
    titre: "Sonne-le d'abord",
    consigne: "Gagne en deux manches.",
    lecon: "assomme",
    indice: "Assommé, il n'aura plus l'énergie de payer sa masse : elle frappera bien moins fort.",
    but: { type: "gagner", manches: 2 },
    manche: 1,
    lieu: null,
    toi: { main: ["fleau-armes", "hache-double", "tunique"], vie: 6, energie: 3 },
    lui: { main: ["bottes", "masse"], vie: 9, energie: 1 },
    adversaire: { annonce: ["bottes", "masse"] },
  },
  {
    id: "la-braise-suffit",
    titre: "La braise suffit",
    consigne: "Gagne en une manche.",
    lecon: "brule",
    indice: "Une carte qui brûle fait perdre de la vie même à celui qui garde.",
    but: { type: "gagner", manches: 1 },
    manche: 1,
    lieu: null,
    toi: { main: ["torche", "hache", "bottes"], vie: 5, energie: 3 },
    lui: { main: ["cotte-mailles", "gourdin"], vie: 1, energie: 3 },
    adversaire: { annonce: ["cotte-mailles"] },
  },
  {
    id: "vite-remise",
    titre: "Vite remise",
    consigne: "Reste debout trois manches.",
    lecon: "vif",
    indice: "Une carte vive ne se repose qu'une manche : elle revient pour le troisième coup.",
    but: { type: "survivre", manches: 3 },
    manche: 1,
    lieu: null,
    toi: { main: ["cape-voyage", "tunique", "braies"], vie: 2, energie: 3 },
    lui: { main: ["gourdin", "bonnet", "coutelas"], vie: 20, energie: 3 },
    adversaire: { annonce: ["gourdin", "bonnet", "coutelas"] },
  },
  {
    id: "encaisse-d-abord",
    titre: "Encaisse d'abord",
    consigne: "Gagne en deux manches.",
    lecon: "rage",
    indice: "La rage ne monte que si tu as moins de vie que lui.",
    but: { type: "gagner", manches: 2 },
    manche: 1,
    lieu: null,
    toi: { main: ["masque-bois", "bottes", "braies"], vie: 9, energie: 3 },
    lui: { main: ["gourdin", "bottes"], vie: 8, energie: 3 },
    adversaire: { annonce: ["gourdin", "bottes"] },
  },
  {
    id: "pris-dans-la-glace",
    titre: "Pris dans la glace",
    consigne: "Reste debout trois manches.",
    lecon: "gel",
    indice: "Le gel fait dormir une manche de plus la carte posée en face.",
    but: { type: "survivre", manches: 3 },
    manche: 1,
    lieu: null,
    toi: { main: ["manteau-fourrure", "gourdin", "braies"], vie: 4, energie: 3 },
    lui: { main: ["capuche", "bottes", "tunique"], vie: 20, energie: 3 },
    adversaire: { annonce: ["capuche", "bottes", "capuche"] },
  },
  {
    id: "l-ardeur-recharge",
    titre: "L'ardeur recharge",
    consigne: "Gagne en deux manches.",
    lecon: "ardeur",
    indice: "L'ardeur rend de l'énergie : de quoi payer la grande épée à la manche suivante.",
    but: { type: "gagner", manches: 2 },
    manche: 1,
    lieu: null,
    toi: { main: ["haut-de-forme", "hache-double", "epee-or"], vie: 10, energie: 3 },
    lui: { main: ["bottes", "braies"], vie: 13, energie: 3 },
    adversaire: { annonce: ["bottes", "braies"] },
  },
  {
    id: "la-fanfare-s-emballe",
    titre: "La fanfare s'emballe",
    consigne: "Gagne en deux manches.",
    lecon: "panoplie:fanfare",
    indice: "Avec le maillot du clan, un coup qui porte donne 2 d'élan au lieu de 1.",
    but: { type: "gagner", manches: 2 },
    manche: 1,
    lieu: null,
    toi: { main: ["cor-guerre", "maillot-clan", "bonnet"], vie: 10, energie: 3 },
    lui: { main: ["bottes", "braies"], vie: 9, energie: 3 },
    adversaire: { annonce: ["bottes", "braies"] },
  },
  {
    id: "qui-s-y-frotte",
    titre: "Qui s'y frotte",
    consigne: "Gagne en une manche, quoi qu'il joue.",
    lecon: "epines",
    indice: "Les épines piquent celui qui cogne, en plus de ce que la garde renvoie.",
    but: { type: "gagner", manches: 1 },
    manche: 1,
    lieu: null,
    toi: { main: ["gilet-cuir-cloute", "cotte-mailles", "gourdin"], vie: 2, energie: 3 },
    lui: { main: ["gourdin", "bonnet"], vie: 4, energie: 3 },
    adversaire: "libre",
  },
  {
    id: "debout-tout-le-monde",
    titre: "Debout tout le monde",
    consigne: "Gagne en trois manches.",
    lecon: "reveil",
    indice: "Le réveil fait revenir tes cartes au repos : ton arc peut tirer deux fois.",
    but: { type: "gagner", manches: 3 },
    manche: 1,
    lieu: null,
    toi: { main: ["arc", "braies-royales", "bottes"], vie: 10, energie: 6 },
    lui: { main: ["bonnet", "bottes", "braies"], vie: 10, energie: 3 },
    adversaire: { annonce: ["bonnet", "bottes", "braies"] },
  },
  {
    id: "rien-ne-l-arrete",
    titre: "Rien ne l'arrête",
    consigne: "Gagne en deux manches, quoi qu'il joue.",
    lecon: "inarretable",
    indice: "Ni garde ni rempart n'arrêtent cette lance : donne-lui d'abord de l'élan.",
    but: { type: "gagner", manches: 2 },
    manche: 1,
    lieu: null,
    toi: { main: ["lance-ceremonie", "bottes", "tunique"], vie: 3, energie: 6 },
    lui: { main: ["cotte-mailles", "gourdin", "braies"], vie: 9, energie: 3 },
    adversaire: "libre",
  },
];
