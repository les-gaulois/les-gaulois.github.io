/**
 * L'insigne du duelliste de la semaine (duel « Coup pour coup » de « Mon Gaulois », demande du pilote du 22 novembre 2026 :
 * « Le tableau des duellistes de la semaine, avec un insigne pour le premier »). Le premier du tableau de la semaine le
 * reçoit le mardi à 21 h 30 et le garde pour toujours, une fois par semaine gagnée ; il se montre sur sa carte et à côté
 * de son nom dans le tableau, avec le nombre de semaines gagnées.
 *
 * Au format des insignes de saison (`insignes-de-saison.ts`) : 24 cases de côté, une lettre par couleur, « . » pour une
 * case vide ; un contour marine, puis un liseré clair, puis le dessin, pour se lire sur la page blanche du thème clair
 * comme sur le bleu marine du thème sombre. Une image fixe, sans animation.
 *
 * Le dessin : un écu à pointe, bordé d'or, parti de bleu (toi) et de rouge (celui d'en face), les deux couleurs des cartes
 * du duel ; au milieu, l'éclat d'or du coup porté, une étoile à quatre branches. Sa forme d'écu le sépare de l'insigne du
 * solstice (un médaillon rond) et des insignes des paliers de victoires (`src/lib/jeu/paliers-de-victoires.ts`), dont
 * aucun n'est parti de deux couleurs.
 *
 * Dessin original de Claude Fable 5.2, fait pour le clan [GAL] ; il n'emprunte rien à une œuvre existante.
 */
export interface InsigneDuDuel {
  nom: string;
  /** La couleur « #rrggbb » de chaque lettre des lignes. */
  couleurs: Readonly<Record<string, string>>;
  /** 24 lignes de 24 caractères ; « . » pour une case vide. */
  lignes: readonly string[];
}

export const INSIGNE_DU_DUEL: InsigneDuDuel = {
  nom: "Insigne du duelliste de la semaine",
  // Le contour (k) et le liseré (w), l'or du bord et de l'éclat (E sa lumière, y, g, G son ombre), le bleu (c sa lumière,
  // b, B son ombre) et le rouge (p sa lumière, r, R son ombre) des deux duellistes.
  couleurs: { k: "#081028", w: "#eaf6ff", E: "#fff7cf", y: "#ffd84a", g: "#e2ac1c", G: "#a87a10", c: "#7fa8ff", b: "#2f6bff", B: "#173a94", p: "#ff7d85", r: "#e0263a", R: "#9c1424" },
  lignes: [
    "...kkkkkkkkkkkkkkkkkk...",
    ".kkkwwwwwwwwwwwwwwwwkkk.",
    "kkwwwEEEEyyyyyyyyyywwwkk",
    "kwwyyyccbbbbppppppyGGwwk",
    "kwyyccccbbbbppppppppGGwk",
    "kwycccccbbbkkrrrrrrrrGwk",
    "kwycccccbbkyykrrrrrrrGwk",
    "kwybbbbbbkkyykkrrrrrrGwk",
    "kwybbbbbkykyykykrrrrrGwk",
    "kwybbbbkkkyEEykkkrrrrGwk",
    "kwybbbkyyyEEEEgggkrrRGwk",
    "kwybbbkyyyEEEEgggkrRRGwk",
    "kwyybbbkkkyEEgkkkrRRGGwk",
    "kwwybbbbkykggkgkrRRRGwwk",
    "kkwyybbbbkkggkkrRRRGGwkk",
    ".kwwyybbBBkggkrRRRGGwwk.",
    ".kkwwyGBBBBkkrRRRGGwwkk.",
    "..kkwwGGBBBBrRRRGGwwkk..",
    "...kkwwGGGBBRRGGGwwkk...",
    "....kkwwwGGBRGGwwwkk....",
    ".....kkkwwGGGGwwkkk.....",
    ".......kkwwwwwwkk.......",
    "........kkkwwkkk........",
    "..........kkkk..........",
  ],
};

/** Le côté de l'insigne, en cases. */
export const COTE_DE_L_INSIGNE_DU_DUEL = 24;

/** Les cases de l'insigne, une par pixel, ligne après ligne : sa couleur « #rrggbb », ou `null` pour une case vide. */
export function casesDeLInsigneDuDuel(): (string | null)[] {
  return INSIGNE_DU_DUEL.lignes.flatMap((ligne) => [...ligne].map((lettre) => (lettre === "." ? null : (INSIGNE_DU_DUEL.couleurs[lettre] ?? null))));
}
