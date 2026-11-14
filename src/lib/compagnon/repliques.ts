/**
 * Ce que dit le Gaulois compagnon, dans sa bulle (`src/scripts/compagnon.ts`) : le petit Gaulois du village qui suit le
 * visiteur de page en page, demandé par le pilote le 14 novembre 2026. Il ne parle que si on le touche, sauf un salut à
 * sa première apparition.
 *
 * Les règles, celles du guerrier de l'accueil (`src/lib/fx/repliques.ts`) : aucun chiffre (une réplique n'annonce ni
 * rang, ni score, ni résultat), aucune référence à Astérix, ni argent ni monnaie (statères compris), pas d'emoji, aucun
 * signe d'informaticien, du français de tous les jours, une phrase courte qui tient sur deux lignes de la bulle. Un test
 * les vérifie (`tests/unit/compagnon-repliques.test.ts`). Et ce qu'aucun test ne sait voir, à relire à chaque ajout :
 * aucun conseil de jeu, rien d'inventé sur le clan ou sur un joueur. Ce sont des mots de personnage, pas des faits.
 */
import { SECTIONS } from "../nav";

/** Ce qu'il dit quand on le touche, sur n'importe quelle page. La première est son salut. */
export const REPLIQUES: readonly string[] = [
  "Salut ! On y va ?",
  "Je ne suis jamais loin.",
  "Doucement, j'ai de petites jambes.",
  "Un Gaulois ne se perd jamais.",
  "Tu lis, je monte la garde.",
  "Belle page, non ?",
];

/** L'accueil n'a pas de rubrique dans le plan du site. */
export const ACCUEIL = "Accueil";

/**
 * Sa première réponse sur une page, selon la rubrique : les noms sont ceux du menu (`SECTIONS`, `src/lib/nav.ts`). La
 * Carte n'en a pas : il n'y vient pas.
 */
export const REPLIQUES_DES_RUBRIQUES: Readonly<Record<string, string>> = {
  [ACCUEIL]: "Bienvenue chez les Gaulois.",
  Actu: "Quoi de neuf au village ?",
  Résultats: "Voyons où en est le clan.",
  Membres: "Que de beau monde ici.",
  Guides: "Je révise avec toi.",
  Rejoindre: "Entre, on ne mord pas.",
};

/** Ce qu'il répond à un geste : réveillé, posé à la main, rappelé pour suivre, et son invitation à l'habiller. */
export const REPLIQUES_DES_GESTES = {
  reveil: "Hein ? Je veillais.",
  pose: "Ici, c'est bien. Je reste.",
  suivre: "Je te suis.",
  invitation: "Habille-moi au village.",
} as const satisfies Record<string, string>;
export type Geste = keyof typeof REPLIQUES_DES_GESTES;

/** Toutes ses phrases, pour le test et la documentation. */
export const TOUTES_LES_REPLIQUES: readonly string[] = [...REPLIQUES, ...Object.values(REPLIQUES_DES_RUBRIQUES), ...Object.values(REPLIQUES_DES_GESTES)];

/** Une réplique a 34 lettres au plus : deux lignes de la bulle sur le plus petit téléphone. */
export const REPLIQUE_MAX = 34;

/** La rubrique d'une adresse, par son nom du menu ; l'accueil ; `null` pour une page hors du plan (compte, mentions). */
export function rubriqueDe(chemin: string): string | null {
  const net = chemin.replace(/\/$/, "") || "/";
  if (net === "/") return ACCUEIL;
  return SECTIONS.find((s) => s.pages.some((p) => net === p.href || net.startsWith(`${p.href}/`)))?.label ?? null;
}

/**
 * La réplique d'un clic. Le premier de la page : celle de la rubrique, s'il y en a une. Ensuite, celles de toutes les
 * pages, dans l'ordre que donne `suivante` (le tirage du guerrier, `tirage` de `src/lib/fx/repliques.ts` : jamais deux
 * fois la même à la suite).
 */
export function repliqueDuClic(rubrique: string | null, clics: number, suivante: () => number): string {
  const duLieu = rubrique === null ? undefined : REPLIQUES_DES_RUBRIQUES[rubrique];
  if (clics === 0 && duLieu) return duLieu;
  return REPLIQUES[suivante()] ?? REPLIQUES[0] ?? "";
}

/** Une espace qui ne se coupe pas, devant un point d'interrogation ou d'exclamation. */
const INSECABLE = String.fromCharCode(160);

/** La réplique prête à écrire : la ponctuation double reste collée à son mot. */
export const ponctuer = (replique: string): string => replique.replace(/ ([?!;:])/g, `${INSECABLE}$1`);

/** Le temps qu'une bulle ouverte reste sans qu'on s'en occupe : celui de la lire, de 6 à 9 secondes. */
export function dureeDeLaBulle(replique: string): number {
  return Math.min(9_000, Math.max(6_000, 4_500 + [...replique].length * 90));
}
