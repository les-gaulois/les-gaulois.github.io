/**
 * Ce que dit le guerrier de l'accueil, dans sa bulle (`src/scripts/holo.ts`) : des répliques de Gaulois qui joue à
 * OpenFront, façon terminal, demandées par le pilote le 12 novembre 2026. Décoratif, masqué aux lecteurs d'écran.
 *
 * Les règles : aucun chiffre (une réplique n'annonce ni rang, ni score, ni résultat), aucune référence à Astérix, ni
 * argent ni monnaie du jeu, pas d'emoji, deux lignes courtes au plus ; un test les vérifie. Et aucun conseil de jeu,
 * rien qui laisse entendre qu'on peut tricher : cela, aucun test ne sait le voir, il faut le relire à chaque ajout.
 * Une réplique qui commence par « $ » est une commande tapée ; sa seconde ligne est la réponse de la machine. La
 * bulle écrit les paroles en capitales, comme dans un manga ; le texte reste ici en casse normale.
 */
export const REPLIQUES: readonly string[] = [
  "Je te vois.",
  "Tu bouges, je te suis.",
  "Tous au front !",
  "On tient la frontière.",
  "Un Gaulois ne recule pas.",
  "Encore une partie ?",
  "$ whoami\nGaulois.",
  "La carte nous attend.",
  "$ sudo tenir la ligne\nAccordé.",
  "Le clan d'abord.",
  "$ rm -rf peur\nFait.",
];

/** Celles qui parlent du curseur qu'il suit : elles ne se disent pas sur un écran tactile, où il n'y en a pas. */
export const REPLIQUES_SOURIS: readonly string[] = ["Tu bouges, je te suis."];

/** Les répliques à dire : toutes avec une souris, sans celles du curseur au toucher. */
export function repliquesPour(souris: boolean): readonly string[] {
  return souris ? REPLIQUES : REPLIQUES.filter((replique) => !REPLIQUES_SOURIS.includes(replique));
}

/** Ce qu'il répond quand on le touche : un clic sur lui, le tour complet du clic droit, le curseur qui vient sur son casque. */
export const REACTIONS = {
  clic: "Même pas mal.",
  tour: "Je surveille mes arrières.",
  survol: "Pas touche au casque.",
} as const;
export type Reaction = keyof typeof REACTIONS;

/**
 * Une ligne de réplique a 26 lettres au plus. La bulle en tient 25 par ligne sur bureau, pavé compris : une parole
 * s'y écrit donc sur une ligne, deux au plus ; une commande et sa réponse sur deux, trois au plus.
 */
export const REPLIQUE_LIGNE_MAX = 26;
/** Le temps d'une lettre : la réplique s'écrit comme au clavier. */
export const FRAPPE_MS = 34;
/** La première réplique, après le réveil du guerrier. */
export const PREMIERE_MS = 1_200;

/** Une espace qui ne se coupe pas, devant un point d'interrogation ou d'exclamation. */
const INSECABLE = String.fromCharCode(160);

/** La commande tapée, s'il y en a une, et les paroles, prêtes à écrire dans la bulle. */
export function decouper(replique: string): { commande: string | null; parole: string } {
  const [premiere = "", ...suite] = replique.split("\n");
  const ponctuer = (texte: string): string => texte.replace(/ ([?!;:])/g, `${INSECABLE}$1`);
  return premiere.startsWith("$ ") ? { commande: premiere, parole: ponctuer(suite.join(" ")) } : { commande: null, parole: ponctuer(replique.replace(/\n/g, " ")) };
}

/** Le nombre de lettres à écrire, espaces comprises. */
export function lettres(replique: string): number {
  const { commande, parole } = decouper(replique);
  return [...(commande ?? "")].length + [...parole].length;
}

/** Le temps qu'une réplique reste à l'écran : celui de l'écrire, puis celui de la lire, entre 3,2 et 7 secondes. */
export function dureeReplique(replique: string): number {
  const n = lettres(replique);
  return Math.min(7_000, Math.max(3_200, n * FRAPPE_MS + 1_800 + n * 60));
}

/** Le silence avant la réplique suivante, quand `dites` répliques ont déjà été dites : de plus en plus long, de 11,5 à 24 secondes. */
export function pauseAvant(dites: number): number {
  return 9_000 + 2_500 * Math.min(6, Math.max(1, dites));
}

/**
 * L'ordre des répliques : la première de la liste d'abord, puis les autres dans un ordre tiré au sort ; ensuite la
 * liste entière, mélangée de nouveau à chaque tour. Jamais deux fois la même à la suite. `hasard` : un tirage entre 0 et 1.
 */
export function tirage(n: number, hasard: () => number): () => number {
  let sac: number[] = [];
  let derniere = -1;
  let tours = 0;
  const melanger = (liste: number[]): number[] => {
    for (let i = liste.length - 1; i > 0; i--) {
      const j = Math.min(i, Math.floor(hasard() * (i + 1)));
      [liste[i], liste[j]] = [liste[j] ?? 0, liste[i] ?? 0];
    }
    return liste;
  };
  return () => {
    if (n <= 0) return -1;
    if (derniere < 0) {
      derniere = 0;
      return 0;
    }
    if (sac.length === 0) {
      // Le premier tour a déjà commencé par la première réplique : il ne la redit pas.
      sac = melanger(Array.from({ length: n }, (_, i) => i).filter((i) => tours > 0 || i !== 0));
      tours++;
      // La prochaine sort par la fin du sac : pas celle qu'on vient d'entendre.
      const fin = sac.length - 1;
      if (sac.length > 1 && sac[fin] === derniere) [sac[0], sac[fin]] = [sac[fin] ?? 0, sac[0] ?? 0];
    }
    derniere = sac.pop() ?? 0;
    return derniere;
  };
}
