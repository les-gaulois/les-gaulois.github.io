/**
 * Les insignes de saison du pass de « Mon Gaulois » (décision du pilote, 21 novembre 2026) : au 30e palier d'une saison, le
 * membre reçoit l'objet légendaire de la saison et cet insigne, montré sur sa carte. Un insigne par saison, en pixels, de
 * 24 cases de côté comme les icônes du jeu : une lettre par couleur, « . » pour une case vide.
 *
 * Chaque insigne se lit sur la page blanche du thème clair comme sur le bleu marine du thème sombre : un contour marine,
 * puis un liseré clair, puis le dessin. Une image fixe, sans animation.
 *
 * Saison 1 (17 novembre au 28 décembre 2026, l'entrée dans l'hiver) : le soleil du solstice, d'or sur le bleu du clan, et
 * devant lui un « 1 » taillé dans la glace, comme les cristaux de la « Couronne du solstice », l'objet de la saison
 * (`supabase/functions/code-discord/garde-robe/saison.ts`).
 *
 * Dessins originaux de Claude Fable 5.2, faits pour le clan [GAL] ; ils n'empruntent rien à une œuvre existante.
 */
export interface InsigneDeSaison {
  /** L'identifiant de la saison du pass : « saison-1 ». */
  saison: string;
  nom: string;
  /** La couleur « #rrggbb » de chaque lettre des lignes. */
  couleurs: Readonly<Record<string, string>>;
  /** 24 lignes de 24 caractères ; « . » pour une case vide. */
  lignes: readonly string[];
}

export const INSIGNES_DE_SAISON: readonly InsigneDeSaison[] = [
  {
    saison: "saison-1",
    nom: "Insigne du solstice",
    // Le contour (k) et le liseré (w), le bleu du clan (b, B son ombre), l'or du soleil (y, g, G, E son cœur), la glace du
    // « 1 » (q, i, p, P).
    couleurs: { k: "#081028", w: "#eaf6ff", b: "#1f4fc4", B: "#173a94", y: "#ffe07a", g: "#e2ac1c", G: "#a87a10", E: "#fff7cf", q: "#f6fcff", i: "#bfeaff", p: "#7cc8f5", P: "#3f86d6" },
    lignes: [
      "........kkkkkkkk........",
      "......kkkwwwwwwkkk......",
      ".....kwwwbbbbbbwwwk.....",
      "...kkwwbbbbyybbbbwwkk...",
      "...kwwbbbbbkkkbbbbwwk...",
      "..kwwybbbykqipkbbbywwk..",
      ".kwwbbbyykqqipkggbbbwwk.",
      ".kwbbbyykqqqipkgggbbbwk.",
      "kkwbbbyykqqqipkgggbbbwkk",
      "kwbbbyyyykkqipkggggbbbwk",
      "kwbbbyyyEEkqipkEggGbbBwk",
      "kwbybyyyEEkqipkEgGGbyBwk",
      "kwbybyygEEkqiPkEGGGByBwk",
      "kwbbbyggEEkqiPkEGGGBBBwk",
      "kwbbbggggEkqiPkGGGGBBBwk",
      "kkwbbbgggkkqiPkkGGBBBwkk",
      ".kwbbbggkqqqipPPkGBBBwk.",
      ".kwwbbbgkiiPPPPPkBBBwwk.",
      "..kwwybbbkkkkkkkBBywwk..",
      "...kwwbbbbbbBBBBBBwwk...",
      "...kkwwbbbbyyBBBBwwkk...",
      ".....kwwwbBBBBBwwwk.....",
      "......kkkwwwwwwkkk......",
      "........kkkkkkkk........",
    ],
  },
];

/** L'insigne d'une saison, ou `null` si elle n'en a pas. */
export const insigneDeLaSaison = (saison: string): InsigneDeSaison | null => INSIGNES_DE_SAISON.find((insigne) => insigne.saison === saison) ?? null;

/** Le côté d'un insigne, en cases. */
export const COTE_DE_L_INSIGNE = 24;

/** Les cases d'un insigne, une par pixel, ligne après ligne : sa couleur « #rrggbb », ou `null` pour une case vide. */
export function casesDeLInsigne(insigne: InsigneDeSaison): (string | null)[] {
  return insigne.lignes.flatMap((ligne) => [...ligne].map((lettre) => (lettre === "." ? null : (insigne.couleurs[lettre] ?? null))));
}
