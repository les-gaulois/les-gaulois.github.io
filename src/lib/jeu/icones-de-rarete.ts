/**
 * Les icônes des raretés de « Mon Gaulois » (dessin de Claude Fable 5.2, 21 novembre 2026, demande du pilote : « des icônes
 * aussi pour commun, peu commun, épique, etc. au lieu de * ** *** **** ***** »). Elles remplacent les losanges qui comptaient
 * la rareté (un à cinq, six pour le divin). Chacune a la couleur de sa rareté et une forme à elle, qui s'enrichit de l'une à
 * l'autre : la couleur n'est jamais le seul repère.
 *
 * - commun : une perle ronde ;
 * - peu commun : un losange taillé ;
 * - épique : une étoile à quatre branches ;
 * - mystique : une gemme taillée, large, avec son éclat ;
 * - légendaire : une couronne d'or à trois pointes, sertie de rouge ;
 * - légendaire de saison : une couronne sertie de vert d'où se lève un soleil clair et ses rayons (celle du dernier palier du pass) ;
 * - divin : un grand sceau turquoise frappé d'une étoile d'or.
 *
 * Une seule version pour les deux thèmes : le cerne d'encre les détache d'un fond clair, leurs lumières d'un fond sombre.
 * Ce module n'importe que la planche et la palette : il sert aussi hors du jeu (l'inscription de « Mon compte »).
 * Voir « Le kit du jeu » dans docs/DESIGN.md.
 */
import { ENCRE } from "./palette";
import { type Planche, cerne, grille } from "./planche";

export const RARETES_ILLUSTREES = ["commun", "peu-commun", "epique", "mystique", "legendaire", "saison", "divin"] as const;
export type RareteIllustree = (typeof RARETES_ILLUSTREES)[number];

/** Le côté des icônes de rareté, en cases (elles sont carrées). */
export const COTE_DES_ICONES_DE_RARETE = 11;

/** Les teintes d'une icône : `L` lumière, `M` corps (la couleur de la rareté), `D` ombre, `W` éclat, et ses pierres. */
type Teintes = Readonly<Record<string, string>>;
const BLANC = "#ffffff";
const OR: Teintes = { L: "#ffe9a0", M: "#f2b632", D: "#a8700a", W: BLANC };

/** La couleur de chaque rareté, celle des cases du site. */
export const COULEURS_DES_RARETES: Readonly<Record<RareteIllustree, string>> = {
  commun: "#4aa3ff",
  "peu-commun": "#3a4fe8",
  epique: "#9b4dff",
  mystique: "#ff2e4a",
  legendaire: "#f2b632",
  saison: "#f2b632",
  divin: "#19d3c5",
};

/** Les dessins, en rangées de lettres, sans leur cerne (posé ensuite) : une marge d'une case tout autour. */
const DESSINS: Readonly<Record<RareteIllustree, { rangees: readonly string[]; teintes: Teintes }>> = {
  commun: {
    teintes: { L: "#b5dcff", M: "#4aa3ff", D: "#1d6fd0", W: BLANC },
    rangees: ["...........", "...........", "...........", "....LLM....", "...LWMMM...", "...LMMMD...", "...MMMDD...", "....MDD....", "...........", "...........", "..........."],
  },
  "peu-commun": {
    teintes: { L: "#a3aeff", M: "#3a4fe8", D: "#2430a8", W: BLANC },
    rangees: ["...........", "...........", ".....L.....", "....LWM....", "...LWMMM...", "..LLMMMMD..", "...MMMDD...", "....MDD....", ".....D.....", "...........", "..........."],
  },
  epique: {
    teintes: { L: "#d6b3ff", M: "#9b4dff", D: "#6a22cf", W: BLANC },
    rangees: ["...........", ".....L.....", ".....L.....", "....LWM....", "...LWMMM...", ".LLMMMMMDD.", "...MMMDD...", "....MDD....", ".....D.....", ".....D.....", "..........."],
  },
  mystique: {
    teintes: { L: "#ff9aa6", M: "#ff2e4a", D: "#b8122a", W: BLANC },
    rangees: ["...........", "...........", "..LLLLMMM..", ".LLWLMMMMD.", ".LWWWMMMDD.", "..LWMMMMD..", "...LMMMD...", "....MMD....", ".....D.....", "...........", "..........."],
  },
  legendaire: {
    teintes: { ...OR, R: "#e0263a", P: "#ff8a8f" },
    rangees: ["...........", ".W...W...M.", ".L...L...M.", ".LM.LMM.MD.", ".LMMMMMMMD.", ".LMRMPRMRD.", ".LMMMMMMDD.", "...........", ".LLMMMMMDD.", "...........", "..........."],
  },
  saison: {
    teintes: { ...OR, G: "#2fb85a", H: "#c4f9cb", Q: "#fff1a8" },
    rangees: ["...........", ".....W.....", ".Q..WWW..Q.", "...WWQWW...", ".L.WQQQW.M.", ".LMLMMMMMD.", ".LMGMHGMGD.", ".LMMMMMMDD.", "...........", ".LLMMMMMDD.", "..........."],
  },
  divin: {
    teintes: { L: "#b5f5ee", M: "#19d3c5", D: "#0b7f77", W: BLANC, Y: "#ffd84a", O: "#d9a21b" },
    rangees: ["...........", "...LLLLM...", "..LMMYMMM..", ".LMMMYMMMD.", ".LMMYYOMMD.", ".LYYYWYOOD.", ".LMMYYOMMD.", ".MMMMYMMDD.", "..MMMOMDD..", "...MDDDD...", "..........."],
  },
};

const DEJA = new Map<RareteIllustree, Planche>();

/** L'icône d'une rareté, sur 11 cases. Dessinée une fois : ne pas peindre dessus, la recopier (`drawImage`). */
export function iconeDeRarete(rarete: RareteIllustree): Planche {
  let p = DEJA.get(rarete);
  if (!p) {
    const d = DESSINS[rarete];
    p = cerne(grille(d.rangees, d.teintes), ENCRE);
    DEJA.set(rarete, p);
  }
  return p;
}

/** Les raretés dans l'ordre de leur rang, de 1 (commun) à 6 (divin). La saison n'a pas de rang à elle : elle se nomme. */
const PAR_RANG = ["commun", "peu-commun", "epique", "mystique", "legendaire", "divin"] as const satisfies readonly RareteIllustree[];

/** La rareté d'un rang de 1 à 6, pour ce qui ne connaît que le rang (les lots de statères, la face des cartes) ; au-delà, la plus proche. */
export function rareteDuRang(rang: number): RareteIllustree {
  return PAR_RANG[Math.min(PAR_RANG.length, Math.max(1, Math.round(rang))) - 1]!;
}
